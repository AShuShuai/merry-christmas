import React, { useEffect, useRef, useState } from 'react';
import { CameraOff, Minimize2, Maximize2, Sparkles, Hand } from 'lucide-react';
import { handTracker } from '../utils/handTracker';
import { HandGestureState } from '../types';

interface Props {
  enabled: boolean;
  visible: boolean;
  onToggle: () => void;
  onGesture: (state: HandGestureState) => void;
  gestureState: HandGestureState;
}

export const HandTrackingWebcam: React.FC<Props> = ({
  enabled,
  visible,
  onToggle,
  onGesture,
  gestureState,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    if (!enabled) {
      handTracker.stop();
      setIsReady(false);
      return;
    }

    let isMounted = true;
    const start = async () => {
      if (videoRef.current && canvasRef.current) {
        const success = await handTracker.init(videoRef.current, canvasRef.current, (st) => {
          if (isMounted) onGesture(st);
        });
        if (isMounted) setIsReady(success);
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
    <div className={`fixed bottom-4 right-4 z-40 font-sans pointer-events-auto ${visible ? '' : 'hidden'}`}>
      <div className="relative rounded-2xl bg-[#090e1c]/90 backdrop-blur-xl border border-cyan-400/30 p-2.5 shadow-[0_10px_35px_rgba(0,0,0,0.6),0_0_25px_rgba(0,240,255,0.2)] transition-all duration-300">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs text-white">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-semibold text-cyan-200 text-[11px] flex items-center gap-1">
              <Hand size={12} />
              <span>Gesti della Mano AI</span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsMinimized((prev) => !prev)}
              title={isMinimized ? 'Ingrandisci' : 'Riduci'}
              className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            >
              {isMinimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
            </button>
            <button
              type="button"
              onClick={onToggle}
              title="Disattiva Webcam"
              className="p-1 rounded hover:bg-red-500/20 text-white/70 hover:text-red-300 transition-colors"
            >
              <CameraOff size={12} />
            </button>
          </div>
        </div>

        {/* Video & Skeleton Canvas Container */}
        {!isMinimized && (
          <div className="relative w-[180px] h-[135px] sm:w-[220px] sm:h-[165px] rounded-xl overflow-hidden bg-black/60 border border-white/10">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover transform scale-x-[-1]"
            />
            <canvas
              ref={canvasRef}
              width={220}
              height={165}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {!isReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-cyan-200 text-[11px] p-2 text-center">
                <Sparkles size={16} className="animate-spin mb-1 text-cyan-400" />
                <span>Caricamento AI Vision...</span>
                <span className="text-[9px] text-white/50">Consenti l'accesso alla webcam</span>
              </div>
            )}
          </div>
        )}

        {/* Real-time Gesture Status Badge */}
        <div className="mt-2 text-[10px] text-center px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-400/20 text-cyan-200">
          {!gestureState.hasHand ? (
            <span className="text-white/60">✋ Mostra la mano alla webcam</span>
          ) : gestureState.isPinching ? (
            <span className="font-bold text-cyan-300 animate-pulse">
              👌 Pizzico Rilevato! Apertura foto...
            </span>
          ) : gestureState.gesture === 'open_palm' ? (
            <span className="text-pink-300">🖐️ Mano Aperta</span>
          ) : gestureState.gesture === 'fist' ? (
            <span className="text-amber-300">✊ Pugno Chiuso</span>
          ) : (
            <span>🖐️ Muovi a destra/sinistra per ruotare</span>
          )}
        </div>
      </div>
    </div>
  );
};
