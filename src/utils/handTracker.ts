import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { HandGestureState } from '../types';

export type GestureCallback = (state: HandGestureState) => void;

type InitResult = 'ready' | 'cancelled' | 'failed';
type HandLandmark = { x: number; y: number; z?: number };

function landmarkDistance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function landmarkDistance2D(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function fingerExtension(
  wrist: HandLandmark,
  mcp: HandLandmark,
  pip: HandLandmark,
  tip: HandLandmark
): number {
  const first = { x: mcp.x - pip.x, y: mcp.y - pip.y, z: (mcp.z ?? 0) - (pip.z ?? 0) };
  const second = { x: tip.x - pip.x, y: tip.y - pip.y, z: (tip.z ?? 0) - (pip.z ?? 0) };
  const lengths = landmarkDistance(first, { x: 0, y: 0, z: 0 }) *
    landmarkDistance(second, { x: 0, y: 0, z: 0 });
  const dot = first.x * second.x + first.y * second.y + first.z * second.z;
  const angle = lengths > 0
    ? Math.acos(Math.max(-1, Math.min(1, dot / lengths))) * 180 / Math.PI
    : 0;
  const angleExtension = clamp01((angle - 60) / 82);
  const mcpDistance = landmarkDistance(mcp, wrist);
  const reachRatio = landmarkDistance(tip, wrist) / Math.max(mcpDistance, 0.0001);
  const reachExtension = clamp01((reachRatio - 1.08) / 0.55);

  return clamp01(angleExtension * 0.7 + reachExtension * 0.3);
}

class HandTrackerEngine {
  private handLandmarker: HandLandmarker | null = null;
  private isRunning: boolean = false;
  private animFrameId: number | null = null;
  private lastVideoTime: number = -1;
  private lastInferenceTime: number = 0;
  private generation: number = 0;
  private initPromise: Promise<InitResult> | null = null;

  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private onGestureCallback: GestureCallback | null = null;

  private lastHandX: number | null = null;
  private lastHandY: number | null = null;
  private smoothCursorX: number | null = null;
  private smoothCursorY: number | null = null;
  private isPinching: boolean = false;
  private smoothedPinchDistance: number | null = null;
  private pinchLastStrictTime: number = 0;
  private pinchStartFrames: number = 0;
  private smoothDeltaX: number = 0;
  private smoothDeltaY: number = 0;
  private lastEmittedHasHand: boolean = false;
  private lastEmittedGesture: HandGestureState['gesture'] = 'none';
  private lastEmittedPinching: boolean = false;
  private lastEmittedCursorX: number = -1;
  private lastEmittedCursorY: number = -1;
  private lastEmittedPinchDistance: number = 1;

  public init(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    onGesture: GestureCallback
  ): Promise<boolean> {
    if (this.isRunning) {
      this.onGestureCallback = onGesture;
      return Promise.resolve(true);
    }

    if (this.initPromise) {
      return this.initPromise.then((result) => {
        if (result === 'failed') return false;
        if (result === 'ready' && this.isRunning) {
          this.onGestureCallback = onGesture;
          return true;
        }
        return this.init(video, canvas, onGesture);
      });
    }

    const initialization = this.initialize(video, canvas, onGesture);
    const queuedInitialization = initialization.then((result) => {
      if (this.initPromise === queuedInitialization) this.initPromise = null;
      return result;
    });
    this.initPromise = queuedInitialization;

    return queuedInitialization.then((result) => result === 'ready');
  }

  private async initialize(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    onGesture: GestureCallback
  ): Promise<InitResult> {
    const generation = ++this.generation;
    this.videoEl = video;
    this.canvasEl = canvas;
    this.canvasCtx = canvas.getContext('2d');
    this.onGestureCallback = onGesture;
    this.lastVideoTime = -1;
    this.lastInferenceTime = 0;
    this.lastEmittedHasHand = false;

    try {
      if (!this.handLandmarker) {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });

        if (generation !== this.generation) {
          landmarker.close();
          return 'cancelled';
        }

        this.handLandmarker = landmarker;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user',
        },
      });

      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return 'cancelled';
      }

      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        const playVideo = () => {
          video.play().then(() => resolve()).catch(() => resolve());
        };
        if (video.readyState >= 1) playVideo();
        else video.onloadedmetadata = playVideo;
      });

      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        return 'cancelled';
      }

      this.isRunning = true;
      this.startLoop();
      return 'ready';
    } catch (err) {
      if (generation !== this.generation) return 'cancelled';
      console.error('HandTracker init error:', err);
      this.stop();
      return 'failed';
    }
  }

  public stop() {
    this.generation += 1;
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.videoEl && this.videoEl.srcObject) {
      const stream = this.videoEl.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      this.videoEl.srcObject = null;
    }
    if (this.videoEl) this.videoEl.onloadedmetadata = null;
    if (this.canvasEl) {
      const ctx = this.canvasEl.getContext('2d');
      ctx?.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
    }
    this.lastHandX = null;
    this.lastHandY = null;
    this.smoothCursorX = null;
    this.smoothCursorY = null;
    this.isPinching = false;
    this.smoothedPinchDistance = null;
    this.pinchLastStrictTime = 0;
    this.pinchStartFrames = 0;
    this.lastVideoTime = -1;
    this.lastInferenceTime = 0;
    this.smoothDeltaX = 0;
    this.smoothDeltaY = 0;
    this.lastEmittedHasHand = false;
    this.lastEmittedGesture = 'none';
    this.lastEmittedPinching = false;
    this.lastEmittedCursorX = -1;
    this.lastEmittedCursorY = -1;
    this.lastEmittedPinchDistance = 1;
    this.canvasCtx = null;
  }

  private startLoop() {
    const loop = () => {
      if (!this.isRunning || !this.videoEl || !this.handLandmarker) return;

      // Skip all webcam AI inference when browser tab is hidden
      if (!document.hidden) {
        const nowInMs = performance.now();
        // Adaptive inference throttling: ~23 FPS when hand is active (high responsiveness), ~8 FPS when idle
        const minIntervalMs = this.lastEmittedHasHand ? 44 : 125;
        if (
          this.videoEl.readyState >= 2 &&
          this.videoEl.currentTime !== this.lastVideoTime &&
          nowInMs - this.lastInferenceTime >= minIntervalMs
        ) {
          this.lastVideoTime = this.videoEl.currentTime;
          this.lastInferenceTime = nowInMs;
          const results: HandLandmarkerResult = this.handLandmarker.detectForVideo(
            this.videoEl,
            nowInMs
          );
          this.processResults(results);
        }
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private processResults(results: HandLandmarkerResult) {
    if (!this.canvasEl || !this.videoEl) return;
    const ctx = this.canvasCtx ?? this.canvasEl.getContext('2d');
    if (!ctx) return;
    this.canvasCtx = ctx;

    const w = this.canvasEl.width;
    const h = this.canvasEl.height;

    if (!results.landmarks || results.landmarks.length === 0) {
      // No hand detected: avoid redundant React re-renders & canvas clears if already idle!
      if (!this.lastEmittedHasHand) {
        return;
      }

      ctx.clearRect(0, 0, w, h);
      this.lastHandX = null;
      this.lastHandY = null;
      this.smoothCursorX = null;
      this.smoothCursorY = null;
      this.isPinching = false;
      this.smoothedPinchDistance = null;
      this.pinchLastStrictTime = 0;
      this.pinchStartFrames = 0;
      this.smoothDeltaX = 0;
      this.smoothDeltaY = 0;
      this.lastEmittedHasHand = false;
      this.lastEmittedGesture = 'none';
      this.lastEmittedPinching = false;
      this.lastEmittedCursorX = 0.5;
      this.lastEmittedCursorY = 0.5;
      this.lastEmittedPinchDistance = 1;

      this.onGestureCallback?.({
        hasHand: false,
        gesture: 'none',
        cursorX: 0.5,
        cursorY: 0.5,
        deltaX: 0,
        deltaY: 0,
        pinchDistance: 1,
        isPinching: false,
      });
      return;
    }

    ctx.clearRect(0, 0, w, h);
    const landmarks = results.landmarks[0];

    // Landmark references:
    // 0: Wrist
    // 4: Thumb Tip
    // 8: Index Tip
    // 12: Middle Tip
    // 16: Ring Tip
    // 20: Pinky Tip
    const wrist = landmarks[0];
    const thumb = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    // High-DPI Ergonomic Active-Zone Mapping:
    // Maps compact central webcam box [0.21..0.79] x [0.18..0.82] onto full [0..1] screen (+22% higher DPI!)
    // Weighted toward index fingertip (65% index + 35% thumb) so closing thumb into a pinch doesn't pull cursor off-target!
    const rawMirrorX = 1 - (indexTip.x * 0.65 + thumb.x * 0.35);
    const rawMirrorY = indexTip.y * 0.65 + thumb.y * 0.35;
    const rawCursorX = clamp01((rawMirrorX - 0.21) / 0.58);
    const rawCursorY = clamp01((rawMirrorY - 0.18) / 0.64);

    // One-Euro Style Velocity-Adaptive Filter:
    // - Slow / aiming: low alpha (~0.26) eliminates micro-jitter for surgical pinch accuracy
    // - Fast sweep: high alpha (~0.86) gives instant, zero-lag high-DPI tracking!
    if (this.smoothCursorX === null || this.smoothCursorY === null) {
      this.smoothCursorX = rawCursorX;
      this.smoothCursorY = rawCursorY;
    } else {
      const moveSpeed = Math.hypot(rawCursorX - this.smoothCursorX, rawCursorY - this.smoothCursorY);
      const adaptiveAlpha = Math.max(0.24, Math.min(0.88, 0.24 + moveSpeed * 11.5));
      this.smoothCursorX += (rawCursorX - this.smoothCursorX) * adaptiveAlpha;
      this.smoothCursorY += (rawCursorY - this.smoothCursorY) * adaptiveAlpha;
    }
    const cursorX = this.smoothCursorX;
    const cursorY = this.smoothCursorY;

    // Use the palm center rather than the wrist to reduce rotation jitter.
    const currentHandX = 1 - (wrist.x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5;
    const currentHandY = (wrist.y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5;

    let deltaX = 0;
    let deltaY = 0;

    if (this.lastHandX !== null && this.lastHandY !== null) {
      const rawDeltaX = currentHandX - this.lastHandX;
      const rawDeltaY = currentHandY - this.lastHandY;
      const filteredDeltaX = Math.abs(rawDeltaX) < 0.0038 ? 0 : rawDeltaX;
      const filteredDeltaY = Math.abs(rawDeltaY) < 0.0038 ? 0 : rawDeltaY;
      this.smoothDeltaX = this.smoothDeltaX * 0.5 + filteredDeltaX * 0.5;
      this.smoothDeltaY = this.smoothDeltaY * 0.5 + filteredDeltaY * 0.5;
      this.smoothDeltaX = Math.max(-0.017, Math.min(0.017, this.smoothDeltaX));
      this.smoothDeltaY = Math.max(-0.017, Math.min(0.017, this.smoothDeltaY));
      deltaX = this.smoothDeltaX;
      deltaY = this.smoothDeltaY;
    }

    this.lastHandX = currentHandX;
    this.lastHandY = currentHandY;

    // Use reliable 2D fingertip distance normalized by 2D palm scale (avoids noisy MediaPipe Z depth error!)
    const palmLength2D = Math.max(
      landmarkDistance2D(wrist, landmarks[9]),
      landmarkDistance2D(landmarks[5], landmarks[17]) * 1.15,
      0.001
    );
    const rawNormalizedPinchDistance = landmarkDistance2D(thumb, indexTip) / palmLength2D;
    // Responsive smoothing (0.78 weight to latest frame so quick natural pinches register immediately!)
    this.smoothedPinchDistance = this.smoothedPinchDistance === null
      ? rawNormalizedPinchDistance
      : this.smoothedPinchDistance +
        (rawNormalizedPinchDistance - this.smoothedPinchDistance) * 0.78;
    const normalizedPinchDistance = this.smoothedPinchDistance;

    const extensions = [
      fingerExtension(wrist, landmarks[5], landmarks[6], indexTip),
      fingerExtension(wrist, landmarks[9], landmarks[10], middleTip),
      fingerExtension(wrist, landmarks[13], landmarks[14], ringTip),
      fingerExtension(wrist, landmarks[17], landmarks[18], pinkyTip),
    ];
    const otherFingersAverage = (extensions[1] + extensions[2] + extensions[3]) / 3;
    const indexReach = landmarkDistance2D(indexTip, wrist) / palmLength2D;

    // A REAL tight fist has ALL 4 fingers tightly curled into the palm (index tip tucked close to knuckles/palm)
    const tightFist =
      extensions.every((ext) => ext < 0.28) &&
      otherFingersAverage < 0.22 &&
      indexReach < 1.18;

    // A natural pinch allows relaxed/half-curled middle-ring-pinky fingers (just not a full slammed tight fist!)
    const isTightPinch = normalizedPinchDistance < 0.39 && !tightFist;
    const pinchCandidate = normalizedPinchDistance < 0.47 && !tightFist;
    const isFist = tightFist && !isTightPinch;

    if (isFist) {
      this.isPinching = false;
      this.pinchLastStrictTime = 0;
      this.pinchStartFrames = 0;
    } else if (this.isPinching) {
      const now = performance.now();
      if (pinchCandidate) this.pinchLastStrictTime = now;
      // Clean crisp release: exits pinch immediately once fingers separate past 0.51 so repeat pinches work effortlessly!
      const remainsPinched =
        normalizedPinchDistance < 0.51 &&
        !tightFist &&
        now - this.pinchLastStrictTime <= 180;
      if (!remainsPinched) {
        this.isPinching = false;
        this.pinchLastStrictTime = 0;
      }
    } else {
      this.pinchStartFrames = pinchCandidate ? this.pinchStartFrames + 1 : 0;
      // Instant 1-frame trigger on clear pinch (< 0.39), 2-frame confirm on borderline pinch (0.39..0.47)
      if (isTightPinch || this.pinchStartFrames >= 2) {
        this.isPinching = true;
        this.pinchLastStrictTime = performance.now();
        this.pinchStartFrames = 0;
      }
    }
    const isPinching = this.isPinching;

    let gesture: HandGestureState['gesture'] = 'move';
    if (isFist) {
      gesture = 'fist';
    } else if (isPinching) {
      gesture = 'pinch';
    } else if (
      extensions.every((extension) => extension > 0.45) &&
      normalizedPinchDistance >= 0.66
    ) {
      gesture = 'open_palm';
    }

    // Draw Skeleton on PIP Canvas
    this.drawSkeleton(ctx, landmarks, w, h, isPinching);

    // Finer high-DPI emission threshold (0.0012) + react immediately to pre-pinch distance changes!
    const cursorMoved =
      Math.abs(cursorX - this.lastEmittedCursorX) >= 0.0012 ||
      Math.abs(cursorY - this.lastEmittedCursorY) >= 0.0012;
    const pinchChanged = Math.abs(normalizedPinchDistance - this.lastEmittedPinchDistance) >= 0.03;
    const stateChanged =
      !this.lastEmittedHasHand ||
      gesture !== this.lastEmittedGesture ||
      isPinching !== this.lastEmittedPinching ||
      cursorMoved ||
      pinchChanged ||
      deltaX !== 0 ||
      deltaY !== 0;

    if (!stateChanged) return;

    this.lastEmittedHasHand = true;
    this.lastEmittedGesture = gesture;
    this.lastEmittedPinching = isPinching;
    this.lastEmittedCursorX = cursorX;
    this.lastEmittedCursorY = cursorY;
    this.lastEmittedPinchDistance = normalizedPinchDistance;

    // Emit state
    this.onGestureCallback?.({
      hasHand: true,
      gesture,
      cursorX,
      cursorY,
      deltaX,
      deltaY,
      pinchDistance: normalizedPinchDistance,
      isPinching,
    });
  }

  private drawSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: Array<{ x: number; y: number }>,
    w: number,
    h: number,
    isPinching: boolean
  ) {
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [5, 9], [9, 10], [10, 11], [11, 12], // Middle
      [9, 13], [13, 14], [14, 15], [15, 16], // Ring
      [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [0, 17], // Palm base
    ];

    ctx.save();
    // Mirror horizontally so the skeleton aligns with user mirror video
    ctx.translate(w, 0);
    ctx.scale(-1, 1);

    // Draw lines
    ctx.strokeStyle = isPinching ? 'rgba(0, 240, 255, 0.95)' : 'rgba(147, 197, 253, 0.65)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const [start, end] of connections) {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
    }
    ctx.stroke();

    // Draw joints
    for (let i = 0; i < landmarks.length; i++) {
      const p = landmarks[i];
      const isTip = [4, 8, 12, 16, 20].includes(i);
      ctx.fillStyle = isTip
        ? isPinching && (i === 4 || i === 8)
          ? '#00f0ff'
          : '#ffffff'
        : 'rgba(59, 130, 246, 0.85)';

      const radius = isTip ? 4.5 : 3;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export const handTracker = new HandTrackerEngine();
