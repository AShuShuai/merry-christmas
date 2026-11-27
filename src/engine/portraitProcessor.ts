import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

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

const TOTAL_PORTRAIT_POINTS = 9800;
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
  spreadFactor: number = 0.007
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
  const halfW = Math.max(0.007, (maxX - minX) * 0.55 + spreadFactor);
  const halfH = Math.max(0.005, (maxY - minY) * 0.55 + spreadFactor);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const radius = Math.sqrt(Math.random());
    const rawX = centerX + Math.cos(angle) * halfW * radius + (Math.random() - 0.5) * spreadFactor;
    const rawY = centerY + Math.sin(angle) * halfH * radius + (Math.random() - 0.5) * spreadFactor;

    if (
      rawX < bounds.left ||
      rawX > bounds.left + bounds.width ||
      rawY < bounds.top ||
      rawY > bounds.top + bounds.height
    ) {
      continue;
    }

    const normX = clamp01((rawX - bounds.left) / bounds.width);
    const normY = clamp01((rawY - bounds.top) / bounds.height);

    const pixelX = Math.max(0, Math.min(imageWidth - 1, Math.round(rawX * (imageWidth - 1))));
    const pixelY = Math.max(0, Math.min(imageHeight - 1, Math.round(rawY * (imageHeight - 1))));
    const pixelLight = luminance[pixelY * imageWidth + pixelX] ?? 0.7;

    const jitterX = (Math.random() - 0.5) * 0.0018;
    const jitterY = (Math.random() - 0.5) * 0.0018;
    const size = sizeMin + Math.random() * (sizeMax - sizeMin);
    const isSparkle = Math.random() < 0.08;

    points.push({
      x: clamp01(normX + jitterX),
      y: clamp01(normY + jitterY),
      z: zBase + (Math.random() - 0.5) * 0.06,
      weight: weightBase,
      light: clamp01(pixelLight),
      size: isSparkle ? size * 1.5 : size,
      phase: Math.random() * TAU,
      speed: 1.8 + Math.random() * 2.2,
      jitterX,
      jitterY,
      priority: 1, // Critical facial feature
      category: 'feature',
      isSparkle,
    });
  }

  return points;
}

