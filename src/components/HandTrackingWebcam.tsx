import React, { useEffect, useRef } from 'react';
import { handTracker } from '../utils/handTracker';
import type { HandGestureState } from '../types';

interface Props {
  onGesture: (state: HandGestureState) => void;
}

export const HandTrackingWebcam = React.memo<Props>(({ onGesture }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    // Defer MediaPipe WASM/webcam init slightly so the tree & "Merry Christmas" intro plays at locked silky FPS!
    const timerId = window.setTimeout(() => {
      if (!isMounted || !videoRef.current || !canvasRef.current) return;
      void handTracker.init(videoRef.current, canvasRef.current, (st) => {
        if (isMounted) onGesture(st);
      });
    }, 1700);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
      handTracker.stop();
    };
  }, [onGesture]);

  return (
    <div
      className="fixed bottom-4 right-4 z-40 h-28 w-36 overflow-hidden rounded-xl border border-white/15 bg-black/60 shadow-lg pointer-events-none max-sm:bottom-auto max-sm:left-4 max-sm:right-auto max-sm:top-4"
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
}, (previous, next) => previous.onGesture === next.onGesture);
