import React, { useEffect, useRef } from 'react';
import { MemoryPhoto, HandGestureState, PhotoTransitionOrigin } from '../types';
import { chimeAudio } from '../utils/audio';

const TAU = Math.PI * 2;

interface OrbitMeta {
  baseAngle: number;
  radiusMult: number;
  heightTier: number; // -1..1 organic altitude scatter
  speedFactor: number; // subtle non-homogeneous drift variation
  baseTilt: number;
  phase: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
  yaw,
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
  const nearCardForSlowdownRef = useRef<boolean>(false);
  const photoCardElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const photoOrbitMetaRef = useRef<Map<string, OrbitMeta>>(new Map());
  const photoIdsRef = useRef('');

  // Smooth 3D orbital flywheel state with dual Edge-Zone Continuous Spin + Smart Globe-Flick inertia!
  const frameStateRef = useRef({
    lastTime: performance.now(),
    orbitTime: 0,
    orbitAngle: 0,
    spinVelocity: 0,
    lastYaw: yaw,
    lastDeltaX: 0,
    lastFlickDir: 0,
    lastFlickAt: 0,
    activeEdgeSpinDir: 0, // -1 left, 0 none, +1 right
  });

  const frameState = frameStateRef.current;
  const now = performance.now();
  const deltaTime = Math.min(0.05, Math.max(0, (now - frameState.lastTime) / 1000));
  frameState.lastTime = now;
  frameState.orbitTime += deltaTime;

  const revealProgress = clamp01((scatter - 0.35) / 0.55);
  const photoVisibility = revealProgress * revealProgress * (3 - 2 * revealProgress);
  const photosReady = introProgress >= 0.85 && scatter >= 0.72;

  frameState.activeEdgeSpinDir = 0;

  const isPinchReady = gestureState.hasHand && gestureState.isPinchReady;
  const isPinchOrReady = gestureState.hasHand && (gestureState.isPinchReady || gestureState.isPinching);

  if (photosReady && !isPhotoOpen) {
    // ONLY slow down the orbit when near a Polaroid AND shaped in a pinch-ready pose (thumb & index poised, NOT open palm)!
    // When hand is OPEN (open_palm), NEVER slow down — keep full speed + edge acceleration + flick!
    const shouldSlowForPinch = nearCardForSlowdownRef.current && isPinchOrReady;

    if (gestureState.hasHand && gestureState.gesture !== 'fist' && !gestureState.isPinching) {
      const gx = gestureState.deltaX;

      // 1. SMART GLOBE-FLICK IMPULSE (flick right/left right in the center of the webcam without leaving FOV!)
      if (!shouldSlowForPinch && Math.abs(gx) > 0.005 && gx !== frameState.lastDeltaX) {
        const swipeDir = Math.sign(gx);
        const sinceLastFlick = now - frameState.lastFlickAt;
        // Ignore gentle return-stroke right after a strong flick so repositioning your hand never cancels spin!
        const isGentleReturnStroke =
          sinceLastFlick < 480 &&
          frameState.lastFlickDir !== 0 &&
          swipeDir === -frameState.lastFlickDir &&
          Math.abs(gx) < 0.011;

        if (!isGentleReturnStroke) {
          const impulse = gx * 60;
          frameState.spinVelocity = Math.max(
            -4.8,
            Math.min(4.8, frameState.spinVelocity + impulse)
          );
          if (Math.abs(gx) >= 0.008) {
            frameState.lastFlickDir = swipeDir;
            frameState.lastFlickAt = now;
          }
        }
      }
      frameState.lastDeltaX = gx;

      // 2. CONTINUOUS EDGE-ZONE JOYSTICK SPIN:
      // Active whenever NOT braking for a pinch-ready aim (so an OPEN hand ALWAYS accelerates smoothly!)
      if (!shouldSlowForPinch) {
        const cxNorm = gestureState.cursorX;
        if (cxNorm > 0.68) {
          const strength = clamp01((cxNorm - 0.68) / 0.24);
          const targetEdgeSpeed = 0.60 + strength * strength * 2.4;
          frameState.spinVelocity += (targetEdgeSpeed - frameState.spinVelocity) * Math.min(1, deltaTime * 4.8);
          frameState.activeEdgeSpinDir = 1;
        } else if (cxNorm < 0.32) {
          const strength = clamp01((0.32 - cxNorm) / 0.24);
          const targetEdgeSpeed = -(0.60 + strength * strength * 2.4);
          frameState.spinVelocity += (targetEdgeSpeed - frameState.spinVelocity) * Math.min(1, deltaTime * 4.8);
          frameState.activeEdgeSpinDir = -1;
        }
      }
    } else {
      frameState.lastDeltaX = 0;
    }

    // Also allow mouse/touch drag rotation from the canvas to spin the Polaroid ring
    const yawDelta = Math.atan2(
      Math.sin(yaw - frameState.lastYaw),
      Math.cos(yaw - frameState.lastYaw)
    );
    if (Math.abs(yawDelta) > 0.004 && Math.abs(yawDelta) < 0.35) {
      frameState.orbitAngle += yawDelta * 0.55;
    }
    frameState.lastYaw = yaw;

    // Smoothly brake orbit ONLY when poised in pinch-ready near a card; open palm keeps full lively orbital speed!
    const baseOrbitSpeed = shouldSlowForPinch ? 0.018 : 0.22;
    frameState.orbitAngle += (baseOrbitSpeed + frameState.spinVelocity) * deltaTime;

    const dampingRate = shouldSlowForPinch ? 9.5 : frameState.activeEdgeSpinDir !== 0 ? 0.35 : 1.25;
    frameState.spinVelocity *= Math.exp(-deltaTime * dampingRate);
    if (Math.abs(frameState.spinVelocity) < 0.006) frameState.spinVelocity = 0;
  } else {
    frameState.lastYaw = yaw;
    frameState.spinVelocity *= Math.exp(-deltaTime * 4);
  }

