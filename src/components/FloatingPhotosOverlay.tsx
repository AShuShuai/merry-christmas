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
  scale: number,
  tilt: number = 0,
  yaw: number = 0,
  exactWidth?: number
): PhotoTransitionOrigin | undefined {
  if (!element) return undefined;
  const { left, top, width: boxW, height: boxH } = element.getBoundingClientRect();
  // Use unrotated visual width when available so 3D-tilted cards dock pixel-perfectly with zero scale snap!
  const width = exactWidth ?? boxW;
  return { left, top, width, height: boxH, x, y, z, scale, tilt, yaw };
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
  const lastPinchTriggerAtRef = useRef<number>(0);
  const prevOpenPhotoIdRef = useRef<string | undefined>(undefined);
  const landedPhotoRef = useRef<{ id: string; landedAt: number } | null>(null);
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
  const revealProgress = Math.max(0, Math.min(1, (scatter - 0.35) / 0.55));
  const photoVisibility = revealProgress * revealProgress * (3 - 2 * revealProgress);
  const photosReady = introProgress >= 0.85 && scatter >= 0.72;
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

  const cardBaseWidth = width < 640 ? 104 : 128;
  const leftPhotos = photos.filter((_, idx) => idx % 2 === 0);
  const rightPhotos = photos.filter((_, idx) => idx % 2 === 1);

  const rawProjectedCards = photos.map((photo, index) => {
    const position = photoOrbitPositionsRef.current.get(photo.id)!;
    const isLeftSide = index % 2 === 0;
    const sideList = isLeftSide ? leftPhotos : rightPhotos;
    const sideIdx = sideList.indexOf(photo);
    const sideCount = Math.max(1, sideList.length);

    // Stable, evenly distributed vertical slots on left & right flanks (easy webcam reach, clear of Chiara's face!)
    const tY = sideCount === 1 ? 0.5 : sideIdx / (sideCount - 1);
    const arcCurve = Math.sin(tY * Math.PI);
    const swayX = Math.sin(orbitTime * 0.58 + position.phase) * Math.min(15, width * 0.014);
    const swayY = Math.cos(orbitTime * 0.68 + position.phase * 1.3) * 10;

    const baseFlankX = isLeftSide
      ? width * (0.245 - arcCurve * 0.032)
      : width * (0.755 + arcCurve * 0.032);
    const screenX = baseFlankX + swayX;
    const minY = height * 0.24;
    const maxY = height * 0.69;
    const screenY = minY + tY * (maxY - minY) + swayY;

    // Natural suspended 3D Polaroid tilt (organic angle + subtle gentle sway)
    const staticAngle = (isLeftSide ? -1 : 1) * (sideIdx % 2 === 0 ? 5.5 : 3.4) * (sideIdx === 1 ? -0.75 : 1);
    const tilt = staticAngle + Math.sin(orbitTime * 0.52 + position.phase) * 1.4;
    const yaw3d = isLeftSide ? 11 : -11;

    const orbitY = (tY - 0.5) * 1.2;
    const proj = { x: screenX, y: screenY, z: 2.5 - Math.abs(orbitY), scale: 1 };

    return { photo, proj, screenX, screenY, tilt, yaw3d };
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
      0.88,
      Number.isFinite(spacing) ? (spacing * 0.68) / cardBaseWidth : 0.88
    );
    const cardWidth = cardBaseWidth * scale;
    const isFront = true;
    const cursorDist = Math.hypot(card.screenX - cursorScreenX, card.screenY - cursorScreenY);
    // Generous magnetic hitbox so grabbing Polaroids with webcam pinch is effortless
    const isUnderCursor =
      Math.abs(card.screenX - cursorScreenX) <= cardWidth * 1.15 &&
      Math.abs(card.screenY - cursorScreenY) <= cardWidth * 1.1 + 26;

    return { ...card, scale, isFront, isUnderCursor, cursorDist };
  }).sort((a, b) => a.proj.z - b.proj.z);

  const photoUnderCursorCard =
    projectedCards
      .filter((card) => card.isUnderCursor)
      .sort((a, b) => a.cursorDist - b.cursorDist)[0] ?? null;
  const photoUnderCursor = photoUnderCursorCard?.photo ?? null;
  const cardVisualBaseW = width < 640 ? 108 : 132;
  const selectedCard = projectedCards.find((card) => card.photo.id === selectedPhotoId);

  // Track exact moment a photo finishes flying back so handoff has ZERO opacity flash + gentle dynamic settle!
  if (prevOpenPhotoIdRef.current && !isPhotoOpen) {
    landedPhotoRef.current = { id: prevOpenPhotoIdRef.current, landedAt: now };
  }
  prevOpenPhotoIdRef.current = isPhotoOpen ? selectedPhotoId : undefined;

  useEffect(() => {
    if (!isPhotoOpen || !selectedPhotoId) return;
    const origin = getPhotoOrigin(
      photoCardElementsRef.current.get(selectedPhotoId),
      selectedCard?.screenX ?? width / 2,
      selectedCard?.screenY ?? height / 2,
      selectedCard?.proj.z ?? 0,
      selectedCard?.scale ?? 1,
      selectedCard?.tilt ?? 0,
      selectedCard?.yaw3d ?? 0,
      cardVisualBaseW * (selectedCard?.scale ?? 1)
    );
    if (origin) onPhotoOriginUpdate(selectedPhotoId, origin);
  }, [
    isPhotoOpen,
    selectedPhotoId,
    orbitTime,
    width,
    height,
    cardVisualBaseW,
    selectedCard?.screenX,
    selectedCard?.screenY,
    selectedCard?.proj.z,
    selectedCard?.scale,
    selectedCard?.tilt,
    selectedCard?.yaw3d,
    onPhotoOriginUpdate,
  ]);

  // A pinch selects the visible Polaroid under the cursor or flies the open one back.
  useEffect(() => {
    const isPinching =
      gestureState.hasHand &&
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

    const nowMs = performance.now();
    const cooldownElapsed = nowMs - lastPinchTriggerAtRef.current >= 540;

    if (closedWithMotion && cooldownElapsed) {
      pinchOpenDistanceRef.current = null;
      lastPinchTriggerAtRef.current = nowMs;
      if (isPhotoOpen) {
        chimeAudio.playChime(784, 0.12);
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
          photoUnderCursorCard?.scale ?? 1,
          photoUnderCursorCard?.tilt ?? 0,
          photoUnderCursorCard?.yaw3d ?? 0,
          cardVisualBaseW * (photoUnderCursorCard?.scale ?? 1)
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
    photoUnderCursorCard,
    onSelectPhoto,
    photos,
    isPhotoOpen,
    onRequestClosePhoto,
  ]);

  if (width === 0 || height === 0) return null;

  const isHoveringAnyPhoto = Boolean(photosReady && !isPhotoOpen && photoUnderCursor);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden select-none"
      style={{ perspective: '1100px' }}
    >
      {/* Gesture cursor follows the index fingertip and glows warm gold when locked onto a Polaroid */}
      {gestureState.hasHand && (
        <div
          className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-40 transition-transform duration-150"
          style={{
            left: `${cursorScreenX}px`,
            top: `${cursorScreenY}px`,
          }}
        >
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center border bg-slate-950/65 backdrop-blur-md transition-all duration-200 ${
              gestureState.isPinching
                ? 'border-amber-200 scale-110 shadow-[0_0_22px_rgba(251,191,36,0.85)]'
                : isHoveringAnyPhoto
                  ? 'border-amber-300/90 scale-105 shadow-[0_0_18px_rgba(251,191,36,0.65)]'
                  : 'border-white/55'
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
              className="text-[24px] leading-none transition-transform duration-150"
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

      {/* 3D Floating Smoked-Glass & Gold Polaroid Memory Cards */}
      {(photoVisibility > 0.001 || isPhotoOpen || isPhotoClosing) &&
        projectedCards.map(({ photo, proj, screenX, screenY, scale: baseScale, tilt, yaw3d, isFront, isUnderCursor }) => {
          const isSelectedPhotoOpen = isPhotoOpen && photo.id === selectedPhotoId;
          // Keep slot invisible while the Polaroid is open OR flying back so there's never a duplicate ghost!
          const opacity =
            introProgress < 1
              ? 0
              : isSelectedPhotoOpen
                ? 0
                : photoVisibility;

          const isHoveredByHand = gestureState.hasHand && isUnderCursor && isFront && photosReady && !isPhotoOpen;
          const activeScale = isHoveredByHand ? baseScale * 1.22 : baseScale;
          // Gently straightens upright toward the viewer when hovered by your hand!
          const activeTilt = isHoveredByHand ? 0 : tilt;
          const activeYaw = isHoveredByHand ? 0 : yaw3d;

          // Zero-flash seamless handoff + dynamic landing momentum ripple when a Polaroid flies back home!
          const landedInfo = landedPhotoRef.current;
          const landedAgeMs = landedInfo && landedInfo.id === photo.id ? now - landedInfo.landedAt : 9999;
          const justLanded = landedAgeMs < 650;
          const landingRipple = justLanded
            ? Math.exp(-landedAgeMs / 240) * Math.sin((landedAgeMs / 1000) * 14)
            : 0;
          const finalTilt = activeTilt + landingRipple * 4.5;
          const finalScale = activeScale * (1 + Math.max(0, landingRipple) * 0.045);

          return (
            <div
              key={photo.id}
              onClick={(event) => {
                chimeAudio.playChime(1046.5, 0.15);
                onSelectPhoto(
                  photo,
                  getPhotoOrigin(
                    event.currentTarget,
                    screenX,
                    screenY,
                    proj.z,
                    activeScale,
                    activeTilt,
                    activeYaw,
                    cardVisualBaseW * activeScale
                  )
                );
              }}
              ref={(element) => {
                if (element) photoCardElementsRef.current.set(photo.id, element);
                else photoCardElementsRef.current.delete(photo.id);
              }}
              className={`absolute cursor-pointer group ${isHoveredByHand ? 'z-30' : 'z-20'}`}
              style={{
                left: `${screenX}px`,
                top: `${screenY}px`,
                transform: `translate3d(-50%, -50%, 0) rotateY(${activeYaw}deg) rotateZ(${finalTilt.toFixed(
                  2
                )}deg) scale(${finalScale.toFixed(3)})`,
                opacity,
                // Zero opacity transition on the landing handoff frame -> ZERO blink/flash!
                transition:
                  isSelectedPhotoOpen || landedAgeMs < 140
                    ? 'none'
                    : 'opacity 220ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
                pointerEvents: photosReady && !isSelectedPhotoOpen ? 'auto' : 'none',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Smoked-Glass & Champagne Gold Polaroid Frame */}
              <div
                className={`relative w-[108px] sm:w-[132px] rounded-[16px] border p-2 pb-2.5 backdrop-blur-md transition-all duration-300 bg-gradient-to-b from-[#1a1d2a]/88 via-[#0f121b]/92 to-[#090b10]/96 ring-1 ring-inset ${
                  isHoveredByHand
                    ? 'border-amber-200 ring-amber-200/45 shadow-[0_18px_42px_rgba(0,0,0,0.75),0_0_32px_rgba(251,191,36,0.72)]'
                    : 'border-amber-200/40 ring-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.72),0_0_18px_rgba(251,191,36,0.16)] group-hover:border-amber-200/90 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.75),0_0_28px_rgba(251,191,36,0.55)]'
                }`}
              >
                {/* Top specular champagne reflection */}
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/75 to-transparent" />

                {/* Polaroid Photo Window */}
                <div className="relative w-full aspect-[4/3] rounded-[10px] overflow-hidden border border-amber-100/20 bg-black/85 shadow-inner">
                  <img
                    src={photo.url}
                    alt={photo.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    draggable={false}
                  />
                  {/* Subtle glass diagonal sheen */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-amber-100/[0.12]" />

                  {/* Magnetic Hand Hover Prompt Badge */}
                  <div
                    className={`pointer-events-none absolute bottom-1.5 right-1.5 rounded-full border border-amber-200/70 bg-black/75 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-amber-100 shadow-md backdrop-blur-sm transition-all duration-200 ${
                      isHoveredByHand ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  >
                    🤏 Apri
                  </div>
                </div>

                {/* Classic Polaroid Bottom Chin with Romantic Serif Title */}
                <div className="mt-2 flex items-center justify-center gap-1 px-0.5">
                  <span className="text-[8px] text-amber-300/75">✦</span>
                  <p
                    className="truncate text-center text-[10.5px] italic tracking-wide text-amber-50/90"
                    style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                  >
                    {photo.title || 'Ricordo'}
                  </p>
                  <span className="text-[8px] text-amber-300/75">✦</span>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
});
