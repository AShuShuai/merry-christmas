import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { makeDiamondStarSprite } from './sprites';

export interface PortraitPoint {
  x: number;
  y: number;
  z: number;
  weight: number;
  light: number;
  size: number;
  phase: number;
  speed: number;
  jitterX: number;
  jitterY: number;
  priority: number; // 1 = critical features (eyes, nose, lips), 2 = skin highlights, 3 = hair texture, 4 = outer scatter
  category: 'feature' | 'skin' | 'hair' | 'scatter';
  isSparkle?: boolean;
}

export interface PortraitTargets {
  points: PortraitPoint[];
  facialFeatures: PortraitPoint[];
  personOutline: PortraitPoint[];
  aspect: number;
  renderedCanvas?: HTMLCanvasElement;
}

interface PortraitTasks {
  faceLandmarker: FaceLandmarker;
}

interface Landmark {
  x: number;
  y: number;
  z?: number;
}

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const TOTAL_PORTRAIT_POINTS = 1800;
const TAU = Math.PI * 2;

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

      return { faceLandmarker };
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

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Generates dense 2D micro-pointillism within a facial feature zone
// Keeping dark features (pupils, dark irises, nostril shadows) empty for high contrast
function generateFeatureAreaPoints(
  landmarks: Landmark[],
  indices: number[],
  bounds: Bounds,
  luminance: Float32Array,
  imageWidth: number,
  imageHeight: number,
  count: number,
  zBase: number,
  weightBase: number,
  sizeMin: number,
  sizeMax: number,
  minLightThreshold: number = 0.32,
  spreadFactor: number = 0.006
): PortraitPoint[] {
  const points: PortraitPoint[] = [];
  const coords = indices.map((idx) => landmarks[idx]).filter(Boolean);
  if (coords.length === 0) return points;

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let sumX = 0;
  let sumY = 0;

  for (const c of coords) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
    sumX += c.x;
    sumY += c.y;
  }

  const centerX = sumX / coords.length;
  const centerY = sumY / coords.length;
  const halfW = Math.max(0.006, (maxX - minX) * 0.54 + spreadFactor);
  const halfH = Math.max(0.005, (maxY - minY) * 0.54 + spreadFactor);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const radius = Math.sqrt(Math.random());
    const rawX = centerX + Math.cos(angle) * halfW * radius + (Math.random() - 0.5) * spreadFactor;
    const rawY = centerY + Math.sin(angle) * halfH * radius + (Math.random() - 0.5) * spreadFactor;

    // Discard any point out of bounds (DO NOT CLAMP, avoiding rectangular borders)
    if (
      rawX < bounds.left ||
      rawX > bounds.left + bounds.width ||
      rawY < bounds.top ||
      rawY > bounds.top + bounds.height
    ) {
      continue;
    }

    const normX = (rawX - bounds.left) / bounds.width;
    const normY = (rawY - bounds.top) / bounds.height;
    if (normX < 0.02 || normX > 0.98 || normY < 0.02 || normY > 0.98) continue;

    const pixelX = Math.max(0, Math.min(imageWidth - 1, Math.round(rawX * (imageWidth - 1))));
    const pixelY = Math.max(0, Math.min(imageHeight - 1, Math.round(rawY * (imageHeight - 1))));
    const rawLight = luminance[pixelY * imageWidth + pixelX] ?? 0.65;

    // HIGH CONTRAST CHECK: keep dark features (pupils, deep shadows) genuinely dark/empty!
    if (rawLight < minLightThreshold) {
      continue;
    }

    const contrastLight = Math.pow((rawLight - minLightThreshold) / (1 - minLightThreshold), 1.3);
    const detailLight = Math.min(1.0, Math.max(0.85, 0.85 + 0.15 * contrastLight));

    const jitterX = (Math.random() - 0.5) * 0.0016;
    const jitterY = (Math.random() - 0.5) * 0.0016;
    // Crisp fine particle sizes: 0.6px to 1.05px radius
    const size = Math.max(0.6, Math.min(1.05, sizeMin + Math.random() * (sizeMax - sizeMin)));
    const isSparkle = Math.random() < 0.10;

    points.push({
      x: clamp01(normX + jitterX),
      y: clamp01(normY + jitterY),
      z: zBase + (Math.random() - 0.5) * 0.06,
      weight: weightBase,
      light: detailLight,
      size,
      phase: Math.random() * TAU,
      speed: 1.8 + Math.random() * 2.2,
      jitterX,
      jitterY,
      priority: 1, // Critical facial feature detail
      category: 'feature',
      isSparkle,
    });
  }

  return points;
}

