import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { HandGestureState } from '../types';

export type GestureCallback = (state: HandGestureState) => void;

type InitResult = 'ready' | 'cancelled' | 'failed';
type HandLandmark = { x: number; y: number; z?: number };

function landmarkDistance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
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
  private pinchReleaseFrames: number = 0;
  private smoothDeltaX: number = 0;
  private smoothDeltaY: number = 0;
  private lastEmittedHasHand: boolean = false;
  private lastEmittedGesture: HandGestureState['gesture'] = 'none';
  private lastEmittedPinching: boolean = false;
  private lastEmittedCursorX: number = -1;
  private lastEmittedCursorY: number = -1;

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
          frameRate: { ideal: 15, max: 20 },
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
    this.pinchReleaseFrames = 0;
    this.lastVideoTime = -1;
    this.lastInferenceTime = 0;
    this.smoothDeltaX = 0;
    this.smoothDeltaY = 0;
    this.lastEmittedHasHand = false;
    this.lastEmittedGesture = 'none';
    this.lastEmittedPinching = false;
    this.lastEmittedCursorX = -1;
    this.lastEmittedCursorY = -1;
    this.canvasCtx = null;
  }

  private startLoop() {
    const loop = () => {
      if (!this.isRunning || !this.videoEl || !this.handLandmarker) return;

      // Skip all webcam AI inference when browser tab is hidden
      if (!document.hidden) {
        const nowInMs = performance.now();
        // Adaptive inference throttling: ~16 FPS when hand is active, ~8 FPS when idle
        const minIntervalMs = this.lastEmittedHasHand ? 62 : 125;
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
      this.pinchReleaseFrames = 0;
      this.smoothDeltaX = 0;
      this.smoothDeltaY = 0;
      this.lastEmittedHasHand = false;
      this.lastEmittedGesture = 'none';
      this.lastEmittedPinching = false;
      this.lastEmittedCursorX = 0.5;
      this.lastEmittedCursorY = 0.5;

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

    // Ergonomic active-zone mapping: maps comfortable central webcam zone [0.16..0.84] x [0.14..0.86]
    // onto full [0..1] screen coordinates so user can effortlessly reach photos on both sides!
    const rawMirrorX = 1 - (indexTip.x + thumb.x) / 2;
    const rawMirrorY = (indexTip.y + thumb.y) / 2;
    const rawCursorX = clamp01((rawMirrorX - 0.16) / 0.68);
    const rawCursorY = clamp01((rawMirrorY - 0.14) / 0.72);
    const cursorSmoothing = 0.55;
    this.smoothCursorX = this.smoothCursorX === null
      ? rawCursorX
      : this.smoothCursorX + (rawCursorX - this.smoothCursorX) * cursorSmoothing;
    this.smoothCursorY = this.smoothCursorY === null
      ? rawCursorY
      : this.smoothCursorY + (rawCursorY - this.smoothCursorY) * cursorSmoothing;
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

    // Normalize fingertip distance by palm length so pinch thresholds adapt to hand size.
    const palmLength = landmarkDistance(wrist, landmarks[9]);
    const rawNormalizedPinchDistance =
      landmarkDistance(thumb, indexTip) / Math.max(palmLength, 0.001);
    this.smoothedPinchDistance = this.smoothedPinchDistance === null
      ? rawNormalizedPinchDistance
      : this.smoothedPinchDistance +
        (rawNormalizedPinchDistance - this.smoothedPinchDistance) * 0.65;
    const normalizedPinchDistance = this.smoothedPinchDistance;
    const extensions = [
      fingerExtension(wrist, landmarks[5], landmarks[6], indexTip),
      fingerExtension(wrist, landmarks[9], landmarks[10], middleTip),
      fingerExtension(wrist, landmarks[13], landmarks[14], ringTip),
      fingerExtension(wrist, landmarks[17], landmarks[18], pinkyTip),
    ];
    const otherFingersAverage = (extensions[1] + extensions[2] + extensions[3]) / 3;
    const fingersClosed = extensions.every((extension) => extension < 0.36);
    const otherFingersCurled = otherFingersAverage < 0.34;
    const pinchCandidate =
      normalizedPinchDistance < 0.46 &&
      !otherFingersCurled;
    const isFist = fingersClosed && !pinchCandidate;

    if (isFist) {
      this.isPinching = false;
      this.pinchLastStrictTime = 0;
      this.pinchStartFrames = 0;
      this.pinchReleaseFrames = 0;
    } else if (this.isPinching) {
      const now = performance.now();
      if (pinchCandidate) this.pinchLastStrictTime = now;
      const remainsPinched =
        normalizedPinchDistance < 0.60 &&
        !otherFingersCurled &&
        now - this.pinchLastStrictTime <= 200;
      this.pinchReleaseFrames = remainsPinched ? 0 : this.pinchReleaseFrames + 1;
      if (this.pinchReleaseFrames >= 2) {
        this.isPinching = false;
        this.pinchLastStrictTime = 0;
        this.pinchReleaseFrames = 0;
      }
    } else {
      this.pinchStartFrames = pinchCandidate
        ? this.pinchStartFrames + 1
        : 0;
      // Trigger pinch quickly (1 frame if tightly pinched, 2 frames if borderline)
      if (this.pinchStartFrames >= 2 || (pinchCandidate && normalizedPinchDistance < 0.34)) {
        this.isPinching = true;
        this.pinchLastStrictTime = performance.now();
        this.pinchStartFrames = 0;
        this.pinchReleaseFrames = 0;
      }
    }
    const isPinching = this.isPinching;

    let gesture: HandGestureState['gesture'] = 'move';
    if (isFist) {
      gesture = 'fist';
    } else if (isPinching) {
      gesture = 'pinch';
    } else if (extensions.every((extension) => extension > 0.5)) {
      gesture = 'open_palm';
    }

    // Draw Skeleton on PIP Canvas
    this.drawSkeleton(ctx, landmarks, w, h, isPinching);

    // Avoid redundant React state updates if hand hasn't moved or changed gesture
    const cursorMoved =
      Math.abs(cursorX - this.lastEmittedCursorX) >= 0.003 ||
      Math.abs(cursorY - this.lastEmittedCursorY) >= 0.003;
    const stateChanged =
      !this.lastEmittedHasHand ||
      gesture !== this.lastEmittedGesture ||
      isPinching !== this.lastEmittedPinching ||
      cursorMoved ||
      deltaX !== 0 ||
      deltaY !== 0;

    if (!stateChanged) return;

    this.lastEmittedHasHand = true;
    this.lastEmittedGesture = gesture;
    this.lastEmittedPinching = isPinching;
    this.lastEmittedCursorX = cursorX;
    this.lastEmittedCursorY = cursorY;

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
