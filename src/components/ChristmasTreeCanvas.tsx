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
import { generateSprites, makeSprite, makeStarlightSprite, makeDiamondStarSprite } from '../engine/sprites';
import { createProjector } from '../engine/projection';
import { processPortraitImage } from '../engine/portraitProcessor';
import type { PortraitTargets } from '../engine/portraitProcessor';
import { chimeAudio } from '../utils/audio';

const TAU = Math.PI * 2;

interface StarParticle3D {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
  kind: 'core' | 'rim' | 'ridge' | 'halo';
}

// Pure 3D volumetric stardust star (~165 golden-white particles) crowning the tree apex
const STAR_PARTICLES_3D: StarParticle3D[] = (() => {
  const list: StarParticle3D[] = [];
  const outerR = 1.28;
  const innerR = 0.49;
  const peakZ = 0.42;

  const verts: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? outerR : innerR;
    const a = (k * Math.PI) / 5 + Math.PI / 2; // Point 0 straight UP in world +Y
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }

  // Deterministic pseudo-random helper so star particle cloud stays clean & balanced
  let seed = 4219;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // 1. Crisp sparkling 5-point star silhouette rim (~80 particles)
  for (let e = 0; e < 10; e++) {
    const a = verts[e];
    const b = verts[(e + 1) % 10];
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const j = 0.045;
      list.push({
        x: a.x + (b.x - a.x) * t + (nextRand() - 0.5) * j,
        y: a.y + (b.y - a.y) * t + (nextRand() - 0.5) * j,
        z: (nextRand() - 0.5) * 0.14,
        size: s === 0 && e % 2 === 0 ? 0.48 : 0.24 + nextRand() * 0.18,
        phase: nextRand() * TAU,
        kind: 'rim',
      });
    }
  }

  // 2. Volumetric 3D pyramid ridges from front/back peaks to tips & valleys (~50 particles)
  for (let k = 0; k < 10; k++) {
    const v = verts[k];
    const isTip = k % 2 === 0;
    const count = isTip ? 6 : 3;
    for (let s = 1; s <= count; s++) {
      const t = s / (count + 1);
      const side = (k + s) % 2 === 0 ? 1 : -1;
      list.push({
        x: v.x * t + (nextRand() - 0.5) * 0.05,
        y: v.y * t + (nextRand() - 0.5) * 0.05,
        z: side * peakZ * (1 - t) + (nextRand() - 0.5) * 0.06,
        size: 0.22 + nextRand() * 0.18,
        phase: nextRand() * TAU,
        kind: 'ridge',
      });
    }
  }

  // 3. Radiant starlight core cluster (~18 particles)
  for (let i = 0; i < 18; i++) {
    const r = Math.pow(nextRand(), 0.7) * 0.34;
    const ang = nextRand() * TAU;
    list.push({
      x: Math.cos(ang) * r,
      y: Math.sin(ang) * r,
      z: (nextRand() - 0.5) * 0.36,
      size: 0.30 + nextRand() * 0.22,
      phase: nextRand() * TAU,
      kind: 'core',
    });
  }

  // 4. Delicate floating stardust halo motes hovering around the star tips (~20 particles)
  for (let i = 0; i < 20; i++) {
    const r = outerR * (0.85 + nextRand() * 0.65);
    const ang = nextRand() * TAU;
    list.push({
      x: Math.cos(ang) * r,
      y: Math.sin(ang) * r,
      z: (nextRand() - 0.5) * 0.55,
      size: 0.14 + nextRand() * 0.14,
      phase: nextRand() * TAU,
      kind: 'halo',
    });
  }

  return list;
})();

// Pre-rendered glossy ornament spheres (eliminates 34 createRadialGradient + shadowBlur calls per frame!)
const ORNAMENT_SPRITES: HTMLCanvasElement[] = ['#d33139', '#f3c64e', '#e9e1c0'].map((color) => {
  const size = 36;
  const half = size / 2;
  const r = size * 0.34;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return cv;

  // Soft outer glow halo
  const halo = g.createRadialGradient(half, half, r * 0.5, half, half, half);
  halo.addColorStop(0, color);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.38;
  g.fillStyle = halo;
  g.beginPath();
  g.arc(half, half, half, 0, TAU);
  g.fill();

  // Glossy 3D sphere
  g.globalAlpha = 1;
  const shine = g.createRadialGradient(half - r * 0.35, half - r * 0.4, 0, half, half, r);
  shine.addColorStop(0, '#fff8d8');
  shine.addColorStop(0.28, color);
  shine.addColorStop(1, '#54252a');
  g.fillStyle = shine;
  g.beginPath();
  g.arc(half, half, r, 0, TAU);
  g.fill();
  return cv;
});

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
  front: string;
  side: string;
  top: string;
  ribbon: string;
  ribbonShade: string;
  yaw: number;
  phase: number;
}

