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

const OPEN_DURATION_MS = 780;
const CLOSE_DURATION_MS = 640;

// Refined elastic spring ease-out: subtle tactile cushion settle (~2.6% overshoot)
function easeOutElasticSoft(t: number): number {
  const c1 = 1.18;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Smooth anticipation + glide-back curve for closing
function easeInOutBackSoft(t: number): number {
  const c1 = 0.85;
  const c2 = c1 * 1.45;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
}

function getPolaroidShowcaseDimensions(): { width: number; height: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.min(560, vw - 40);
  const maxH = Math.min(620, vh - 68);
  // Generous Polaroid proportions: crisp 4:3 photo + 92px luxury smoked-glass dedication chin
  const chinHeight = vw < 640 ? 84 : 96;
  let width = maxW;
  let height = Math.round((width - 28) * 0.74 + chinHeight + 28);
  if (height > maxH) {
    height = maxH;
    width = Math.max(250, Math.round((height - chinHeight - 28) / 0.74 + 28));
  }
  return { width: Math.max(250, width), height: Math.max(250, height) };
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

  const [dims, setDims] = useState<{ width: number; height: number }>(() =>
    getPolaroidShowcaseDimensions()
  );
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

  useEffect(() => {
    const onResize = () => setDims(getPolaroidShowcaseDimensions());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const applyFrameTransform = useCallback(
    (
      originRect: PhotoTransitionOrigin | undefined,
      easedOpen: number,
      rawPhase: number,
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
      const origW = originRect ? Math.max(48, originRect.width) : targetW * 0.24;
      const origTilt = originRect?.tilt ?? (origX < centerX ? -5 : 5);
      const startScale = Math.max(0.15, Math.min(0.65, origW / targetW));

      // t = 0 at floating Polaroid slot, t = 1 at centered showcase (with refined elastic cushion!)
      const t = easedOpen;
      const clampedT = Math.max(0, Math.min(1, t));
      const inv = 1 - t;
      const clampedInv = 1 - clampedT;

      // Graceful parabolic lift arc during flight
      const arcLift = -Math.sin(Math.PI * rawPhase) * (closing ? 28 : 40);
      const dx = (origX - centerX) * inv;
      const dy = (origY - centerY) * inv + arcLift;
      const scale = Math.max(0.12, startScale + (1 - startScale) * t);

      // Soft 3D Flip + Perspective Bank (rotates smoothly toward viewer on open, flips gracefully back on close!)
      const sideSign = origX < centerX ? 1 : -1;
      const flipProfile = closing
        ? Math.pow(rawPhase, 1.15)
        : Math.pow(1 - rawPhase, 1.55);
      const rotY = sideSign * (closing ? 48 : 58) * flipProfile;
      const rotX = (closing ? 11 : 14) * flipProfile;
      const rotZ = origTilt * clampedInv - sideSign * 6 * Math.sin(Math.PI * rawPhase);
      const zDepth = (closing ? -185 : -220) * clampedInv;

      // Pure GPU-composited transform — silky 60 FPS with zero layout reflow!
      card.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, ${zDepth.toFixed(
        1
      )}px) rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg) rotateZ(${rotZ.toFixed(
        2
      )}deg) scale(${scale.toFixed(4)})`;
      card.style.opacity = `${Math.min(1, 0.94 + clampedT * 0.06).toFixed(3)}`;

      // Smooth dim + blur backdrop
      backdrop.style.opacity = `${clampedT.toFixed(3)}`;

      if (captionRef.current) {
        const capOpacity = Math.max(0, Math.min(1, (clampedT - 0.38) / 0.52));
        captionRef.current.style.opacity = `${capOpacity.toFixed(3)}`;
        captionRef.current.style.transform = `translateY(${((1 - capOpacity) * 8).toFixed(1)}px)`;
      }
      if (closeBtnRef.current) {
        const btnOpacity = Math.max(0, Math.min(1, (clampedT - 0.45) / 0.5));
        closeBtnRef.current.style.opacity = `${btnOpacity.toFixed(3)}`;
      }
      if (sheenRef.current) {
        if (!closing) {
          // Warm champagne glass gleam sweeping diagonally across the Polaroid on arrival
          const sheenPos = -130 + rawPhase * 280;
          const sheenAlpha = Math.sin(Math.PI * rawPhase) * 0.48;
          sheenRef.current.style.transform = `translateX(${sheenPos.toFixed(1)}%) skewX(-24deg)`;
          sheenRef.current.style.opacity = `${sheenAlpha.toFixed(3)}`;
        } else {
          sheenRef.current.style.opacity = '0';
        }
      }

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
          const eased = easeInOutBackSoft(raw);
          const liveOrigin = getCurrentOrigin() ?? origin;
          applyFrameTransform(liveOrigin, 1 - eased, raw, true);
        } else {
          const eased = easeOutElasticSoft(raw);
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

  // Subtle ambient zero-gravity breath while the Polaroid is open
  useEffect(() => {
    if (!isPresented || isClosing || prefersReducedMotion) return;
    let rafId = 0;
    const t0 = performance.now();
    const idleFloat = (now: number) => {
      const card = cardRef.current;
      if (!card) return;
      const elapsed = (now - t0) / 1000;
      const dy = Math.sin(elapsed * 1.45) * 3.5;
      const rotZ = Math.sin(elapsed * 0.9) * 0.55;
      card.style.transform = `translate3d(0px, ${dy.toFixed(2)}px, 0px) rotateZ(${rotZ.toFixed(2)}deg) scale(1)`;
      rafId = window.requestAnimationFrame(idleFloat);
    };
    rafId = window.requestAnimationFrame(idleFloat);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPresented, isClosing, prefersReducedMotion]);

  useEffect(() => {
    if (!photo) return;
    closeStartedRef.current = false;
    setIsClosing(false);
    setIsPresented(false);

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
    setIsPresented(false);
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
      style={{ perspective: '1400px' }}
    >
      {/* Smooth cinematic smoked backdrop */}
      <div
        ref={backdropRef}
        onClick={handleClose}
        className="absolute inset-0 bg-[#03050a]/78 backdrop-blur-md pointer-events-auto"
        style={{ opacity: 0, willChange: 'opacity' }}
      />

      {/* Luxury Smoked-Glass & Champagne Gold Polaroid Showcase */}
      <div
        ref={cardRef}
        onClick={(event) => event.stopPropagation()}
        className="relative z-[51] flex flex-col overflow-hidden rounded-[24px] border border-amber-200/45 bg-gradient-to-b from-[#1a1d2a]/92 via-[#10121b]/96 to-[#090b10]/98 p-3.5 pb-4 backdrop-blur-xl shadow-[0_36px_110px_rgba(0,0,0,0.9),0_0_64px_rgba(251,191,36,0.22)] ring-1 ring-inset ring-white/10 pointer-events-auto"
        style={{
          width: `${dims.width}px`,
          height: `${dims.height}px`,
          transformOrigin: 'center center',
          willChange: 'transform, opacity',
          opacity: 0,
        }}
      >
        {/* Top champagne gold light hairline */}
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/85 to-transparent" />

        {/* Subtle golden corner starlight accents */}
        <span className="pointer-events-none absolute left-3 top-2.5 text-[10px] text-amber-200/55">✦</span>
        <span className="pointer-events-none absolute right-3 bottom-2.5 text-[10px] text-amber-200/45">✦</span>

        {/* Sweeping golden glass reflection during elastic 3D flip */}
        <div
          ref={sheenRef}
          className="pointer-events-none absolute inset-y-0 -left-1/2 z-20 w-1/2 bg-gradient-to-r from-transparent via-amber-100/28 to-transparent"
          style={{ opacity: 0, willChange: 'transform, opacity' }}
        />

        {/* Crisp Polaroid Photo Viewport */}
        <div className="relative flex-1 w-full overflow-hidden rounded-[15px] border border-amber-100/20 bg-black/90 shadow-inner">
          <img
            src={photo.url}
            alt={photo.title}
            className="h-full w-full object-cover select-none"
            draggable={false}
          />
          {/* Subtle cinema vignette */}
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_36px_rgba(0,0,0,0.34)]" />

          {/* Sleek Floating Close Button */}
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

        {/* Romantic Polaroid Dedication Chin (Title + Subtitle + Gesture Hint) */}
        <div
          ref={captionRef}
          className="flex items-end justify-between gap-3 px-2 pt-3.5 pb-0.5"
          style={{ opacity: 0, willChange: 'opacity, transform' }}
        >
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-lg sm:text-[21px] font-medium italic tracking-wide text-amber-50 drop-shadow-[0_2px_10px_rgba(251,191,36,0.28)]"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            >
              {photo.title || 'Ricordo di Natale'}
            </h3>
            {photo.subtitle && (
              <p className="mt-0.5 truncate text-xs sm:text-[13px] italic tracking-wide text-amber-100/70">
                {photo.subtitle}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-full border border-amber-200/30 bg-amber-200/10 px-2.5 py-1 text-[11px] font-medium text-amber-200/90 backdrop-blur-sm">
            🤏 Pizzica per chiudere
          </span>
        </div>
      </div>
    </div>
  );
};