  const orbitTime = frameState.orbitTime;
  const orbitAngle = frameState.orbitAngle;

  const cursorScreenX = gestureState.cursorX * width;
  const cursorScreenY = gestureState.cursorY * height;

  // Build deterministic, organic non-uniform 3D orbits (scales cleanly for 5, 10, 20+ photos!)
  const photoIds = photos.map((photo) => photo.id).join('|');
  if (photoIdsRef.current !== photoIds) {
    const metas = new Map<string, OrbitMeta>();
    const count = Math.max(1, photos.length);
    photos.forEach((photo, index) => {
      // Deterministic pseudo-random hashes per photo index (organic, non-uniform, never rigid!)
      const h1 = ((Math.sin(index * 12.9898 + 1.3) * 43758.5453) % 1 + 1) % 1;
      const h2 = ((Math.sin(index * 78.233 + 2.7) * 24634.6345) % 1 + 1) % 1;
      const h3 = ((Math.sin(index * 39.425 + 4.1) * 19384.2913) % 1 + 1) % 1;

      const slotStep = TAU / count;
      const angleJitter = (h1 - 0.5) * Math.min(0.45, slotStep * 0.42);
      const baseAngle = index * slotStep + angleJitter + 0.35;

      // Golden-ratio vertical tiers so adjacent cards float at varied heights
      const tier = ((index * 0.6180339887) % 1) * 2 - 1; // -1..+1
      const radiusMult = 0.88 + h2 * 0.28; // organic depth/width variation
      const speedFactor = 0.92 + h3 * 0.18; // subtle non-homogeneous drift
      const baseTilt = (h2 - 0.5) * 11; // -5.5°..+5.5°

      metas.set(photo.id, {
        baseAngle,
        radiusMult,
        heightTier: tier,
        speedFactor,
        baseTilt,
        phase: index * 1.73 + h1 * TAU,
      });
    });
    photoOrbitMetaRef.current = metas;
    photoIdsRef.current = photoIds;
  }

  const cardVisualBaseW = width < 640 ? 104 : 126;
  const baseRadiusX = Math.min(width * 0.39, Math.max(175, width * 0.35));

