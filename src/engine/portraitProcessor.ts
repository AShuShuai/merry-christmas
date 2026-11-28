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

const TOTAL_PORTRAIT_POINTS = 4800;
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

    const jitterX = (Math.random() - 0.5) * 0.0016;
    const jitterY = (Math.random() - 0.5) * 0.0016;
    // Fine particle sizes: 0.5px to 1.1px radius
    const size = sizeMin + Math.random() * (sizeMax - sizeMin);
    const isSparkle = Math.random() < 0.06;

    points.push({
      x: clamp01(normX + jitterX),
      y: clamp01(normY + jitterY),
      z: zBase + (Math.random() - 0.5) * 0.06,
      weight: weightBase,
      light: clamp01(contrastLight),
      size,
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

    const jitterX = (Math.random() - 0.5) * 0.0016;
    const jitterY = (Math.random() - 0.5) * 0.0016;
    const size = sizeMin + Math.random() * (sizeMax - sizeMin);
    const isSparkle = Math.random() < 0.06;

    points.push({
      x: clamp01(normX + jitterX),
      y: clamp01(normY + jitterY),
      z: zBase + (Math.random() - 0.5) * 0.06,
      weight: weightBase,
      light: clamp01(contrastLight),
      size,
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

  // Determine portrait framing bounds (constrained within 5% margins)
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

    // Tighter framing: face itself occupies 65%+ of the bounding box (significantly enlarging Chiara's face!)
    const padX = fWidth * 0.40;
    const padTop = fHeight * 0.22;
    const padBottom = fHeight * 0.44;

    const bLeft = Math.max(0.04, fLeft - padX);
    const bRight = Math.min(0.96, fRight + padX);
    const bTop = Math.max(0.04, fTop - padTop);
    const bBottom = Math.min(0.94, fBottom + padBottom);

    bounds = {
      left: bLeft,
      top: bTop,
      width: Math.max(0.1, bRight - bLeft),
      height: Math.max(0.1, bBottom - bTop),
    };
  } else {
    bounds = {
      left: 0.08,
      top: 0.08,
      width: 0.84,
      height: 0.84,
    };
  }

  const allPoints: PortraitPoint[] = [];

  // 1. Detailed Facial Feature Micro-Points (Eyes, Brows, Nose, Lips)
  // Fine radii (0.5px to 1.05px) and dark pupil/iris exclusion
  if (landmarks && landmarks.length >= 400) {
    // Left Eye Area: Sclera and highlights only (pupil < 0.35 kept empty!)
    const leftEyePoints = generateFeatureAreaPoints(
      landmarks,
      [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 468, 469, 470, 471, 472],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      200,
      0.15,
      3.0,
      0.5,
      0.95,
      0.34,
      0.003
    );
    allPoints.push(...leftEyePoints);

    // Right Eye Area
    const rightEyePoints = generateFeatureAreaPoints(
      landmarks,
      [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 473, 474, 475, 476, 477],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      200,
      0.15,
      3.0,
      0.5,
      0.95,
      0.34,
      0.003
    );
    allPoints.push(...rightEyePoints);

    // Left Eyebrow Ribbon: Skin highlights framing brow (dark hair < 0.28 kept empty)
    const leftBrowPoints = generateRibbonPoints(
      landmarks,
      [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      140,
      0.32,
      2.6,
      0.008,
      0.5,
      0.9,
      0.28
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
      140,
      0.32,
      2.6,
      0.008,
      0.5,
      0.9,
      0.28
    );
    allPoints.push(...rightBrowPoints);

    // Nose Bridge & Ridge: Highlight crest
    const noseRidge = generateRibbonPoints(
      landmarks,
      [168, 6, 197, 195, 5, 4, 1, 2],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      190,
      0.85,
      3.2,
      0.010,
      0.65,
      1.15,
      0.38
    );
    allPoints.push(...noseRidge);

    // Nose Base & Tip Contours (nostril cavity < 0.28 kept empty)
    const noseBase = generateFeatureAreaPoints(
      landmarks,
      [98, 97, 2, 326, 327, 278, 48, 115, 220, 45, 275, 440],
      bounds,
      luminance,
      imageWidth,
      imageHeight,
      120,
      0.55,
      2.5,
      0.55,
      1.0,
      0.32,
      0.005
    );
    allPoints.push(...noseBase);

    // Lips & Mouth: Bright highlight on lower lip cushion and cupid's bow (lip seam < 0.3 kept empty)
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
      340,
      0.48,
      3.2,
      0.55,
      1.1,
      0.30,
      0.008
    );
    allPoints.push(...lipsPoints);
  }

  // 2. High-Density Skin Chiaroscuro & Feathered Hair / Shoulders
  const faceCenter = {
    x: bounds.left + bounds.width * 0.48,
    y: bounds.top + bounds.height * 0.44,
  };
  const faceRadius = Math.max(bounds.width, bounds.height) * 0.46;

  const densityField = new Float32Array(imageWidth * imageHeight);
  let totalDensity = 0;

  for (let y = marginY; y < imageHeight - marginY; y++) {
    const rawY = y / (imageHeight - 1);
    if (rawY < bounds.top || rawY > bounds.top + bounds.height) continue;

    const normY = (rawY - bounds.top) / bounds.height;
    const dy = rawY - faceCenter.y;

    for (let x = marginX; x < imageWidth - marginX; x++) {
      const rawX = x / (imageWidth - 1);
      if (rawX < bounds.left || rawX > bounds.left + bounds.width) continue;

      const idx = y * imageWidth + x;
      if (isCutoutBg[idx]) continue; // Zero density on cutout white background!

      const lum = luminance[idx];
      const edge = edges[idx];
      const skinPixel = isSkin[idx];

      const dx = (rawX - faceCenter.x) * 1.15;
      const distFromFace = Math.hypot(dx, dy);

      // SHOULDER SOFT FADE-OUT: smoothly fade out bottom edge well above Merry Christmas text
      let fade = 1.0;
      if (normY > 0.68) {
        // Drops smoothly to 0 by normY = 0.88
        fade *= Math.max(0, 1.0 - Math.pow(Math.min(1, (normY - 0.68) / 0.20), 1.25));
      }
      if (distFromFace > faceRadius * 0.90) {
        const lateralFalloff = (distFromFace - faceRadius * 0.90) / (faceRadius * 0.50);
        fade *= Math.max(0, 1.0 - Math.pow(Math.min(1, lateralFalloff), 1.2));
      }

      if (fade <= 0.001) continue;

      // HIGH-CONTRAST GAMMA CURVE:
      // Dark areas (pupils, nostrils, lip seam, dark shadow) receive 0 density!
      let contrastLum = 0;
      if (lum > 0.24) {
        contrastLum = Math.pow((lum - 0.24) / 0.76, 1.45);
      }

      let localDensity = 0;
      if (skinPixel) {
        // High density on inner face skin, shaped by contrast
        localDensity = 3.6 * (0.15 + 0.85 * contrastLum) * fade;
      } else {
        // Lower density on outer hair silhouette compared to inner face
        const hairSheen = Math.pow(lum, 0.8);
        localDensity = 1.35 * (0.3 + 0.7 * hairSheen + 0.4 * edge) * fade;
      }

      densityField[idx] = localDensity;
      totalDensity += localDensity;
    }
  }

  // Allocate remaining points
  const pointsRemaining = Math.max(1600, TOTAL_PORTRAIT_POINTS - allPoints.length - 350);

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
          if (py < marginY || py >= imageHeight - marginY) continue;
          for (let px = cellXStart; px < cellXEnd; px++) {
            if (px < marginX || px >= imageWidth - marginX) continue;
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

          // Discard if in the 5% margin
          if (subX < 0.03 || subX > 0.97 || subY < 0.03 || subY > 0.78) continue;

          const rawX = bounds.left + subX * bounds.width;
          const rawY = bounds.top + subY * bounds.height;

          const px = Math.max(0, Math.min(imageWidth - 1, Math.round(rawX * (imageWidth - 1))));
          const py = Math.max(0, Math.min(imageHeight - 1, Math.round(rawY * (imageHeight - 1))));

          if (isCutoutBg[py * imageWidth + px]) continue;

          const lightVal = luminance[py * imageWidth + px];
          const skinPixel = isSkin[py * imageWidth + px];

          // High contrast check
          if (lightVal < 0.22) continue;

          const distToCenter = Math.hypot(
            (rawX - faceCenter.x) * 1.3,
            rawY - faceCenter.y
          );
          const faceDome = Math.max(0, 1 - distToCenter / (faceRadius * 1.05));
          let zVal = (faceDome - 0.45) * 0.75;
          if (subY > 0.65) zVal -= (subY - 0.65) * 0.9;

          const jitterX = (Math.random() - 0.5) * 0.002;
          const jitterY = (Math.random() - 0.5) * 0.002;

          // VIBRANT STARDUST RADII (0.7px to 1.7px radius, crisp and clearly visible)
          let baseSize = 0.70 + 0.85 * Math.pow(lightVal, 1.2) + (Math.random() - 0.5) * 0.15;
          if (skinPixel) baseSize += 0.2;
          const clampedSize = Math.max(0.65, Math.min(1.7, baseSize));

          let priority = 2;
          let category: 'feature' | 'skin' | 'hair' | 'scatter' = 'skin';
          if (subY > 0.68 || distToCenter > faceRadius * 0.90) {
            priority = 4;
            category = 'scatter';
          } else if (!skinPixel) {
            priority = 3;
            category = 'hair';
          }

          const isSparkle = Math.random() < 0.05;

          allPoints.push({
            x: clamp01(subX + jitterX),
            y: clamp01(subY + jitterY),
            z: zVal + (Math.random() - 0.5) * 0.05,
            weight: skinPixel ? 2.5 : 1.4,
            light: clamp01(lightVal),
            size: clampedSize,
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

  // 3. Cosmic Nebula Halo & Floating Stars (Carefully bounded, NEVER clamped to borders)
  const haloPointsCount = 350;
  for (let i = 0; i < haloPointsCount; i++) {
    const angle = (Math.random() < 0.65)
      ? Math.PI * 0.7 + (Math.random() - 0.5) * Math.PI * 0.8 // Left side cluster
      : Math.random() * TAU;
    const dist = faceRadius * (0.88 + Math.pow(Math.random(), 0.75) * 0.45);

    const rawX = faceCenter.x + Math.cos(angle) * dist * 1.05;
    const rawY = faceCenter.y + Math.sin(angle) * dist * 0.95;

    const normX = (rawX - bounds.left) / bounds.width;
    const normY = (rawY - bounds.top) / bounds.height;

    // STRICT CHECK: Discard any point outside [0.04, 0.96]!
    // NEVER clamp, which was what created the rectangular frame artifact!
    if (normX < 0.04 || normX > 0.96 || normY < 0.04 || normY > 0.76) {
      continue;
    }

    const isSparkle = Math.random() < 0.09;
    const size = isSparkle ? 0.9 + Math.random() * 0.35 : 0.55 + Math.random() * 0.4;

    allPoints.push({
      x: normX,
      y: normY,
      z: -0.2 - Math.random() * 0.4,
      weight: 0.8,
      light: 0.85,
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

  // Shuffle points randomly
  for (let i = allPoints.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPoints[i], allPoints[j]] = [allPoints[j], allPoints[i]];
  }

  const facialFeatures = allPoints.filter((p) => p.category === 'feature');
  const personOutline = allPoints.filter((p) => p.category !== 'feature');

  return {
    points: allPoints,
    facialFeatures: facialFeatures.length > 0 ? facialFeatures : allPoints.slice(0, 2500),
    personOutline: personOutline.length > 0 ? personOutline : allPoints.slice(2500),
    aspect: (bounds.width * image.naturalWidth) / (bounds.height * image.naturalHeight),
  };
}