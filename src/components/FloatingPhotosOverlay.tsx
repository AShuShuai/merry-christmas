import React, { useEffect, useRef } from 'react';
import { Heart } from 'lucide-react';
import { MemoryPhoto, HandGestureState } from '../types';
import { project } from '../engine/projection';
import { chimeAudio } from '../utils/audio';

interface Props {
  photos: MemoryPhoto[];
  yaw: number;
  pitch: number;
  width: number;
  height: number;
  focal: number;
  scatter?: number;
  gestureState: HandGestureState;
  onSelectPhoto: (photo: MemoryPhoto) => void;
  isPhotoOpen: boolean;
  onRequestClosePhoto: () => void;
}

export const FloatingPhotosOverlay: React.FC<Props> = ({
  photos,
  yaw,
  pitch,
  width,
  height,
  focal,
  scatter = 0,
  gestureState,
  onSelectPhoto,
  isPhotoOpen,
  onRequestClosePhoto,
}) => {
  const pinchOpenDistanceRef = useRef<number | null>(null);
  const seenPhotoIdsRef = useRef<Set<string>>(new Set());
  const dispersedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const photoIdsRef = useRef<string>('');

  const cursorScreenX = gestureState.cursorX * width;
  const cursorScreenY = gestureState.cursorY * height;
  const photoIds = photos.map((photo) => photo.id).join('|');
  if (photoIdsRef.current !== photoIds) {
    const positions = new Map<string, { x: number; y: number }>();
    for (const photo of photos) {
      positions.set(photo.id, {
        x: 0.12 + Math.random() * 0.76,
        y: 0.14 + Math.random() * 0.72,
      });
    }
    dispersedPositionsRef.current = positions;
    photoIdsRef.current = photoIds;
  }

  const projectedCards = photos.map((photo) => {
    // Keep memories outside the tree silhouette, while letting them spread in chaos mode.
    const effRadius = (photo.radius + 2.5) * (1 + scatter * 0.4);
    const px = Math.cos(photo.angle) * effRadius;
    const py = photo.y * (1 + scatter * 0.2);
    const pz = Math.sin(photo.angle) * effRadius;

    const proj = project(px, py, pz, yaw, pitch, width, height, focal);

    const formedScale = Math.max(0.16, Math.min(0.22, proj.scale * 0.007));
    const dispersedScale = Math.min(0.82, Math.max(0.52, proj.scale * 0.022));
    const scale = formedScale + (dispersedScale - formedScale) * scatter;
    const dispersedPosition = dispersedPositionsRef.current.get(photo.id)!;
    const dispersedX = dispersedPosition.x * width;
    const dispersedY = dispersedPosition.y * height;
    const targetX = proj.x + (dispersedX - proj.x) * scatter;
    const targetY = proj.y + (dispersedY - proj.y) * scatter;
    const screenX = Math.min(width - 64 * scale, Math.max(64 * scale, targetX));
    const screenY = Math.min(height - 54 * scale, Math.max(54 * scale, targetY));

    // Front/back depth calculation
    const isFront = proj.z > -3.5;
    const cardWidth = (width < 640 ? 112 : 128) * scale;
    const isUnderCursor =
      scatter > 0.25 &&
      Math.abs(screenX - cursorScreenX) <= cardWidth * 0.9 &&
      Math.abs(screenY - cursorScreenY) <= 82 * scale + 18;

    return {
      photo,
      proj,
      scatter,
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
    const availableIds = new Set(photos.map((photo) => photo.id));
    seenPhotoIdsRef.current = new Set(
      [...seenPhotoIdsRef.current].filter((id) => availableIds.has(id))
    );
  }, [photos]);

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
      gestureState.pinchDistance > 0.38
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
        Math.max(0.07, pinchOpenDistanceRef.current * 0.12);

    if (closedWithMotion) {
      pinchOpenDistanceRef.current = null;
      if (isPhotoOpen) {
        onRequestClosePhoto();
        return;
      }
      if (!photoUnderCursor || width <= 0 || height <= 0 || photos.length === 0) return;

      const seen = seenPhotoIdsRef.current;
      const unseenPhotos = photos.filter((photo) => !seen.has(photo.id));
      let selectedPhoto: MemoryPhoto;

      if (unseenPhotos.length === 0) {
        seen.clear();
        selectedPhoto = photos[Math.floor(Math.random() * photos.length)];
      } else if (unseenPhotos.some((photo) => photo.id === photoUnderCursor.id)) {
        selectedPhoto = photoUnderCursor;
      } else {
        selectedPhoto = unseenPhotos[Math.floor(Math.random() * unseenPhotos.length)];
      }

      seen.add(selectedPhoto.id);
      chimeAudio.playChime(1046.5, 0.15);
      onSelectPhoto(selectedPhoto);
    }
  }, [
    width,
    height,
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
      {projectedCards.map(({ photo, proj, scatter: cardScatter, screenX, screenY, scale: baseScale, isFront, isUnderCursor }) => {
        // If card is too far behind, hide or make deeply faded
        const depthOpacity = isFront
          ? Math.min(1, Math.max(0.65, (proj.z + 8) / 14))
          : Math.max(0.18, (proj.z + 10) / 25);
        const opacity = depthOpacity * Math.min(1, cardScatter / 0.3);

        const isHoveredByHand = gestureState.hasHand && isUnderCursor && isFront;
        const scale = isHoveredByHand ? baseScale * 1.12 : baseScale;

        return (
          <div
            key={photo.id}
            onClick={() => {
              chimeAudio.playChime(1046.5, 0.15);
              onSelectPhoto(photo);
            }}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group ${
              isFront ? 'z-20' : 'z-10'
            }`}
            style={{
              left: `${screenX}px`,
              top: `${screenY}px`,
              transform: `translate(-50%, -50%) scale(${scale})`,
              opacity,
              pointerEvents: cardScatter > 0.25 ? 'auto' : 'none',
            }}
          >
            <div className="absolute left-1/2 -top-3 h-3 -translate-x-1/2 border-l border-amber-200/80" />
            <div className="absolute left-1/2 -top-1 z-10 h-1.5 w-1.5 -translate-x-1/2 rounded-full border border-amber-100 bg-amber-300 shadow-[0_0_6px_rgba(253,224,71,0.8)]" />
            {/* Polaroid Frame */}
            <div
              className={`w-[112px] sm:w-[128px] p-1.5 pb-2 rounded-xl bg-white shadow-xl transition-all duration-300 ${
                isHoveredByHand
                  ? 'border-2 border-cyan-400 shadow-[0_0_35px_rgba(0,240,255,0.7)] scale-105'
                  : 'border border-cyan-200/40 shadow-[0_10px_25px_rgba(0,0,0,0.5)] group-hover:border-cyan-400 group-hover:shadow-[0_0_25px_rgba(0,240,255,0.5)] group-hover:scale-105'
              }`}
            >
              {/* Image thumbnail */}
              <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-900">
                <img
                  src={photo.url}
                  alt={photo.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-pink-500/80 backdrop-blur-sm flex items-center justify-center text-white">
                  <Heart size={10} className="fill-white" />
                </div>
              </div>

              {/* Title preview */}
              <div className="pt-2 text-center">
                <div className="font-sans font-bold text-[10px] sm:text-[11px] text-slate-900 truncate">
                  {photo.title}
                </div>
                <div className="text-[9px] text-cyan-600 font-mono mt-0.5 font-semibold">
                  {isHoveredByHand ? '👌 Pizzica per aprire' : 'Tocca per aprire ✨'}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
