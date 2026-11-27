import React, { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  ColorRGB,
  PortraitLoadStatus,
  TreeSettings,
  TreePoint,
  OrbitPoint,
  Sparkle,
  Petal,
  Meteor,
  BurstParticle,
} from '../types';
import { THEMES } from '../config/themes';
import { generateSprites, makeStarlightSprite } from '../engine/sprites';
import { createProjector } from '../engine/projection';
import { processPortraitImage } from '../engine/portraitProcessor';
import type { PortraitTargets } from '../engine/portraitProcessor';
import { chimeAudio } from '../utils/audio';

const TAU = Math.PI * 2;
const TRUNK_SPRITES = generateSprites([
  [96, 52, 30],
  [131, 74, 40],
  [167, 102, 56],
  [193, 119, 63],
  [220, 157, 91],
  [245, 198, 130],
  [144, 77, 52],
]);

function rand(max: number, min: number = 0): number {
  return min + Math.random() * (max - min);
}

function energyCloudPos(w: number, h: number): [number, number] {
  const angle = Math.random() * TAU;
  const phase = Math.random() * TAU;
  const radius = Math.min(w, h) * (0.12 + Math.pow(Math.random(), 0.62) * 0.42);
  const unevenEdge =
    0.72 +
    Math.sin(angle * 3 + phase) * 0.2 +
    Math.sin(angle * 6 - phase * 1.4) * 0.12 +
    Math.cos(angle * 11 + phase * 0.7) * 0.08;
  const centerX = w * (0.5 + (Math.random() - 0.5) * 0.14);
  const centerY = h * (0.52 + (Math.random() - 0.5) * 0.16);
  const swirlRadius = radius * Math.max(0.28, unevenEdge);

  return [
    centerX + Math.cos(angle) * swirlRadius,
    centerY + Math.sin(angle) * swirlRadius * (0.62 + Math.random() * 0.44),
  ];
}

interface GiftModel {
  x: number;
  z: number;
  baseY: number;
  width: number;
  height: number;
  depth: number;
  body: string;
  ribbon: string;
  side: string;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  phase: number;
}

function createGiftModels(): GiftModel[] {
  const range = (min: number, max: number) => min + Math.random() * (max - min);
  const colors = [
    { body: '#a51f36', side: '#6f1728', ribbon: '#f4d36d' },
    { body: '#187845', side: '#0d4c30', ribbon: '#f7e4a0' },
    { body: '#c6383d', side: '#84232c', ribbon: '#f6d573' },
  ];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const startingAngle = range(0, TAU);
  const count = 9;

  return Array.from({ length: count }, (_, index) => {
    const color = colors[Math.floor(range(0, colors.length))];
    const angle = startingAngle + index * goldenAngle + range(-0.42, 0.42);
    const radius = 1.8 + Math.sqrt((index + Math.random()) / count) * 6.3;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      baseY: -9.45 + range(-0.42, 0.28),
      width: range(0.72, 1.6),
      height: range(0.62, 1.55),
      depth: range(0.68, 1.55),
      body: color.body,
      side: color.side,
      ribbon: color.ribbon,
      yaw: range(0, TAU),
      tiltX: range(-0.16, 0.16),
      tiltZ: range(-0.13, 0.13),
      phase: range(0, TAU),
    };
  });
}

const GIFT_MODELS = createGiftModels();

type Projector = (x: number, y: number, z: number) => { x: number; y: number; z: number; scale: number };

function assignPortraitTargets(
  points: TreePoint[],
  targets: PortraitTargets,
  tempStarPointsRef?: React.MutableRefObject<TreePoint[]>
) {
  if (points.length === 0 || !targets.points || targets.points.length === 0) return;

  const targetPoints = targets.points;
  const primaryCount = Math.min(points.length, targetPoints.length);

  for (let i = 0; i < primaryCount; i++) {
    const pt = points[i];
    const tgt = targetPoints[i];
    pt.portraitX = tgt.x;
    pt.portraitY = tgt.y;
    pt.portraitZ = tgt.z;
    pt.portraitLight = tgt.light;
    pt.portraitSize = tgt.size;
    pt.portraitJitterX = tgt.jitterX;
    pt.portraitJitterY = tgt.jitterY;
    pt.portraitSpeed = tgt.speed;
    pt.portraitPriority = tgt.priority;
    pt.portraitCategory = tgt.category;
    pt.portraitIsSparkle = tgt.isSparkle;
  }

  // If portrait targets has more points (e.g. 9,800 points total),
  // dynamically allocate temporary star particles that fade in during expansion!
  if (tempStarPointsRef) {
    const extraPoints: TreePoint[] = [];
    for (let i = primaryCount; i < targetPoints.length; i++) {
      const tgt = targetPoints[i];
      extraPoints.push({
        x: 0,
        y: 0,
        z: 0,
        t: Math.random(),
        c: 0,
        originalColor: [255, 255, 255],
        base: tgt.size,
        phase: tgt.phase,
        fade: 1,
        sx: 0,
        sy: 0,
        portraitX: tgt.x,
        portraitY: tgt.y,
        portraitZ: tgt.z,
        portraitLight: tgt.light,
        portraitSize: tgt.size,
        portraitJitterX: tgt.jitterX,
        portraitJitterY: tgt.jitterY,
        portraitSpeed: tgt.speed,
        portraitPriority: tgt.priority,
        portraitCategory: tgt.category,
        portraitIsSparkle: tgt.isSparkle,
        isTemporary: true,
      });
    }
    tempStarPointsRef.current = extraPoints;
  }
}

