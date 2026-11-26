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

type Rect = PhotoTransitionOrigin;

interface Pose {
  x: number;
  y: number;
  z: number;
  depth: number;
}

const TRANSITION_DURATION_MS = 760;
const CLOSE_DURATION_MS = 860;
const LEVEL_POSE: Pose = { x: 0, y: 0, z: 0, depth: 0 };

function getTargetRect(): Rect {
  const width = Math.max(1, Math.min(420, window.innerWidth - 32));
  const height = Math.max(1, Math.min(window.innerHeight - 32, width * 0.82));
  const left = (window.innerWidth - width) / 2;
  const top = (window.innerHeight - height) / 2;
  return {
    left,
    top,
    width,
    height,
    x: left + width / 2,
    y: top + height / 2,
    z: 0,
    scale: 1,
  };
}

function getOriginRect(origin?: PhotoTransitionOrigin): Rect {
  if (!origin) return getTargetRect();
  return {
    ...origin,
    left: origin.x - origin.width / 2,
    top: origin.y - origin.height / 2,
  };
}

function getEntryPose(origin?: PhotoTransitionOrigin): Pose {
  const depth = Math.max(-80, Math.min(-24, -55 + (origin?.z ?? 0) * 2));
  return { x: 12, y: -48, z: -6, depth };
}

function interpolateRect(start: Rect, end: Rect, progress: number): Rect {
  const lerp = (from: number, to: number) => from + (to - from) * progress;
  const left = lerp(start.left, end.left);
  const top = lerp(start.top, end.top);
  const width = lerp(start.width, end.width);
  const height = lerp(start.height, end.height);
  return {
    left,
    top,
    width,
    height,
    x: left + width / 2,
    y: top + height / 2,
    z: lerp(start.z, end.z),
    scale: lerp(start.scale, end.scale),
  };
}

function interpolatePose(start: Pose, end: Pose, progress: number): Pose {
  const lerp = (from: number, to: number) => from + (to - from) * progress;
  return {
    x: lerp(start.x, end.x),
    y: lerp(start.y, end.y),
    z: lerp(start.z, end.z),
    depth: lerp(start.depth, end.depth),
  };
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
  const transitionDuration = prefersReducedMotion ? 1 : TRANSITION_DURATION_MS;
  const closeDuration = prefersReducedMotion ? 1 : CLOSE_DURATION_MS;
  const [rect, setRect] = useState<Rect>(() => getOriginRect(origin));
  const [pose, setPose] = useState<Pose>(() => getEntryPose(origin));
  const [backdropOpacity, setBackdropOpacity] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isPresented, setIsPresented] = useState(false);
  const rectRef = useRef(rect);
  const poseRef = useRef(pose);
  const animationFrameRef = useRef<number | null>(null);
  const closeStartedRef = useRef(false);
  const lastCloseRequestRef = useRef(closeRequest);

  const runAnimation = useCallback((
    startRect: Rect,
    startPose: Pose,
    closing: boolean
  ) => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    const startedAt = performance.now();
    const duration = closing ? closeDuration : transitionDuration;
    const frame = (now: number) => {
      const linearProgress = Math.min(1, (now - startedAt) / duration);
      const easedProgress = linearProgress * linearProgress * (3 - 2 * linearProgress);
      const liveOrigin = closing ? getCurrentOrigin() ?? origin : undefined;
      const targetRect = closing
        ? getOriginRect(liveOrigin)
        : getTargetRect();
      const nextRect = interpolateRect(startRect, targetRect, easedProgress);
      const nextPose = interpolatePose(startPose, LEVEL_POSE, easedProgress);

      rectRef.current = nextRect;
      poseRef.current = nextPose;
      setRect(nextRect);
      setPose(nextPose);
      setBackdropOpacity(closing ? 1 - easedProgress : easedProgress);
      setProgress(closing ? 1 - easedProgress : easedProgress);

      if (linearProgress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(frame);
      } else {
        animationFrameRef.current = null;
        if (closing) onClose();
        else setIsPresented(true);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(frame);
  }, [closeDuration, transitionDuration, origin, getCurrentOrigin, onClose]);

  useEffect(() => {
    if (!photo) return;
    const startRect = getOriginRect(origin);
    const startPose = getEntryPose(origin);
    rectRef.current = startRect;
    poseRef.current = startPose;
    closeStartedRef.current = false;
    setRect(startRect);
    setPose(startPose);
    setBackdropOpacity(0);
    setProgress(0);
    setIsClosing(false);
    setIsPresented(false);

    animationFrameRef.current = window.requestAnimationFrame(() => {
      runAnimation(startRect, startPose, false);
    });

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [photo?.id, runAnimation]);

  const handleClose = useCallback(() => {
    if (!photo || closeStartedRef.current) return;
    closeStartedRef.current = true;
    onCloseStart();
    setIsClosing(true);
    runAnimation(rectRef.current, poseRef.current, true);
  }, [photo, onCloseStart, runAnimation]);

  useEffect(() => {
    if (lastCloseRequestRef.current === closeRequest) return;
    lastCloseRequestRef.current = closeRequest;
    if (photo) handleClose();
  }, [closeRequest, photo, handleClose]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" style={{ perspective: '1200px' }}>
      <div
        onClick={handleClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md pointer-events-auto"
        style={{ opacity: backdropOpacity }}
      />
      <div
        onClick={(event) => event.stopPropagation()}
        className="absolute z-[51] overflow-hidden border-2 border-amber-200/80 bg-gradient-to-br from-amber-200 via-emerald-800 to-red-900 shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_42px_rgba(255,195,70,0.3)]"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          padding: `${4 + progress * 8}px`,
          borderRadius: `${12 + progress * 16}px`,
          transform: `translateZ(${pose.depth}px) rotateX(${pose.x}deg) rotateY(${pose.y}deg) rotateZ(${pose.z}deg)`,
          transformOrigin: 'center center',
          willChange: 'left, top, width, height, transform',
          pointerEvents: 'auto',
        }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[inherit] border border-amber-100/70 bg-gradient-to-b from-[#173321] via-[#102417] to-[#1c1710]">
          <div className="h-full w-full rounded-[inherit] border-2 border-amber-200/80 bg-gradient-to-br from-amber-100 via-amber-500 to-emerald-950 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
            <div className="h-full w-full overflow-hidden rounded-xl border border-emerald-950 bg-emerald-950">
              <img src={photo.url} alt={photo.title} className="h-full w-full object-cover" />
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Chiudi foto"
            disabled={!isPresented || isClosing}
            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-amber-200/80 bg-[#102417]/80 text-amber-100 shadow-lg backdrop-blur-sm transition-colors hover:bg-amber-300 hover:text-emerald-950 disabled:pointer-events-none"
            style={{ opacity: progress }}
          >
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>
      </div>
    </div>
  );
};
