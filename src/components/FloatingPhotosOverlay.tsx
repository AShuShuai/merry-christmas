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
  activePhoto: MemoryPhoto | null;
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
  activePhoto,
}) => {
  const lastPinchTimeRef = useRef<number>(0);

  const cursorScreenX = gestureState.cursorX * width;
  const cursorScreenY = gestureState.cursorY * height;

  let photoUnderCursor: MemoryPhoto | null = null;
  let photoUnderCursorDepth = -Infinity;

  const projectedCards = photos.map((photo) => {
    // Keep memories outside the tree silhouette, while letting them spread in chaos mode.
    const effRadius = (photo.radius + 2.5) * (1 + scatter * 0.4);
    const px = Math.cos(photo.angle) * effRadius;
    const py = photo.y * (1 + scatter * 0.2);
    const pz = Math.sin(photo.angle) * effRadius;

    const proj = project(px, py, pz, yaw, pitch, width, height, focal);

    const formedScale = Math.max(0.58, Math.min(0.92, proj.scale * 0.03));
    const scale = formedScale * (1 - scatter * 0.35);
    const screenX = Math.min(width - 82 * scale, Math.max(82 * scale, proj.x));
    const screenY = Math.min(height - 92 * scale, Math.max(92 * scale, proj.y));

    // Front/back depth calculation
    const isFront = proj.z > -3.5;
    const isUnderCursor =
      Math.abs(screenX - cursorScreenX) <= 78 * scale &&
      Math.abs(screenY - cursorScreenY) <= 88 * scale;

    if (isUnderCursor && isFront && proj.z > photoUnderCursorDepth) {
      photoUnderCursor = photo;
      photoUnderCursorDepth = proj.z;
    }

    return {
      photo,
      proj,
      screenX,
      screenY,
      scale,
      isFront,
      isUnderCursor,
    };
  }).sort((a, b) => a.proj.z - b.proj.z);

  // Handle gesture pinch opening the highlighted photo
  useEffect(() => {
    if (
      width > 0 &&
      height > 0 &&
      gestureState.gesture === 'pinch' &&
      gestureState.isPinching &&
      photoUnderCursor &&
      !activePhoto
    ) {
      const now = Date.now();
      if (now - lastPinchTimeRef.current > 1500) {
        lastPinchTimeRef.current = now;
        chimeAudio.playChime(1046.5, 0.15); // C6 bell chime
        onSelectPhoto(photoUnderCursor);
      }
    }
  }, [width, height, gestureState.gesture, gestureState.isPinching, photoUnderCursor, onSelectPhoto, activePhoto]);

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
        const opacity = isFront
          ? Math.min(1, Math.max(0.65, (proj.z + 8) / 14))
          : Math.max(0.18, (proj.z + 10) / 25);

        const isHoveredByHand = gestureState.hasHand && isUnderCursor && isFront;
        const scale = isHoveredByHand ? baseScale * 1.12 : baseScale;

        return (
          <div
            key={photo.id}
            onClick={() => {
              chimeAudio.playChime(1046.5, 0.15);
              onSelectPhoto(photo);
            }}
            className={`absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group ${
              isFront ? 'z-20' : 'z-10'
            }`}
            style={{
              left: `${screenX}px`,
              top: `${screenY}px`,
              transform: `translate(-50%, -50%) scale(${scale})`,
              opacity,
            }}
          >
            {/* Polaroid Frame */}
            <div
              className={`w-[130px] sm:w-[155px] p-2 pb-3 rounded-2xl bg-white shadow-xl transition-all duration-300 ${
                isHoveredByHand
                  ? 'border-2 border-cyan-400 shadow-[0_0_35px_rgba(0,240,255,0.7)] scale-105'
                  : 'border border-cyan-200/40 shadow-[0_10px_25px_rgba(0,0,0,0.5)] group-hover:border-cyan-400 group-hover:shadow-[0_0_25px_rgba(0,240,255,0.5)] group-hover:scale-105'
              }`}
            >
              {/* Image thumbnail */}
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-900">
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
