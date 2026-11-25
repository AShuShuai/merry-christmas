import React, { useEffect, useRef } from 'react';
import { Heart, Sparkles } from 'lucide-react';
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

  if (width === 0 || height === 0) return null;

  const cursorScreenX = gestureState.cursorX * width;
  const cursorScreenY = gestureState.cursorY * height;

  // Find closest photo to hand cursor for gesture pinch trigger
  let closestPhoto: MemoryPhoto | null = null;
  let minCursorDist = Infinity;

  const projectedCards = photos.map((photo) => {
    // In Chaos/scattered mode, photos expand outward for easy viewing
    const effRadius = photo.radius * (1 + scatter * 0.4);
    const px = Math.cos(photo.angle) * effRadius;
    const py = photo.y * (1 + scatter * 0.2);
    const pz = Math.sin(photo.angle) * effRadius;

    const proj = project(px, py, pz, yaw, pitch, width, height, focal);

    // Front/back depth calculation
    const isFront = proj.z > -3.5;
    const distToCursor = Math.hypot(proj.x - cursorScreenX, proj.y - cursorScreenY);

    if (distToCursor < minCursorDist && isFront) {
      minCursorDist = distToCursor;
      closestPhoto = photo;
    }

    return {
      photo,
      proj,
      isFront,
      distToCursor,
    };
  });

  // Handle gesture pinch opening the highlighted photo
  useEffect(() => {
    if (
      gestureState.isPinching &&
      closestPhoto &&
      minCursorDist < 120 &&
      !activePhoto
    ) {
      const now = Date.now();
      if (now - lastPinchTimeRef.current > 1500) {
        lastPinchTimeRef.current = now;
        chimeAudio.playChime(1046.5, 0.15); // C6 bell chime
        onSelectPhoto(closestPhoto);
      }
    }
  }, [gestureState.isPinching, closestPhoto, minCursorDist, onSelectPhoto, activePhoto]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {/* Virtual Hand Magic Wand Cursor */}
      {gestureState.hasHand && (
        <div
          className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-40 transition-transform duration-75"
          style={{
            left: `${cursorScreenX}px`,
            top: `${cursorScreenY}px`,
          }}
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              gestureState.isPinching
                ? 'bg-cyan-400/80 scale-125 shadow-[0_0_30px_#00f0ff]'
                : 'bg-cyan-500/35 border-2 border-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.6)] animate-pulse'
            }`}
          >
            <Sparkles
              size={16}
              className={`text-white transition-transform ${
                gestureState.isPinching ? 'scale-125' : ''
              }`}
            />
          </div>
        </div>
      )}

      {/* 3D Floating Memory Polaroid Cards */}
      {projectedCards.map(({ photo, proj, isFront, distToCursor }) => {
        // If card is too far behind, hide or make deeply faded
        const opacity = isFront
          ? Math.min(1, Math.max(0.65, (proj.z + 8) / 14))
          : Math.max(0.18, (proj.z + 10) / 25);

        const baseScale = Math.max(0.4, Math.min(1.25, proj.scale * 0.022 * (1 + scatter * 0.35)));
        const isHoveredByHand = gestureState.hasHand && distToCursor < 90 && isFront;
        const scale = isHoveredByHand ? baseScale * 1.22 : baseScale;

        return (
          <div
            key={photo.id}
            onClick={() => {
              chimeAudio.playChime(1046.5, 0.15);
              onSelectPhoto(photo);
            }}
            className={`absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 cursor-pointer group ${
              isFront ? 'z-20' : 'z-10'
            }`}
            style={{
              left: `${proj.x}px`,
              top: `${proj.y}px`,
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