function drawGiftModels(
  ctx: CanvasRenderingContext2D,
  projectFrame: Projector,
  sprites: HTMLCanvasElement[],
  time: number,
  intro: number,
  scatter: number,
  width: number,
  height: number
) {
  if (intro <= 0) return;

  const scatterProgress = Math.max(0, Math.min(1, scatter));
  const gifts = GIFT_MODELS.map((gift, index) => {
    const bob = Math.sin(time * 0.85 + gift.phase) * 0.045;
    const centerY = gift.baseY + gift.height / 2 + bob;
    const origin = projectFrame(gift.x, centerY, gift.z);
    const angle = -Math.PI / 2 + ((index + 0.5) * TAU) / GIFT_MODELS.length + time * 0.065;
    const targetX = width / 2 + Math.cos(angle) * width * 0.28;
    const targetY = height / 2 + Math.sin(angle) * height * 0.2;
    const displayX = origin.x + (targetX - origin.x) * scatterProgress;
    const displayY = origin.y + (targetY - origin.y) * scatterProgress;
    const yaw = gift.yaw + Math.sin(time * 0.32 + gift.phase) * 0.035;
    const tiltX = gift.tiltX + Math.sin(time * 0.72 + gift.phase) * 0.025;
    const tiltZ = gift.tiltZ + Math.cos(time * 0.68 + gift.phase) * 0.025;
    const modelScale = 0.48 * (1 - scatterProgress * 0.45);
    const screenScale = origin.scale * modelScale;
    const projectVertex = (vx: number, vy: number, vz: number) => {
      const cosX = Math.cos(tiltX);
      const sinX = Math.sin(tiltX);
      const rotatedY = vy * cosX - vz * sinX;
      const rotatedZ = vy * sinX + vz * cosX;
      const cosZ = Math.cos(tiltZ);
      const sinZ = Math.sin(tiltZ);
      const rotatedX = vx * cosZ - rotatedY * sinZ;
      const tiltedY = vx * sinZ + rotatedY * cosZ;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const worldX = gift.x + rotatedX * cosYaw + rotatedZ * sinYaw;
      const worldZ = gift.z - rotatedX * sinYaw + rotatedZ * cosYaw;
      const projected = projectFrame(worldX, centerY + tiltedY, worldZ);

      return {
        x: displayX + (projected.x - origin.x) * modelScale,
        y: displayY + (projected.y - origin.y) * modelScale,
        z: projected.z,
      };
    };

    const halfWidth = gift.width / 2;
    const halfHeight = gift.height / 2;
    const halfDepth = gift.depth / 2;
    const faces = [
      {
        color: gift.body,
        vertices: [
          [-halfWidth, -halfHeight, halfDepth],
          [halfWidth, -halfHeight, halfDepth],
          [halfWidth, halfHeight, halfDepth],
          [-halfWidth, halfHeight, halfDepth],
        ],
      },
      {
        color: gift.side,
        vertices: [
          [halfWidth, -halfHeight, -halfDepth],
          [-halfWidth, -halfHeight, -halfDepth],
          [-halfWidth, halfHeight, -halfDepth],
          [halfWidth, halfHeight, -halfDepth],
        ],
      },
      {
        color: gift.side,
        vertices: [
          [-halfWidth, -halfHeight, -halfDepth],
          [-halfWidth, -halfHeight, halfDepth],
          [-halfWidth, halfHeight, halfDepth],
          [-halfWidth, halfHeight, -halfDepth],
        ],
      },
      {
        color: gift.side,
        vertices: [
          [halfWidth, -halfHeight, halfDepth],
          [halfWidth, -halfHeight, -halfDepth],
          [halfWidth, halfHeight, -halfDepth],
          [halfWidth, halfHeight, halfDepth],
        ],
      },
      {
        color: '#e6b958',
        vertices: [
          [-halfWidth, halfHeight, halfDepth],
          [halfWidth, halfHeight, halfDepth],
          [halfWidth, halfHeight, -halfDepth],
          [-halfWidth, halfHeight, -halfDepth],
        ],
      },
      {
        color: '#3e2630',
        vertices: [
          [-halfWidth, -halfHeight, -halfDepth],
          [halfWidth, -halfHeight, -halfDepth],
          [halfWidth, -halfHeight, halfDepth],
          [-halfWidth, -halfHeight, halfDepth],
        ],
      },
    ].map((face) => {
      const points = face.vertices.map(([x, y, z]) => projectVertex(x, y, z));
      return {
        color: face.color,
        points,
        depth: points.reduce((sum, point) => sum + point.z, 0) / points.length,
      };
    }).sort((a, b) => a.depth - b.depth);

    return {
      gift,
      projectVertex,
      faces,
      depth: origin.z,
      screenScale,
      halfWidth,
      halfHeight,
      halfDepth,
    };
  }).sort((a, b) => a.depth - b.depth);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = intro * (1 - scatterProgress);
  gifts.forEach(({ gift, projectVertex, faces, screenScale, halfWidth, halfHeight, halfDepth }) => {
    const base = projectVertex(0, -halfHeight, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + screenScale * 0.08, screenScale * gift.width * 0.34, screenScale * gift.depth * 0.22, 0, 0, TAU);
    ctx.fill();

    faces.forEach(({ color, points }) => {
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.shadowColor = '#ffd36e';
      ctx.shadowBlur = Math.max(1.2, screenScale * 0.16);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 226, 155, 0.42)';
      ctx.lineWidth = Math.max(0.6, screenScale * 0.025);
      ctx.stroke();
    });

    const ribbonHalfWidth = gift.width * 0.075;
    const frontRibbon = [
      [-ribbonHalfWidth, -halfHeight, halfDepth + 0.004],
      [ribbonHalfWidth, -halfHeight, halfDepth + 0.004],
      [ribbonHalfWidth, halfHeight, halfDepth + 0.004],
      [-ribbonHalfWidth, halfHeight, halfDepth + 0.004],
    ].map(([x, y, z]) => projectVertex(x, y, z));
    ctx.beginPath();
    frontRibbon.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fillStyle = gift.ribbon;
    ctx.fill();

    const topRibbon = [
      [-halfWidth, halfHeight + 0.004, -gift.depth * 0.07],
      [halfWidth, halfHeight + 0.004, -gift.depth * 0.07],
      [halfWidth, halfHeight + 0.004, gift.depth * 0.07],
      [-halfWidth, halfHeight + 0.004, gift.depth * 0.07],
    ].map(([x, y, z]) => projectVertex(x, y, z));
    ctx.beginPath();
    topRibbon.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fillStyle = gift.ribbon;
    ctx.fill();

    const sparkle = sprites[0];
    if (sparkle) {
      const sparkleSize = Math.max(1.5, screenScale * 0.3);
      const sparklePoint = projectVertex(-halfWidth * 0.42, halfHeight * 0.3, halfDepth + 0.01);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7;
      ctx.drawImage(sparkle, sparklePoint.x - sparkleSize / 2, sparklePoint.y - sparkleSize / 2, sparkleSize, sparkleSize);
      ctx.globalAlpha = intro;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawTreeDecorations(
  ctx: CanvasRenderingContext2D,
  projectFrame: Projector,
  time: number,
  intro: number,
  scatter: number
) {
  if (intro <= 0 || scatter >= 0.98) return;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = intro * (1 - scatter);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const garlandPoints: Array<{ x: number; y: number; z: number; scale: number }> = [];
  const segmentCount = 220;
  const visibleSegments = Math.max(2, Math.floor(segmentCount * intro));
  for (let i = 0; i <= visibleSegments; i++) {
    const t = (i / segmentCount) * 0.94;
    const radius = 6.9 * Math.pow(1 - t, 0.85) + 0.45;
    const angle = t * TAU * 4.8 + time * 0.025;
    const point = projectFrame(Math.cos(angle) * radius, -8.85 + t * 14.8, Math.sin(angle) * radius);
    garlandPoints.push(point);
  }

  ctx.shadowColor = '#ffd56a';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = 'rgba(255, 200, 72, 0.88)';
  ctx.lineWidth = Math.max(1.5, garlandPoints[0].scale * 0.075);
  ctx.beginPath();
  let drawingFront = false;
  garlandPoints.forEach((point) => {
    if (point.z > 0) {
      if (!drawingFront) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
      drawingFront = true;
    } else {
      drawingFront = false;
    }
  });
  ctx.stroke();

  ctx.shadowBlur = 9;
  for (let i = 0; i < garlandPoints.length; i += 7) {
    const point = garlandPoints[i];
    if (point.z <= 0) continue;
    const radius = Math.max(1.8, point.scale * 0.1);
    ctx.fillStyle = i % 2 === 0 ? '#fff1aa' : '#f6c94e';
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.fill();
  }

  const ornamentColors = ['#d33139', '#f3c64e', '#e9e1c0'];
  for (let i = 0; i < 34; i++) {
    const t = 0.1 + (i / 34) * 0.76;
    const radius = 6.9 * Math.pow(1 - t, 0.85) + 0.45;
    const angle = i * 2.399 + time * 0.025;
    const point = projectFrame(Math.cos(angle) * radius, -8.75 + t * 14.8, Math.sin(angle) * radius);
    if (point.z <= 0) continue;

    const ornamentRadius = Math.max(2.5, point.scale * 0.25);
    const color = ornamentColors[i % ornamentColors.length];
    const shine = ctx.createRadialGradient(
      point.x - ornamentRadius * 0.35,
      point.y - ornamentRadius * 0.4,
      0,
      point.x,
      point.y,
      ornamentRadius
    );
    shine.addColorStop(0, '#fff8d8');
    shine.addColorStop(0.28, color);
    shine.addColorStop(1, '#54252a');
    ctx.fillStyle = shine;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, ornamentRadius, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export interface CanvasHandle {
  restartIntro: () => void;
  resetCamera: () => void;
  takeSnapshot: () => void;
}

interface Props {
  settings: TreeSettings;
  gestureDeltaX?: number;
  gestureDeltaY?: number;
  onPortraitStatusUpdate?: (status: PortraitLoadStatus, message?: string) => void;
  onCameraUpdate?: (
    yaw: number,
    pitch: number,
    width: number,
    height: number,
    focal: number,
    scatter: number,
    intro: number
  ) => void;
}

export const ChristmasTreeCanvas = React.memo(forwardRef<CanvasHandle, Props>(
  ({
    settings,
    gestureDeltaX = 0,
    gestureDeltaY = 0,
    onPortraitStatusUpdate,
    onCameraUpdate,
  }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Chaos vs Formed scatter factor (0 = formed tree, 1 = dispersed galaxy)
    const scatterRef = useRef<number>(0);
    const starSequenceRef = useRef<number>(0);
    const zoomRef = useRef<number>(1.0);
    const lastCameraUpdateRef = useRef<number>(0);
    const backgroundGradientRef = useRef<{ key: string; gradient: CanvasGradient | null }>({
      key: '',
      gradient: null,
    });

  // Scene points refs
  const treePointsRef = useRef<TreePoint[]>([]);
  const tempStarPointsRef = useRef<TreePoint[]>([]);
  const portraitTargetsRef = useRef<PortraitTargets | null>(null);
  const portraitAspectRef = useRef(1);
  const portraitRequestRef = useRef(0);
  const orbitPointsRef = useRef<OrbitPoint[]>([]);
  const sparklesRef = useRef<Sparkle[]>([]);
  const petalsRef = useRef<Petal[]>([]);
  const meteorsRef = useRef<Meteor[]>([]);
  const burstsRef = useRef<BurstParticle[]>([]);
  const spritesRef = useRef<HTMLCanvasElement[]>([]);
  const starlightSpriteRef = useRef<HTMLCanvasElement | null>(null);

  // Time & Intro tracking
  const startTimeRef = useRef<number>(0);
  const introStartRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);

  // Dimensions
  const dimRef = useRef({ w: 0, h: 0, dpr: 1, focal: 800 });

  // Interactive user drag rotation
  const manualRotRef = useRef({ yaw: 0, pitch: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const currentTheme = THEMES[settings.themeId] || THEMES.frozen;
  const settingsRef = useRef(settings);
  const currentThemeRef = useRef(currentTheme);
  settingsRef.current = settings;
  currentThemeRef.current = currentTheme;

  const gestureRef = useRef({ dx: gestureDeltaX, dy: gestureDeltaY });
  useEffect(() => {
    gestureRef.current = { dx: gestureDeltaX, dy: gestureDeltaY };
  }, [gestureDeltaX, gestureDeltaY]);

  const onCameraUpdateRef = useRef(onCameraUpdate);
  useEffect(() => {
    onCameraUpdateRef.current = onCameraUpdate;
  }, [onCameraUpdate]);

  // Rebuild scene particles
  const rebuildScene = useCallback(() => {
    const { w, h } = dimRef.current;
    if (w === 0 || h === 0) return;

    const sceneSettings = settingsRef.current;
    const palette = currentThemeRef.current.palette;
    const treePalette = currentThemeRef.current.treePalette;

    // 1. Tree Helix Points
    const pts: TreePoint[] = [];
    const total = sceneSettings.totalPoints;
    const strings = sceneSettings.strings;
    const turns = sceneSettings.turns;

    for (let i = 0; i < total; i++) {
      const st = i % strings;
      const t = Math.floor(i / strings) / (total / strings);
      const radius = 6.9 * Math.pow(1 - t, 0.85) + 0.45;
      const ang = t * turns * TAU + (st * TAU) / strings;
      const j = 0.14;
      const ep = energyCloudPos(w, h);
      const ornament = Math.random() < 0.035;
      const colorIndex = treePalette
        ? palette.length + Math.min(treePalette.length - 1, Math.floor(t * treePalette.length))
        : Math.floor(Math.random() * palette.length);
      const originalColor: ColorRGB =
        treePalette && colorIndex >= palette.length
          ? treePalette[colorIndex - palette.length]
          : palette[colorIndex];

      pts.push({
        x: Math.cos(ang) * radius + rand(j, -j),
        y: -9 + t * 15.2 + rand(j, -j),
        z: Math.sin(ang) * radius + rand(j, -j),
        t: t,
        c: colorIndex,
        originalColor,
        base: ornament ? rand(0.9, 1.25) : rand(0.15, 0.3),
        phase: rand(TAU),
        fade: t > 0.9 ? 1 - ((t - 0.9) / 0.1) * 0.6 : 1,
        sx: ep[0],
        sy: ep[1],
        portraitX: 0.5,
        portraitY: 0.5,
        portraitLight: 0,
      });
    }
    if (portraitTargetsRef.current) {
      assignPortraitTargets(pts, portraitTargetsRef.current, tempStarPointsRef);
    }
    treePointsRef.current = pts;

    // 2. Orbiting Points (Fairy dust)
    const orbits: OrbitPoint[] = [];
    for (let o = 0; o < sceneSettings.orbitCount; o++) {
      orbits.push({
        a0: rand(TAU),
        r: rand(7.6, 2.2),
        y: rand(5.5, -8.5),
        spd: rand(0.9, 0.25) * (Math.random() < 0.5 ? -1 : 1),
        ws: rand(1.2, 0.3),
        ph: rand(TAU),
        c: Math.floor(Math.random() * palette.length),
        size: rand(0.34, 0.14),
      });
    }
    orbitPointsRef.current = orbits;

    // 3. Sparkles
    const spk: Sparkle[] = [];
    for (let s = 0; s < sceneSettings.sparkleCount; s++) {
      spk.push({
        x: rand(w, -w * 0.1),
        y: rand(h, -h * 0.2),
        r: rand(30, 6),
        speed: rand(0.6, 0.12),
        drift: rand(TAU),
        alpha: rand(0.3, 0.06),
      });
    }
    sparklesRef.current = spk;

    // 4. Petals
    const pet: Petal[] = [];
    for (let p = 0; p < sceneSettings.petalCount; p++) {
      pet.push({
        x: rand(w),
        y: rand(h),
        r: rand(4.5, 1.8),
        sp: rand(1.5, 0.4),
        sw: rand(TAU),
        rot: rand(TAU),
        rs: rand(0.05, -0.05),
      });
    }
    petalsRef.current = pet;

    // 5. Meteors
    const met: Meteor[] = [];
    for (let m = 0; m < sceneSettings.meteorCount; m++) {
      met.push({
        t0: rand(9),
        dur: 1.1,
        x0: rand(w * 0.85, w * 0.2),
        y0: rand(h * 0.25, -h * 0.1),
        dx: rand(-0.42, -0.24) * w,
        dy: rand(0.45, 0.28) * h,
      });
    }
    meteorsRef.current = met;
  }, []);

  // Handle Resize
  const handleResize = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);

    cv.width = Math.floor(w * dpr);
    cv.height = Math.floor(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;

    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    dimRef.current = {
      w,
      h,
      dpr,
      focal: Math.max(760, h * 1.3) * 0.82,
    };

    rebuildScene();
  }, [rebuildScene]);

  // Update scene assets without restarting the animation loop.
  useEffect(() => {
    spritesRef.current = generateSprites([
      ...currentTheme.palette,
      ...(currentTheme.treePalette || []),
    ]);
    starlightSpriteRef.current = makeStarlightSprite(64);
  }, [currentTheme]);

  useEffect(() => {
    rebuildScene();
  }, [
    rebuildScene,
    settings.totalPoints,
    settings.strings,
    settings.turns,
    settings.themeId,
    settings.orbitCount,
    settings.sparkleCount,
    settings.petalCount,
    settings.meteorCount,
  ]);

  useEffect(() => {
    const requestId = ++portraitRequestRef.current;
    portraitTargetsRef.current = null;
    portraitAspectRef.current = 1;
    onPortraitStatusUpdate?.('loading');
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    const fail = (error: Error) => {
      if (portraitRequestRef.current !== requestId) return;
      portraitTargetsRef.current = null;
      onPortraitStatusUpdate?.('error', error.message);
      console.error('Unable to process the tree portrait image.', error);
    };
    image.onload = () => {
      void processPortraitImage(image)
        .then((targets) => {
          if (portraitRequestRef.current !== requestId) return;
          portraitTargetsRef.current = targets;
          portraitAspectRef.current = targets.aspect;
          assignPortraitTargets(treePointsRef.current, targets, tempStarPointsRef);
          onPortraitStatusUpdate?.('ready');
        })
        .catch((error: unknown) => {
          fail(error instanceof Error ? error : new Error(String(error)));
        });
    };
    image.onerror = () => {
      fail(new Error(`Unable to load tree portrait image: ${settings.portraitUrl}`));
    };
    if (settings.portraitUrl) image.src = settings.portraitUrl;
    else fail(new Error('Choose a portrait image before expanding the tree'));

    return () => {
      portraitRequestRef.current += 1;
      image.onload = null;
      image.onerror = null;
    };
  }, [settings.portraitUrl, onPortraitStatusUpdate]);

  // Expose controls to parent via ref
  useImperativeHandle(ref, () => ({
    restartIntro: () => {
      introStartRef.current = (performance.now() - startTimeRef.current) / 1000;
      rebuildScene();
    },
    resetCamera: () => {
      manualRotRef.current = { yaw: 0, pitch: 0 };
    },
    takeSnapshot: () => {
      const cv = canvasRef.current;
      if (!cv) return;
      const dataUrl = cv.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `merry-christmas-${settings.themeId}-${Date.now()}.png`;
      a.click();
    },
  }));

  // Handle Burst Click/Tap
  const triggerBurst = (clientX: number, clientY: number) => {
    chimeAudio.playChime(rand(1200, 700), 0.1);

    const burstList: BurstParticle[] = [];
    const count = 18;
    const palLen = currentTheme.palette.length;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = rand(6.5, 2.0);
      burstList.push({
        x: clientX,
        y: clientY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: rand(5, 2),
        alpha: 1,
        colorIdx: Math.floor(Math.random() * palLen),
        life: 0,
        maxLife: rand(45, 25),
      });
    }

    burstsRef.current.push(...burstList);
  };

  // Pointer interactions (drag rotation & tap burst)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!settings.interactiveRotation) return;
    isDraggingRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !settings.interactiveRotation) return;
    const dx = e.clientX - lastPointerRef.current.x;
    const dy = e.clientY - lastPointerRef.current.y;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };

    // Update yaw & pitch
    manualRotRef.current.yaw += dx * 0.006;
    manualRotRef.current.pitch = Math.max(-0.4, Math.min(0.4, manualRotRef.current.pitch - dy * 0.004));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      // If it was just a click (minimal drag distance), spawn a sparkle burst!
      const cv = canvasRef.current;
      if (cv) {
        triggerBurst(e.clientX, e.clientY);
      }
    }
    isDraggingRef.current = false;
  };

  // Main Render Loop
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    handleResize();
    window.addEventListener('resize', handleResize);

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now();
      introStartRef.current = 0;
    }
    lastTimeRef.current = 0;

    const render = () => {
      const currentTimeMs = performance.now();
      const time = (currentTimeMs - startTimeRef.current) / 1000;
      const dt = lastTimeRef.current ? Math.min(0.05, time - lastTimeRef.current) : 0.016;
      lastTimeRef.current = time;

      const { w, h, focal } = dimRef.current;
      const sprites = spritesRef.current;
      const frameSettings = settingsRef.current;
      const frameTheme = currentThemeRef.current;

      if (w === 0 || h === 0 || sprites.length === 0) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Intro calculation
      const elapsedSinceIntro = Math.max(0, time - introStartRef.current);
      let intro = Math.min(1, elapsedSinceIntro / 2.4);
      intro = 1 - Math.pow(1 - intro, 3);

      // Apply AI hand gesture rotation
      const gDx = gestureRef.current.dx;
      const gDy = gestureRef.current.dy;
      gestureRef.current = { dx: 0, dy: 0 };
      if (gDx !== 0) {
        manualRotRef.current.yaw += gDx * 3.2;
      }
      if (gDy !== 0) {
        manualRotRef.current.pitch = Math.max(
          -0.45,
          Math.min(0.45, manualRotRef.current.pitch - gDy * 2.2)
        );
      }

      // Camera Angle & Zoom
      const effFocal = focal * zoomRef.current;
      const autoAngle = frameSettings.autoRotate ? time * frameSettings.rotationSpeed + Math.sin(time * 0.4) * 0.1 : 0;
      const yaw = autoAngle + manualRotRef.current.yaw;
      const pitch = manualRotRef.current.pitch;
      const projectFrame = createProjector(yaw, pitch, w, h, effFocal);

      const hasPortrait = portraitTargetsRef.current !== null;
      const targetScatter = frameSettings.treeState === 'dispersed' && hasPortrait ? 1 : 0;
      const scatterEase = 1 - Math.exp(-3.7 * dt);
      scatterRef.current += (targetScatter - scatterRef.current) * scatterEase;
      const scatter = scatterRef.current;
      const portraitProgress = hasPortrait ? scatter : 0;
      const portraitClarity = 1 - portraitProgress;
      const particleProjectFrame = hasPortrait
        ? createProjector(yaw * (1 - portraitProgress), pitch * (1 - portraitProgress), w, h, effFocal)
        : projectFrame;
      const portraitAspect = portraitTargetsRef.current?.aspect ?? portraitAspectRef.current;
      const targetMaxH = h * 0.72;
      const targetMaxW = w * 0.70;
      const portraitHeight = Math.min(targetMaxH, targetMaxW / portraitAspect);
      const portraitWidth = portraitHeight * portraitAspect;
      const portraitLeft = (w - portraitWidth) / 2;
      const portraitTop = Math.max(h * 0.05, (h * 0.84 - portraitHeight) / 2);
      if (frameSettings.treeState !== 'formed' || !frameSettings.showStar) {
        starSequenceRef.current = 0;
      } else if (scatter < 0.06 && intro >= 0.9) {
        starSequenceRef.current += dt;
      }

      // Keep the DOM photo overlay in step with the canvas animation.
      if (currentTimeMs - lastCameraUpdateRef.current >= 1000 / 60) {
        onCameraUpdateRef.current?.(yaw, pitch, w, h, effFocal, scatter, intro);
        lastCameraUpdateRef.current = currentTimeMs;
      }

      // 1. Background
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const gradientKey = `${w}:${h}:${frameTheme.bgGradient.join(':')}`;
      if (backgroundGradientRef.current.key !== gradientKey) {
        const gradient = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75);
        gradient.addColorStop(0, frameTheme.bgGradient[0]);
        gradient.addColorStop(0.5, frameTheme.bgGradient[1]);
        gradient.addColorStop(1, frameTheme.bgGradient[2]);
        backgroundGradientRef.current = { key: gradientKey, gradient };
      }
      const bgGrad = backgroundGradientRef.current.gradient;
      if (!bgGrad) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Ambient Sparkles
      ctx.globalCompositeOperation = 'lighter';
      const sparkles = sparklesRef.current;
      for (let i = 0; i < sparkles.length; i++) {
        const f = sparkles[i];
        f.y -= f.speed * dt * 60;
        f.x += Math.sin(f.drift + f.y * 0.008) * 0.4;
        if (f.y < -f.r) {
          f.y = h + f.r;
          f.x = rand(w, -w * 0.1);
        }
        const size = f.r * 2;
        const flick = 0.7 + 0.3 * Math.sin(time * 1.2 + f.drift);
        const flare = Math.pow(Math.max(0, Math.sin(time * 0.7 + f.drift * 3)), 12);
        ctx.globalAlpha = Math.min(1, f.alpha * (flick + flare)) * (0.35 + 0.65 * portraitClarity);
        ctx.drawImage(sprites[0], f.x - size / 2, f.y - size / 2, size, size);
      }

      // 3. Meteors
      if (frameSettings.showMeteors) {
        ctx.globalCompositeOperation = 'lighter';
        const meteors = meteorsRef.current;
        for (let i = 0; i < meteors.length; i++) {
          const m = meteors[i];
          const ph = (time + m.t0) % 9;
          if (ph > m.dur) continue;
          const k = ph / m.dur;
          const x = m.x0 + m.dx * k;
          const y = m.y0 + m.dy * k;
          const tailX = x - m.dx * 0.12;
          const tailY = y - m.dy * 0.12;
          const a = Math.sin(k * Math.PI);

          const lg = ctx.createLinearGradient(tailX, tailY, x, y);
          const c0 = frameTheme.palette[0];
          lg.addColorStop(0, `rgba(${c0[0]},${c0[1]},${c0[2]},0)`);
          lg.addColorStop(1, `rgba(255,255,255,${0.9 * a})`);

          ctx.globalAlpha = portraitClarity;
          ctx.strokeStyle = lg;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(x, y);
          ctx.stroke();

          const sz = 16 * a;
          ctx.globalAlpha = a * portraitClarity;
          ctx.drawImage(sprites[0], x - sz / 2, y - sz / 2, sz, sz);
        }
      }

      // 4. Ground Glow
      if (frameSettings.showGroundGlow) {
        const pGlow = projectFrame(0, -10.2, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(w / 2, pGlow.y);
        ctx.scale(1, 0.17);
        const pulse = 1 + 0.14 * Math.sin(time * 1.6);
        const R = effFocal * 0.44 * pulse;
        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        gg.addColorStop(0, frameTheme.groundGlow.inner);
        gg.addColorStop(0.45, frameTheme.groundGlow.mid);
        gg.addColorStop(1, frameTheme.groundGlow.outer);
        ctx.globalAlpha = Math.max(0, 1 - scatter * 1.5);
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      // 5. Tree Points & Volumetric Stardust Cloud (up to 8,500 particles with on-the-fly return culling)
      ctx.globalCompositeOperation = 'lighter';
      const pts = treePointsRef.current;
      const tempPts = tempStarPointsRef.current;
      const breathe = frameSettings.breatheEffect ? 1 + 0.07 * Math.sin(time * 0.9) : 1;
      const heartbeat = frameSettings.breatheEffect ? 0.9 + 0.1 * Math.pow(Math.max(0, Math.sin(time * 1.8)), 6) : 1;
      const starlightSprite = starlightSpriteRef.current || sprites[0];

      const isClosing = frameSettings.treeState === 'formed' || targetScatter === 0;

      // On-the-fly return culling multipliers:
      // - Priority 4 (outer scatter / shoulders): dissolved by scatter = 0.45
      // - Priority 3 (hair texture): dissolved by scatter = 0.25
      // - Temporary star particles: dissolve naturally in mid-air by scatter = 0.28
      const p4ReturnFactor = isClosing ? Math.max(0, (portraitProgress - 0.45) / 0.55) : 1.0;
      const p3ReturnFactor = isClosing ? Math.max(0, (portraitProgress - 0.25) / 0.75) : 1.0;
      const tempReturnFactor = isClosing ? Math.max(0, (portraitProgress - 0.28) / 0.72) : 1.0;

      // Faster, lighter return curve as particles snap back to the helix
      const returnEase = isClosing
        ? Math.pow(portraitProgress, 1.45)
        : portraitProgress;

      // Color fade factors: smooth shift from pure white (#FFFFFF) back to warm tree colors
      const whiteGlow = Math.pow(portraitProgress, 1.3);
      const treeColorGlow = Math.max(0, 1 - whiteGlow);

      const renderParticle = (pt: TreePoint, isTemp: boolean) => {
        // CULLING CHECK 1: If temporary star particle has dissolved in mid-air, skip completely!
        if (isTemp && isClosing && tempReturnFactor <= 0.005) {
          return;
        }

        const priority = pt.portraitPriority || 2;

        // CULLING CHECK 2: Progressive Fade & Kill 30% to 50% of less critical particles during return
        let priorityCullMult = 1.0;
        if (isClosing) {
          if (priority === 4) {
            priorityCullMult = p4ReturnFactor;
          } else if (priority === 3) {
            priorityCullMult = p3ReturnFactor;
          }
        }

        const p = particleProjectFrame(pt.x * breathe, pt.y, pt.z * breathe);
        const px = w / 2 + (p.x - w / 2) * intro;
        const py = h / 2 + (p.y - h / 2) * intro;
        let cx = pt.sx + (px - pt.sx) * intro;
        let cy = pt.sy + (py - pt.sy) * intro;

        if (hasPortrait) {
          // 3D Volumetric depth parallax (subtle shift with camera rotation)
          const pZ = pt.portraitZ || 0;
          const volOffsetX = Math.sin(yaw * 0.55) * pZ * portraitWidth * 0.04;
          const volOffsetY = -Math.sin(pitch * 0.55) * pZ * portraitHeight * 0.04;

          // Gentle floating wave-like animation and organic sub-pixel jitter
          const wave = Math.sin(time * 1.3 + pt.phase + pt.portraitY * 5.5) * 1.1;
          const floatX = Math.cos(time * 1.05 + pt.phase * 1.7 + pt.portraitX * 4.2) * 0.8;
          const floatY = Math.sin(time * 1.15 + pt.phase * 2.1 + pt.portraitY * 3.8) * 0.8;
          const jitX = (pt.portraitJitterX || 0) * portraitWidth;
          const jitY = (pt.portraitJitterY || 0) * portraitHeight;

          const targetX = portraitLeft + pt.portraitX * portraitWidth + (volOffsetX + wave + floatX + jitX);
          const targetY = portraitTop + pt.portraitY * portraitHeight + (volOffsetY + wave * 0.65 + floatY + jitY);

          // Accelerated snap-back trail when returning
          cx += (targetX - cx) * returnEase;
          cy += (targetY - cy) * returnEase;
        }

        const gathering = 1 - intro;
        const drift = gathering * Math.min(w, h) * 0.045;
        const swirl = pt.phase + time * (1.5 + pt.t);
        cx += Math.sin(swirl) * drift;
        cy += Math.cos(swirl * 1.35) * drift * 0.72;

        let depth = (p.z + 8) / 15;
        if (depth < 0) depth = 0;
        if (depth > 1) depth = 1;

        const twinkle = 0.5 + 0.5 * Math.sin(time * 4 + pt.phase);
        const waveTwinkle = 0.5 + 0.5 * Math.sin(time * 3.5 - pt.t * 26);
        const spark = Math.pow(Math.max(0, Math.sin(time * 2.2 + pt.phase * 2)), 16);
        const glow = (0.4 + 0.35 * twinkle + 0.45 * waveTwinkle * waveTwinkle + 0.6 * spark) * heartbeat;
        const treeSize = pt.base * p.scale * (0.8 + 0.4 * twinkle + 0.3 * waveTwinkle + 0.5 * spark);

        // Portrait particle size: fine micro-dots (0.5px to 1.1px radius) to avoid blown-out white blobs
        const portraitRadius = Math.max(0.5, Math.min(1.1, pt.portraitSize || 0.8));
        const treeRadius = Math.max(0.5, treeSize * 0.5);
        const radius = treeRadius * (1 - portraitProgress) + portraitRadius * portraitProgress;

        // Asynchronous glowing & twinkling
        const pSpeed = pt.portraitSpeed || 2.4;
        const pTwinkle = 0.82 + 0.18 * Math.sin(time * pSpeed + pt.phase * 3.7);
        const pFlare = Math.pow(Math.max(0, Math.sin(time * 1.6 + pt.phase * 4.9)), 14) * 0.7;

        const baseAlpha = Math.min(1, glow * (0.4 + 0.6 * depth) * pt.fade * (0.4 + 0.6 * intro));

        // 1. Warm tree colors (greens, golds, scarlets): smoothly fades back in as it nears tree
        if (!isTemp) {
          const originalSprite = sprites[pt.c] || sprites[0];
          const treeAlpha = baseAlpha * treeColorGlow;
          if (treeAlpha > 0.005) {
            ctx.globalAlpha = treeAlpha;
            const drawSize = radius * 2;
            ctx.drawImage(originalSprite, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
          }
        }

        // 2. Pure brilliant white stardust (#FFFFFF): fine 0.5-1.1px dots with modulated 0.35-0.85 alpha
        if (whiteGlow > 0.005) {
          const lum = pt.portraitLight ?? 0.7;
          const lumAlpha = 0.35 + 0.50 * lum;
          const tempFadeMult = isTemp ? tempReturnFactor : 1.0;
          const finalAlpha =
            Math.min(0.85, Math.max(0.35, lumAlpha * pTwinkle)) *
            whiteGlow *
            priorityCullMult *
            tempFadeMult;

          if (finalAlpha > 0.005) {
            // Fine, crisp white micro-dot (prevents overexposure and creates clear chiaroscuro)
            ctx.globalAlpha = finalAlpha;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, TAU);
            ctx.fill();

            // Soft, gentle starlight aura (restrained size prevents additive blowout on skin)
            const auraSize = radius * 2.2;
            ctx.globalAlpha = finalAlpha * 0.35;
            ctx.drawImage(starlightSprite, cx - auraSize / 2, cy - auraSize / 2, auraSize, auraSize);

            // 4-Pointed Diamond Star Twinkle Cross for sparkle stars (matching Image 1)
            if ((pt.portraitIsSparkle || pFlare > 0.65) && finalAlpha > 0.28) {
              const flareLen = radius * (2.4 + 1.8 * pFlare);
              ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.9, finalAlpha * (0.7 + 0.3 * pFlare))})`;
              ctx.lineWidth = 0.75;
              ctx.beginPath();
              ctx.moveTo(cx - flareLen, cy);
              ctx.lineTo(cx + flareLen, cy);
              ctx.moveTo(cx, cy - flareLen);
              ctx.lineTo(cx, cy + flareLen);
              ctx.stroke();
            }
          }
        }
      };

      for (let i = 0; i < pts.length; i++) {
        renderParticle(pts[i], false);
      }

      // Temporary star particles (dissolve rapidly in mid-air on return, skipped if evaporated)
      if (portraitProgress > 0 && tempPts.length > 0 && (!isClosing || tempReturnFactor > 0.005)) {
        for (let i = 0; i < tempPts.length; i++) {
          renderParticle(tempPts[i], true);
        }
      }

      // Draw a dense, multicolored brown sparkle trunk, revealed from the roots upward.
      if (scatter < 0.98) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const trunkRows = 21;
        const trunkColumns = 9;
        for (let row = 0; row < trunkRows; row++) {
          const rowProgress = row / (trunkRows - 1);
          const rowReveal = intro * trunkRows - row;
          if (rowReveal <= 0) continue;

          const trunkY = -9.1 + rowProgress * 3.8;
          const trunkHalfWidth = 0.5 - rowProgress * 0.12;
          for (let column = 0; column < trunkColumns; column++) {
            const columnPosition = column / (trunkColumns - 1) * 2 - 1;
            const x = columnPosition * trunkHalfWidth + Math.sin(row * 2.1 + column * 1.7) * 0.035;
            const z = ((row + column) % 5 - 2) * 0.09;
            const point = projectFrame(x, trunkY, z);
            const twinkle = 0.35 + 0.65 * Math.max(0, Math.sin(time * 5 + row * 1.3 + column * 2.2));
            const fadeIn = Math.min(1, rowReveal);
            const size = Math.max(2.5, point.scale * (0.2 + twinkle * 0.16));

            ctx.globalAlpha = (1 - scatter) * fadeIn * (0.5 + twinkle * 0.5);
            ctx.drawImage(
              TRUNK_SPRITES[(row * 3 + column * 5) % TRUNK_SPRITES.length],
              point.x - size / 2,
              point.y - size / 2,
              size,
              size
            );
          }
        }
        ctx.restore();
      }

      if (frameTheme.id === 'snowglobe') {
        drawTreeDecorations(ctx, projectFrame, time, intro, scatter);
      }
      drawGiftModels(ctx, projectFrame, sprites, time, intro, scatter, w, h);

      // 6. Orbiting Points (fairy dust)
      if (frameSettings.showOrbits) {
        ctx.globalCompositeOperation = 'lighter';
        const orbits = orbitPointsRef.current;
        for (let i = 0; i < orbits.length; i++) {
          const o = orbits[i];
          const a = o.a0 + time * o.spd;
          const yy = o.y + Math.sin(time * o.ws + o.ph) * 0.6;
          const p = projectFrame(Math.cos(a) * o.r, yy, Math.sin(a) * o.r);
          const tw = 0.5 + 0.5 * Math.sin(time * 3 + o.ph);
          const size = o.size * p.scale * (0.8 + 0.5 * tw);
          ctx.globalAlpha = (0.35 + 0.5 * tw) * 0.85 * portraitClarity;
          const spr = sprites[o.c] || sprites[0];
          ctx.drawImage(spr, p.x - size / 2, p.y - size / 2, size, size);
        }
      }

      // 7. Falling Petals
      if (frameSettings.showPetals) {
        ctx.globalCompositeOperation = 'source-over';
        const petals = petalsRef.current;
        for (let i = 0; i < petals.length; i++) {
          const p = petals[i];
          p.y += p.sp * dt * 60;
          p.x += Math.sin(p.sw + p.y * 0.01) * 0.5;
          p.rot += p.rs;
          if (p.y > h + 10) {
            p.y = -10;
            p.x = rand(w);
          }
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = 0.55 * portraitClarity;
          ctx.fillStyle = frameTheme.petalColor;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }

      // 8. Gather light from the roots toward the treetop, then reveal the top star.
      const starSequenceTime = starSequenceRef.current;
      const gatherDuration = 0.4;
      if (
        frameSettings.showStar &&
        frameSettings.treeState === 'formed' &&
        starSequenceTime > 0 &&
        starSequenceTime < gatherDuration
      ) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#fff2a6';
        ctx.shadowBlur = 9;
        const moteCount = 26;
        const launchSpan = 0.2;
        const travelDuration = 0.24;
        for (let i = 0; i < moteCount; i++) {
          const launchTime = (i / (moteCount - 1)) * launchSpan;
          const age = starSequenceTime - launchTime;
          if (age < 0 || age > travelDuration) continue;

          const travel = age / travelDuration;
          const easedTravel = 1 - Math.pow(1 - travel, 2);
          const treeProgress = easedTravel;
          const treeRadius = 6.9 * Math.pow(1 - treeProgress, 0.85) + 0.45;
          const angle = i * 2.399 + time * 0.7;
          const orbitRadius = treeRadius * (0.72 + 0.12 * Math.sin(age * 13 + i));
          const moteY = -9 + treeProgress * 16.7;
          const mote = projectFrame(
            Math.cos(angle) * orbitRadius,
            moteY,
            Math.sin(angle) * orbitRadius
          );
          const fadeIn = Math.min(1, age / 0.12);
          const fadeOut = Math.min(1, (travelDuration - age) / 0.12);
          const size = Math.max(2, mote.scale * 0.13);

          ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut)) * (0.75 + 0.25 * Math.sin(time * 10 + i));
          ctx.drawImage(sprites[0], mote.x - size / 2, mote.y - size / 2, size, size);
        }
        ctx.restore();
      }

      const starAppearDuration = 0.2;
      const starReveal = Math.max(0, Math.min(1, (starSequenceTime - gatherDuration) / starAppearDuration));
      if (frameSettings.showStar && frameSettings.treeState === 'formed' && starReveal > 0) {
        const appearScale = 0.2 + 0.8 * (1 - Math.pow(1 - starReveal, 3));
        const pStar = projectFrame(0, 7.7, 0);
        const pulse = 1 + 0.14 * Math.sin(time * 3.2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = starReveal;
        ctx.translate(pStar.x, pStar.y);
        ctx.scale(pulse * appearScale, pulse * appearScale);

        const R = effFocal * (frameTheme.id === 'snowglobe' ? 0.14 : 0.22);
        const gStar = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        gStar.addColorStop(0, frameTheme.star.inner);
        gStar.addColorStop(0.12, frameTheme.star.mid);
        gStar.addColorStop(0.4, frameTheme.star.outer);
        gStar.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gStar;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, TAU);
        ctx.fill();

        // 10 Rays
        const rayLen = effFocal * (frameTheme.id === 'snowglobe' ? 0.1 : 0.28);
        for (let i = 0; i < 10; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI) / 5 + time * 0.55);
          const len = rayLen * (i % 2 === 0 ? 1 : 0.62);
          const lg = ctx.createLinearGradient(0, 0, len, 0);
          lg.addColorStop(0, 'rgba(255,255,255,0.95)');
          lg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = lg;
          ctx.beginPath();
          ctx.moveTo(0, -3.6);
          ctx.lineTo(len, 0);
          ctx.lineTo(0, 3.6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Inner solid 10-point star
        ctx.rotate(-time * 0.3);
        const sr = focal * (frameTheme.id === 'snowglobe' ? 0.05 : 0.042);
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const r = k % 2 === 0 ? sr : sr * 0.42;
          const a = (k * Math.PI) / 5 - Math.PI / 2;
          const sx = Math.cos(a) * r;
          const sy = Math.sin(a) * r;
          if (k === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fillStyle = frameTheme.star.star;
        ctx.shadowColor = frameTheme.star.glow;
        ctx.shadowBlur = frameTheme.id === 'snowglobe' ? 25 : 45;
        ctx.fill();
        ctx.restore();
      }

      // 9. Burst Click Particles
      if (burstsRef.current.length > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const activeBursts: BurstParticle[] = [];
        for (let b = 0; b < burstsRef.current.length; b++) {
          const bp = burstsRef.current[b];
          bp.x += bp.vx;
          bp.y += bp.vy;
          bp.vx *= 0.94;
          bp.vy *= 0.94;
          bp.life++;
          const progress = bp.life / bp.maxLife;
          bp.alpha = 1 - progress;

          if (bp.life < bp.maxLife) {
            ctx.globalAlpha = bp.alpha * portraitClarity;
            const spr = sprites[bp.colorIdx] || sprites[0];
            const sz = bp.size * (1 + (1 - progress) * 2);
            ctx.drawImage(spr, bp.x - sz / 2, bp.y - sz / 2, sz, sz);
            activeBursts.push(bp);
          }
        }
        burstsRef.current = activeBursts;
      }

      // 10. Greeting Text (Matching Image 1: glowing golden cursive Merry Christmas)
      if (frameSettings.showGreeting && frameSettings.greetingText.trim().length > 0) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1, Math.max(intro, 0.95));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const size = Math.max(34, Math.min(76, w * 0.065));
        let fontStr = `italic bold ${size}px "Brush Script MT", "Great Vibes", "Segoe Script", cursive`;
        if (frameSettings.greetingFont === 'serif') {
          fontStr = `italic 800 ${size}px "Playfair Display", Georgia, serif`;
        } else if (frameSettings.greetingFont === 'cinzel') {
          fontStr = `800 ${size * 0.85}px "Cinzel", "Times New Roman", serif`;
        }

        ctx.font = fontStr;
        // Positioned cleanly below the feathered shoulders (shoulders fade out by normY = 0.78)
        const textY =
          hasPortrait && portraitProgress > 0.3
            ? Math.min(h * 0.92, portraitTop + portraitHeight * 0.84 + 30)
            : Math.min(h * 0.92, h * 0.88);

        const textGrad = ctx.createLinearGradient(0, textY - size / 2, 0, textY + size / 2);
        textGrad.addColorStop(0, '#ffffff');
        textGrad.addColorStop(0.3, '#fef08a');
        textGrad.addColorStop(0.65, '#f59e0b');
        textGrad.addColorStop(1, '#d97706');

        ctx.fillStyle = textGrad;
        ctx.shadowColor = 'rgba(251, 191, 36, 0.95)';
        ctx.shadowBlur = 28 + 10 * Math.sin(time * 2);
        ctx.fillText(frameSettings.greetingText, w / 2, textY);
        ctx.shadowBlur = 0;
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  const handleWheel = (e: React.WheelEvent) => {
    zoomRef.current = Math.max(0.6, Math.min(2.0, zoomRef.current - e.deltaY * 0.001));
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        isDraggingRef.current = false;
      }}
      onWheel={handleWheel}
      className="fixed inset-0 w-full h-full block cursor-grab active:cursor-grabbing select-none touch-none"
    />
  );
}));

ChristmasTreeCanvas.displayName = 'ChristmasTreeCanvas';