// Curated luxury grounded Christmas presents nestled naturally around the wooden trunk base
function createGiftModels(): GiftModel[] {
  const palettes = [
    { front: '#9b1c31', side: '#66101f', top: '#be2640', ribbon: '#fde48b', ribbonShade: '#c9972b' }, // Velvet Crimson + Gold
    { front: '#145c38', side: '#0a3a22', top: '#1d7a4c', ribbon: '#fef0a8', ribbonShade: '#c59630' }, // Royal Emerald + Champagne
    { front: '#c8973a', side: '#8d661d', top: '#e4b960', ribbon: '#a8182b', ribbonShade: '#6f0d1b' }, // Champagne Silk + Ruby
    { front: '#e4dac7', side: '#b8ac94', top: '#f5efe2', ribbon: '#b92034', ribbonShade: '#7d1322' }, // Ivory Pearl + Crimson
    { front: '#6c1836', side: '#440c21', top: '#8c2248', ribbon: '#fae084', ribbonShade: '#be8e27' }, // Deep Burgundy + Gold
  ];

  // Hand-arranged cozy circle hugging the tree skirt at exact floor plane y = -10.35 (never floating!)
  const layout: Array<{ angle: number; radius: number; w: number; h: number; d: number; yaw: number; p: number }> = [
    { angle: 0.35,  radius: 2.35, w: 1.42, h: 1.12, d: 1.28, yaw: 0.42, p: 0 }, // Large Crimson front-right
    { angle: 1.25,  radius: 3.10, w: 1.18, h: 0.88, d: 1.15, yaw: 1.05, p: 2 }, // Champagne Gold right
    { angle: 2.15,  radius: 2.55, w: 1.32, h: 1.26, d: 1.20, yaw: 0.25, p: 1 }, // Tall Royal Emerald back-right
    { angle: 2.95,  radius: 3.65, w: 1.08, h: 0.78, d: 1.05, yaw: 0.75, p: 3 }, // Ivory Pearl back
    { angle: 3.72,  radius: 2.45, w: 1.48, h: 1.02, d: 1.32, yaw: 0.58, p: 4 }, // Wide Burgundy back-left
    { angle: 4.55,  radius: 3.35, w: 1.12, h: 1.28, d: 1.08, yaw: 1.18, p: 0 }, // Tall Crimson left
    { angle: 5.28,  radius: 2.25, w: 1.26, h: 0.92, d: 1.22, yaw: 0.30, p: 3 }, // Ivory Pearl front-left
    { angle: 5.95,  radius: 3.95, w: 0.98, h: 0.76, d: 0.96, yaw: 0.88, p: 1 }, // Cozy Emerald front accent
  ];

  return layout.map((item, idx) => {
    const pal = palettes[item.p % palettes.length];
    return {
      x: Math.cos(item.angle) * item.radius,
      z: Math.sin(item.angle) * item.radius,
      baseY: -10.35,
      width: item.w,
      height: item.h,
      depth: item.d,
      front: pal.front,
      side: pal.side,
      top: pal.top,
      ribbon: pal.ribbon,
      ribbonShade: pal.ribbonShade,
      yaw: item.yaw,
      phase: idx * 1.17,
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
  goldSprite: HTMLCanvasElement | null,
  diamondSprite: HTMLCanvasElement | null,
  time: number,
  intro: number,
  scatter: number
) {
  if (intro <= 0.05 || scatter >= 0.14) return;

  const alphaMaster = Math.min(1, (intro - 0.05) * 1.4) * Math.max(0, 1 - scatter / 0.14);
  if (alphaMaster <= 0.01) return;

  const fillQuad = (pts: Array<{ x: number; y: number }>, fillStyle: string, strokeStyle?: string) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  };

  // True 3D projection for each grounded gift, sorted strictly back-to-front by camera depth
  const prepared = GIFT_MODELS.map((gift) => {
    const centerY = gift.baseY + gift.height / 2;
    const origin = projectFrame(gift.x, centerY, gift.z);
    const cosY = Math.cos(gift.yaw);
    const sinY = Math.sin(gift.yaw);

    const projectLocal = (lx: number, ly: number, lz: number) => {
      const wx = gift.x + lx * cosY + lz * sinY;
      const wz = gift.z - lx * sinY + lz * cosY;
      return projectFrame(wx, gift.baseY + ly, wz);
    };

    return { gift, origin, projectLocal };
  }).sort((a, b) => a.origin.z - b.origin.z);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alphaMaster;

  prepared.forEach(({ gift, origin, projectLocal }) => {
    const hw = gift.width * 0.5;
    const hd = gift.depth * 0.5;
    const h = gift.height;
    const lidY = h * 0.78;
    const rw = Math.min(gift.width, gift.depth) * 0.11;

    // 1. Grounded contact shadow directly beneath the box's floor footprint
    const floorCenter = projectLocal(0, 0, 0);
    const shadowRx = origin.scale * Math.max(gift.width, gift.depth) * 0.66;
    const shadowRy = shadowRx * 0.34;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
    ctx.beginPath();
    ctx.ellipse(floorCenter.x, floorCenter.y + shadowRy * 0.15, shadowRx, shadowRy, 0, 0, TAU);
    ctx.fill();

    // 2. Define the 4 vertical walls (each with its own matching centered vertical satin ribbon band)
    type SideWall = {
      id: string;
      color: string;
      ribbonColor: string;
      quad: Array<{ x: number; y: number; z: number }>;
      lidSeam: [ { x: number; y: number; z: number }, { x: number; y: number; z: number } ];
      ribbonQuad: Array<{ x: number; y: number; z: number }>;
      avgZ: number;
    };

    const makeWall = (
      id: string,
      color: string,
      ribbonColor: string,
      c0: [number, number, number],
      c1: [number, number, number],
      r0: [number, number, number],
      r1: [number, number, number]
    ): SideWall => {
      const p0 = projectLocal(c0[0], 0, c0[2]);
      const p1 = projectLocal(c1[0], 0, c1[2]);
      const p2 = projectLocal(c1[0], h, c1[2]);
      const p3 = projectLocal(c0[0], h, c0[2]);
      const s0 = projectLocal(c0[0], lidY, c0[2]);
      const s1 = projectLocal(c1[0], lidY, c1[2]);
      const rb0 = projectLocal(r0[0], 0, r0[2]);
      const rb1 = projectLocal(r1[0], 0, r1[2]);
      const rb2 = projectLocal(r1[0], h, r1[2]);
      const rb3 = projectLocal(r0[0], h, r0[2]);
      return {
        id,
        color,
        ribbonColor,
        quad: [p0, p1, p2, p3],
        lidSeam: [s0, s1],
        ribbonQuad: [rb0, rb1, rb2, rb3],
        avgZ: (p0.z + p1.z + p2.z + p3.z) * 0.25,
      };
    };

    const walls: SideWall[] = [
      makeWall('front', gift.front, gift.ribbon,      [-hw, 0,  hd], [ hw, 0,  hd], [-rw, 0,  hd + 0.008], [ rw, 0,  hd + 0.008]),
      makeWall('back',  gift.side,  gift.ribbonShade, [ hw, 0, -hd], [-hw, 0, -hd], [ rw, 0, -hd - 0.008], [-rw, 0, -hd - 0.008]),
      makeWall('right', gift.side,  gift.ribbonShade, [ hw, 0,  hd], [ hw, 0, -hd], [ hw + 0.008, 0,  rw], [ hw + 0.008, 0, -rw]),
      makeWall('left',  gift.front, gift.ribbon,      [-hw, 0, -hd], [-hw, 0,  hd], [-hw - 0.008, 0, -rw], [-hw - 0.008, 0,  rw]),
    ];

    // Painter's order: draw only the 2 nearest visible vertical faces (clean 3D with zero back-face clutter!)
    walls.sort((a, b) => a.avgZ - b.avgZ);
    const visibleWalls = walls.slice(2);

    visibleWalls.forEach((wall) => {
      fillQuad(wall.quad, wall.color, 'rgba(255, 224, 150, 0.16)');
      // Boutique gift-box lid shadow seam
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.34)';
      ctx.lineWidth = Math.max(1, origin.scale * 0.045);
      ctx.beginPath();
      ctx.moveTo(wall.lidSeam[0].x, wall.lidSeam[0].y);
      ctx.lineTo(wall.lidSeam[1].x, wall.lidSeam[1].y);
      ctx.stroke();
      // Continuous vertical satin ribbon wrapping down this visible face
      fillQuad(wall.ribbonQuad, wall.ribbonColor);
    });

    // 3. Top Lid Face (slightly wider boutique overhang + warm tree-light sheen)
    const lidPad = 0.03;
    const topPts = [
      projectLocal(-hw - lidPad, h,  hd + lidPad),
      projectLocal( hw + lidPad, h,  hd + lidPad),
      projectLocal( hw + lidPad, h, -hd - lidPad),
      projectLocal(-hw - lidPad, h, -hd - lidPad),
    ];
    fillQuad(topPts, gift.top, 'rgba(255, 232, 175, 0.28)');

    // 4. Crossed Satin Ribbon (+) cleanly across the top lid
    const topRibbonX = [
      projectLocal(-hw - lidPad, h + 0.006,  rw),
      projectLocal( hw + lidPad, h + 0.006,  rw),
      projectLocal( hw + lidPad, h + 0.006, -rw),
      projectLocal(-hw - lidPad, h + 0.006, -rw),
    ];
    const topRibbonZ = [
      projectLocal(-rw, h + 0.008,  hd + lidPad),
      projectLocal( rw, h + 0.008,  hd + lidPad),
      projectLocal( rw, h + 0.008, -hd - lidPad),
      projectLocal(-rw, h + 0.008, -hd - lidPad),
    ];
    fillQuad(topRibbonX, gift.ribbon);
    fillQuad(topRibbonZ, gift.ribbon);

    // 5. Sculpted 3D Double-Loop Satin Ribbon Bow crowning the top of each gift!
    const bowCenter = projectLocal(0, h + 0.04, 0);
    const bowR = Math.max(4, origin.scale * Math.min(gift.width, gift.depth) * 0.24);
    const drawBowLoop = (dirX: number, dirZ: number, shade: string) => {
      const tip = projectLocal(dirX * 0.42, h + 0.28, dirZ * 0.42);
      const ctrl1 = projectLocal(dirX * 0.28 - dirZ * 0.22, h + 0.36, dirZ * 0.28 + dirX * 0.22);
      const ctrl2 = projectLocal(dirX * 0.28 + dirZ * 0.22, h + 0.06, dirZ * 0.28 - dirX * 0.22);
      ctx.beginPath();
      ctx.moveTo(bowCenter.x, bowCenter.y);
      ctx.quadraticCurveTo(ctrl1.x, ctrl1.y, tip.x, tip.y);
      ctx.quadraticCurveTo(ctrl2.x, ctrl2.y, bowCenter.x, bowCenter.y);
      ctx.closePath();
      ctx.fillStyle = shade;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 250, 225, 0.45)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    };
    drawBowLoop(-1, 0, gift.ribbonShade);
    drawBowLoop(1, 0, gift.ribbon);
    drawBowLoop(0, -1, gift.ribbonShade);
    drawBowLoop(0, 1, gift.ribbon);

    // Central satin bow knot
    ctx.fillStyle = gift.ribbon;
    ctx.beginPath();
    ctx.arc(bowCenter.x, bowCenter.y, Math.max(2.2, bowR * 0.24), 0, TAU);
    ctx.fill();

    // 6. Magical Tree-Light Stardust Glint sparkling on the bow (integrates gifts with particle tree!)
    const twinkle = 0.45 + 0.55 * Math.sin(time * 2.6 + gift.phase * 2.1);
    const sparkPeak = Math.pow(Math.max(0, Math.sin(time * 1.9 + gift.phase * 3.3)), 8);
    if (goldSprite) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glowSz = Math.max(8, bowR * (1.35 + 0.5 * twinkle));
      ctx.globalAlpha = alphaMaster * (0.32 + 0.32 * twinkle);
      ctx.drawImage(goldSprite, bowCenter.x - glowSz / 2, bowCenter.y - glowSz / 2, glowSz, glowSz);
      if (diamondSprite && sparkPeak > 0.2) {
        const dSz = glowSz * (0.95 + 0.65 * sparkPeak);
        ctx.globalAlpha = alphaMaster * 0.85 * sparkPeak;
        ctx.drawImage(diamondSprite, bowCenter.x - dSz / 2, bowCenter.y - dSz / 2, dSz, dSz);
      }
      ctx.restore();
    }
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

  const baseWidth = Math.max(1.5, garlandPoints[0].scale * 0.075);
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
  // Fast double-stroke glow (20x faster than CPU shadowBlur!)
  ctx.strokeStyle = 'rgba(255, 213, 106, 0.28)';
  ctx.lineWidth = baseWidth * 3.0;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 200, 72, 0.9)';
  ctx.lineWidth = baseWidth;
  ctx.stroke();

  for (let i = 0; i < garlandPoints.length; i += 7) {
    const point = garlandPoints[i];
    if (point.z <= 0) continue;
    const radius = Math.max(1.8, point.scale * 0.1);
    ctx.fillStyle = i % 2 === 0 ? '#fff1aa' : '#f6c94e';
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.fill();
  }

  for (let i = 0; i < 34; i++) {
    const t = 0.1 + (i / 34) * 0.76;
    const radius = 6.9 * Math.pow(1 - t, 0.85) + 0.45;
    const angle = i * 2.399 + time * 0.025;
    const point = projectFrame(Math.cos(angle) * radius, -8.75 + t * 14.8, Math.sin(angle) * radius);
    if (point.z <= 0) continue;

    const ornamentRadius = Math.max(2.5, point.scale * 0.25);
    const drawSize = ornamentRadius * 3.0;
    const sprite = ORNAMENT_SPRITES[i % ORNAMENT_SPRITES.length];
    ctx.drawImage(sprite, point.x - drawSize / 2, point.y - drawSize / 2, drawSize, drawSize);
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
    const lastRenderMsRef = useRef<number>(0);
    const lastCameraSentRef = useRef<{ w: number; h: number; scatter: number; intro: number }>({
      w: 0,
      h: 0,
      scatter: -1,
      intro: -1,
    });
    const backgroundGradientRef = useRef<{ key: string; gradient: CanvasGradient | null }>({
      key: '',
      gradient: null,
    });
    const groundGlowCacheRef = useRef<{ key: string; canvas: HTMLCanvasElement | null }>({
      key: '',
      canvas: null,
    });
    const starCacheRef = useRef<{
      key: string;
      haloCanvas: HTMLCanvasElement | null;
      bodyCanvas: HTMLCanvasElement | null;
      radius: number;
    }>({
      key: '',
      haloCanvas: null,
      bodyCanvas: null,
      radius: 0,
    });
    const greetingCacheRef = useRef<{
      key: string;
      canvas: HTMLCanvasElement | null;
      width: number;
      height: number;
      textWidth: number;
    }>({
      key: '',
      canvas: null,
      width: 0,
      height: 0,
      textWidth: 0,
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
  const goldSparkSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const rubySparkSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const emeraldSparkSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const diamondStarSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const supernovaSpriteRef = useRef<HTMLCanvasElement | null>(null);

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

    // 1. Lush Tiered 3D Pine Foliage & Embedded Fairy Lights
    const pts: TreePoint[] = [];
    const total = sceneSettings.totalPoints;
    const strings = sceneSettings.strings;
    const turns = sceneSettings.turns;

    for (let i = 0; i < total; i++) {
      const st = i % strings;
      const t = Math.floor(i / strings) / (total / strings);
      // Organic 7-tier scalloped pine bough profile + volumetric inner foliage depth!
      const tierWave = 1 + 0.13 * Math.sin(t * 7.5 * TAU) * (1 - t * 0.65);
      const isInnerCore = i % 4 === 0;
      const depthScale = isInnerCore ? rand(0.84, 0.52) : rand(1.04, 0.90);
      const radius = (6.9 * Math.pow(1 - t, 0.86) + 0.42) * tierWave * depthScale;
      const ang = t * turns * TAU + (st * TAU) / strings + (isInnerCore ? rand(0.45, -0.45) : 0);
      const j = 0.16;
      const ep = energyCloudPos(w, h);

      // Rich festive balance: ~81% layered emerald pine needles, ~15% warm golden fairy lights, ~4% glowing ornaments
      const isFairyLight = !isInnerCore && Math.random() < 0.16;
      const ornament = !isInnerCore && !isFairyLight && Math.random() < 0.045;
      const colorIndex = treePalette
        ? isFairyLight || ornament
          ? Math.floor(Math.random() * palette.length)
          : palette.length + Math.min(treePalette.length - 1, Math.floor(t * treePalette.length))
        : Math.floor(Math.random() * palette.length);
      const originalColor: ColorRGB =
        treePalette && colorIndex >= palette.length
          ? treePalette[colorIndex - palette.length]
          : palette[colorIndex];

      pts.push({
        x: Math.cos(ang) * radius + rand(j, -j),
        y: -8.6 + t * 14.9 + rand(j, -j),
        z: Math.sin(ang) * radius + rand(j, -j),
        t: t,
        c: colorIndex,
        originalColor,
        base: ornament ? rand(1.1, 1.5) : isFairyLight ? rand(0.44, 0.72) : rand(0.24, 0.42),
        phase: rand(TAU),
        fade: t > 0.92 ? 1 - ((t - 0.92) / 0.08) * 0.45 : 1,
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
    // Cap DPR at 1 for particle Canvas2D: cuts pixel fill cost by 36%-75% on 125%/150%/Retina displays!
    const dpr = 1;

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
    goldSparkSpriteRef.current = makeSprite([255, 224, 132], 64);
    rubySparkSpriteRef.current = makeSprite([239, 72, 72], 64);
    emeraldSparkSpriteRef.current = makeSprite([34, 197, 94], 64);
    diamondStarSpriteRef.current = makeDiamondStarSprite(64);
    if (!supernovaSpriteRef.current) {
      const sCv = document.createElement('canvas');
      sCv.width = 256;
      sCv.height = 256;
      const sCtx = sCv.getContext('2d');
      if (sCtx) {
        const g = sCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.18, 'rgba(255,246,210,0.92)');
        g.addColorStop(0.45, 'rgba(255,205,110,0.38)');
        g.addColorStop(0.78, 'rgba(255,180,90,0.08)');
        g.addColorStop(1, 'rgba(255,180,90,0)');
        sCtx.fillStyle = g;
        sCtx.fillRect(0, 0, 256, 256);
      }
      supernovaSpriteRef.current = sCv;
    }
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
      // Pause animation completely when tab is hidden
      if (document.hidden) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const currentTimeMs = performance.now();
      // Smooth 40 FPS cap: prevents 120Hz/144Hz monitors from burning 3x CPU!
      if (lastRenderMsRef.current && currentTimeMs - lastRenderMsRef.current < 24) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastRenderMsRef.current = currentTimeMs;

      const time = (currentTimeMs - startTimeRef.current) / 1000;
      const dt = lastTimeRef.current ? Math.min(0.05, time - lastTimeRef.current) : 0.025;
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

      // Apply AI hand gesture rotation (calibrated for smooth, controlled turning)
      const gDx = gestureRef.current.dx;
      const gDy = gestureRef.current.dy;
      gestureRef.current = { dx: 0, dy: 0 };
      if (gDx !== 0) {
        manualRotRef.current.yaw += gDx * 1.85;
      }
      if (gDy !== 0) {
        manualRotRef.current.pitch = Math.max(
          -0.42,
          Math.min(0.42, manualRotRef.current.pitch - gDy * 1.2)
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
      // Epic Big Bang cinema pacing: ~1.95s opening (charge -> Big Bang -> zero-G hang -> reform), ~1.45s closing
      const morphDuration = targetScatter > scatterRef.current ? 1.95 : 1.45;
      const maxDelta = dt / morphDuration;
      const diffScatter = targetScatter - scatterRef.current;
      if (Math.abs(diffScatter) <= maxDelta) {
        scatterRef.current = targetScatter;
      } else {
        scatterRef.current += Math.sign(diffScatter) * maxDelta;
      }
      const scatter = scatterRef.current;
      const portraitProgress = hasPortrait ? scatter : 0;
      const portraitClarity = 1 - portraitProgress;
      const particleProjectFrame = hasPortrait
        ? createProjector(yaw * (1 - portraitProgress), pitch * (1 - portraitProgress), w, h, effFocal)
        : projectFrame;
      const portraitAspect = portraitTargetsRef.current?.aspect ?? portraitAspectRef.current;
      const targetMaxH = h * 0.78;
      const targetMaxW = w * 0.84;
      const portraitHeight = Math.min(targetMaxH, targetMaxW / portraitAspect);
      const portraitWidth = portraitHeight * portraitAspect;
      const portraitLeft = (w - portraitWidth) / 2;
      // Shift portrait slightly higher so shoulders fade out gently right above the "Merry Christmas" text
      const portraitTop = Math.max(h * 0.015, (h * 0.84 - portraitHeight) / 2);
      if (frameSettings.treeState !== 'formed' || !frameSettings.showStar) {
        starSequenceRef.current = 0;
      } else if (scatter < 0.06 && intro >= 0.9) {
        starSequenceRef.current += dt;
      }

      // Keep the DOM photo overlay in step with canvas animation (throttled to ~15fps & skipped when photos are hidden!)
      const lastSent = lastCameraSentRef.current;
      const photosActiveOrTransitioning =
        scatter > 0.08 ||
        lastSent.scatter > 0.08 ||
        intro < 0.99 ||
        lastSent.intro < 0.99 ||
        lastSent.w !== w ||
        lastSent.h !== h;
      if (photosActiveOrTransitioning && currentTimeMs - lastCameraUpdateRef.current >= 66) {
        onCameraUpdateRef.current?.(yaw, pitch, w, h, effFocal, scatter, intro);
        lastCameraUpdateRef.current = currentTimeMs;
        lastCameraSentRef.current = { w, h, scatter, intro };
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

      // 4. Ground Glow (pre-rendered offscreen sprite — zero per-frame radial gradients!)
      if (frameSettings.showGroundGlow && scatter < 0.65) {
        const ggKey = `${frameTheme.id}:${frameTheme.groundGlow.inner}`;
        if (groundGlowCacheRef.current.key !== ggKey) {
          const gCv = document.createElement('canvas');
          gCv.width = 256;
          gCv.height = 256;
          const gCtx = gCv.getContext('2d');
          if (gCtx) {
            const gg = gCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
            gg.addColorStop(0, frameTheme.groundGlow.inner);
            gg.addColorStop(0.45, frameTheme.groundGlow.mid);
            gg.addColorStop(1, frameTheme.groundGlow.outer);
            gCtx.fillStyle = gg;
            gCtx.fillRect(0, 0, 256, 256);
          }
          groundGlowCacheRef.current = { key: ggKey, canvas: gCv };
        }
        const gCanvas = groundGlowCacheRef.current.canvas;
        if (gCanvas) {
          const pGlow = projectFrame(0, -10.2, 0);
          const pulse = 1 + 0.14 * Math.sin(time * 1.6);
          const R = effFocal * 0.44 * pulse;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, 1 - scatter * 1.5);
          ctx.translate(w / 2, pGlow.y);
          ctx.scale(1, 0.17);
          ctx.drawImage(gCanvas, -R, -R, R * 2, R * 2);
          ctx.restore();
        }
      }

      // Pre-calculate frame constants outside particle loop for silky performance
      const sinYawParallax = Math.sin(yaw * 0.55) * portraitWidth * 0.04;
      const sinPitchParallax = -Math.sin(pitch * 0.55) * portraitHeight * 0.04;
      const minDim = Math.min(w, h);
      const maxDim = Math.max(w, h);
      const centerX = w / 2;
      const centerY = h * 0.45;
      const isClosing = frameSettings.treeState === 'formed' || targetScatter === 0;
      const isMorphing = hasPortrait && portraitProgress > 0.005 && portraitProgress < 0.995;

      // 4a. BIG BANG SUPERNOVA FLASH & EXPANDING SHOCKWAVE RINGS (zero shadowBlur!)
      if (isMorphing) {
        // Core Singularity Charge & Supernova Detonation Flash (peaks right at t = 0.18!)
        const supernovaSprite = supernovaSpriteRef.current;
        if (supernovaSprite && portraitProgress > 0.03 && portraitProgress < 0.48) {
          let flashIntensity = 0;
          let flashRadius = minDim * 0.15;
          if (portraitProgress < 0.18) {
            // Singularity charging inward
            const u = (portraitProgress - 0.03) / 0.15;
            flashIntensity = u * u * 0.75;
            flashRadius = minDim * (0.28 - 0.16 * u);
          } else {
            // Blazing Big Bang detonation bloom!
            const u = (portraitProgress - 0.18) / 0.30;
            flashIntensity = Math.pow(1 - u, 2.0) * 0.95;
            flashRadius = minDim * (0.12 + 0.62 * (1 - Math.pow(1 - u, 2.5)));
          }
          if (flashIntensity > 0.01) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = Math.min(0.95, flashIntensity);
            ctx.drawImage(
              supernovaSprite,
              centerX - flashRadius,
              centerY - flashRadius,
              flashRadius * 2,
              flashRadius * 2
            );
            ctx.restore();
          }
        }

        // Twin Big Bang Shockwave Rings ripping outward across the screen (0.16 -> 0.72)
        if (portraitProgress > 0.15 && portraitProgress < 0.74) {
          const waveT = (portraitProgress - 0.15) / 0.59;
          const ringAlpha = Math.pow(1 - waveT, 1.5) * Math.min(1, waveT * 7) * 0.42;
          const baseR = maxDim * (0.04 + 0.64 * (1 - Math.pow(1 - waveT, 2.8)));

          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          // Outer golden shockwave rim
          ctx.strokeStyle = `rgba(255, 224, 145, ${(ringAlpha * 0.85).toFixed(3)})`;
          ctx.lineWidth = Math.max(1.2, 6.5 * (1 - waveT * 0.8));
          ctx.beginPath();
          ctx.arc(centerX, centerY, baseR, 0, TAU);
          ctx.stroke();

          // Secondary crisp white harmonic ring trailing slightly behind
          if (waveT > 0.05) {
            const innerR = baseR * 0.74;
            ctx.strokeStyle = `rgba(255, 255, 255, ${(ringAlpha * 0.7).toFixed(3)})`;
            ctx.lineWidth = Math.max(0.8, 2.4 * (1 - waveT * 0.7));
            ctx.beginPath();
            ctx.arc(centerX, centerY, innerR, 0, TAU);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // 4b. Ultra-HD Pre-Rendered Stippled Stardust Portrait (crystallizes out of converging Big Bang stars!)
      const renderedPortrait = portraitTargetsRef.current?.renderedCanvas;
      if (hasPortrait && renderedPortrait && portraitProgress > 0.62) {
        const rawReveal = Math.max(0, Math.min(1, (portraitProgress - 0.62) / 0.36));
        const portraitCanvasAlpha = rawReveal * rawReveal * (3 - 2 * rawReveal);
        const settleScale = 0.955 + 0.045 * portraitCanvasAlpha;
        const drawW = portraitWidth * settleScale;
        const drawH = portraitHeight * settleScale;
        const pxOffset = sinYawParallax * 0.28 + (portraitWidth - drawW) / 2;
        const pyOffset = sinPitchParallax * 0.28 + (portraitHeight - drawH) / 2 + Math.sin(time * 0.9) * 1.4;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = portraitCanvasAlpha;
        ctx.drawImage(
          renderedPortrait,
          portraitLeft + pxOffset,
          portraitTop + pyOffset,
          drawW,
          drawH
        );
      }

      // 4c. Sculpted 3D Tapered Wooden Trunk (drawn behind front pine boughs so foliage drapes naturally!)
      if (scatter < 0.14 && intro > 0.05) {
        const trunkAlpha = Math.max(0, 1 - scatter / 0.14) * Math.min(1, intro * 1.4);
        const revealTopY = -10.3 + Math.min(1, intro * 1.35) * 3.1;
        const baseCenter = projectFrame(0, -10.35, 0);
        const topCenter = projectFrame(0, revealTopY, 0);
        const baseHalfW = Math.max(10, baseCenter.scale * 0.88);
        const topHalfW = Math.max(6, topCenter.scale * 0.50);

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = trunkAlpha;

        // Soft grounding shadow ellipse directly under the roots
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.beginPath();
        ctx.ellipse(baseCenter.x, baseCenter.y + baseHalfW * 0.18, baseHalfW * 1.55, baseHalfW * 0.38, 0, 0, TAU);
        ctx.fill();

        // Tapered organic trunk silhouette with gentle root flare
        ctx.beginPath();
        ctx.moveTo(baseCenter.x - baseHalfW * 1.18, baseCenter.y);
        ctx.quadraticCurveTo(
          baseCenter.x - baseHalfW * 0.82,
          (baseCenter.y + topCenter.y) * 0.55,
          topCenter.x - topHalfW,
          topCenter.y
        );
        ctx.lineTo(topCenter.x + topHalfW, topCenter.y);
        ctx.quadraticCurveTo(
          baseCenter.x + baseHalfW * 0.82,
          (baseCenter.y + topCenter.y) * 0.55,
          baseCenter.x + baseHalfW * 1.18,
          baseCenter.y
        );
        ctx.ellipse(baseCenter.x, baseCenter.y, baseHalfW * 1.18, baseHalfW * 0.24, 0, 0, Math.PI);
        ctx.closePath();

        // Rich 3D cylindrical mahogany/cedar wood shading
        const woodGrad = ctx.createLinearGradient(
          baseCenter.x - baseHalfW * 1.15,
          0,
          baseCenter.x + baseHalfW * 1.15,
          0
        );
        woodGrad.addColorStop(0, '#180a04');
        woodGrad.addColorStop(0.24, '#472512');
        woodGrad.addColorStop(0.46, '#754122');
        woodGrad.addColorStop(0.66, '#4f2a14');
        woodGrad.addColorStop(0.88, '#281207');
        woodGrad.addColorStop(1, '#120703');
        ctx.fillStyle = woodGrad;
        ctx.fill();

        // Subtle curved vertical bark grain ridges rotating naturally with tree yaw
        ctx.clip();
        ctx.strokeStyle = 'rgba(255, 208, 145, 0.14)';
        ctx.lineWidth = Math.max(1, baseHalfW * 0.08);
        for (let b = 0; b < 5; b++) {
          const barkAngle = (b / 5) * TAU + yaw * 0.8;
          const sinB = Math.sin(barkAngle);
          if (Math.cos(barkAngle) < -0.1) continue;
          const bxBottom = baseCenter.x + sinB * baseHalfW * 0.9;
          const bxTop = topCenter.x + sinB * topHalfW * 0.85;
          ctx.beginPath();
          ctx.moveTo(bxBottom, baseCenter.y + 4);
          ctx.quadraticCurveTo((bxBottom + bxTop) * 0.5 + sinB * 3, (baseCenter.y + topCenter.y) * 0.5, bxTop, topCenter.y);
          ctx.stroke();
        }

        // Warm golden reflected rim glow from the Christmas tree lights at top & base
        const rimGrad = ctx.createLinearGradient(0, topCenter.y, 0, baseCenter.y);
        rimGrad.addColorStop(0, 'rgba(10, 35, 18, 0.55)'); // soft canopy shadow where boughs meet trunk
        rimGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
        rimGrad.addColorStop(1, 'rgba(255, 198, 92, 0.22)'); // warm ground light reflection
        ctx.fillStyle = rimGrad;
        ctx.fillRect(
          baseCenter.x - baseHalfW * 1.4,
          topCenter.y - 4,
          baseHalfW * 2.8,
          baseCenter.y - topCenter.y + baseHalfW * 0.5
        );
        ctx.restore();

        // Delicate warm golden stardust motes spiraling gently around the wooden trunk base
        const trunkDustSprite = goldSparkSpriteRef.current || sprites[0];
        if (trunkDustSprite) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let d = 0; d < 22; d++) {
            const dtFrac = d / 22;
            const dY = -10.2 + dtFrac * 2.8;
            const dAng = d * 1.95 + time * 0.65;
            const dRad = 0.95 - dtFrac * 0.34;
            const dp = projectFrame(Math.cos(dAng) * dRad, dY, Math.sin(dAng) * dRad);
            if (dp.z < -0.5) continue;
            const tw = 0.45 + 0.55 * Math.sin(time * 3.8 + d * 2.1);
            const sz = Math.max(2.2, dp.scale * (0.14 + 0.1 * tw));
            ctx.globalAlpha = trunkAlpha * (0.28 + 0.45 * tw);
            ctx.drawImage(trunkDustSprite, dp.x - sz / 2, dp.y - sz / 2, sz, sz);
          }
          ctx.restore();
        }
      }

      // 5. Unified Color-Morphing Particles — BIG BANG EXPLOSION -> ZERO-G STARFIELD -> FACE REFORMATION
      ctx.globalCompositeOperation = 'lighter';
      const pts = treePointsRef.current;
      const tempPts = tempStarPointsRef.current;
      const breathe = frameSettings.breatheEffect ? 1 + 0.07 * Math.sin(time * 0.9) : 1;
      const heartbeat = frameSettings.breatheEffect ? 0.9 + 0.1 * Math.pow(Math.max(0, Math.sin(time * 1.8)), 6) : 1;
      const starlightSprite = starlightSpriteRef.current || sprites[0];
      const goldSparkSprite = goldSparkSpriteRef.current || sprites[0];
      const rubySparkSprite = rubySparkSpriteRef.current || sprites[0];
      const emeraldSparkSprite = emeraldSparkSpriteRef.current || sprites[0];
      const diamondStarSprite = diamondStarSpriteRef.current;

      const tempReturnFactor = isClosing ? Math.max(0, (portraitProgress - 0.28) / 0.72) : 1.0;

      const isPurePortrait = portraitProgress >= 0.995;
      const isPureTree = portraitProgress <= 0.005;
      const gathering = (1 - intro) * minDim * 0.045;
      const hasHDPortraitBase = Boolean(renderedPortrait);

      // Batched comet trails for both outward Big Bang blast & inward reformation!
      const blastComets: number[] = [];
      const reformComets: number[] = [];

      const renderParticle = (pt: TreePoint, idx: number, isTemp: boolean) => {
        if (isTemp && isClosing && tempReturnFactor <= 0.005) {
          return;
        }

        const priority = pt.portraitPriority || 2;

        // Slight per-particle jitter so the Big Bang feels organic rather than a rigid shell
        let localP = portraitProgress;
        if (isMorphing) {
          const microStagger = ((pt.phase * 0.3183) % 1) * 0.08 + pt.t * 0.04; // 0..0.12
          const span = 1 - microStagger;
          localP = Math.max(0, Math.min(1, (portraitProgress - microStagger * 0.5) / span));
        }

        let treeX = 0;
        let treeY = 0;
        let depth = 0.5;
        let treeSize = 1.0;

        // 3D Tree Projection (completely skipped when settled in pure portrait mode!)
        if (!isPurePortrait && localP < 0.60) {
          const p = particleProjectFrame(pt.x * breathe, pt.y, pt.z * breathe);
          const px = centerX + (p.x - centerX) * intro;
          const py = h / 2 + (p.y - h / 2) * intro;
          treeX = pt.sx + (px - pt.sx) * intro;
          treeY = pt.sy + (py - pt.sy) * intro;

          if (gathering > 0.001) {
            const swirl = pt.phase + time * (1.5 + pt.t);
            treeX += Math.sin(swirl) * gathering;
            treeY += Math.cos(swirl * 1.35) * gathering * 0.72;
          }

          depth = Math.max(0, Math.min(1, (p.z + 8) / 15));
          const twinkle = 0.5 + 0.5 * Math.sin(time * 4 + pt.phase);
          const waveTwinkle = 0.5 + 0.5 * Math.sin(time * 3.5 - pt.t * 26);
          const spark = Math.pow(Math.max(0, Math.sin(time * 2.2 + pt.phase * 2)), 16);
          treeSize = pt.base * p.scale * (0.8 + 0.4 * twinkle + 0.3 * waveTwinkle + 0.5 * spark);
        }

        let cx = treeX;
        let cy = treeY;
        let burstEnergy = 0; // peaks during the Big Bang explosion for lens bloom & golden flash

        // ~17% of tree particles (~300 stars) remain suspended in the cosmic background around Chiara's portrait
        // for atmospheric beauty (upper starlight cosmos + lower festive emerald/gold/ruby horizon mist)!
        const isBgCosmic = !isTemp && idx % 6 === 0;
        const bgSlot = Math.floor(idx / 6);
        const bgZone = bgSlot % 10; // 0..4 = upper cosmic white stars, 5..7 = festive lower horizon mist, 8..9 = deep outer bokeh

        // Festive tree sprite for this particle (mixes its original tree color + ruby red ornament accents)
        const festiveSprite =
          idx % 7 === 0
            ? rubySparkSprite
            : idx % 5 === 0
              ? goldSparkSprite
              : sprites[pt.c] || emeraldSparkSprite;

        // BIG BANG 3-ACT FLIGHT TRAJECTORY
        if (hasPortrait && !isPureTree && localP > 0.001) {
          let targetX = 0;
          let targetY = 0;

          if (isBgCosmic) {
            // Planned artistic cosmic background placement (strictly OUTSIDE central face/hair silhouette!)
            const h1 = (pt.phase * 1.6180339 + idx * 0.371) % 1;
            const h2 = (pt.t * 2.7182818 + pt.phase * 0.73) % 1;
            const bgDepth = -0.75 + h1 * 1.5;
            const driftX = Math.sin(time * (0.38 + h2 * 0.35) + pt.phase) * (6 + h1 * 8) + sinYawParallax * bgDepth * 0.9;
            const driftY = Math.cos(time * (0.32 + h1 * 0.3) + pt.phase * 1.3) * (5 + h2 * 6) + sinPitchParallax * bgDepth * 0.9;

            if (bgZone < 5) {
              // Zone A: Upper & flanking starlight cosmos feathering out from Chiara's hair
              const onLeft = bgSlot % 2 === 0;
              const sideX = onLeft
                ? w * (0.04 + Math.pow(h1, 0.78) * 0.34)
                : w * (0.96 - Math.pow(h1, 0.78) * 0.34);
              const skyY = h * (0.04 + h2 * 0.56);
              targetX = sideX + driftX;
              targetY = skyY + driftY;
            } else if (bgZone < 8) {
              // Zone B: Ethereal festive lower-horizon stardust mist flanking her shoulders (emerald/gold left, ruby/amber right)
              const onLeft = bgSlot % 2 === 0;
              const mistX = onLeft
                ? w * (0.04 + h1 * 0.30)
                : w * (0.96 - h1 * 0.30);
              const mistY = h * (0.60 + h2 * 0.24);
              targetX = mistX + driftX * 1.15;
              targetY = mistY + driftY * 0.7;
            } else {
              // Zone C: Deep outer perimeter stars across top & sides
              const angle = pt.phase * 2.3 + h1 * TAU;
              const rx = w * (0.36 + h2 * 0.13);
              const ry = h * (0.34 + h1 * 0.12);
              targetX = centerX + Math.cos(angle) * rx + driftX;
              targetY = h * 0.44 + Math.sin(angle) * ry + driftY;
            }
          } else {
            const pZ = pt.portraitZ || 0;
            const volOffsetX = sinYawParallax * pZ;
            const volOffsetY = sinPitchParallax * pZ;
            const floatOffset = Math.sin(time * 1.25 + pt.phase) * 0.7;
            const jitX = (pt.portraitJitterX || 0) * portraitWidth;
            const jitY = (pt.portraitJitterY || 0) * portraitHeight;
            targetX = portraitLeft + pt.portraitX * portraitWidth + (volOffsetX + floatOffset + jitX);
            targetY = portraitTop + pt.portraitY * portraitHeight + (volOffsetY + floatOffset * 0.7 + jitY);
          }

          if (isPurePortrait || localP >= 0.999) {
            cx = targetX;
            cy = targetY;
          } else {
            // Deterministic 360° Big Bang destination spanning the entire viewport!
            const burstAngle = pt.phase * 3.17 + pt.t * 19.7 + (idx % 13) * 0.48;
            const frac = (pt.phase * 1.61803 + pt.t * 2.71828) % 1;
            const burstDist = maxDim * (0.16 + 0.54 * Math.pow(frac, 0.68));
            const burstX = isBgCosmic ? targetX : centerX + Math.cos(burstAngle) * burstDist;
            const burstY = isBgCosmic ? targetY : centerY + Math.sin(burstAngle) * burstDist * 0.72;

            // Compressed singularity point right before detonation
            const chargeX = treeX + (centerX - treeX) * 0.48;
            const chargeY = treeY + (centerY - treeY) * 0.48;

            if (localP < 0.16) {
              // ACT 1: GRAVITATIONAL IMPLOSION (tree pulls inward into glowing singularity!)
              const u = localP / 0.16;
              const pull = u * u * (3 - 2 * u);
              cx = treeX + (chargeX - treeX) * pull;
              cy = treeY + (chargeY - treeY) * pull;
              burstEnergy = u * 0.45;
            } else if (localP < 0.54) {
              // ACT 2: THE BIG BANG EXPLOSION! (fast outward radial blast -> zero-gravity starfield hang!)
              const u = (localP - 0.16) / 0.38;
              const blast = 1 - Math.pow(1 - u, 3.4);
              const drift = Math.sin(u * Math.PI) * 0.08;
              const bx = burstX - centerX;
              const by = burstY - centerY;
              const rotBurstX = centerX + bx * Math.cos(drift) - by * Math.sin(drift);
              const rotBurstY = centerY + bx * Math.sin(drift) + by * Math.cos(drift);

              cx = chargeX + (rotBurstX - chargeX) * blast;
              cy = chargeY + (rotBurstY - chargeY) * blast;

              const radialSpeed = Math.pow(1 - u, 2.1);
              burstEnergy = 0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.15));

              if (radialSpeed > 0.12 && idx % 3 === 0) {
                const dirX = rotBurstX - chargeX;
                const dirY = rotBurstY - chargeY;
                const streakLen = radialSpeed * (isClosing ? -0.14 : 0.19);
                blastComets.push(cx, cy, cx - dirX * streakLen, cy - dirY * streakLen);
              }
            } else {
              // ACT 3: MAGNETIC COSMIC REFORMATION!
              // Portrait stars swoop inward to sculpt Chiara's face; background stars gently settle in space!
              const u = (localP - 0.54) / 0.46;
              const ease = u * u * u * (u * (u * 6 - 15) + 10);
              const midCurve = Math.sin(Math.PI * u);

              if (isBgCosmic) {
                // Background particles stay gently suspended right where the Big Bang carried them!
                cx = targetX + Math.sin(u * Math.PI + pt.phase) * 6;
                cy = targetY + Math.cos(u * Math.PI + pt.phase) * 4;
                burstEnergy = (1 - u) * 0.35;
              } else {
                const vx = targetX - burstX;
                const vy = targetY - burstY;
                const curveSign = idx % 2 === 0 ? 1 : -1;
                const curveAmp = midCurve * 0.14 * curveSign;

                cx = burstX + vx * ease - vy * curveAmp;
                cy = burstY + vy * ease + vx * curveAmp;
                burstEnergy = midCurve * 0.42;

                const inwardSpeed = midCurve * midCurve;
                if (inwardSpeed > 0.18 && idx % 3 === 0) {
                  const streakLen = inwardSpeed * (isClosing ? -0.11 : 0.12);
                  reformComets.push(cx, cy, cx - vx * streakLen, cy - vy * streakLen);
                }
              }
            }
          }
        }

        // UNIFIED PARTICLE RENDERING
        const portraitRadius = isBgCosmic
          ? bgZone >= 5 && bgZone < 8
            ? 0.9 + (pt.phase % 0.85) // Soft festive horizon stardust mist
            : 0.7 + (pt.phase % 0.95) // Crisp cosmic background stars
          : priority === 1
            ? Math.max(0.6, Math.min(1.1, pt.portraitSize || 0.85))
            : Math.max(0.65, Math.min(1.25, pt.portraitSize || 0.95));
        const treeRadius = Math.max(0.5, treeSize * 0.5);
        const radiusBlend = Math.max(0, Math.min(1, (localP - 0.16) / 0.72));
        const flightFlareBoost = 1 + 0.85 * burstEnergy;
        const radius = (treeRadius * (1 - radiusBlend) + portraitRadius * radiusBlend) * flightFlareBoost;

        if (localP <= 0.01) {
          // Pure Tree state (1 draw call)
          if (!isTemp) {
            const twinkle = 0.5 + 0.5 * Math.sin(time * 4 + pt.phase);
            const spark = Math.pow(Math.max(0, Math.sin(time * 2.2 + pt.phase * 2)), 16);
            const glow = (0.4 + 0.35 * twinkle + 0.6 * spark) * heartbeat;
            const treeAlpha = Math.min(1, glow * (0.4 + 0.6 * depth) * pt.fade * (0.4 + 0.6 * intro));
            if (treeAlpha > 0.005) {
              ctx.globalAlpha = treeAlpha;
              const originalSprite = sprites[pt.c] || sprites[0];
              const drawSize = radius * 2;
              ctx.drawImage(originalSprite, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
            }
          }
        } else if (localP >= 0.99) {
          // Pure Portrait state: Chiara's shimmering portrait + lingering cosmic background & festive mist!
          if (isBgCosmic) {
            const bgTwinkle = 0.55 + 0.45 * Math.sin(time * (1.4 + (bgSlot % 5) * 0.45) + pt.phase * 2.3);
            if (bgZone >= 5 && bgZone < 8) {
              // Zone B: Subtle festive emerald/gold (left) & ruby/amber (right) stardust mist flanking her shoulders!
              const onLeft = bgSlot % 2 === 0;
              const mistSprite = onLeft
                ? bgSlot % 4 === 0
                  ? emeraldSparkSprite
                  : goldSparkSprite
                : bgSlot % 4 === 1
                  ? rubySparkSprite
                  : goldSparkSprite;
              const mistAlpha = (0.24 + 0.32 * bgTwinkle) * (0.75 + 0.25 * Math.sin(time + pt.phase));
              const drawSize = Math.max(2.6, portraitRadius * 3.1);
              ctx.globalAlpha = mistAlpha;
              ctx.drawImage(mistSprite, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
            } else {
              // Zone A & C: Delicate twinkling white cosmos stars + subtle diamond glints
              const starAlpha = 0.28 + 0.52 * bgTwinkle;
              const drawSize = Math.max(2.2, portraitRadius * 2.5);
              ctx.globalAlpha = starAlpha;
              ctx.drawImage(starlightSprite, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);

              if (diamondStarSprite && bgSlot % 5 === 0) {
                const bgFlare = Math.pow(Math.max(0, Math.sin(time * 1.3 + pt.phase * 3.1)), 10);
                if (bgFlare > 0.3) {
                  const flareSize = drawSize * (1.8 + 1.2 * bgFlare);
                  ctx.globalAlpha = starAlpha * 0.85 * bgFlare;
                  ctx.drawImage(diamondStarSprite, cx - flareSize / 2, cy - flareSize / 2, flareSize, flareSize);
                }
              }
            }
          } else {
            const pSpeed = pt.portraitSpeed || 2.4;
            const pTwinkle = 0.85 + 0.15 * Math.sin(time * pSpeed + pt.phase * 3.7);
            const pLight = pt.portraitLight ?? (priority === 1 ? 0.95 : 0.45);
            const baseAlpha =
              priority === 1
                ? Math.min(1.0, Math.max(0.85, pLight * pTwinkle))
                : Math.min(0.70, Math.max(0.25, pLight * pTwinkle));
            const overlayBalance = hasHDPortraitBase ? (priority === 1 ? 0.65 : 0.48) : 1.0;
            const finalAlpha = baseAlpha * overlayBalance * (isTemp ? tempReturnFactor : 1.0);

            if (finalAlpha > 0.008) {
              ctx.globalAlpha = finalAlpha;
              const drawSize = Math.max(2.0, portraitRadius * 2.2);
              ctx.drawImage(starlightSprite, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);

              if (diamondStarSprite && (pt.portraitIsSparkle || (priority === 1 && pTwinkle > 0.96))) {
                const pFlare = Math.pow(Math.max(0, Math.sin(time * 1.8 + pt.phase * 4.9)), 12);
                if (pFlare > 0.35) {
                  const flareSize = drawSize * (1.5 + 0.9 * pFlare);
                  ctx.globalAlpha = finalAlpha * 0.9 * pFlare;
                  ctx.drawImage(diamondStarSprite, cx - flareSize / 2, cy - flareSize / 2, flareSize, flareSize);
                }
              }
            }
          }
        } else if (isClosing) {
          // RETURN BIG BANG (Portrait -> Tree):
          // RIGHT DURING THE EXPLOSION (before recombining into the tree!), particles ALREADY shift
          // from white starlight into vibrant Christmas tree colors (emerald green, ruby red, warm gold)!
          const drawSize = Math.max(2.4, radius * 2.45);
          const tempFadeMult = isTemp ? tempReturnFactor : 1.0;

          // White fades out fast during initial shatter (1.0 -> 0.56)
          const whiteWeight = Math.max(0, Math.min(1, (localP - 0.56) / 0.38));
          // Festive Christmas tree colors (green, red, gold) ignite ALREADY during the explosion (0.94 -> 0.50 -> 0.0)!
          const festiveColorWeight = Math.max(0, Math.min(1, (0.94 - localP) / 0.36));

          if (whiteWeight > 0.02) {
            ctx.globalAlpha = Math.min(0.95, (0.75 + 0.25 * burstEnergy) * whiteWeight * tempFadeMult);
            ctx.drawImage(starlightSprite, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
          }

          if (!isTemp && festiveColorWeight > 0.02) {
            const festiveSize = drawSize * (1.0 + 0.32 * burstEnergy);
            ctx.globalAlpha = Math.min(1, (0.72 + 0.28 * burstEnergy) * pt.fade * festiveColorWeight);
            ctx.drawImage(festiveSprite, cx - festiveSize / 2, cy - festiveSize / 2, festiveSize, festiveSize);
          }

          // Subtle golden sparkle highlights at explosion peak
          if (diamondStarSprite && localP > 0.28 && localP < 0.78 && (pt.portraitIsSparkle || idx % 16 === 0)) {
            const flareSize = drawSize * (1.6 + 0.9 * burstEnergy);
            ctx.globalAlpha = Math.min(0.85, burstEnergy * 0.75 * tempFadeMult);
            ctx.drawImage(diamondStarSprite, cx - flareSize / 2, cy - flareSize / 2, flareSize, flareSize);
          }
        } else {
          // OPENING BIG BANG (Tree -> Portrait):
          // Tree colors -> superheated golden supernova burst -> pure white starlight reforming into Chiara (+ festive bg mist)!
          const drawSize = Math.max(2.2, radius * 2.35);
          const tempFadeMult = isTemp ? tempReturnFactor : 1.0;

          // 1. Original Tree Color Sprite fades smoothly out during detonation (0% -> 42%)
          const treeColorWeight = Math.max(0, 1 - localP * 2.35);
          if (!isTemp && treeColorWeight > 0.02) {
            ctx.globalAlpha = Math.min(1, (0.7 + 0.3 * depth) * pt.fade * treeColorWeight);
            ctx.drawImage(festiveSprite, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
          }

          // 2. Superheated Golden Big Bang Spark peaks during charge & explosion (0.06 -> 0.65)
          const goldWeight = Math.max(0, burstEnergy * (1 - Math.max(0, (localP - 0.52) / 0.32))) * tempFadeMult;
          if (goldWeight > 0.03) {
            const goldSize = drawSize * (1.1 + 0.45 * burstEnergy);
            ctx.globalAlpha = Math.min(0.95, goldWeight);
            ctx.drawImage(goldSparkSprite, cx - goldSize / 2, cy - goldSize / 2, goldSize, goldSize);
          }

          // 3. Target color rises from detonation (0.14 -> 1.0):
          // Festive horizon mist stays subtly emerald/ruby/gold; cosmos & portrait become crisp pure white!
          const targetRise = Math.max(0, Math.min(1, (localP - 0.14) / 0.42));
          if (targetRise > 0.02) {
            const isMistBg = isBgCosmic && bgZone >= 5 && bgZone < 8;
            const onLeft = bgSlot % 2 === 0;
            const destSprite = isMistBg
              ? onLeft
                ? bgSlot % 4 === 0
                  ? emeraldSparkSprite
                  : goldSparkSprite
                : bgSlot % 4 === 1
                  ? rubySparkSprite
                  : goldSparkSprite
              : starlightSprite;
            const pLight = pt.portraitLight ?? (priority === 1 ? 0.95 : 0.55);
            const settleMult = localP > 0.72 ? (localP - 0.72) / 0.28 : 0;
            const targetAlpha = isBgCosmic
              ? isMistBg
                ? 0.42
                : 0.55
              : (priority === 1 ? Math.max(0.82, pLight) : Math.max(0.32, pLight)) *
                (hasHDPortraitBase ? (priority === 1 ? 0.68 : 0.5) : 1.0);
            const flightAlpha = 0.85 * (1 - settleMult) + targetAlpha * settleMult;
            ctx.globalAlpha = Math.min(1, flightAlpha * targetRise * tempFadeMult);
            ctx.drawImage(destSprite, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
          }

          // 4. Sparkling 4-point diamond stars during the Big Bang burst & zero-G starfield!
          if (diamondStarSprite && localP > 0.15 && localP < 0.88 && (pt.portraitIsSparkle || idx % 14 === 0)) {
            const flareSize = drawSize * (1.8 + 1.2 * burstEnergy);
            ctx.globalAlpha = Math.min(0.95, (0.35 + 0.65 * burstEnergy) * tempFadeMult);
            ctx.drawImage(diamondStarSprite, cx - flareSize / 2, cy - flareSize / 2, flareSize, flareSize);
          }
        }
      };

      for (let i = 0; i < pts.length; i++) {
        renderParticle(pts[i], i, false);
      }

      if (portraitProgress > 0 && tempPts.length > 0 && (!isClosing || tempReturnFactor > 0.005)) {
        for (let i = 0; i < tempPts.length; i++) {
          renderParticle(tempPts[i], i, true);
        }
      }

      // Batched GPU Stroke 1: Blazing Golden-White Outward Big Bang Streaks!
      if (blastComets.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let s = 0; s < blastComets.length; s += 4) {
          ctx.moveTo(blastComets[s], blastComets[s + 1]);
          ctx.lineTo(blastComets[s + 2], blastComets[s + 3]);
        }
        ctx.globalAlpha = 0.36;
        ctx.strokeStyle = '#ffda85';
        ctx.lineWidth = 2.4;
        ctx.stroke();

        ctx.globalAlpha = 0.58;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ctx.restore();
      }

      // Batched GPU Stroke 2: Incoming Gravity Reformation Streaks (crisp white -> portrait, festive gold -> tree!)
      if (reformComets.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let s = 0; s < reformComets.length; s += 4) {
          ctx.moveTo(reformComets[s], reformComets[s + 1]);
          ctx.lineTo(reformComets[s + 2], reformComets[s + 3]);
        }
        ctx.globalAlpha = isClosing ? 0.42 : 0.38;
        ctx.strokeStyle = isClosing ? '#ffd984' : '#e8f4ff';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.restore();
      }

      if (frameTheme.id === 'snowglobe' && scatter < 0.1) {
        drawTreeDecorations(ctx, projectFrame, time, intro, scatter);
      }
      if (scatter < 0.14) {
        drawGiftModels(
          ctx,
          projectFrame,
          goldSparkSpriteRef.current || sprites[0],
          diamondStarSpriteRef.current,
          time,
          intro,
          scatter
        );
      }

      // 6. Orbiting Points (fairy dust)
      if (frameSettings.showOrbits && scatter < 0.2) {
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
      if (frameSettings.showPetals && scatter < 0.2) {
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
        const moteCount = 22;
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

      const starAppearDuration = 0.42;
      const starReveal = Math.max(0, Math.min(1, (starSequenceTime - gatherDuration) / starAppearDuration));
      if (frameSettings.showStar && frameSettings.treeState === 'formed' && starReveal > 0 && scatter < 0.12) {
        const starKey = `v3-particles:${frameTheme.id}:${Math.round(focal / 40)}`;
        if (starCacheRef.current.key !== starKey) {
          const haloR = focal * 0.125;
          const haloPad = Math.ceil(haloR + 12);
          const haloCv = document.createElement('canvas');
          haloCv.width = haloPad * 2;
          haloCv.height = haloPad * 2;
          const hCtx = haloCv.getContext('2d');
          if (hCtx) {
            hCtx.translate(haloPad, haloPad);
            const gStar = hCtx.createRadialGradient(0, 0, 0, 0, 0, haloR);
            gStar.addColorStop(0, frameTheme.star.inner);
            gStar.addColorStop(0.22, frameTheme.star.mid);
            gStar.addColorStop(0.55, frameTheme.star.outer);
            gStar.addColorStop(1, 'rgba(0,0,0,0)');
            hCtx.fillStyle = gStar;
            hCtx.beginPath();
            hCtx.arc(0, 0, haloR, 0, TAU);
            hCtx.fill();
          }
          starCacheRef.current = {
            key: starKey,
            haloCanvas: haloCv,
            bodyCanvas: null,
            radius: haloR,
          };
        }

        const appearScale = 0.18 + 0.82 * (1 - Math.pow(1 - starReveal, 3));
        const starAlphaMaster = starReveal * Math.max(0, 1 - scatter / 0.12);
        const starCenterY = 6.95;
        const pStarCenter = projectFrame(0, starCenterY, 0);

        // 1. Soft warm radial stardust glow behind the 3D particle star (no hard spikes or vector lines!)
        const { haloCanvas } = starCacheRef.current;
        if (haloCanvas) {
          const haloPulse = (1 + 0.12 * Math.sin(time * 2.4)) * zoomRef.current * appearScale;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = starAlphaMaster * 0.72;
          ctx.translate(pStarCenter.x, pStarCenter.y);
          ctx.scale(haloPulse, haloPulse);
          ctx.drawImage(haloCanvas, -haloCanvas.width / 2, -haloCanvas.height / 2);
          ctx.restore();
        }

        // 2. Pure 3D Volumetric Stardust Particle Star (rotates naturally in 3D with the tree!)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const goldSpr = goldSparkSpriteRef.current || sprites[0];
        const whiteSpr = starlightSpriteRef.current || sprites[0];
        const diamondSpr = diamondStarSpriteRef.current;
        const starSpin = Math.sin(time * 0.55) * 0.25; // subtle graceful 3D shimmer yaw
        const cosS = Math.cos(starSpin);
        const sinS = Math.sin(starSpin);

        for (let i = 0; i < STAR_PARTICLES_3D.length; i++) {
          const sp = STAR_PARTICLES_3D[i];
          const floatD = sp.kind === 'halo' ? Math.sin(time * 1.8 + sp.phase) * 0.12 : Math.sin(time * 2.6 + sp.phase) * 0.025;
          const lx = (sp.x * cosS - sp.z * sinS) * appearScale;
          const ly = (sp.y + floatD) * appearScale;
          const lz = (sp.x * sinS + sp.z * cosS) * appearScale;

          const proj = projectFrame(lx, starCenterY + ly, lz);
          const tw = 0.52 + 0.48 * Math.sin(time * (sp.kind === 'core' ? 5.2 : 3.8) + sp.phase);
          const sparkFlash = Math.pow(Math.max(0, Math.sin(time * 2.5 + sp.phase * 2.3)), 10);
          const drawSz = Math.max(2.2, proj.scale * sp.size * (0.88 + 0.36 * tw + 0.45 * sparkFlash));

          // Blend warm champagne gold on outer rim/halo and brilliant white-gold at the core & ridges
          const useWhite = sp.kind === 'core' || (sp.kind === 'rim' && i % 3 === 0);
          const spr = useWhite ? whiteSpr : goldSpr;
          const baseA = sp.kind === 'halo' ? 0.42 : sp.kind === 'core' ? 0.95 : 0.82;
          ctx.globalAlpha = Math.min(1, starAlphaMaster * baseA * (0.55 + 0.45 * tw));
          ctx.drawImage(spr, proj.x - drawSz / 2, proj.y - drawSz / 2, drawSz, drawSz);

          // Tiny crisp 4-point diamond star glints on star tips & peak flashes
          if (diamondSpr && ((sp.kind === 'rim' && i % 8 === 0) || sparkFlash > 0.55)) {
            const flareSz = drawSz * (1.55 + 0.9 * sparkFlash);
            ctx.globalAlpha = Math.min(0.95, starAlphaMaster * (0.35 + 0.6 * sparkFlash));
            ctx.drawImage(diamondSpr, proj.x - flareSz / 2, proj.y - flareSz / 2, flareSz, flareSz);
          }
        }
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

      // 10. Greeting Text (Cached offscreen canvas + Movie-Style Left-to-Right Golden Stardust Reveal!)
      if (frameSettings.showGreeting && frameSettings.greetingText.trim().length > 0) {
        const size = Math.round(Math.max(34, Math.min(76, w * 0.065)));
        const greetKey = `${w}:${size}:${frameSettings.greetingFont}:${frameSettings.greetingText}`;
        if (greetingCacheRef.current.key !== greetKey) {
          const gCv = document.createElement('canvas');
          const cw = Math.max(320, w);
          const ch = Math.ceil(size * 2.4);
          gCv.width = cw;
          gCv.height = ch;
          const gCtx = gCv.getContext('2d');
          let measuredWidth = Math.min(cw * 0.72, frameSettings.greetingText.length * size * 0.58);
          if (gCtx) {
            let fontStr = `italic bold ${size}px "Brush Script MT", "Great Vibes", "Segoe Script", cursive`;
            if (frameSettings.greetingFont === 'serif') {
              fontStr = `italic 800 ${size}px "Playfair Display", Georgia, serif`;
            } else if (frameSettings.greetingFont === 'cinzel') {
              fontStr = `800 ${size * 0.85}px "Cinzel", "Times New Roman", serif`;
            }
            gCtx.font = fontStr;
            gCtx.textAlign = 'center';
            gCtx.textBaseline = 'middle';
            measuredWidth = Math.min(cw - 40, gCtx.measureText(frameSettings.greetingText).width + 48);
            const midY = ch / 2;
            const textGrad = gCtx.createLinearGradient(0, midY - size / 2, 0, midY + size / 2);
            textGrad.addColorStop(0, '#ffffff');
            textGrad.addColorStop(0.3, '#fef08a');
            textGrad.addColorStop(0.65, '#f59e0b');
            textGrad.addColorStop(1, '#d97706');
            gCtx.fillStyle = textGrad;
            gCtx.shadowColor = 'rgba(251, 191, 36, 0.92)';
            gCtx.shadowBlur = 28;
            gCtx.fillText(frameSettings.greetingText, cw / 2, midY);
          }
          greetingCacheRef.current = {
            key: greetKey,
            canvas: gCv,
            width: cw,
            height: ch,
            textWidth: measuredWidth,
          };
        }

        const gCache = greetingCacheRef.current;
        if (gCache.canvas) {
          const textY = Math.round(h * 0.905);
          const shimmer = 0.92 + 0.08 * Math.sin(time * 2);
          const drawLeft = (w - gCache.width) / 2;
          const drawTop = textY - gCache.height / 2;

          // Movie-style left-to-right calligraphy reveal on page load / intro restart (0.35s -> 2.15s)
          const rawSweep = Math.max(0, Math.min(1, (elapsedSinceIntro - 0.35) / 1.8));
          const easedSweep = rawSweep * rawSweep * (3 - 2 * rawSweep);

          if (easedSweep >= 0.999) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = shimmer;
            ctx.drawImage(gCache.canvas, drawLeft, drawTop);
          } else if (easedSweep > 0.002) {
            const textStartX = Math.max(0, (gCache.width - gCache.textWidth) / 2);
            const revealWidthInCanvas = textStartX + gCache.textWidth * easedSweep;
            const screenEdgeX = drawLeft + revealWidthInCanvas;

            // Smoothly draw the revealed portion from left to right (1 fast sliced drawImage!)
            const sliceW = Math.min(gCache.width, Math.max(1, revealWidthInCanvas));
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = Math.min(1, easedSweep * 3.5) * shimmer;
            ctx.drawImage(
              gCache.canvas,
              0,
              0,
              sliceW,
              gCache.height,
              drawLeft,
              drawTop,
              sliceW,
              gCache.height
            );

            // Radiant Golden Stardust Quill & Magic Sparks writing the letters left -> right!
            const quillFade = Math.sin(Math.PI * easedSweep);
            if (quillFade > 0.02) {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              const wandY = textY + Math.sin(easedSweep * 16) * (size * 0.14);

              // Glowing warm golden aura at the writing tip
              if (goldSparkSprite) {
                const auraSz = size * (0.95 + 0.35 * quillFade);
                ctx.globalAlpha = 0.72 * quillFade;
                ctx.drawImage(goldSparkSprite, screenEdgeX - auraSz / 2, wandY - auraSz / 2, auraSz, auraSz);
              }
              // Crisp 4-point diamond star flare gliding across the letters
              if (diamondStarSprite) {
                const starSz = size * (0.85 + 0.3 * Math.sin(time * 12));
                ctx.globalAlpha = 0.95 * quillFade;
                ctx.drawImage(diamondStarSprite, screenEdgeX - starSz / 2, wandY - starSz / 2, starSz, starSz);
              }
              // Trailing golden stardust motes floating off the freshly written letters
              const sparkSpr = goldSparkSprite || starlightSprite;
              for (let k = 0; k < 10; k++) {
                const lag = ((k * 0.13 + time * 1.4) % 1);
                const sx = screenEdgeX - lag * (size * 1.45) - k * 2.5;
                const sy =
                  textY +
                  Math.sin(k * 2.7 + time * 5) * (size * 0.36) -
                  lag * (size * 0.35);
                const spSize = Math.max(3, (1 - lag) * size * 0.24);
                ctx.globalAlpha = (1 - lag) * 0.78 * quillFade;
                ctx.drawImage(sparkSpr, sx - spSize / 2, sy - spSize / 2, spSize, spSize);
              }
              ctx.restore();
            }
          }
        }
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
