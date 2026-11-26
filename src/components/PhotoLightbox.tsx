import React, { useEffect, useRef, useState } from 'react';
import { MemoryPhoto, PhotoTransitionOrigin } from '../types';

interface Props {
  photo: MemoryPhoto | null;
  origin?: PhotoTransitionOrigin;
  getCurrentOrigin: () => PhotoTransitionOrigin | undefined;
  closeRequest: number;
  onCloseStart: () => void;
  onClose: () => void;
}

const TRANSITION_DURATION_MS = 760;
const CLOSE_DURATION_MS = 860;

export const PhotoLightbox: React.FC<Props> = ({
  photo,
  origin,
  getCurrentOrigin,
  closeRequest,
  onCloseStart,
  onClose,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [isPresented, setIsPresented] = useState(false);
  const [returnOrigin, setReturnOrigin] = useState<PhotoTransitionOrigin | undefined>();
  const closeTimerRef = useRef<number | null>(null);
  const lastCloseRequestRef = useRef(closeRequest);
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const transitionDuration = prefersReducedMotion
    ? 1
    : TRANSITION_DURATION_MS;
  const closeDuration = prefersReducedMotion ? 1 : CLOSE_DURATION_MS;

  useEffect(() => {
    setIsClosing(false);
    setIsPresented(false);
    setReturnOrigin(undefined);
    const frame = window.requestAnimationFrame(() => setIsPresented(true));
    return () => {
      window.cancelAnimationFrame(frame);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [photo?.id]);

  const handleClose = () => {
    if (isClosing) return;
    onCloseStart();
    setIsClosing(true);
    setIsPresented(false);
    setReturnOrigin(getCurrentOrigin() ?? origin);
    closeTimerRef.current = window.setTimeout(
      onClose,
      closeDuration + 80
    );
  };

  useEffect(() => {
    if (lastCloseRequestRef.current === closeRequest) return;
    lastCloseRequestRef.current = closeRequest;
    if (photo) handleClose();
  }, [closeRequest, photo]);

  if (!photo) return null;

  const transitionOrigin = returnOrigin ?? origin;
  const targetWidth = Math.min(420, Math.max(1, window.innerWidth - 32));
  const originX = transitionOrigin
    ? transitionOrigin.left + transitionOrigin.width / 2 - window.innerWidth / 2
    : 0;
  const originY = transitionOrigin
    ? transitionOrigin.top + transitionOrigin.height / 2 - window.innerHeight / 2
    : 0;
  const originScale = transitionOrigin
    ? Math.min(1, (transitionOrigin.width / targetWidth) * 1.2)
    : 0.62;
  const startTransform =
    `translate3d(${originX * 1.2}px, ${originY * 1.2}px, -240px) scale(${originScale}) ` +
    'rotateX(18deg) rotateY(-70deg) rotateZ(-8deg)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans"
      style={{ perspective: '1200px' }}
    >
      <div
        onClick={handleClose}
        className={`absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity ${
          isPresented && !isClosing ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDuration: `${isClosing ? 320 : 420}ms` }}
      />
      <div
        onClick={(event) => event.stopPropagation()}
        onTransitionEnd={(event) => {
          if (isClosing && event.propertyName === 'transform' && event.target === event.currentTarget) {
            if (closeTimerRef.current !== null) {
              window.clearTimeout(closeTimerRef.current);
              closeTimerRef.current = null;
            }
            onClose();
          }
        }}
        className="relative max-h-[calc(100vh-2rem)] max-w-[420px] w-full overflow-x-hidden overflow-y-auto rounded-[28px] border-2 border-amber-200/80 bg-gradient-to-br from-amber-200 via-emerald-800 to-red-900 p-[2px] shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_42px_rgba(255,195,70,0.3)]"
        style={{
          transform: isPresented ? 'translate3d(0, 0, 0) scale(1) rotateX(0) rotateY(0) rotateZ(0)' : startTransform,
          transformOrigin: 'center center',
          opacity: isPresented ? 1 : 0.78,
          transition: isClosing
            ? `transform ${closeDuration}ms cubic-bezier(0.45, 0, 0.2, 1), opacity 420ms ease-out`
            : `transform ${transitionDuration}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 380ms ease-out`,
          willChange: 'transform, opacity',
        }}
      >
        <div className="relative max-h-[calc(100vh-2.25rem)] overflow-hidden rounded-[24px] border border-amber-100/70 bg-gradient-to-b from-[#173321] via-[#102417] to-[#1c1710] p-3 sm:p-4">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Chiudi foto"
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-amber-200/80 bg-[#102417]/80 text-amber-100 shadow-lg backdrop-blur-sm transition-colors hover:bg-amber-300 hover:text-emerald-950"
          >
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
          <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-100 via-amber-500 to-emerald-950 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
            <div
              className="relative w-full aspect-[4/3] overflow-hidden rounded-xl border border-emerald-950 bg-emerald-950"
              style={{ maxHeight: 'min(42vh, 22rem)' }}
            >
              <img
                src={photo.url}
                alt={photo.title}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
