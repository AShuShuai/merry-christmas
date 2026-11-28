import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MemoryPhoto, PhotoTransitionOrigin } from '../types';

interface Props {
  photo: MemoryPhoto | null;
  origin?: PhotoTransitionOrigin;
  getCurrentOrigin: () => PhotoTransitionOrigin | undefined;
  closeRequest: number;
  onCloseStart: () => void;
  onClose: () => void;
}

const OPEN_DURATION_MS = 680;
const CLOSE_DURATION_MS = 580;

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getShowcaseDimensions(): { width: number; height: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.min(640, vw - 44);
  const maxH = Math.min(580, vh - 76);
  // Elegant 4:3 photo viewport + sleek 56px gallery caption strip
  let width = maxW;
  let height = Math.round(width * 0.72 + 58);
  if (height > maxH) {
    height = maxH;
    width = Math.max(240, Math.round((height - 58) / 0.72));
  }
  return { width: Math.max(240, width), height: Math.max(220, height) };
}

export const PhotoLightbox: React.FC<Props> = ({
  photo,
  origin,
  getCurrentOrigin,
  closeRequest,
  onCloseStart,
  onClose,
}) => {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const openDuration = prefersReducedMotion ? 1 : OPEN_DURATION_MS;
  const closeDuration = prefersReducedMotion ? 1 : CLOSE_DURATION_MS;

  const [dims, setDims] = useState<{ width: number; height: number }>(() => getShowcaseDimensions());
  const [isPresented, setIsPresented] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const backdropRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const sheenRef = useRef<HTMLDivElement | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const closeStartedRef = useRef(false);
  const lastCloseRequestRef = useRef(closeRequest);
  const dimsRef = useRef(dims);
  dimsRef.current = dims;

  // Keep showcase dimensions responsive on window resize
  useEffect(() => {
    const onResize = () => setDims(getShowcaseDimensions());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const applyFrameTransform = useCallback(
    (
      originRect: PhotoTransitionOrigin | undefined,
      openProgress: number,
      arcFactor: number,
      closing: boolean
    ) => {
      const card = cardRef.current;
      const backdrop = backdropRef.current;
      if (!card || !backdrop) return;

      const { width: targetW, height: targetH } = dimsRef.current;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      const origX = originRect ? originRect.x : centerX;
      const origY = originRect ? originRect.y : centerY + 60;
      const origW = originRect ? Math.max(40, originRect.width) : targetW * 0.24;
      const startScale = Math.max(0.14, Math.min(0.65, origW / targetW));

      // t = 0 at origin floating slot, t = 1 at centered showcase
      const t = openProgress;
      const inv = 1 - t;

      const dx = (origX - centerX) * inv;
      // Gentle cinematic upward arc as the photo flies toward / away from the viewer
      const arcLift = -Math.sin(Math.PI * arcFactor) * (closing ? 24 : 34);
      const dy = (origY - centerY) * inv + arcLift;
      const scale = startScale + (1 - startScale) * t;

      // Directional 3D perspective bank depending on left/right origin
      const sideSign = origX < centerX ? 1 : -1;
      const rotY = sideSign * (closing ? 28 : 34) * inv;
      const rotX = (closing ? 10 : 12) * inv;
      const rotZ = -sideSign * (closing ? 5 : 7) * inv;
      const zDepth = (closing ? -110 : -150) * inv;

      // Pure GPU-composited transform — silky 60 FPS with zero layout reflow!
      card.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, ${zDepth.toFixed(
        1
      )}px) rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg) rotateZ(${rotZ.toFixed(
        2
      )}deg) scale(${scale.toFixed(4)})`;
      // Keep card fully solid during flight so it docks seamlessly back into its floating slot
      card.style.opacity = `${Math.min(1, 0.92 + t * 0.08).toFixed(3)}`;

      // Subtle dynamic glow expansion as card flies closer to viewer
      backdrop.style.opacity = `${Math.max(0, Math.min(1, t)).toFixed(3)}`;

      if (captionRef.current) {
        const capOpacity = Math.max(0, Math.min(1, (t - 0.45) / 0.55));
        captionRef.current.style.opacity = `${capOpacity.toFixed(3)}`;
      }
      if (closeBtnRef.current) {
        const btnOpacity = Math.max(0, Math.min(1, (t - 0.5) / 0.5));
        closeBtnRef.current.style.opacity = `${btnOpacity.toFixed(3)}`;
      }
      if (sheenRef.current && !closing) {
        // Warm golden glass reflection sweep during fly-in
        const sheenPos = -120 + arcFactor * 260;
        const sheenOpacity = Math.sin(Math.PI * arcFactor) * 0.45;
        sheenRef.current.style.transform = `translateX(${sheenPos.toFixed(1)}%) skewX(-22deg)`;
        sheenRef.current.style.opacity = `${sheenOpacity.toFixed(3)}`;
      } else if (sheenRef.current && closing) {
        sheenRef.current.style.opacity = '0';
      }

      // Ensure card stays aligned to its centered anchor size
      if (card.style.width !== `${targetW}px`) card.style.width = `${targetW}px`;
      if (card.style.height !== `${targetH}px`) card.style.height = `${targetH}px`;
    },
    []
  );

  const runAnimation = useCallback(
    (closing: boolean) => {
      if (animFrameRef.current !== null) {
        window.cancelAnimationFrame(animFrameRef.current);
      }

      const startedAt = performance.now();
      const duration = closing ? closeDuration : openDuration;

      const step = (now: number) => {
        const raw = Math.min(1, (now - startedAt) / duration);
        if (closing) {
          const eased = easeInOutCubic(raw);
          const liveOrigin = getCurrentOrigin() ?? origin;
          applyFrameTransform(liveOrigin, 1 - eased, raw, true);
        } else {
          const eased = easeOutQuart(raw);
          applyFrameTransform(origin, eased, raw, false);
        }

        if (raw < 1) {
          animFrameRef.current = window.requestAnimationFrame(step);
        } else {
          animFrameRef.current = null;
          if (closing) {
            onClose();
          } else {
            setIsPresented(true);
          }
        }
      };

      animFrameRef.current = window.requestAnimationFrame(step);
    },
    [applyFrameTransform, closeDuration, openDuration, getCurrentOrigin, origin, onClose]
  );

  useEffect(() => {
    if (!photo) return;
    closeStartedRef.current = false;
    setIsClosing(false);
    setIsPresented(false);

    // Paint initial frame at exact origin slot before flying toward viewer
    applyFrameTransform(origin, 0, 0, false);

    animFrameRef.current = window.requestAnimationFrame(() => {
      runAnimation(false);
    });

    return () => {
      if (animFrameRef.current !== null) {
        window.cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [photo?.id, origin, applyFrameTransform, runAnimation]);

  const handleClose = useCallback(() => {
    if (!photo || closeStartedRef.current) return;
    closeStartedRef.current = true;
    onCloseStart();
    setIsClosing(true);
    runAnimation(true);
  }, [photo, onCloseStart, runAnimation]);

  useEffect(() => {
    if (lastCloseRequestRef.current === closeRequest) return;
    lastCloseRequestRef.current = closeRequest;
    if (photo) handleClose();
  }, [closeRequest, photo, handleClose]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{ perspective: '1300px' }}
    >
      {/* Smooth ambient dimmed backdrop */}
      <div
        ref={backdropRef}
        onClick={handleClose}
        className="absolute inset-0 bg-[#04060c]/75 backdrop-blur-md pointer-events-auto"
        style={{ opacity: 0, willChange: 'opacity' }}
      />

      {/* Luxury Gallery Showcase Frame */}
      <div
        ref={cardRef}
        onClick={(event) => event.stopPropagation()}
        className="relative z-[51] flex flex-col overflow-hidden rounded-[22px] border border-amber-200/45 bg-gradient-to-b from-[#161922]/95 via-[#0f1219]/98 to-[#0a0c11]/98 p-3 shadow-[0_32px_95px_rgba(0,0,0,0.88),0_0_55px_rgba(251,191,36,0.22)] ring-1 ring-inset ring-white/10 pointer-events-auto"
        style={{
          width: `${dims.width}px`,
          height: `${dims.height}px`,
          transformOrigin: 'center center',
          willChange: 'transform, opacity',
          opacity: 0,
        }}
      >
        {/* Subtle top champagne light hairline */}
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/75 to-transparent" />

        {/* Sweeping golden glass sheen during fly-in */}
        <div
          ref={sheenRef}
          className="pointer-events-none absolute inset-y-0 -left-1/2 z-20 w-1/2 bg-gradient-to-r from-transparent via-amber-100/25 to-transparent"
          style={{ opacity: 0, willChange: 'transform, opacity' }}
        />

        {/* Crisp Full-Bleed Photo Viewport */}
        <div className="relative flex-1 w-full overflow-hidden rounded-[14px] border border-amber-100/20 bg-black/90 shadow-inner">
          <img
            src={photo.url}
            alt={photo.title}
            className="h-full w-full object-cover select-none"
            draggable={false}
          />
          {/* Subtle cinema edge vignette */}
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_32px_rgba(0,0,0,0.35)]" />

          {/* Refined Floating Close Button */}
          <button
            ref={closeBtnRef}
            type="button"
            onClick={handleClose}
            aria-label="Chiudi foto"
            disabled={!isPresented || isClosing}
            className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/50 bg-black/55 text-amber-100 shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-105 hover:border-amber-200 hover:bg-amber-200 hover:text-slate-950 disabled:pointer-events-none"
            style={{ opacity: 0 }}
          >
            <span aria-hidden="true" className="text-xl leading-none font-light">×</span>
          </button>
        </div>

        {/* Sleek Gallery Caption Strip */}
        <div
          ref={captionRef}
          className="flex items-center justify-between gap-3 px-2 pt-2.5 pb-0.5"
          style={{ opacity: 0 }}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm sm:text-base font-medium tracking-wide text-amber-50/95">
              {photo.title || 'Ricordo di Natale'}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-amber-200/25 bg-amber-200/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200/85">
            🤏 Pizzica per chiudere
          </span>
        </div>
      </div>
    </div>
  );
};
