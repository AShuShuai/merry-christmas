import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { HandGestureState } from '../types';

export type GestureCallback = (state: HandGestureState) => void;

type InitResult = 'ready' | 'cancelled' | 'failed';

class HandTrackerEngine {
  private handLandmarker: HandLandmarker | null = null;
  private isRunning: boolean = false;
  private animFrameId: number | null = null;
  private lastVideoTime: number = -1;
  private generation: number = 0;
  private initPromise: Promise<InitResult> | null = null;

  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private onGestureCallback: GestureCallback | null = null;

  private lastHandX: number | null = null;
  private lastHandY: number | null = null;
  private smoothDeltaX: number = 0;
  private smoothDeltaY: number = 0;

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
    this.onGestureCallback = onGesture;
    this.lastVideoTime = -1;

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
          width: { ideal: 640 },
          height: { ideal: 480 },
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
    this.lastVideoTime = -1;
    this.smoothDeltaX = 0;
    this.smoothDeltaY = 0;
  }

  private startLoop() {
    const loop = () => {
      if (!this.isRunning || !this.videoEl || !this.handLandmarker) return;

      if (this.videoEl.readyState >= 2 && this.videoEl.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.videoEl.currentTime;
        const nowInMs = performance.now();
        const results: HandLandmarkerResult = this.handLandmarker.detectForVideo(
          this.videoEl,
          nowInMs
        );
        this.processResults(results);
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private processResults(results: HandLandmarkerResult) {
    if (!this.canvasEl || !this.videoEl) return;
    const ctx = this.canvasEl.getContext('2d');
    if (!ctx) return;

    const w = this.canvasEl.width;
    const h = this.canvasEl.height;
    ctx.clearRect(0, 0, w, h);

    if (!results.landmarks || results.landmarks.length === 0) {
      // No hand detected
      this.lastHandX = null;
      this.lastHandY = null;
      this.smoothDeltaX *= 0.8;
      this.smoothDeltaY *= 0.8;

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

    // Screen cursor coords (Mirroring X for intuitive selfie interaction)
    const cursorX = 1 - indexTip.x;
    const cursorY = indexTip.y;

    // Movement delta tracking for 3D rotation (tracking palm/wrist)
    const currentHandX = 1 - wrist.x;
    const currentHandY = wrist.y;

    let deltaX = 0;
    let deltaY = 0;

    if (this.lastHandX !== null && this.lastHandY !== null) {
      const rawDeltaX = currentHandX - this.lastHandX;
      const rawDeltaY = currentHandY - this.lastHandY;
      // Exponential smoothing for buttery smooth rotation
      this.smoothDeltaX = this.smoothDeltaX * 0.6 + rawDeltaX * 0.4;
      this.smoothDeltaY = this.smoothDeltaY * 0.6 + rawDeltaY * 0.4;
      deltaX = this.smoothDeltaX;
      deltaY = this.smoothDeltaY;
    }

    this.lastHandX = currentHandX;
    this.lastHandY = currentHandY;

    // 1. Pinch detection (Index Tip 8 to Thumb Tip 4)
    const pinchDist = Math.hypot(thumb.x - indexTip.x, thumb.y - indexTip.y);
    // 2. Open palm vs Fist
    // An open finger has its tip further from the wrist than its pip joint (index: 8 vs 6, middle: 12 vs 10, etc.)
    const isIndexOpen = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y) > Math.hypot(landmarks[6].x - wrist.x, landmarks[6].y - wrist.y);
    const isMiddleOpen = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y) > Math.hypot(landmarks[10].x - wrist.x, landmarks[10].y - wrist.y);
    const isRingOpen = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y) > Math.hypot(landmarks[14].x - wrist.x, landmarks[14].y - wrist.y);
    const isPinkyOpen = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y) > Math.hypot(landmarks[18].x - wrist.x, landmarks[18].y - wrist.y);

    const isFist = !isIndexOpen && !isMiddleOpen && !isRingOpen && !isPinkyOpen;
    const isPinching = pinchDist < 0.075 && isIndexOpen && !isFist;

    let gesture: HandGestureState['gesture'] = 'move';
    if (isFist) {
      gesture = 'fist';
    } else if (isPinching) {
      gesture = 'pinch';
    } else if (isIndexOpen && isMiddleOpen && isRingOpen && isPinkyOpen) {
      gesture = 'open_palm';
    }

    // Draw Skeleton on PIP Canvas
    this.drawSkeleton(ctx, landmarks, w, h, isPinching);

    // Emit state
    this.onGestureCallback?.({
      hasHand: true,
      gesture,
      cursorX,
      cursorY,
      deltaX,
      deltaY,
      pinchDistance: pinchDist,
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
