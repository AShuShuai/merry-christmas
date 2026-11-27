import React, { useEffect, useRef } from 'react';
import { MemoryPhoto, HandGestureState, PhotoTransitionOrigin } from '../types';
import { project } from '../engine/projection';
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

export const FloatingPhotosOverlay: React.FC<Props> = ({
  photos,
  selectedPhotoId,
  yaw,
  pitch,
  width,
  height,
  focal,
  scatter = 0,
  introProgress,
  treeIsDispersed,
  portraitReady,
  gestureState,
  onSelectPhoto,
  onPhotoOriginUpdate,
  isPhotoOpen,
  isPhotoClosing,
  onRequestClosePhoto,
}) => {
  const pinchOpenDistanceRef = useRef<number | null>(null);
  const photoCardElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const photoOrbitPositionsRef = useRef<Map<string, OrbitPosition>>(new Map());
  const photoIdsRef = useRef('');
  const frameStateRef = useRef({
    lastTime: performance.now(),
    orbitTime: 0,
    yaw,
    pitch,
  });
  const frameState = frameStateRef.current;
  const now = performance.now();
  const deltaTime = Math.min(0.05, Math.max(0, (now - frameState.lastTime) / 1000));
  frameState.lastTime = now;
  frameState.orbitTime += deltaTime;
  const yawDelta = Math.atan2(
    Math.sin(yaw - frameState.yaw),
    Math.cos(yaw - frameState.yaw)
  );
  const damping = 1 - Math.exp(-deltaTime * 8);
  frameState.yaw += yawDelta * damping;
  frameState.pitch += (pitch - frameState.pitch) * damping;
  const orbitTime = frameState.orbitTime;
  const smoothedYaw = frameState.yaw;
  const smoothedPitch = frameState.pitch;
  const orbitSpeed = 0.065;

  const cursorScreenX = gestureState.cursorX * width;
  const cursorScreenY = gestureState.cursorY * height;
  const revealProgress = Math.max(0, Math.min(1, (scatter - 0.16) / 0.42));
  const photoVisibility = treeIsDispersed
    ? revealProgress * revealProgress * (3 - 2 * revealProgress) * (portraitReady ? 1 - scatter : 1)
    : 0;
  const photosReady = introProgress >= 1 && treeIsDispersed && scatter >= 0.58 && !portraitReady;
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

  const cardBaseWidth = width < 640 ? 88 : 104;
  const orbitRadius = Math.min(width * 0.36, height * 0.34);
  const rawProjectedCards = photos.map((photo) => {
    const position = photoOrbitPositionsRef.current.get(photo.id)!;
    const angle = orbitTime * orbitSpeed - smoothedYaw;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const orbitX = position.x * cosAngle - position.y * sinAngle;
    const orbitY = position.x * sinAngle + position.y * cosAngle;
    const bob = Math.sin(orbitTime * 0.8 + position.phase) * 0.025;
    const orbitZ = Math.sin(angle + position.phase);
    const screenX = width / 2 + orbitX * orbitRadius;
    const screenY = height / 2 + (orbitY + bob) * orbitRadius;
    const effRadius = (photo.radius + 2.5) * (1 + scatter * 0.4);
    const proj = project(
      orbitX * effRadius,
      (orbitY + bob) * effRadius,
      orbitZ * effRadius,
      smoothedYaw,
      smoothedPitch,
      width,
      height,
      focal
    );

    return { photo, proj, screenX, screenY };
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
      0.58,
      Number.isFinite(spacing) ? (spacing * 0.58) / cardBaseWidth : 0.58
    );
    const cardWidth = cardBaseWidth * scale;
    const isFront = card.proj.z > -3.5;
    const isUnderCursor =
      Math.abs(card.screenX - cursorScreenX) <= cardWidth * 0.9 &&
      Math.abs(card.screenY - cursorScreenY) <= cardWidth * 0.85 + 18;

    return { ...card, scale, isFront, isUnderCursor };
  }).sort((a, b) => a.proj.z - b.proj.z);
  const photoUnderCursorCard =
    [...projectedCards].reverse().find((card) => card.isUnderCursor) ?? null;
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
      return;
    }

    if (
      !isPinching &&
      gestureState.gesture !== 'fist' &&
      gestureState.pinchDistance > 0.25
    ) {
      pinchOpenDistanceRef.current = Math.max(
        pinchOpenDistanceRef.current ?? 0,
        gestureState.pinchDistance
      );
    }

    const closedWithMotion =
      isPinching &&
      pinchOpenDistanceRef.current !== null &&
      pinchOpenDistanceRef.current - gestureState.pinchDistance >=
        Math.max(0.04, pinchOpenDistanceRef.current * 0.08);

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
      {projectedCards.map(({ photo, proj, screenX, screenY, scale: baseScale, isFront, isUnderCursor }) => {
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
        const scale = isHoveredByHand ? baseScale * 1.12 : baseScale;

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
};
