import { FaceLandmarker, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

export interface PortraitPoint {
  x: number;
  y: number;
  weight: number;
  light: number;
}

export interface PortraitTargets {
  facialFeatures: PortraitPoint[];
  personOutline: PortraitPoint[];
  aspect: number;
}

interface PortraitTasks {
  faceLandmarker: FaceLandmarker;
  imageSegmenter: ImageSegmenter;
}

interface Landmark {
  x: number;
  y: number;
}

interface LandmarkConnection {
  start: number;
  end: number;
}

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const PERSON_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';

let tasksPromise: Promise<PortraitTasks> | null = null;

function getPortraitTasks(): Promise<PortraitTasks> {
  if (!tasksPromise) {
    const initialization = (async () => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        minFaceDetectionConfidence: 0.35,
        minFacePresenceConfidence: 0.35,
      });

      try {
        const imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: PERSON_MODEL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        return { faceLandmarker, imageSegmenter };
      } catch (error) {
        faceLandmarker.close();
        throw error;
      }
    })();

    tasksPromise = initialization.catch((error: unknown) => {
      tasksPromise = null;
      throw error;
    });
  }

  return tasksPromise;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sampleMask(
  mask: Float32Array,
  maskWidth: number,
  maskHeight: number,
  x: number,
  y: number
): number {
  const maskX = Math.max(0, Math.min(maskWidth - 1, Math.round(x * (maskWidth - 1))));
  const maskY = Math.max(0, Math.min(maskHeight - 1, Math.round(y * (maskHeight - 1))));
  return mask[maskY * maskWidth + maskX] ?? 0;
}

function featurePoint(
  x: number,
  y: number,
  bounds: { left: number; top: number; width: number; height: number },
  weight: number,
  light: number
): PortraitPoint {
  const jitter = 0.0015;
  return {
    x: clamp01((x - bounds.left) / bounds.width + (Math.random() - 0.5) * jitter),
    y: clamp01((y - bounds.top) / bounds.height + (Math.random() - 0.5) * jitter),
    weight,
    light: clamp01(light),
  };
}

function makeFacialFeatures(
  landmarks: Landmark[],
  bounds: { left: number; top: number; width: number; height: number },
  personMask: Float32Array,
  maskWidth: number,
  maskHeight: number,
  imageWidth: number,
  imageHeight: number
): PortraitPoint[] {
  const groups: Array<{ connections: LandmarkConnection[]; weight: number }> = [
    { connections: FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, weight: 1.6 },
    { connections: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, weight: 1.6 },
    { connections: FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, weight: 1.5 },
    { connections: FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, weight: 1.5 },
    { connections: FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, weight: 1.45 },
    { connections: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, weight: 1.45 },
    { connections: FaceLandmarker.FACE_LANDMARKS_LIPS, weight: 1.5 },
    {
      connections: [
        { start: 168, end: 6 },
        { start: 6, end: 197 },
        { start: 197, end: 195 },
        { start: 195, end: 5 },
        { start: 5, end: 4 },
        { start: 4, end: 1 },
        { start: 1, end: 2 },
        { start: 2, end: 98 },
        { start: 2, end: 327 },
      ],
      weight: 1.35,
    },
    { connections: FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, weight: 1.15 },
    { connections: FaceLandmarker.FACE_LANDMARKS_CONTOURS, weight: 0.9 },
  ];
  const points: PortraitPoint[] = [];

  for (const group of groups) {
    for (const connection of group.connections) {
      const start = landmarks[connection.start];
      const end = landmarks[connection.end];
      if (!start || !end) continue;

      const distance = Math.hypot(
        (end.x - start.x) * imageWidth,
        (end.y - start.y) * imageHeight
      );
      const steps = Math.max(1, Math.ceil(distance * 1.25));
      for (let step = 0; step <= steps; step++) {
        const progress = step / steps;
        const x = start.x + (end.x - start.x) * progress;
        const y = start.y + (end.y - start.y) * progress;
        if (
          x < bounds.left ||
          x > bounds.left + bounds.width ||
          y < bounds.top ||
          y > bounds.top + bounds.height ||
          sampleMask(personMask, maskWidth, maskHeight, x, y) < 0.12
        ) {
          continue;
        }

        points.push(
          featurePoint(x, y, bounds, group.weight, 0.7 + sampleMask(personMask, maskWidth, maskHeight, x, y) * 0.3)
        );
      }
    }
  }

  return points;
}