// Generate dense pointillism along facial feature curves without 1D lines (2D soft ribbon sampling)
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
  sizeMax: number
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
    const rawX = baseX + nx * offset + (Math.random() - 0.5) * 0.002;
    const rawY = baseY + ny * offset + (Math.random() - 0.5) * 0.002;

    if (
      rawX < bounds.left ||
      rawX > bounds.left + bounds.width ||
      rawY < bounds.top ||
      rawY > bounds.top + bounds.height
    ) {
      continue;
    }

    const normX = clamp01((rawX - bounds.left) / bounds.width);
    const normY = clamp01((rawY - bounds.top) / bounds.height);

    const pixelX = Math.max(0, Math.min(imageWidth - 1, Math.round(rawX * (imageWidth - 1))));
    const pixelY = Math.max(0, Math.min(imageHeight - 1, Math.round(rawY * (imageHeight - 1))));
    const pixelLight = luminance[pixelY * imageWidth + pixelX] ?? 0.7;

    const jitterX = (Math.random() - 0.5) * 0.0018;
    const jitterY = (Math.random() - 0.5) * 0.0018;
    const size = sizeMin + Math.random() * (sizeMax - sizeMin);
    const isSparkle = Math.random() < 0.08;

    points.push({
      x: clamp01(normX + jitterX),
      y: clamp01(normY + jitterY),
      z: zBase + (Math.random() - 0.5) * 0.06,
      weight: weightBase,
      light: clamp01(pixelLight),
      size: isSparkle ? size * 1.5 : size,
      phase: Math.random() * TAU,
      speed: 1.8 + Math.random() * 2.2,
      jitterX,
      jitterY,
      priority: 1, // Critical facial feature
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

  const maxSide = 400;
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

  // Analyze RGB: Detect pure white background cutout vs Chiara's skin and hair
  for (let y = 0; y < imageHeight; y++) {
    for (let x = 0; x < imageWidth; x++) {
      const idx = y * imageWidth + x;
      const off = idx * 4;
      const r = data[off];
      const g = data[off + 1];
      const b = data[off + 2];

      // Pure white or near-white background cutout (cutout edges)
      const isWhiteBg = r > 230 && g > 230 && b > 230;
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

  // Compute Sobel edges for textural detail (hair strands, eyes, lips, jawline)
  for (let y = 1; y < imageHeight - 1; y++) {
    for (let x = 1; x < imageWidth - 1; x++) {
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
      edges[idx] = Math.min(1, Math.hypot(gx, gy) * 1.6);
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

  // Determine portrait framing bounds
  let bounds: Bounds;
  if (landmarks && landmarks.length >= 20) {
    const xs = landmarks.map((l) => l.x);
    const ys = landmarks.map((l) => l.y);
    const fLeft = Math.min(...xs);
    const fRight = Math.max(...xs);
    const fTop = Math.min(...ys);
    const fBottom = Math.max(...ys);
    const fWidth = fRight - fLeft;
    const fHeight = fBottom - fTop;

    // Head, full hair flow and shoulders (matching Image 1 framing)
    const padX = fWidth * 0.72;
    const padTop = fHeight * 0.38;
    const padBottom = fHeight * 0.98;

    const bLeft = Math.max(0, fLeft - padX);
    const bRight = Math.min(1, fRight + padX);
    const bTop = Math.max(0, fTop - padTop);
    const bBottom = Math.min(1, fBottom + padBottom);

    bounds = {
      left: bLeft,
      top: bTop,
      width: Math.max(0.1, bRight - bLeft),
      height: Math.max(0.1, bBottom - bTop),
    };
  } else {
    // Find bounds from non-white foreground
    let left = 1;
    let right = 0;
    let top = 1;
    let bottom = 0;
    for (let y = 0; y < imageHeight; y++) {
      for (let x = 0; x < imageWidth; x++) {
        if (!isCutoutBg[y * imageWidth + x]) {
          const nx = x / (imageWidth - 1);
          const ny = y / (imageHeight - 1);
          left = Math.min(left, nx);
          right = Math.max(right, nx);
          top = Math.min(top, ny);
          bottom = Math.max(bottom, ny);
        }
      }
    }
    bounds = {
      left: Math.max(0, left - 0.02),
      top: Math.max(0, top - 0.02),
      width: Math.min(1, right + 0.02) - Math.max(0, left - 0.02),
      height: Math.min(1, bottom + 0.02) - Math.max(0, top - 0.02),
    };
  }

  const allPoints: PortraitPoint[] = [];

  // 1. Detailed Facial Feature Micro-Points (Eyes, Brows, Nose, Lips)
  if (landmarks && landmarks.length >= 400) {
    // Left Eye & Iris (Thick, sparkling gaze)
    const leftEyePoints = generateFeatureAreaPoints(
      landmarks,
      [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 468, 469, 470, 471, 472],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      450,
      0.15,
      3.5,
      0.9,
      1.6,
      0.003
    );
    allPoints.push(...leftEyePoints);

    // Right Eye & Iris
    const rightEyePoints = generateFeatureAreaPoints(
      landmarks,
      [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 473, 474, 475, 476, 477],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      450,
      0.15,
      3.5,
      0.9,
      1.6,
      0.003
    );
    allPoints.push(...rightEyePoints);

    // Left Eyebrow Ribbon
    const leftBrowPoints = generateRibbonPoints(
      landmarks,
      [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      360,
      0.32,
      3.0,
      0.009,
      0.8,
      1.5
    );
    allPoints.push(...leftBrowPoints);

    // Right Eyebrow Ribbon
    const rightBrowPoints = generateRibbonPoints(
      landmarks,
      [336, 296, 334, 293, 300, 285, 295, 282, 283, 276],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      360,
      0.32,
      3.0,
      0.009,
      0.8,
      1.5
    );
    allPoints.push(...rightBrowPoints);

    // Nose Bridge & Ridge (High 3D Protrusion & Brilliant Highlight)
    const noseRidge = generateRibbonPoints(
      landmarks,
      [168, 6, 197, 195, 5, 4, 1, 2],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      450,
      0.85,
      3.5,
      0.012,
      1.1,
      2.0
    );
    allPoints.push(...noseRidge);

    // Nose Base & Nostril Contours
    const noseBase = generateFeatureAreaPoints(
      landmarks,
      [98, 97, 2, 326, 327, 278, 48, 115, 220, 45, 275, 440],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      300,
      0.55,
      2.8,
      0.8,
      1.5,
      0.006
    );
    allPoints.push(...noseBase);

    // Lips & Mouth (Soft curvature, vermilion border, bright lower lip highlight)
    const lipsPoints = generateFeatureAreaPoints(
      landmarks,
      [
        61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
        78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
      ],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      850,
      0.48,
      3.5,
      0.9,
      1.8,
      0.009
    );
    allPoints.push(...lipsPoints);
  }

  // 2. High-Density Skin Chiaroscuro & Full Hair Volume
  const faceCenter = {
    x: bounds.left + bounds.width * 0.48,
    y: bounds.top + bounds.height * 0.38,
  };
  const faceRadius = Math.max(bounds.width, bounds.height) * 0.44;

  const densityField = new Float32Array(imageWidth * imageHeight);
  let totalDensity = 0;

  for (let y = 0; y < imageHeight; y++) {
    const rawY = y / (imageHeight - 1);
    if (rawY < bounds.top || rawY > bounds.top + bounds.height) continue;

    const normY = (rawY - bounds.top) / bounds.height;
    const dy = rawY - faceCenter.y;

    for (let x = 0; x < imageWidth; x++) {
      const rawX = x / (imageWidth - 1);
      if (rawX < bounds.left || rawX > bounds.left + bounds.width) continue;

      const idx = y * imageWidth + x;
      if (isCutoutBg[idx]) continue; // Never place on cutout white background!

      const lum = luminance[idx];
      const edge = edges[idx];
      const skinPixel = isSkin[idx];

      const dx = (rawX - faceCenter.x) * 1.15;
      const distFromFace = Math.hypot(dx, dy);

      let fade = 1.0;
      if (normY > 0.65) {
        const falloff = (normY - 0.65) / 0.35;
        fade *= Math.max(0, 1.0 - Math.pow(falloff, 1.1));
      }
      if (distFromFace > faceRadius * 0.95) {
        const lateralFalloff = (distFromFace - faceRadius * 0.95) / (faceRadius * 0.55);
        fade *= Math.max(0, 1.0 - Math.pow(Math.min(1, lateralFalloff), 1.15));
      }

      // Skin regions: heavy starlight density to create solid, luminous white skin
      // Hair regions: rich particle flow tracing hair volume and sheen
      let localDensity = 0;
      if (skinPixel) {
        const lightFactor = Math.pow(lum, 0.6);
        localDensity = 4.2 * lightFactor * fade;
      } else {
        // Hair & shoulders: strong stardust presence so hair is thick and visible (Image 1)
        const hairSheen = Math.pow(lum, 0.7);
        localDensity = 2.4 * (0.6 + 0.4 * hairSheen + 0.5 * edge) * fade;
      }

      densityField[idx] = localDensity;
      totalDensity += localDensity;
    }
  }

  // Allocate remaining points
  const pointsRemaining = Math.max(3000, TOTAL_PORTRAIT_POINTS - allPoints.length - 1000);

  if (totalDensity > 0) {
    const gridCols = 140;
    const gridRows = 140;
    const pointsPerCellFloat = pointsRemaining / (gridCols * gridRows);

    for (let gy = 0; gy < gridRows; gy++) {
      const cellYStart = Math.floor(bounds.top * imageHeight + (gy / gridRows) * bounds.height * imageHeight);
      const cellYEnd = Math.floor(bounds.top * imageHeight + ((gy + 1) / gridRows) * bounds.height * imageHeight);

      for (let gx = 0; gx < gridCols; gx++) {
        const cellXStart = Math.floor(bounds.left * imageWidth + (gx / gridCols) * bounds.width * imageWidth);
        const cellXEnd = Math.floor(bounds.left * imageWidth + ((gx + 1) / gridCols) * bounds.width * imageWidth);

        let cellDensity = 0;
        let countSamples = 0;
        for (let py = cellYStart; py < cellYEnd; py++) {
          if (py < 0 || py >= imageHeight) continue;
          for (let px = cellXStart; px < cellXEnd; px++) {
            if (px < 0 || px >= imageWidth) continue;
            cellDensity += densityField[py * imageWidth + px];
            countSamples++;
          }
        }

        if (countSamples === 0 || cellDensity === 0) continue;
        const avgDensity = cellDensity / countSamples;
        const targetCount = (avgDensity / (totalDensity / (imageWidth * imageHeight))) * pointsPerCellFloat;
        const integerCount = Math.floor(targetCount);
        const fractionalPart = targetCount - integerCount;
        const actualCount = integerCount + (Math.random() < fractionalPart ? 1 : 0);

        for (let k = 0; k < actualCount; k++) {
          const subX = (gx + Math.random()) / gridCols;
          const subY = (gy + Math.random()) / gridRows;

          const rawX = bounds.left + subX * bounds.width;
          const rawY = bounds.top + subY * bounds.height;

          const px = Math.max(0, Math.min(imageWidth - 1, Math.round(rawX * (imageWidth - 1))));
          const py = Math.max(0, Math.min(imageHeight - 1, Math.round(rawY * (imageHeight - 1))));

          if (isCutoutBg[py * imageWidth + px]) continue;

          const lightVal = luminance[py * imageWidth + px];
          const skinPixel = isSkin[py * imageWidth + px];

          const distToCenter = Math.hypot(
            (rawX - faceCenter.x) * 1.3,
            rawY - faceCenter.y
          );
          const faceDome = Math.max(0, 1 - distToCenter / (faceRadius * 1.05));
          let zVal = (faceDome - 0.45) * 0.75;
          if (subY > 0.65) zVal -= (subY - 0.65) * 0.9;

          const jitterX = (Math.random() - 0.5) * 0.0025;
          const jitterY = (Math.random() - 0.5) * 0.0025;

          // Prominent stardust sizing: solid cores with diamond sparkles
          let baseSize = 0.95 + 1.25 * lightVal + (Math.random() - 0.5) * 0.4;
          if (skinPixel) baseSize += 0.35; // Thicker stardust on face
          const clampedSize = Math.max(0.85, Math.min(2.8, baseSize));

          let priority = 2;
          let category: 'feature' | 'skin' | 'hair' | 'scatter' = 'skin';
          if (subY > 0.7 || distToCenter > faceRadius * 0.92) {
            priority = 4;
            category = 'scatter';
          } else if (!skinPixel) {
            priority = 3;
            category = 'hair';
          }

          const isSparkle = Math.random() < 0.07;

          allPoints.push({
            x: clamp01(subX + jitterX),
            y: clamp01(subY + jitterY),
            z: zVal + (Math.random() - 0.5) * 0.05,
            weight: skinPixel ? 3.0 : 1.8,
            light: clamp01(lightVal),
            size: isSparkle ? clampedSize * 1.6 : clampedSize,
            phase: Math.random() * TAU,
            speed: 1.5 + Math.random() * 2.5,
            jitterX,
            jitterY,
            priority,
            category,
            isSparkle,
          });
        }
      }
    }
  }

  // 3. Cosmic Nebula Halo & Floating Stars (Matching Image 1's outer stardust)
  // Look at Image 1: on the left and right of the hair, loose stars drift outward into the space
  const haloPointsCount = 1000;
  for (let i = 0; i < haloPointsCount; i++) {
    // Generate loose stars around the upper torso and head contour (concentrated on left side as in Image 1)
    const angle = (Math.random() < 0.65)
      ? Math.PI * 0.7 + (Math.random() - 0.5) * Math.PI * 0.85 // Left side cluster
      : Math.random() * TAU; // All around
    const dist = faceRadius * (0.85 + Math.pow(Math.random(), 0.7) * 0.55);

    const rawX = faceCenter.x + Math.cos(angle) * dist * 1.05;
    const rawY = faceCenter.y + Math.sin(angle) * dist * 0.95;

    const normX = clamp01((rawX - bounds.left) / bounds.width);
    const normY = clamp01((rawY - bounds.top) / bounds.height);

    const isSparkle = Math.random() < 0.12; // High sparkle rate in halo
    const size = isSparkle ? 2.5 + Math.random() * 2.0 : 0.9 + Math.random() * 1.4;

    allPoints.push({
      x: normX,
      y: normY,
      z: -0.2 - Math.random() * 0.4,
      weight: 0.8,
      light: 0.9,
      size,
      phase: Math.random() * TAU,
      speed: 1.2 + Math.random() * 2.0,
      jitterX: (Math.random() - 0.5) * 0.004,
      jitterY: (Math.random() - 0.5) * 0.004,
      priority: 4,
      category: 'scatter',
      isSparkle,
    });
  }

  // Shuffle points randomly
  for (let i = allPoints.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPoints[i], allPoints[j]] = [allPoints[j], allPoints[i]];
  }

  const facialFeatures = allPoints.filter((p) => p.category === 'feature');
  const personOutline = allPoints.filter((p) => p.category !== 'feature');

  return {
    points: allPoints,
    facialFeatures: facialFeatures.length > 0 ? facialFeatures : allPoints.slice(0, 3000),
    personOutline: personOutline.length > 0 ? personOutline : allPoints.slice(3000),
    aspect: (bounds.width * image.naturalWidth) / (bounds.height * image.naturalHeight),
  };
}