// Generate dense pointillism along feature curves (soft ribbon sampling)
function generateRibbonPoints(
  landmarks: Landmark[],
  chain: number[],
  bounds: Bounds,
  luminance: Float32Array,
  imageWidth: number,
  imageHeight: number,
  count: number,
  zBase: number,
  weightBase: number,
  ribbonWidth: number,
  sizeMin: number,
  sizeMax: number,
  minLightThreshold: number = 0.3
): PortraitPoint[] {
  const points: PortraitPoint[] = [];
  const coords = chain.map((idx) => landmarks[idx]).filter(Boolean);
  if (coords.length < 2) return points;

  for (let i = 0; i < count; i++) {
    const segIdx = Math.floor(Math.random() * (coords.length - 1));
    const p1 = coords[segIdx];
    const p2 = coords[segIdx + 1];
    const t = Math.random();

    const baseX = p1.x + (p2.x - p1.x) * t;
    const baseY = p1.y + (p2.y - p1.y) * t;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const offset = (Math.random() - 0.5) * 2 * ribbonWidth;
    const rawX = baseX + nx * offset + (Math.random() - 0.5) * 0.0018;
    const rawY = baseY + ny * offset + (Math.random() - 0.5) * 0.0018;

    if (
      rawX < bounds.left ||
      rawX > bounds.left + bounds.width ||
      rawY < bounds.top ||
      rawY > bounds.top + bounds.height
    ) {
      continue;
    }

    const normX = (rawX - bounds.left) / bounds.width;
    const normY = (rawY - bounds.top) / bounds.height;
    if (normX < 0.02 || normX > 0.98 || normY < 0.02 || normY > 0.98) continue;

    const pixelX = Math.max(0, Math.min(imageWidth - 1, Math.round(rawX * (imageWidth - 1))));
    const pixelY = Math.max(0, Math.min(imageHeight - 1, Math.round(rawY * (imageHeight - 1))));
    const rawLight = luminance[pixelY * imageWidth + pixelX] ?? 0.65;

    // High contrast check
    if (rawLight < minLightThreshold) {
      continue;
    }
    const contrastLight = Math.pow((rawLight - minLightThreshold) / (1 - minLightThreshold), 1.3);
    const detailLight = Math.min(1.0, Math.max(0.85, 0.85 + 0.15 * contrastLight));

    const jitterX = (Math.random() - 0.5) * 0.0016;
    const jitterY = (Math.random() - 0.5) * 0.0016;
    const size = Math.max(0.6, Math.min(1.05, sizeMin + Math.random() * (sizeMax - sizeMin)));
    const isSparkle = Math.random() < 0.10;

    points.push({
      x: clamp01(normX + jitterX),
      y: clamp01(normY + jitterY),
      z: zBase + (Math.random() - 0.5) * 0.06,
      weight: weightBase,
      light: detailLight,
      size,
      phase: Math.random() * TAU,
      speed: 1.8 + Math.random() * 2.2,
      jitterX,
      jitterY,
      priority: 1, // Critical facial feature detail
      category: 'feature',
      isSparkle,
    });
  }

  return points;
}

