import React, { useEffect, useRef } from 'react';
import { MemoryPhoto, HandGestureState, PhotoTransitionOrigin } from '../types';
import { project } from '../engine/projection';
import { chimeAudio } from '../utils/audio';

const TAU = Math.PI * 2;

function getPhotoOrigin(element: HTMLElement | null | undefined): PhotoTransitionOrigin | undefined {
  if (!element) return undefined;
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
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
  gestureState,
  onSelectPhoto,
  onPhotoOriginUpdate,
  isPhotoOpen,
  isPhotoClosing,
  onRequestClosePhoto,
}) => {
  const pinchOpenDistanceRef = useRef<number | null>(null);
  const dispersedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const photoCardElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const photoOrbitOffsetsRef = useRef<Map<string, number>>(new Map());
  const pausedPhotoOrbitRef = useRef<{ photoId: string; angle: number } | null>(null);
  const orbitStartTimeRef = useRef<number | null>(null);
  const photoIdsRef = useRef<string>('');

  if (orbitStartTimeRef.current === null) {
    orbitStartTimeRef.current = performance.now();
  }
  const orbitTime = (performance.now() - orbitStartTimeRef.current) / 1000;
  const orbitSpeed = 0.065;

  const cursorScreenX = gestureState.cursorX * width;
  const cursorScreenY = gestureState.cursorY * height;
  const revealProgress = Math.max(0, Math.min(1, (scatter - 0.16) / 0.42));
  const photoVisibility = treeIsDispersed
    ? revealProgress * revealProgress * (3 - 2 * revealProgress)
    : 0;
  const photosReady = introProgress >= 1 && treeIsDispersed && scatter >= 0.58;
  const photoIds = photos.map((photo) => photo.id).join('|');
  if (photoIdsRef.current !== photoIds) {
    const positions = new Map<string, { x: number; y: number }>();
    photos.forEach((photo, index) => {
      const angle = -Math.PI / 2 + (index * TAU) / Math.max(photos.length, 1);
      positions.set(photo.id, { x: Math.cos(angle), y: Math.sin(angle) });
    });
    dispersedPositionsRef.current = positions;
    photoIdsRef.current = photoIds;
  }

  const getPhotoBaseAngle = (photoId: string): number => {
    const position = dispersedPositionsRef.current.get(photoId);
    return position ? Math.atan2(position.y, position.x) : 0;
  };

  if (isPhotoOpen && selectedPhotoId) {
    if (pausedPhotoOrbitRef.current?.photoId !== selectedPhotoId) {
      const previousPause = pausedPhotoOrbitRef.current;
      if (previousPause) {
        const previousPhoto = photos.find((photo) => photo.id === previousPause.photoId);
        if (previousPhoto) {
          photoOrbitOffsetsRef.current.set(
            previousPhoto.id,
            previousPause.angle - previousPhoto.angle - orbitTime * orbitSpeed
          );
        }
      }

      const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId);
      if (selectedPhoto) {
        pausedPhotoOrbitRef.current = {
          photoId: selectedPhotoId,
          angle:
            getPhotoBaseAngle(selectedPhotoId) +
            orbitTime * orbitSpeed +
            (photoOrbitOffsetsRef.current.get(selectedPhotoId) ?? 0),
        };
      }
    }
  } else if (pausedPhotoOrbitRef.current) {
    const pausedPhoto = photos.find(
      (photo) => photo.id === pausedPhotoOrbitRef.current?.photoId
    );
    if (pausedPhoto) {
      photoOrbitOffsetsRef.current.set(
        pausedPhoto.id,
        pausedPhotoOrbitRef.current.angle -
          getPhotoBaseAngle(pausedPhoto.id) -
          orbitTime * orbitSpeed
      );
    }
    pausedPhotoOrbitRef.current = null;
  }

  const projectedCards = photos.map((photo) => {
    // Keep memories outside the tree silhouette, while letting them spread in chaos mode.
    const effRadius = (photo.radius + 2.5) * (1 + scatter * 0.4);
    const baseAngle = getPhotoBaseAngle(photo.id);
    const pausedOrbit = pausedPhotoOrbitRef.current;
    const orbitAngle =
      pausedOrbit?.photoId === photo.id
        ? pausedOrbit.angle
        : baseAngle +
          orbitTime * orbitSpeed +
          (photoOrbitOffsetsRef.current.get(photo.id) ?? 0);
    const angle = orbitAngle - yaw;
    const px = Math.cos(angle) * effRadius;
    const py = photo.y * (1 + scatter * 0.2);
    const pz = Math.sin(angle) * effRadius;

    const proj = project(px, py, pz, yaw, pitch, width, height, focal);

    const cardBaseWidth = width < 640 ? 88 : 104;
    const orbitRadiusX = width * 0.28;
    const orbitRadiusY = height * 0.2;
    const minCenterSpacing =
      photos.length > 1
        ? 2 * Math.min(orbitRadiusX, orbitRadiusY) * Math.sin(Math.PI / photos.length)
        : cardBaseWidth;
    const dispersedWidth = Math.min(cardBaseWidth * 0.48, minCenterSpacing * 0.7);
    const formedScale = Math.max(0.14, Math.min(0.18, proj.scale * 0.006));
    const dispersedScale = dispersedWidth / cardBaseWidth;
    const layoutProgress = 1;
    const scale = formedScale + (dispersedScale - formedScale) * layoutProgress;
    const dispersedX = width / 2 + Math.cos(orbitAngle) * orbitRadiusX;
    const dispersedY = height / 2 + Math.sin(orbitAngle) * orbitRadiusY;
    const targetX = proj.x + (dispersedX - proj.x) * layoutProgress;
    const targetY = proj.y + (dispersedY - proj.y) * layoutProgress;
    const screenX = Math.min(width - 64 * scale, Math.max(64 * scale, targetX));
    const screenY = Math.min(height - 54 * scale, Math.max(54 * scale, targetY));

    // Front/back depth calculation
    const isFront = proj.z > -3.5;
    const cardWidth = cardBaseWidth * scale;
    const isUnderCursor =
      layoutProgress > 0.95 &&
      Math.abs(screenX - cursorScreenX) <= cardWidth * 0.9 &&
      Math.abs(screenY - cursorScreenY) <= 82 * scale + 18;

    return {
      photo,
      proj,
      layoutProgress,
      screenX,
      screenY,
      scale,
      isFront,
      isUnderCursor,
    };
  }).sort((a, b) => a.proj.z - b.proj.z);
  const photoUnderCursor =
    [...projectedCards].reverse().find((card) => card.isUnderCursor)?.photo ?? null;

  useEffect(() => {
    photoOrbitOffsetsRef.current = new Map(
      [...photoOrbitOffsetsRef.current].filter(([id]) => photos.some((photo) => photo.id === id))
    );
  }, [photos]);

  useEffect(() => {
    if (!isPhotoOpen || !selectedPhotoId) return;
    const origin = getPhotoOrigin(photoCardElementsRef.current.get(selectedPhotoId));
    if (origin) onPhotoOriginUpdate(selectedPhotoId, origin);
  }, [
    isPhotoOpen,
    selectedPhotoId,
    yaw,
    pitch,
    width,
    height,
    scatter,
    photos,
    onPhotoOriginUpdate,
  ]);

  // Each pinch opens a not-yet-seen memory until a full randomized cycle has completed.
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
        getPhotoOrigin(photoCardElementsRef.current.get(photoUnderCursor.id))
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
      {projectedCards.map(({ photo, proj, layoutProgress, screenX, screenY, scale: baseScale, isFront, isUnderCursor }) => {
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
              onSelectPhoto(photo, getPhotoOrigin(event.currentTarget));
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
                ? 'left 40ms linear, top 40ms linear, opacity 220ms ease 540ms, transform 120ms ease-out'
                : 'left 40ms linear, top 40ms linear, opacity 220ms ease, transform 120ms ease-out',
              pointerEvents:
                photosReady && !isSelectedPhotoOpen && layoutProgress > 0.95
                  ? 'auto'
                  : 'none',
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