  const projectedCards = photos
    .map((photo) => {
      const meta = photoOrbitMetaRef.current.get(photo.id)!;
      // Combine global hand-driven orbitAngle + subtle per-card organic non-homogeneous drift
      const organicDrift = orbitTime * 0.06 * (meta.speedFactor - 1);
      const theta = meta.baseAngle + orbitAngle + organicDrift;

      // 3D cylindrical coordinates around Chiara's portrait center:
      // nx: -1 (far left) .. 0 (center) .. +1 (far right)
      // nz: +1 (closest in front) .. 0 (flanks) .. -1 (directly behind Chiara!)
      const nx = Math.sin(theta);
      const nz = Math.cos(theta);

      const effRadiusX = baseRadiusX * meta.radiusMult;
      const screenX = width / 2 + nx * effRadiusX;

      // Gently tilted 3D Saturn-ring ellipse:
      // - Front cards glide slightly lower (framing Chiara without blocking her eyes!)
      // - Side cards float at ergonomic hand height
      // - Back cards rise softly behind her hair as they fade away!
      const bobY = Math.sin(orbitTime * 0.85 + meta.phase) * 9;
      const rawY =
        height * 0.46 +
        meta.heightTier * height * 0.165 +
        nz * height * 0.105 +
        bobY;
      const screenY = Math.max(height * 0.14, Math.min(height * 0.76, rawY));

      // True 3D perspective scale: smaller behind Chiara (0.60), larger in front (0.94)
      const depthNorm = (nz + 1) * 0.5; // 0 (back) .. 1 (front)
      const scale = 0.58 + depthNorm * 0.36;

      // TRUE 3D OCCLUSION FADE BEHIND CHIARA:
      // Smoothly fades to 0 as a card curves behind Chiara's 3D silhouette (nz < 0.18 & |nx| inside body width)
      // and smoothly reappears as it emerges around the opposite shoulder!
      const behindDepth = clamp01((0.20 - nz) / 0.86);
      const silhouetteMask = clamp01((0.88 - Math.abs(nx)) / 0.50);
      const occlusionOpacity = clamp01(1 - behindDepth * (0.22 + 0.96 * silhouetteMask));

      // Natural 3D Polaroid orientation tangent to the orbit
      const tilt = meta.baseTilt + Math.sin(orbitTime * 0.55 + meta.phase) * 1.4;
      const yaw3d = -nx * 28 * (nz >= 0 ? 1 : -0.65);

      const cardWidth = cardVisualBaseW * scale;
      const isInteractive = occlusionOpacity >= 0.42 && nz >= -0.22;
      const dxCursor = Math.abs(screenX - cursorScreenX);
      const dyCursor = Math.abs(screenY - cursorScreenY);
      const cursorDist = Math.hypot(dxCursor, dyCursor);
      // Generous proximity halo starts slowing the card as your pinch-ready hand approaches!
      const isNearForSlowdown =
        isInteractive &&
        dxCursor <= cardWidth * 1.32 &&
        dyCursor <= cardWidth * 1.24 + 26;
      // Crisp hover target highlights the exact card that will open on actual pinch contact!
      const isUnderCursor =
        isInteractive &&
        dxCursor <= cardWidth * 1.0 &&
        dyCursor <= cardWidth * 0.96 + 20;

      const proj = { x: screenX, y: screenY, z: nz * 6, scale };
      return {
        photo,
        proj,
        screenX,
        screenY,
        scale,
        tilt,
        yaw3d,
        nz,
        occlusionOpacity,
        isInteractive,
        isNearForSlowdown,
        isUnderCursor,
        cursorDist,
      };
    })
    // Strict back-to-front 3D depth sorting!
    .sort((a, b) => a.nz - b.nz);

  const photoUnderCursorCard =
    projectedCards
      .filter((card) => card.isUnderCursor)
      // Prefer the closest front-most card when two overlap slightly
      .sort((a, b) => b.nz - a.nz || a.cursorDist - b.cursorDist)[0] ?? null;
  const photoUnderCursor = photoUnderCursorCard?.photo ?? null;
  nearCardForSlowdownRef.current = projectedCards.some((card) => card.isNearForSlowdown);

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
    const cooldownElapsed = nowMs - lastPinchTriggerAtRef.current >= 420;