export async function processPortraitImage(image: HTMLImageElement): Promise<PortraitTargets> {
  let tasks: PortraitTasks | null = null;
  try {
    tasks = await getPortraitTasks();
  } catch (err) {
    console.warn('MediaPipe tasks unavailable, falling back to CV analyzer:', err);
  }

  const maxSide = 480;
  const scale = maxSide / Math.max(image.naturalWidth, image.naturalHeight);
  const imageWidth = Math.max(16, Math.round(image.naturalWidth * scale));
  const imageHeight = Math.max(16, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context is unavailable');

  context.drawImage(image, 0, 0, imageWidth, imageHeight);
  const { data } = context.getImageData(0, 0, imageWidth, imageHeight);

  const luminance = new Float32Array(imageWidth * imageHeight);
  const edges = new Float32Array(imageWidth * imageHeight);
  const isCutoutBg = new Uint8Array(imageWidth * imageHeight);
  const isSkin = new Uint8Array(imageWidth * imageHeight);

  // 1. 5% PADDING MARGIN ON ALL FOUR EDGES (Completely eliminates rectangular border artifacts)
  const marginX = Math.round(imageWidth * 0.05);
  const marginY = Math.round(imageHeight * 0.05);

  for (let y = 0; y < imageHeight; y++) {
    for (let x = 0; x < imageWidth; x++) {
      const idx = y * imageWidth + x;

      // Ignore 5% padding margin on all 4 edges
      if (x < marginX || x >= imageWidth - marginX || y < marginY || y >= imageHeight - marginY) {
        isCutoutBg[idx] = 1;
        luminance[idx] = 0;
        continue;
      }

      const off = idx * 4;
      const r = data[off];
      const g = data[off + 1];
      const b = data[off + 2];

      // Pure white or near-white background cutout
      const isWhiteBg = r > 228 && g > 228 && b > 228;
      isCutoutBg[idx] = isWhiteBg ? 1 : 0;

      luminance[idx] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

      // Skin detection: warm peachy/olive tones
      const isSkinTone =
        !isWhiteBg &&
        r > 70 &&
        g > 45 &&
        b > 30 &&
        r > g &&
        r - b > 12 &&
        Math.abs(r - g) > 8;
      isSkin[idx] = isSkinTone ? 1 : 0;
    }
  }

  // Compute Sobel edges (ignoring 5% margin)
  for (let y = marginY + 1; y < imageHeight - marginY - 1; y++) {
    for (let x = marginX + 1; x < imageWidth - marginX - 1; x++) {
      const idx = y * imageWidth + x;
      if (isCutoutBg[idx]) continue;

      const tl = luminance[(y - 1) * imageWidth + x - 1];
      const tc = luminance[(y - 1) * imageWidth + x];
      const tr = luminance[(y - 1) * imageWidth + x + 1];
      const ml = luminance[y * imageWidth + x - 1];
      const mr = luminance[y * imageWidth + x + 1];
      const bl = luminance[(y + 1) * imageWidth + x - 1];
      const bc = luminance[(y + 1) * imageWidth + x];
      const br = luminance[(y + 1) * imageWidth + x + 1];

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      edges[idx] = Math.min(1, Math.hypot(gx, gy) * 1.5);
    }
  }

  let landmarks: Landmark[] | null = null;

  if (tasks) {
    try {
      const faceResult = tasks.faceLandmarker.detect(image);
      if (faceResult.faceLandmarks?.[0]?.length) {
        landmarks = faceResult.faceLandmarks[0];
      }
    } catch (e) {
      console.warn('MediaPipe detection failed, proceeding with CV heuristics:', e);
    }
  }

  // Find physical silhouette bounds of the person (excluding cutout white background)
  let personMinX = imageWidth;
  let personMaxX = 0;
  let personMinY = imageHeight;
  let personMaxY = 0;
  let personPixels = 0;

  for (let y = marginY; y < imageHeight - marginY; y++) {
    for (let x = marginX; x < imageWidth - marginX; x++) {
      const idx = y * imageWidth + x;
      if (!isCutoutBg[idx]) {
        personPixels++;
        if (x < personMinX) personMinX = x;
        if (x > personMaxX) personMaxX = x;
        if (y < personMinY) personMinY = y;
        if (y > personMaxY) personMaxY = y;
      }
    }
  }

  const rawPersonMinX = personPixels > 100 ? personMinX / (imageWidth - 1) : 0.08;
  const rawPersonMaxX = personPixels > 100 ? personMaxX / (imageWidth - 1) : 0.92;
  const rawPersonMinY = personPixels > 100 ? personMinY / (imageHeight - 1) : 0.05;
  const rawPersonMaxY = personPixels > 100 ? personMaxY / (imageHeight - 1) : 0.95;

  let bounds: Bounds;
  let faceCenter = { x: 0.5, y: 0.4 };
  let faceRadius = 0.35;
  let faceBoundsBox = { left: 0.25, right: 0.75, top: 0.12, bottom: 0.55 };

  if (landmarks && landmarks.length >= 20) {
    const xs = landmarks.map((l) => l.x);
    const ys = landmarks.map((l) => l.y);
    const fLeft = Math.min(...xs);
    const fRight = Math.max(...xs);
    const fTop = Math.min(...ys);
    const fBottom = Math.max(...ys);
    const fWidth = fRight - fLeft;
    const fHeight = fBottom - fTop;

    // Framing: capture neck and top of shoulders ("diminuisci di metà le spalle" compared to full torso)
    const bLeft = Math.max(0.02, Math.min(rawPersonMinX - 0.02, fLeft - fWidth * 0.95));
    const bRight = Math.min(0.98, Math.max(rawPersonMaxX + 0.02, fRight + fWidth * 0.95));
    const bTop = Math.max(0.02, Math.min(rawPersonMinY - 0.02, fTop - fHeight * 0.35));
    const bBottom = Math.min(0.85, fBottom + fHeight * 0.54);

    bounds = {
      left: bLeft,
      top: bTop,
      width: Math.max(0.1, bRight - bLeft),
      height: Math.max(0.1, bBottom - bTop),
    };

    faceCenter = {
      x: (fLeft + fRight) / 2,
      y: (fTop + fBottom) / 2,
    };
    faceRadius = Math.max(fWidth, fHeight) * 0.95;
    faceBoundsBox = {
      left: fLeft - fWidth * 0.08,
      right: fRight + fWidth * 0.08,
      top: fTop - fHeight * 0.12,
      bottom: fBottom + fHeight * 0.08,
    };
  } else {
    const bLeft = Math.max(0.02, rawPersonMinX - 0.02);
    const bRight = Math.min(0.98, rawPersonMaxX + 0.02);
    const bTop = Math.max(0.02, rawPersonMinY - 0.02);
    const bBottom = Math.min(0.85, rawPersonMinY + (rawPersonMaxY - rawPersonMinY) * 0.62);

    bounds = {
      left: bLeft,
      top: bTop,
      width: Math.max(0.1, bRight - bLeft),
      height: Math.max(0.1, bBottom - bTop),
    };

    faceCenter = {
      x: bounds.left + bounds.width * 0.48,
      y: bounds.top + bounds.height * 0.36,
    };
    faceRadius = Math.max(bounds.width, bounds.height) * 0.42;
    faceBoundsBox = {
      left: faceCenter.x - bounds.width * 0.24,
      right: faceCenter.x + bounds.width * 0.24,
      top: faceCenter.y - bounds.height * 0.24,
      bottom: faceCenter.y + bounds.height * 0.24,
    };
  }

  // Face-aware Auto-Levels Histogram + Unsharp Mask Sharpening:
  // Ensures warm/olive skin & bright eye sclera pop clearly while pupils, lashes, nostrils & mouth seam stay pitch black!
  const isFaceZone = new Uint8Array(imageWidth * imageHeight);
  const faceHist = new Uint32Array(256);
  let faceHistTotal = 0;

  for (let y = marginY; y < imageHeight - marginY; y++) {
    const rawY = y / (imageHeight - 1);
    for (let x = marginX; x < imageWidth - marginX; x++) {
      const idx = y * imageWidth + x;
      if (isCutoutBg[idx]) continue;
      const rawX = x / (imageWidth - 1);
      const inFace =
        rawX >= faceBoundsBox.left &&
        rawX <= faceBoundsBox.right &&
        rawY >= faceBoundsBox.top &&
        rawY <= faceBoundsBox.bottom;
      if (inFace) {
        isFaceZone[idx] = 1;
      }
      if (inFace || isSkin[idx]) {
        const bin = Math.max(0, Math.min(255, Math.round(luminance[idx] * 255)));
        faceHist[bin]++;
        faceHistTotal++;
      }
    }
  }

  let pLow = 0.14;
  let pHigh = 0.68;
  if (faceHistTotal > 50) {
    const lowTarget = faceHistTotal * 0.12;
    const highTarget = faceHistTotal * 0.97;
    let acc = 0;
    for (let b = 0; b < 256; b++) {
      acc += faceHist[b];
      if (acc >= lowTarget) {
        pLow = b / 255;
        break;
      }
    }
    acc = 0;
    for (let b = 0; b < 256; b++) {
      acc += faceHist[b];
      if (acc >= highTarget) {
        pHigh = b / 255;
        break;
      }
    }
    if (pHigh - pLow < 0.22) {
      pLow = Math.max(0.08, pHigh - 0.35);
    }
  }

  // Build normalized luminance & 3x3 unsharp mask so eyes, eyebrows, nose & lips are razor sharp
  const normLumArr = new Float32Array(imageWidth * imageHeight);
  const sharpLum = new Float32Array(imageWidth * imageHeight);
  const lumSpan = Math.max(0.2, pHigh - pLow);

  for (let i = 0; i < imageWidth * imageHeight; i++) {
    if (isCutoutBg[i]) continue;
    const rawL = luminance[i];
    const stretched = clamp01((rawL - pLow) / lumSpan);
    // Keep very dark features (pupils, eyelashes, nostrils, mouth seam) genuinely dark (0),
    // while lifting midtones/highlights (sclera, cheeks, forehead, nose bridge, lips) clearly!
    if (stretched < 0.13) {
      normLumArr[i] = 0;
    } else {
      normLumArr[i] = Math.pow((stretched - 0.13) / 0.87, 0.82);
    }
  }

  for (let y = marginY + 1; y < imageHeight - marginY - 1; y++) {
    for (let x = marginX + 1; x < imageWidth - marginX - 1; x++) {
      const idx = y * imageWidth + x;
      if (isCutoutBg[idx]) continue;
      const center = normLumArr[idx];
      const avg =
        (normLumArr[(y - 1) * imageWidth + x - 1] +
          normLumArr[(y - 1) * imageWidth + x] +
          normLumArr[(y - 1) * imageWidth + x + 1] +
          normLumArr[y * imageWidth + x - 1] +
          center +
          normLumArr[y * imageWidth + x + 1] +
          normLumArr[(y + 1) * imageWidth + x - 1] +
          normLumArr[(y + 1) * imageWidth + x] +
          normLumArr[(y + 1) * imageWidth + x + 1]) /
        9;
      // Stronger local sharpening inside the face oval
      const amount = isFaceZone[idx] ? 0.78 : 0.4;
      sharpLum[idx] = clamp01(center + (center - avg) * amount);
    }
  }

  // TARGET SPLIT for live morphing/twinkling stars (1,800 lightweight particles):
  // 40% Feature Detail Layer (~720 points): crisp, high-opacity white particles
  // 60% Soft Shading Layer (~1,080 points): alpha mapped to brightness (0.25 - 0.70)
  const TARGET_DETAIL_COUNT = Math.round(TOTAL_PORTRAIT_POINTS * 0.40);
  const TARGET_SHADING_COUNT = TOTAL_PORTRAIT_POINTS - TARGET_DETAIL_COUNT;

  const detailPoints: PortraitPoint[] = [];

  // 1. Detailed Facial Feature Micro-Points (Eyes, Brows, Nose, Lips)
  if (landmarks && landmarks.length >= 400) {
    const leftEyePoints = generateFeatureAreaPoints(
      landmarks,
      [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 468, 469, 470, 471, 472],
      bounds,
      sharpLum,
      imageWidth,
      imageHeight,
      85,
      0.15,
      3.0,
      0.55,
      0.95,
      0.18,
      0.003
    );
    detailPoints.push(...leftEyePoints);

    const rightEyePoints = generateFeatureAreaPoints(
      landmarks,
      [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 473, 474, 475, 476, 477],
      bounds,
      sharpLum,
      imageWidth,
      imageHeight,
      85,
      0.15,
      3.0,
      0.55,
      0.95,
      0.18,
      0.003
    );
    detailPoints.push(...rightEyePoints);

    const leftBrowPoints = generateRibbonPoints(
      landmarks,
      [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
      bounds,
      sharpLum,
      imageWidth,
      imageHeight,
      55,
      0.32,
      2.6,
      0.007,
      0.5,
      0.85,
      0.15
    );
    detailPoints.push(...leftBrowPoints);

    const rightBrowPoints = generateRibbonPoints(
      landmarks,
      [336, 296, 334, 293, 300, 285, 295, 282, 283, 276],
      bounds,
      sharpLum,
      imageWidth,
      imageHeight,
      55,
      0.32,
      2.6,
      0.007,
      0.5,
      0.85,
      0.15
    );
    detailPoints.push(...rightBrowPoints);

    const noseRidge = generateRibbonPoints(
      landmarks,
      [168, 6, 197, 195, 5, 4, 1, 2],
      bounds,
      sharpLum,
      imageWidth,
      imageHeight,
      75,
      0.85,
      3.2,
      0.009,
      0.6,
      1.05,
      0.22
    );
    detailPoints.push(...noseRidge);

    const noseBase = generateFeatureAreaPoints(
      landmarks,
      [98, 97, 2, 326, 327, 278, 48, 115, 220, 45, 275, 440],
      bounds,
      sharpLum,
      imageWidth,
      imageHeight,
      50,
      0.55,
      2.5,
      0.6,
      1.0,
      0.18,
      0.005
    );
    detailPoints.push(...noseBase);

    const lipsPoints = generateFeatureAreaPoints(
      landmarks,
      [
        61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
        78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
      ],
      bounds,
      sharpLum,
      imageWidth,
      imageHeight,
      135,
      0.48,
      3.2,
      0.6,
      1.05,
      0.16,
      0.007
    );
    detailPoints.push(...lipsPoints);
  }

  // 1b. Remaining Feature Detail Points: Edge/gradient detection (Sobel filter)
  // Placing crisp, high-opacity white particles directly along eyes, brows, nose, lips, jaw, and outer silhouette of hair and shoulders
  const remainingDetailNeeded = TARGET_DETAIL_COUNT - detailPoints.length;
  if (remainingDetailNeeded > 0) {
    const detailEdgeField = new Float32Array(imageWidth * imageHeight);
    let totalDetailEdge = 0;

    for (let y = marginY; y < imageHeight - marginY; y++) {
      const rawY = y / (imageHeight - 1);
      if (rawY < bounds.top || rawY > bounds.top + bounds.height) continue;
      const normY = (rawY - bounds.top) / bounds.height;

      // Feathered cutoff across bottom 15%
      let fade = 1.0;
      if (normY > 0.85) {
        fade *= Math.pow(Math.max(0, (1.0 - normY) / 0.15), 1.3);
      }
      if (fade <= 0.001 || normY >= 0.99) continue;

      for (let x = marginX; x < imageWidth - marginX; x++) {
        const rawX = x / (imageWidth - 1);
        if (rawX < bounds.left || rawX > bounds.left + bounds.width) continue;

        const idx = y * imageWidth + x;
        if (isCutoutBg[idx]) continue;

        const edge = edges[idx];
        const lum = luminance[idx];
        if (edge > 0.15 && lum > 0.18) {
          const skinPixel = isSkin[idx];
          const weight = edge * (skinPixel ? 2.5 : 1.5) * fade;
          detailEdgeField[idx] = weight;
          totalDetailEdge += weight;
        }
      }
    }

    if (totalDetailEdge > 0) {
      const totalPixels = imageWidth * imageHeight;
      const cdfEdge = new Float64Array(totalPixels);
      let cumulativeEdge = 0;
      for (let i = 0; i < totalPixels; i++) {
        cumulativeEdge += detailEdgeField[i];
        cdfEdge[i] = cumulativeEdge;
      }

      const sampleEdgePixel = (target: number): number => {
        let low = 0;
        let high = totalPixels - 1;
        while (low < high) {
          const mid = (low + high) >> 1;
          if (cdfEdge[mid] < target) low = mid + 1;
          else high = mid;
        }
        return low;
      };

      let edgeAttempts = 0;
      const maxEdgeAttempts = remainingDetailNeeded * 6;
      let sampledEdgeCount = 0;

      while (sampledEdgeCount < remainingDetailNeeded && edgeAttempts < maxEdgeAttempts) {
        edgeAttempts++;
        const randVal = Math.random() * cumulativeEdge;
        const idx = sampleEdgePixel(randVal);
        if (detailEdgeField[idx] <= 0.0001) continue;

        const py = Math.floor(idx / imageWidth);
        const px = idx % imageWidth;

        const rawX = (px + (Math.random() - 0.5) * 1.4) / (imageWidth - 1);
        const rawY = (py + (Math.random() - 0.5) * 1.4) / (imageHeight - 1);

        if (
          rawX < bounds.left ||
          rawX > bounds.left + bounds.width ||
          rawY < bounds.top ||
          rawY > bounds.top + bounds.height
        ) {
          continue;
        }

        const normX = (rawX - bounds.left) / bounds.width;
        const normY = (rawY - bounds.top) / bounds.height;
        if (normX < 0.02 || normX > 0.98 || normY < 0.02 || normY >= 0.99) continue;

        const distToCenter = Math.hypot((rawX - faceCenter.x) * 1.25, rawY - faceCenter.y);
        const faceDome = Math.max(0, 1 - distToCenter / (faceRadius * 1.15));
        let zVal = (faceDome - 0.45) * 0.7;
        if (normY > 0.65) zVal -= (normY - 0.65) * 0.85;

        const detailLight = Math.min(1.0, Math.max(0.85, 0.85 + 0.15 * Math.min(1, edges[idx])));
        const size = 0.6 + Math.random() * 0.45; // 0.6px - 1.05px

        detailPoints.push({
          x: clamp01(normX),
          y: clamp01(normY),
          z: zVal + (Math.random() - 0.5) * 0.05,
          weight: 3.0,
          light: detailLight,
          size,
          phase: Math.random() * TAU,
          speed: 1.8 + Math.random() * 2.2,
          jitterX: (Math.random() - 0.5) * 0.0016,
          jitterY: (Math.random() - 0.5) * 0.0016,
          priority: 1, // Critical feature / silhouette detail
          category: 'feature',
          isSparkle: Math.random() < 0.10,
        });

        sampledEdgeCount++;
      }
    }
  }

  // 2. 60% Soft Shading Layer (Forehead, Cheeks, Chin, Neck, Upper Shoulders)
  const haloPointsCount = 80;
  const shadingBodyCount = Math.max(0, TARGET_SHADING_COUNT - haloPointsCount);
  const shadingPoints: PortraitPoint[] = [];

  const shadingDensityField = new Float32Array(imageWidth * imageHeight);
  let totalShadingDensity = 0;

  for (let y = marginY; y < imageHeight - marginY; y++) {
    const rawY = y / (imageHeight - 1);
    if (rawY < bounds.top || rawY > bounds.top + bounds.height) continue;

    const normY = (rawY - bounds.top) / bounds.height;

    // FEATHERED SHOULDER CUTOFF: smooth density and opacity fade-out across bottom 15%
    let fade = 1.0;
    if (normY > 0.85) {
      fade *= Math.pow(Math.max(0, (1.0 - normY) / 0.15), 1.35);
    }
    if (fade <= 0.001 || normY >= 0.99) continue;

    for (let x = marginX; x < imageWidth - marginX; x++) {
      const rawX = x / (imageWidth - 1);
      if (rawX < bounds.left || rawX > bounds.left + bounds.width) continue;

      const idx = y * imageWidth + x;
      if (isCutoutBg[idx]) continue; // Zero density on cutout white background

      const sLum = sharpLum[idx];
      const skinOrFace = isSkin[idx] || isFaceZone[idx];

      // STRICT HIGH-CONTRAST CHIAROSCURO:
      // Dark areas (pupils, nostrils, lip seam, dark hair shadows) receive ZERO density!
      let localDensity = 0;
      if (skinOrFace) {
        if (sLum > 0.10) {
          localDensity = 4.5 * Math.pow(sLum, 1.25) * fade;
        }
      } else {
        const lum = luminance[idx];
        const edge = edges[idx];
        if (lum > 0.16 || edge > 0.18) {
          const hairSheen = clamp01((lum - 0.14) / 0.72);
          localDensity = 1.5 * (0.65 * hairSheen + 0.55 * edge) * fade;
        }
      }

      shadingDensityField[idx] = localDensity;
      totalShadingDensity += localDensity;
    }
  }

  if (totalShadingDensity > 0) {
    const totalPixels = imageWidth * imageHeight;
    const cdfShading = new Float64Array(totalPixels);
    let cumulativeShading = 0;
    for (let i = 0; i < totalPixels; i++) {
      cumulativeShading += shadingDensityField[i];
      cdfShading[i] = cumulativeShading;
    }

    const sampleShadingPixel = (target: number): number => {
      let low = 0;
      let high = totalPixels - 1;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (cdfShading[mid] < target) low = mid + 1;
        else high = mid;
      }
      return low;
    };

    let shadingAttempts = 0;
    const maxShadingAttempts = shadingBodyCount * 6;
    let sampledShadingCount = 0;

    while (sampledShadingCount < shadingBodyCount && shadingAttempts < maxShadingAttempts) {
      shadingAttempts++;
      const randVal = Math.random() * cumulativeShading;
      const idx = sampleShadingPixel(randVal);
      if (shadingDensityField[idx] <= 0.0001) continue;

      const py = Math.floor(idx / imageWidth);
      const px = idx % imageWidth;

      if (isCutoutBg[idx]) continue;

      // Continuous sub-pixel jitter: completely eliminates grid artifacts
      const rawX = (px + (Math.random() - 0.5) * 1.5) / (imageWidth - 1);
      const rawY = (py + (Math.random() - 0.5) * 1.5) / (imageHeight - 1);

      if (
        rawX < bounds.left ||
        rawX > bounds.left + bounds.width ||
        rawY < bounds.top ||
        rawY > bounds.top + bounds.height
      ) {
        continue;
      }

      const normX = (rawX - bounds.left) / bounds.width;
      const normY = (rawY - bounds.top) / bounds.height;
      if (normX < 0.02 || normX > 0.98 || normY < 0.02 || normY >= 0.99) continue;

      let bottomFade = 1.0;
      if (normY > 0.85) {
        bottomFade *= Math.pow(Math.max(0, (1.0 - normY) / 0.15), 1.3);
      }

      const lightVal = luminance[idx];
      const skinPixel = isSkin[idx];

      const distToCenter = Math.hypot((rawX - faceCenter.x) * 1.25, rawY - faceCenter.y);
      const faceDome = Math.max(0, 1 - distToCenter / (faceRadius * 1.15));
      let zVal = (faceDome - 0.45) * 0.7;
      if (normY > 0.65) zVal -= (normY - 0.65) * 0.85;

      // Fine, textured stardust size (0.65px - 1.25px)
      const baseSize = 0.65 + 0.55 * Math.pow(clamp01(lightVal), 1.2) + (Math.random() - 0.5) * 0.15;
      const clampedSize = Math.max(0.65, Math.min(1.25, baseSize));

      // Alpha mapped to pixel brightness: 0.25 to 0.70
      const contrastLum = clamp01(Math.pow(clamp01((lightVal - 0.20) / 0.80), 1.1));
      const shadingLight = Math.max(0.25, Math.min(0.70, (0.25 + 0.45 * contrastLum) * bottomFade));

      shadingPoints.push({
        x: clamp01(normX),
        y: clamp01(normY),
        z: zVal + (Math.random() - 0.5) * 0.05,
        weight: skinPixel ? 2.5 : 1.5,
        light: shadingLight,
        size: clampedSize,
        phase: Math.random() * TAU,
        speed: 1.5 + Math.random() * 2.5,
        jitterX: (Math.random() - 0.5) * 0.002,
        jitterY: (Math.random() - 0.5) * 0.002,
        priority: 2,
        category: skinPixel ? 'skin' : 'hair',
        isSparkle: Math.random() < 0.05,
      });

      sampledShadingCount++;
    }
  }

  // 3. Cosmic Nebula Halo & Floating Stars (Carefully bounded, NEVER clamped to borders)
  for (let i = 0; i < haloPointsCount; i++) {
    const angle = (Math.random() < 0.65)
      ? Math.PI * 0.7 + (Math.random() - 0.5) * Math.PI * 0.8 // Left side cluster
      : Math.random() * TAU;
    const dist = faceRadius * (0.95 + Math.pow(Math.random(), 0.75) * 0.55);

    const rawX = faceCenter.x + Math.cos(angle) * dist * 1.05;
    const rawY = faceCenter.y + Math.sin(angle) * dist * 0.95;

    const normX = (rawX - bounds.left) / bounds.width;
    const normY = (rawY - bounds.top) / bounds.height;

    // Discard any point out of frame
    if (normX < 0.03 || normX > 0.97 || normY < 0.03 || normY > 0.84) {
      continue;
    }

    const isSparkle = Math.random() < 0.12;
    const size = isSparkle ? 0.95 + Math.random() * 0.3 : 0.6 + Math.random() * 0.3;

    shadingPoints.push({
      x: clamp01(normX),
      y: clamp01(normY),
      z: -0.2 - Math.random() * 0.4,
      weight: 0.8,
      light: 0.55,
      size,
      phase: Math.random() * TAU,
      speed: 1.2 + Math.random() * 2.0,
      jitterX: (Math.random() - 0.5) * 0.003,
      jitterY: (Math.random() - 0.5) * 0.003,
      priority: 4,
      category: 'scatter',
      isSparkle,
    });
  }

  // 4. Bake Ultra-HD Stippled Stardust Portrait Offscreen Canvas ONCE on load!
  // Gives crystal-clear photographic facial recognition (~22,000+ micro-stars) at 1 drawImage call/frame!
  const aspect = (bounds.width * image.naturalWidth) / (bounds.height * image.naturalHeight);
  const outH = 720;
  const outW = Math.max(200, Math.round(outH * aspect));
  const renderedCanvas = document.createElement('canvas');
  renderedCanvas.width = outW;
  renderedCanvas.height = outH;
  const rCtx = renderedCanvas.getContext('2d');

  if (rCtx) {
    rCtx.clearRect(0, 0, outW, outH);
    const diamondMini = makeDiamondStarSprite(28);
    const step = 2.35;
    const sparkleCandidates: Array<{ x: number; y: number; weight: number }> = [];

    // Pass 1: High-definition jittered micro-stardust stippling (ZERO grid artifacts, razor-sharp eyes/nose/lips)
    for (let oy = step; oy < outH - step; oy += step) {
      const normYBase = oy / outH;
      if (normYBase < 0.015 || normYBase > 0.99) continue;

      let bottomFade = 1.0;
      if (normYBase > 0.85) {
        bottomFade = Math.pow(Math.max(0, (1.0 - normYBase) / 0.15), 1.45);
      }
      if (bottomFade <= 0.01) continue;

      for (let ox = step; ox < outW - step; ox += step) {
        const jx = ox + (Math.random() - 0.5) * step * 0.95;
        const jy = oy + (Math.random() - 0.5) * step * 0.95;
        const normX = jx / outW;
        const normY = jy / outH;
        if (normX < 0.015 || normX > 0.985 || normY < 0.015 || normY > 0.99) continue;

        const rawX = bounds.left + normX * bounds.width;
        const rawY = bounds.top + normY * bounds.height;
        const px = Math.max(0, Math.min(imageWidth - 1, Math.round(rawX * (imageWidth - 1))));
        const py = Math.max(0, Math.min(imageHeight - 1, Math.round(rawY * (imageHeight - 1))));
        const idx = py * imageWidth + px;
        if (isCutoutBg[idx]) continue;

        const isFaceOrSkin = isFaceZone[idx] === 1 || isSkin[idx] === 1;
        const edge = edges[idx];

        if (isFaceOrSkin) {
          const val = sharpLum[idx];
          // Keep dark features (pupils, eyelashes, eyebrows, nostrils, lip crease) genuinely dark/empty!
          if (val < 0.07) continue;

          // Probabilistic fill for dark midtones, 100% fill for lit skin/sclera highlights
          if (val < 0.35 && Math.random() > val * 2.6) continue;

          const alpha = Math.min(0.96, (0.20 + 0.80 * Math.pow(val, 0.9)) * bottomFade);
          const radius = 0.55 + val * 0.72 + (Math.random() - 0.5) * 0.14;
          rCtx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          rCtx.beginPath();
          rCtx.arc(jx, jy, Math.max(0.45, radius), 0, TAU);
          rCtx.fill();

          // Extra pinpoint highlight micro-dot on illuminated planes (forehead, sclera, nose bridge, cheeks, lower lip, upper shoulders)
          if (val > 0.56) {
            const jx2 = jx + (Math.random() - 0.5) * 1.9;
            const jy2 = jy + (Math.random() - 0.5) * 1.9;
            const alpha2 = Math.min(0.94, val * 0.85 * bottomFade);
            const r2 = 0.45 + 0.48 * val;
            rCtx.fillStyle = `rgba(255,255,255,${alpha2.toFixed(3)})`;
            rCtx.beginPath();
            rCtx.arc(jx2, jy2, r2, 0, TAU);
            rCtx.fill();
          }

          if (edge > 0.24 && val > 0.42 && Math.random() < 0.03) {
            sparkleCandidates.push({ x: jx, y: jy, weight: edge * bottomFade });
          }
        } else {
          // Hair & dark outfit: deep rich silhouette studded with crisp white starlight strands & rim highlights
          const hairSheen = clamp01((luminance[idx] - 0.05) / Math.max(0.24, pHigh - 0.05));
          const prob = (0.11 + 0.44 * hairSheen + 0.72 * edge) * bottomFade;
          if (Math.random() > prob) continue;

          const intensity = Math.min(1, 0.28 + 0.55 * hairSheen + 0.65 * edge);
          const alpha = Math.min(0.96, intensity * bottomFade);
          const radius = 0.50 + Math.random() * 0.82;
          rCtx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          rCtx.beginPath();
          rCtx.arc(jx, jy, radius, 0, TAU);
          rCtx.fill();

          if ((edge > 0.22 || hairSheen > 0.55) && Math.random() < 0.025) {
            sparkleCandidates.push({ x: jx, y: jy, weight: (edge + hairSheen) * bottomFade });
          }
        }
      }
    }

    // Pass 2: Feathered cosmic stardust aura around the hair & shoulders (matching dreamy sparkle look)
    for (let i = 0; i < 360; i++) {
      const angle =
        Math.random() < 0.62
          ? Math.PI * 0.75 + (Math.random() - 0.5) * Math.PI * 0.9
          : Math.random() * TAU;
      const dist = faceRadius * (0.85 + Math.pow(Math.random(), 0.7) * 0.65);
      const rawX = faceCenter.x + Math.cos(angle) * dist * 1.08;
      const rawY = faceCenter.y + Math.sin(angle) * dist * 0.95;
      const normX = (rawX - bounds.left) / bounds.width;
      const normY = (rawY - bounds.top) / bounds.height;
      if (normX < 0.025 || normX > 0.975 || normY < 0.02 || normY > 0.86) continue;

      const ox = normX * outW;
      const oy = normY * outH;
      const r = 0.55 + Math.random() * 1.0;
      const a = 0.25 + Math.random() * 0.65;
      rCtx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      rCtx.beginPath();
      rCtx.arc(ox, oy, r, 0, TAU);
      rCtx.fill();

      if (Math.random() < 0.06) {
        sparkleCandidates.push({ x: ox, y: oy, weight: 0.7 });
      }
    }

    // Pass 3: Delicate 4-point diamond star glints on hair sheen, shoulder rim & cosmic aura
    const maxGlints = Math.min(55, sparkleCandidates.length);
    for (let i = 0; i < maxGlints; i++) {
      const pick = sparkleCandidates[Math.floor(Math.random() * sparkleCandidates.length)];
      const sz = 6 + Math.random() * 8;
      rCtx.globalAlpha = Math.min(0.92, 0.45 + pick.weight * 0.5);
      rCtx.drawImage(diamondMini, pick.x - sz / 2, pick.y - sz / 2, sz, sz);
    }
    rCtx.globalAlpha = 1;
  }

  // Combine both layers: 40% Detail + 60% Shading = 100% (1,800 live twinkling points)
  const allPoints: PortraitPoint[] = [...detailPoints, ...shadingPoints];

  // Shuffle points randomly so tree particles transition smoothly
  for (let i = allPoints.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPoints[i], allPoints[j]] = [allPoints[j], allPoints[i]];
  }

  const facialFeatures = allPoints.filter((p) => p.category === 'feature');
  const personOutline = allPoints.filter((p) => p.category !== 'feature');

  return {
    points: allPoints,
    facialFeatures: facialFeatures.length > 0 ? facialFeatures : allPoints.slice(0, 1000),
    personOutline: personOutline.length > 0 ? personOutline : allPoints.slice(1000),
    aspect,
    renderedCanvas,
  };
}