export async function processPortraitImage(image: HTMLImageElement): Promise<PortraitTargets> {
  const tasks = await getPortraitTasks();
  const faceResult = tasks.faceLandmarker.detect(image);
  const landmarks = faceResult.faceLandmarks[0];
  if (!landmarks?.length) throw new Error('MediaPipe could not find a face in this image');

  const segmentation = tasks.imageSegmenter.segment(image);
  try {
    const personMaskResult = segmentation.confidenceMasks?.[0];
    if (!personMaskResult) throw new Error('MediaPipe did not return a person mask');
    const personMask = personMaskResult.getAsFloat32Array();
    const maskWidth = personMaskResult.width;
    const maskHeight = personMaskResult.height;
    const maxSide = 256;
    const scale = maxSide / Math.max(image.naturalWidth, image.naturalHeight);
    const imageWidth = Math.max(3, Math.round(image.naturalWidth * scale));
    const imageHeight = Math.max(3, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context is unavailable');
    context.drawImage(image, 0, 0, imageWidth, imageHeight);
    const { data } = context.getImageData(0, 0, imageWidth, imageHeight);
    const luminance = new Float32Array(imageWidth * imageHeight);
    const resizedPersonMask = new Float32Array(imageWidth * imageHeight);

    for (let y = 0; y < imageHeight; y++) {
      for (let x = 0; x < imageWidth; x++) {
        const index = y * imageWidth + x;
        const offset = index * 4;
        luminance[index] =
          0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
        resizedPersonMask[index] = sampleMask(
          personMask,
          maskWidth,
          maskHeight,
          x / (imageWidth - 1),
          y / (imageHeight - 1)
        );
      }
    }

    const faceOvalIndices = new Set<number>();
    for (const connection of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
      faceOvalIndices.add(connection.start);
      faceOvalIndices.add(connection.end);
    }
    const faceOval = [...faceOvalIndices].map((index) => landmarks[index]).filter(Boolean);
    if (faceOval.length < 20) throw new Error('MediaPipe returned incomplete face landmarks');
    const faceLeft = Math.min(...faceOval.map((point) => point.x));
    const faceRight = Math.max(...faceOval.map((point) => point.x));
    const faceTop = Math.min(...faceOval.map((point) => point.y));
    const faceBottom = Math.max(...faceOval.map((point) => point.y));
    const faceWidth = faceRight - faceLeft;
    const faceHeight = faceBottom - faceTop;
    if (faceWidth <= 0 || faceHeight <= 0) throw new Error('MediaPipe returned invalid face bounds');

    const searchBounds = {
      left: Math.max(0, faceLeft - faceWidth * 0.75),
      right: Math.min(1, faceRight + faceWidth * 0.75),
      top: Math.max(0, faceTop - faceHeight * 0.48),
      bottom: Math.min(1, faceBottom + faceHeight * 0.82),
    };
    let left = 1;
    let right = 0;
    let top = 1;
    let bottom = 0;
    for (let y = 0; y < imageHeight; y++) {
      const normalizedY = y / (imageHeight - 1);
      if (normalizedY < searchBounds.top || normalizedY > searchBounds.bottom) continue;
      for (let x = 0; x < imageWidth; x++) {
        const normalizedX = x / (imageWidth - 1);
        if (
          normalizedX >= searchBounds.left &&
          normalizedX <= searchBounds.right &&
          resizedPersonMask[y * imageWidth + x] >= 0.35
        ) {
          left = Math.min(left, normalizedX);
          right = Math.max(right, normalizedX);
          top = Math.min(top, normalizedY);
          bottom = Math.max(bottom, normalizedY);
        }
      }
    }
    if (left >= right || top >= bottom) throw new Error('MediaPipe could not isolate the person');

    const paddingX = Math.min(0.025, (right - left) * 0.04);
    const paddingY = Math.min(0.02, (bottom - top) * 0.03);
    const bounds = {
      left: Math.max(0, left - paddingX),
      top: Math.max(0, top - paddingY),
      width: Math.min(1, right + paddingX) - Math.max(0, left - paddingX),
      height: Math.min(1, bottom + paddingY) - Math.max(0, top - paddingY),
    };
    if (bounds.width <= 0 || bounds.height <= 0) throw new Error('The isolated portrait is empty');

    const facialFeatures = makeFacialFeatures(
      landmarks,
      bounds,
      resizedPersonMask,
      imageWidth,
      imageHeight,
      imageWidth,
      imageHeight
    );
    if (facialFeatures.length < 100) throw new Error('Not enough facial landmarks were detected');

    const edgeStrengths = new Float32Array(imageWidth * imageHeight);
    let strongestEdge = 0;
    for (let y = 1; y < imageHeight - 1; y++) {
      for (let x = 1; x < imageWidth - 1; x++) {
        const index = y * imageWidth + x;
        if (resizedPersonMask[index] < 0.15) continue;

        const topLeft = luminance[(y - 1) * imageWidth + x - 1];
        const above = luminance[(y - 1) * imageWidth + x];
        const topRight = luminance[(y - 1) * imageWidth + x + 1];
        const leftPixel = luminance[y * imageWidth + x - 1];
        const rightPixel = luminance[y * imageWidth + x + 1];
        const bottomLeft = luminance[(y + 1) * imageWidth + x - 1];
        const below = luminance[(y + 1) * imageWidth + x];
        const bottomRight = luminance[(y + 1) * imageWidth + x + 1];
        const horizontal =
          -topLeft + topRight - 2 * leftPixel + 2 * rightPixel - bottomLeft + bottomRight;
        const vertical =
          -topLeft - 2 * above - topRight + bottomLeft + 2 * below + bottomRight;
        const magnitude = Math.hypot(horizontal, vertical) / 4;
        edgeStrengths[index] = magnitude;
        strongestEdge = Math.max(strongestEdge, magnitude);
      }
    }

    const personOutline: PortraitPoint[] = [];
    for (let y = 1; y < imageHeight - 1; y++) {
      const normalizedY = y / (imageHeight - 1);
      if (normalizedY < bounds.top || normalizedY > bounds.top + bounds.height) continue;
      const depth = (normalizedY - bounds.top) / bounds.height;
      const densityFalloff = 1.15 - depth * 0.7;
      for (let x = 1; x < imageWidth - 1; x++) {
        const normalizedX = x / (imageWidth - 1);
        if (normalizedX < bounds.left || normalizedX > bounds.left + bounds.width) continue;
        const index = y * imageWidth + x;
        const confidence = resizedPersonMask[index];
        if (confidence < 0.12) continue;

        const maskGradient =
          Math.abs(resizedPersonMask[index + 1] - resizedPersonMask[index - 1]) +
          Math.abs(
            resizedPersonMask[index + imageWidth] - resizedPersonMask[index - imageWidth]
          );
        const imageEdge = edgeStrengths[index];
        if (maskGradient < 0.12 && (confidence < 0.45 || imageEdge < 32)) continue;

        const weight = (maskGradient * 2 + Math.min(1, imageEdge / 255) * 0.45) * densityFalloff;
        personOutline.push(
          featurePoint(
            normalizedX,
            normalizedY,
            bounds,
            weight,
            Math.max(0.2, Math.min(1, maskGradient + imageEdge / 255))
          )
        );
      }
    }
    if (personOutline.length < 100) throw new Error('Not enough person outline points were detected');

    return {
      facialFeatures,
      personOutline,
      aspect: (bounds.width * image.naturalWidth) / (bounds.height * image.naturalHeight),
    };
  } finally {
    segmentation.close();
  }
}