    if (closedWithMotion && cooldownElapsed) {
      if (isPhotoOpen) {
        pinchOpenDistanceRef.current = null;
        lastPinchTriggerAtRef.current = nowMs;
        chimeAudio.playChime(784, 0.12);
        onRequestClosePhoto();
        return;
      }
      if (!photosReady) return;
      if (!photoUnderCursor || !photoUnderCursorCard || width <= 0 || height <= 0 || photos.length === 0) return;

      pinchOpenDistanceRef.current = null;
      lastPinchTriggerAtRef.current = nowMs;
      chimeAudio.playChime(1046.5, 0.15);
      onSelectPhoto(
        photoUnderCursor,
        getPhotoOrigin(
          photoCardElementsRef.current.get(photoUnderCursor.id),
          photoUnderCursorCard.screenX,
          photoUnderCursorCard.screenY,
          photoUnderCursorCard.proj.z,
          photoUnderCursorCard.scale,
          photoUnderCursorCard.tilt,
          photoUnderCursorCard.yaw3d,
          cardVisualBaseW * photoUnderCursorCard.scale
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
    cardVisualBaseW,
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
      style={{ perspective: '1200px' }}
    >
      {/* Subtle Golden Directional Glow when holding hand in Left/Right Continuous Spin Zone */}
      {photosReady && !isPhotoOpen && frameState.activeEdgeSpinDir !== 0 && (
        <div
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 z-30 flex items-center gap-1 rounded-full border border-amber-200/35 bg-black/45 px-3 py-1.5 text-amber-200/90 backdrop-blur-sm shadow-[0_0_24px_rgba(251,191,36,0.35)] transition-opacity duration-200 ${frameState.activeEdgeSpinDir < 0 ? 'left-4' : 'right-4'
            }`}
        >
          <span className="text-sm font-light tracking-widest">
            {frameState.activeEdgeSpinDir < 0 ? '‹‹' : '››'}
          </span>
        </div>
      )}

      {/* Borderless Luxury Glowing SVG Hand Cursor (GPU translate3d for silky high-DPI tracking!) */}
      {gestureState.hasHand && (
        <div
          className="absolute left-0 top-0 pointer-events-none z-40"
          style={{
            transform: `translate3d(${cursorScreenX.toFixed(1)}px, ${cursorScreenY.toFixed(1)}px, 0) translate(-50%, -50%)`,
            transition: 'transform 52ms linear',
            willChange: 'transform',
          }}
        >
          <div
            className={`relative flex items-center justify-center transition-transform duration-150 ${
              gestureState.isPinching
                ? 'scale-[1.15]'
                : isPinchReady || isHoveringAnyPhoto
                  ? 'scale-[1.08]'
                  : 'scale-100'
            }`}
            style={{
              filter: gestureState.isPinching
                ? 'drop-shadow(0 0 13px rgba(254, 240, 138, 0.98)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.72))'
                : isPinchReady
                  ? 'drop-shadow(0 0 11px rgba(251, 191, 36, 0.92)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.68))'
                  : isHoveringAnyPhoto
                    ? 'drop-shadow(0 0 9px rgba(251, 191, 36, 0.78)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.65))'
                    : 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.55)) drop-shadow(0 2px 5px rgba(0, 0, 0, 0.65))',
            }}
            role="img"
            aria-label={
              gestureState.isPinching
                ? 'Pizzico attivo'
                : isPinchReady
                  ? 'Pronto a pizzicare'
                  : gestureState.gesture === 'fist'
                    ? 'Pugno chiuso'
                    : 'Mano aperta'
            }
          >
            {gestureState.isPinching ? (
              <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="12" r="5.5" fill="url(#pinchGlow)" />
                <path
                  d="M15 5.5L16 10.5L21 12L16 13.5L15 18.5L14 13.5L9 12L14 10.5L15 5.5Z"
                  fill="#FFFBEB"
                />
                <path
                  d="M16.5 13.5C18 11.2 21.2 10.8 22.8 12.6C24.1 14 23.8 16.5 22.5 18.2L25.2 16.8C26.7 16.1 28.4 16.9 28.8 18.5C29.2 20 28.2 21.5 26.8 22.1L28.5 21.7C29.8 21.5 31 22.5 31 23.9C31 25.1 30.1 26.2 28.9 26.5L25.4 27.6C22.4 28.6 19.1 28.4 16.5 26.9L12.4 24.4C10.8 23.4 10.5 21.2 11.7 19.7C12.7 18.4 14.5 18.2 15.8 19.1L17.4 20.1L14.5 16.3C13.7 15.2 14.2 13.6 15.5 13.3C15.9 13.2 16.2 13.3 16.5 13.5Z"
                  fill="url(#handGoldFill)"
                  stroke="#FEF3C7"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <defs>
                  <radialGradient id="pinchGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(15 12) rotate(90) scale(6)">
                    <stop stopColor="#FFFFFF" />
                    <stop offset="0.5" stopColor="#FDE047" stopOpacity="0.8" />
                    <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="handGoldFill" x1="11" y1="11" x2="30" y2="29" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFFBEB" />
                    <stop offset="0.55" stopColor="#FDE68A" />
                    <stop offset="1" stopColor="#D97706" />
                  </linearGradient>
                </defs>
              </svg>
            ) : isPinchReady ? (
              <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Poised golden target spark between open thumb & index fingertips (ready to snap!) */}
                <circle cx="11.5" cy="14" r="2.2" fill="#FEF08A" opacity="0.95" />
                <path
                  d="M11.5 9.8V11.2M11.5 16.8V18.2M7.3 14H8.7M14.3 14H15.7"
                  stroke="#FDE047"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                  opacity="0.85"
                />
                {/* Open pinch C-shape hand: arched index above, poised thumb below */}
                <path
                  d="M13 10.2C14.8 8.3 18.2 8.2 20.4 10.1L23.2 12.6C24.2 11.7 25.8 11.8 26.8 12.8C27.6 13.7 27.6 15 27 16C28.2 15.6 29.6 16.3 30 17.6C30.4 18.8 29.8 20.1 28.7 20.7C29.7 21 30.4 22 30.3 23.1C30.2 24.3 29.3 25.3 28.1 25.6L24.4 26.8C21.5 27.7 18.3 27.3 15.8 25.6L11.4 22.5C10.1 21.6 9.9 19.7 10.9 18.5C11.9 17.4 13.6 17.3 14.8 18.2L17.4 20.1C18.2 20.7 19.3 20.5 19.8 19.7C20.3 18.9 20.1 17.8 19.3 17.2L15.1 14C13.6 12.9 11.8 11.4 13 10.2Z"
                  fill="rgba(253, 224, 71, 0.28)"
                  stroke="#FDE68A"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : gestureState.gesture === 'fist' ? (
              <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M11 16.5V13.5C11 12.1 12.1 11 13.5 11C14.9 11 16 12.1 16 13.5V15M16 14V12C16 10.6 17.1 9.5 18.5 9.5C19.9 9.5 21 10.6 21 12V15M21 14V12.8C21 11.4 22.1 10.3 23.5 10.3C24.9 10.3 26 11.4 26 12.8V16.5M26 15.5C26 14.3 27 13.3 28.2 13.3C29.4 13.3 30.4 14.3 30.4 15.5V21C30.4 25.5 26.8 29 22.2 29H16.8C12.8 29 9.6 26.2 9.2 22.3L8.8 18.5C8.6 16.9 9.8 15.5 11.4 15.5H15.5C17.2 15.5 18.5 16.8 18.5 18.5C18.5 19.6 17.6 20.5 16.5 20.5H13.5"
                  fill="rgba(255, 251, 235, 0.22)"
                  stroke="#FDE68A"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M14.2 18.5V8.8C14.2 7.5 15.2 6.5 16.4 6.5C17.6 6.5 18.6 7.5 18.6 8.8V16.2M18.6 15.2V7.2C18.6 6 19.6 5 20.8 5C22 5 23 6 23 7.2V16.2M23 15.6V9.2C23 8 24 7 25.2 7C26.4 7 27.4 8 27.4 9.2V17.6M27.4 16.8V12.6C27.4 11.5 28.3 10.6 29.4 10.6C30.5 10.6 31.4 11.5 31.4 12.6V21.2C31.4 26.6 27.2 30.8 21.8 30.8H17.4C14.2 30.8 11.2 29.1 9.5 26.4L6.2 21.1C5.4 19.9 5.8 18.2 7 17.4C8.2 16.7 9.8 17 10.6 18.1L14.2 22.4V18.5Z"
                  fill={isHoveringAnyPhoto ? 'rgba(253, 230, 138, 0.28)' : 'rgba(255, 255, 255, 0.16)'}
                  stroke={isHoveringAnyPhoto ? '#FDE68A' : '#F8FAFC'}
                  strokeWidth="1.65"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* 3D Orbiting Smoked-Glass & Gold Polaroid Cards around Chiara */}
      {(photoVisibility > 0.001 || isPhotoOpen || isPhotoClosing) &&
        projectedCards.map(
          ({
            photo,
            proj,
            screenX,
            screenY,
            scale: baseScale,
            tilt,
            yaw3d,
            nz,
            occlusionOpacity,
            isInteractive,
            isUnderCursor,
          }) => {
            const isSelectedPhotoOpen = isPhotoOpen && photo.id === selectedPhotoId;
            const opacity =
              introProgress < 1
                ? 0
                : isSelectedPhotoOpen
                  ? 0
                  : photoVisibility * occlusionOpacity;

            // Skip painting fully occluded cards behind Chiara's silhouette (zero wasted GPU blur/paint!)
            if (opacity <= 0.015 && !isSelectedPhotoOpen) {
              return null;
            }

            const isHoveredByHand =
              gestureState.hasHand &&
              isUnderCursor &&
              photoUnderCursor?.id === photo.id &&
              photosReady &&
              !isPhotoOpen;
            const activeScale = isHoveredByHand ? baseScale * 1.18 : baseScale;
            const activeTilt = isHoveredByHand ? 0 : tilt;
            const activeYaw = isHoveredByHand ? 0 : yaw3d;

            // Zero-flash seamless handoff + dynamic landing momentum ripple when a Polaroid flies back home!
            const landedInfo = landedPhotoRef.current;
            const landedAgeMs =
              landedInfo && landedInfo.id === photo.id ? now - landedInfo.landedAt : 9999;
            const justLanded = landedAgeMs < 650;
            const landingRipple = justLanded
              ? Math.exp(-landedAgeMs / 240) * Math.sin((landedAgeMs / 1000) * 14)
              : 0;
            const finalTilt = activeTilt + landingRipple * 4.5;
            const finalScale = activeScale * (1 + Math.max(0, landingRipple) * 0.045);

            // Real 3D z-index layered by depth around Chiara
            const zIndex = isHoveredByHand ? 35 : Math.round(20 + nz * 10);

            return (
              <div
                key={photo.id}
                onClick={(event) => {
                  if (!isInteractive) return;
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
                className="absolute cursor-pointer group"
                style={{
                  left: `${screenX.toFixed(1)}px`,
                  top: `${screenY.toFixed(1)}px`,
                  zIndex,
                  transform: `translate3d(-50%, -50%, 0) rotateY(${activeYaw.toFixed(
                    1
                  )}deg) rotateZ(${finalTilt.toFixed(2)}deg) scale(${finalScale.toFixed(3)})`,
                  opacity: Number(opacity.toFixed(3)),
                  // Keep orbital movement crisp & immediate (no laggy CSS transition fighting live 3D orbit!)
                  transition: 'none',
                  pointerEvents: photosReady && isInteractive && !isSelectedPhotoOpen ? 'auto' : 'none',
                  transformStyle: 'preserve-3d',
                  willChange: 'transform, opacity',
                }}
              >
                <div
                  className={`relative w-[104px] sm:w-[126px] rounded-[16px] border p-2 pb-2.5 backdrop-blur-md transition-shadow duration-200 bg-gradient-to-b from-[#1a1d2a]/88 via-[#0f121b]/92 to-[#090b10]/96 ring-1 ring-inset ${isHoveredByHand
                    ? 'border-amber-200 ring-amber-200/45 shadow-[0_18px_42px_rgba(0,0,0,0.78),0_0_32px_rgba(251,191,36,0.75)]'
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
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-amber-100/[0.12]" />

                    {/* Magnetic Hand Hover Prompt Badge */}
                    <div
                      className={`pointer-events-none absolute bottom-1.5 right-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wide shadow-md backdrop-blur-sm transition-all duration-150 ${
                        isHoveredByHand
                          ? isPinchReady
                            ? 'border-amber-200 bg-amber-400/30 text-amber-50 opacity-100 scale-105 shadow-[0_0_12px_rgba(251,191,36,0.55)]'
                            : 'border-amber-200/70 bg-black/75 text-amber-100 opacity-100 scale-100'
                          : 'border-amber-200/70 bg-black/75 text-amber-100 opacity-0 scale-90'
                      }`}
                    >
                      {isPinchReady ? '🤏 Pizzica' : '🤏 Apri'}
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
          }
        )}
    </div>
  );
});
