import React, { useEffect, useRef } from 'react';
import { MemoryPhoto, HandGestureState, PhotoTransitionOrigin } from '../types';
import { chimeAudio } from '../utils/audio';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface OrbitPosition {
  x: number;
  y: number;
  phase: number;
}

function getPhotoOrigin(
  element: HTMLElement | null | undefined,
  x: number,
  y: number,
  z: number,
  scale: number
): PhotoTransitionOrigin | undefined {
  if (!element) return undefined;
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height, x, y, z, scale };
}

interface Props {
  photos: MemoryPhoto[];
  selectedPhotoId?: string;
  yaw: number;
  pitch: number;
  width: number;
  height: number;
  focal: number;
  scatter?: number;
  introProgress: number;
  treeIsDispersed: boolean;
  portraitReady: boolean;
  gestureState: HandGestureState;
  onSelectPhoto: (photo: MemoryPhoto, origin?: PhotoTransitionOrigin) => void;
  onPhotoOriginUpdate: (photoId: string, origin: PhotoTransitionOrigin) => void;
  isPhotoOpen: boolean;
  isPhotoClosing: boolean;
  onRequestClosePhoto: () => void;
}

export const FloatingPhotosOverlay: React.FC<Props> = React.memo(({
  photos,
  selectedPhotoId,
  yaw: _yaw,
  pitch: _pitch,
  width,
  height,
  focal: _focal,
  scatter = 0,
  introProgress,
  treeIsDispersed: _treeIsDispersed,
  portraitReady: _portraitReady,
  gestureState,
  onSelectPhoto,
  onPhotoOriginUpdate,
  isPhotoOpen,
  isPhotoClosing,
  onRequestClosePhoto,
}) => {
  const pinchOpenDistanceRef = useRef<number | null>(null);
  const wasPinchingRef = useRef<boolean>(false);
  const photoCardElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const photoOrbitPositionsRef = useRef<Map<string, OrbitPosition>>(new Map());
  const photoIdsRef = useRef('');
  const frameStateRef = useRef({
    lastTime: performance.now(),
    orbitTime: 0,
  });
  const frameState = frameStateRef.current;
  const now = performance.now();
  const deltaTime = Math.min(0.05, Math.max(0, (now - frameState.lastTime) / 1000));
  frameState.lastTime = now;
  frameState.orbitTime += deltaTime;
  const orbitTime = frameState.orbitTime;

  const cursorScreenX = gestureState.cursorX * width;
  const cursorScreenY = gestureState.cursorY * height;
  // Photos appear ONLY when the face is shown (scatter -> 1), and NOT when the tree is formed (scatter -> 0)
  const revealProgress = Math.max(0, Math.min(1, (scatter - 0.25) / 0.55));
  const photoVisibility = revealProgress * revealProgress * (3 - 2 * revealProgress);
  const photosReady = introProgress >= 0.85 && scatter >= 0.65;
  const photoIds = photos.map((photo) => photo.id).join('|');
  if (photoIdsRef.current !== photoIds) {
    const positions = new Map<string, OrbitPosition>();
    photos.forEach((photo, index) => {
      const spiralRadius = 0.84 + 0.14 * ((index + 0.5) / Math.max(photos.length, 1));
      const angle = index * GOLDEN_ANGLE;
      positions.set(photo.id, {
        x: Math.cos(angle) * spiralRadius,
        y: Math.sin(angle) * spiralRadius,
        phase: angle,
      });
    });
    photoOrbitPositionsRef.current = positions;
    photoIdsRef.current = photoIds;
  }

  const cardBaseWidth = width < 640 ? 92 : 112;
  const leftPhotos = photos.filter((_, idx) => idx % 2 === 0);
  const rightPhotos = photos.filter((_, idx) => idx % 2 === 1);

  const rawProjectedCards = photos.map((photo, index) => {
    const position = photoOrbitPositionsRef.current.get(photo.id)!;
    const isLeftSide = index % 2 === 0;
    const sideList = isLeftSide ? leftPhotos : rightPhotos;
    const sideIdx = sideList.indexOf(photo);
    const sideCount = Math.max(1, sideList.length);

    // Stable, evenly distributed vertical slots on left & right flanks (NEVER teleports, NEVER overlaps face!)
    // Positioned closer to center (24% and 76% width) so webcam hand cursor reaches them effortlessly!
    const tY = sideCount === 1 ? 0.5 : sideIdx / (sideCount - 1);
    const arcCurve = Math.sin(tY * Math.PI); // subtle gentle outward curve in the middle
    const swayX = Math.sin(orbitTime * 0.65 + position.phase) * Math.min(18, width * 0.016);
    const swayY = Math.cos(orbitTime * 0.75 + position.phase * 1.3) * 11;

    const baseFlankX = isLeftSide
      ? width * (0.255 - arcCurve * 0.03)
      : width * (0.745 + arcCurve * 0.03);
    const screenX = baseFlankX + swayX;
    const minY = height * 0.25;
    const maxY = height * 0.68;
    const screenY = minY + tY * (maxY - minY) + swayY;

    const orbitX = isLeftSide ? -0.8 : 0.8;
    const orbitY = (tY - 0.5) * 1.2;
    const proj = { x: screenX, y: screenY, z: 2.5 - Math.abs(orbitY), scale: 1 };

    return { photo, proj, screenX, screenY, orbitX, orbitY };
  });
  const nearestSpacing = new Map<string, number>();
  rawProjectedCards.forEach((card, index) => {
    let nearest = Number.POSITIVE_INFINITY;
    rawProjectedCards.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      nearest = Math.min(
        nearest,
        Math.hypot(card.screenX - other.screenX, card.screenY - other.screenY)
      );
    });
    nearestSpacing.set(card.photo.id, nearest);
  });
  const projectedCards = rawProjectedCards.map((card) => {
    const spacing = nearestSpacing.get(card.photo.id) ?? Number.POSITIVE_INFINITY;
    const scale = Math.min(
      0.84,
      Number.isFinite(spacing) ? (spacing * 0.66) / cardBaseWidth : 0.84
    );
    const cardWidth = cardBaseWidth * scale;
    const isFront = true;
    const cursorDist = Math.hypot(card.screenX - cursorScreenX, card.screenY - cursorScreenY);
    // Generous magnetic hitbox so grabbing photos with webcam pinch is effortless
    const isUnderCursor =
      Math.abs(card.screenX - cursorScreenX) <= cardWidth * 1.15 &&
      Math.abs(card.screenY - cursorScreenY) <= cardWidth * 1.05 + 24;

    return { ...card, scale, isFront, isUnderCursor, cursorDist };
  }).sort((a, b) => a.proj.z - b.proj.z);
  const photoUnderCursorCard =
    projectedCards
      .filter((card) => card.isUnderCursor)
      .sort((a, b) => a.cursorDist - b.cursorDist)[0] ?? null;
  const photoUnderCursor = photoUnderCursorCard?.photo ?? null;
  const selectedCard = projectedCards.find((card) => card.photo.id === selectedPhotoId);

  useEffect(() => {
    if (!isPhotoOpen || !selectedPhotoId) return;
    const origin = getPhotoOrigin(
      photoCardElementsRef.current.get(selectedPhotoId),
      selectedCard?.screenX ?? width / 2,
      selectedCard?.screenY ?? height / 2,
      selectedCard?.proj.z ?? 0,
      selectedCard?.scale ?? 1
    );
    if (origin) onPhotoOriginUpdate(selectedPhotoId, origin);
  }, [
    isPhotoOpen,
    selectedPhotoId,
    orbitTime,
    width,
    height,
    selectedCard?.screenX,
    selectedCard?.screenY,
    selectedCard?.proj.z,
    selectedCard?.scale,
    onPhotoOriginUpdate,
  ]);

  // A pinch selects the visible photo under the cursor.
  useEffect(() => {
    const isPinching = gestureState.hasHand &&
      gestureState.gesture === 'pinch' &&
      gestureState.isPinching;

    if (!gestureState.hasHand) {
      pinchOpenDistanceRef.current = null;
      wasPinchingRef.current = false;
      return;
    }

    if (
      !isPinching &&
      gestureState.gesture !== 'fist' &&
      gestureState.pinchDistance > 0.22
    ) {
      pinchOpenDistanceRef.current = Math.max(
        pinchOpenDistanceRef.current ?? 0,
        gestureState.pinchDistance
      );
    }

    const risingEdgePinch = isPinching && !wasPinchingRef.current;
    wasPinchingRef.current = isPinching;

    const closedWithMotion =
      risingEdgePinch ||
      (isPinching &&
        pinchOpenDistanceRef.current !== null &&
        pinchOpenDistanceRef.current - gestureState.pinchDistance >=
          Math.max(0.035, pinchOpenDistanceRef.current * 0.07));

    if (closedWithMotion) {
      pinchOpenDistanceRef.current = null;
      if (isPhotoOpen) {
        onRequestClosePhoto();
        return;
      }
      if (!photosReady) return;
      if (!photoUnderCursor || width <= 0 || height <= 0 || photos.length === 0) return;

      chimeAudio.playChime(1046.5, 0.15);
      onSelectPhoto(
        photoUnderCursor,
        getPhotoOrigin(
          photoCardElementsRef.current.get(photoUnderCursor.id),
          photoUnderCursorCard?.screenX ?? width / 2,
          photoUnderCursorCard?.screenY ?? height / 2,
          photoUnderCursorCard?.proj.z ?? 0,
          photoUnderCursorCard?.scale ?? 1
        )
      );
    }
  }, [
    width,
    height,
    photosReady,
    scatter,
    gestureState.hasHand,
    gestureState.gesture,
    gestureState.isPinching,
    gestureState.pinchDistance,
    gestureState.cursorX,
    gestureState.cursorY,
    photoUnderCursor?.id,
    onSelectPhoto,
    photos,
    isPhotoOpen,
    onRequestClosePhoto,
  ]);

  if (width === 0 || height === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {/* Gesture cursor follows the index fingertip and mirrors the detected hand pose. */}
      {gestureState.hasHand && (
        <div
          className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-40 transition-transform duration-150"
          style={{
            left: `${cursorScreenX}px`,
            top: `${cursorScreenY}px`,
          }}
        >
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center border bg-slate-950/60 backdrop-blur-sm transition-all duration-150 ${
              gestureState.isPinching
                ? 'border-cyan-200 scale-110'
                : 'border-white/60'
            }`}
          >
            <span
              role="img"
              aria-label={
                gestureState.isPinching
                  ? 'Pizzico'
                  : gestureState.gesture === 'fist'
                    ? 'Pugno chiuso'
                    : 'Mano aperta'
              }
              className="text-[25px] leading-none transition-transform duration-150"
            >
              {gestureState.isPinching
                ? '🤏'
                : gestureState.gesture === 'fist'
                  ? '✊'
                  : '🖐️'}
            </span>
          </div>
        </div>
      )}

      {/* 3D Floating Memory Polaroid Cards */}
      {(photoVisibility > 0.001 || isPhotoOpen || isPhotoClosing) &&
        projectedCards.map(({ photo, proj, screenX, screenY, scale: baseScale, isFront, isUnderCursor }) => {
        // If card is too far behind, hide or make deeply faded
        const depthOpacity = photosReady
          ? 1
          : isFront
            ? Math.min(1, Math.max(0.65, (proj.z + 8) / 14))
            : Math.max(0.18, (proj.z + 10) / 25);
        const isSelectedPhotoOpen = isPhotoOpen && photo.id === selectedPhotoId;
        const opacity = introProgress < 1
          ? 0
          : isSelectedPhotoOpen
            ? isPhotoClosing
              ? depthOpacity * photoVisibility
              : 0
            : depthOpacity * photoVisibility;

        const isHoveredByHand = gestureState.hasHand && isUnderCursor && isFront;
        const scale = isHoveredByHand ? baseScale * 1.18 : baseScale;

        return (
          <div
            key={photo.id}
            onClick={(event) => {
              chimeAudio.playChime(1046.5, 0.15);
              onSelectPhoto(
                photo,
                getPhotoOrigin(event.currentTarget, screenX, screenY, proj.z, scale)
              );
            }}
            ref={(element) => {
              if (element) photoCardElementsRef.current.set(photo.id, element);
              else photoCardElementsRef.current.delete(photo.id);
            }}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group ${
              isFront ? 'z-20' : 'z-10'
            }`}
            style={{
              left: `${screenX}px`,
              top: `${screenY}px`,
              transform: `translate(-50%, -50%) scale(${scale})`,
              opacity,
              transition: isSelectedPhotoOpen && isPhotoClosing
                ? 'opacity 180ms ease, transform 120ms ease-out'
                : 'opacity 220ms ease, transform 120ms ease-out',
              pointerEvents: photosReady && !isSelectedPhotoOpen ? 'auto' : 'none',
            }}
          >
            <div
              className={`w-[88px] sm:w-[104px] rounded-xl border-2 p-1 bg-gradient-to-br from-amber-100 via-amber-400 to-emerald-950 shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition-all duration-300 ${
                isHoveredByHand
                  ? 'border-amber-100 shadow-[0_0_24px_rgba(255,215,120,0.7)]'
                  : 'border-amber-300/70 group-hover:border-amber-100 group-hover:shadow-[0_0_22px_rgba(255,215,120,0.55)]'
              }`}
            >
              <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-emerald-950/70 bg-emerald-950">
                <img
                  src={photo.url}
                  alt={photo.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
