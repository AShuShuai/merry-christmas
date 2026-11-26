import React, { useEffect, useRef } from 'react';
import { handTracker } from '../utils/handTracker';
import type { HandGestureState } from '../types';

interface Props {
  enabled: boolean;
  visible: boolean;
  onGesture: (state: HandGestureState) => void;
}

export const HandTrackingWebcam = React.memo<Props>(({
  enabled,
  visible,
  onGesture,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      handTracker.stop();
      return;
    }

    let isMounted = true;
    const start = async () => {
      if (videoRef.current && canvasRef.current) {
        await handTracker.init(videoRef.current, canvasRef.current, (st) => {
          if (isMounted) onGesture(st);
        });
      }
    };

    start();

    return () => {
      isMounted = false;
      handTracker.stop();
    };
  }, [enabled, onGesture]);

  if (!enabled) return null;

  return (
    <div
      className={`fixed right-4 top-20 z-40 h-28 w-36 overflow-hidden rounded-xl border border-white/15 bg-black/60 shadow-lg pointer-events-none ${
        visible ? '' : 'hidden'
      }`}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        aria-label="Anteprima videocamera"
        className="absolute inset-0 h-full w-full object-cover scale-x-[-1]"
      />
      <canvas
        ref={canvasRef}
        width={220}
        height={165}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full pointer-events-none"
      />
    </div>
  );
}, (previous, next) =>
  previous.enabled === next.enabled &&
  previous.visible === next.visible &&
  previous.onGesture === next.onGesture
);
