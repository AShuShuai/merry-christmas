import React, { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { TreeSettings, TreePoint, OrbitPoint, Sparkle, Petal, Meteor, BurstParticle } from '../types';
import { THEMES } from '../config/themes';
import { generateSprites } from '../engine/sprites';
import { createProjector } from '../engine/projection';
import { chimeAudio } from '../utils/audio';

const TAU = Math.PI * 2;

function rand(max: number, min: number = 0): number {
  return min + Math.random() * (max - min);
}

function edgePos(w: number, h: number): [number, number] {
  const e = Math.random();
  if (e < 0.25) return [rand(w * 1.2, -w * 0.1), rand(-h * 0.12, -h * 0.02)];
  if (e < 0.5) return [rand(w * 1.2, -w * 0.1), rand(h * 1.12, h * 1.02)];
  if (e < 0.75) return [rand(-w * 0.12, -w * 0.02), rand(h * 1.2, -h * 0.2)];
  return [rand(w * 1.02, w * 1.12), rand(h * 1.2, -h * 0.2)];
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
  onCameraUpdate?: (
    yaw: number,
    pitch: number,
    width: number,
    height: number,
    focal: number,
    scatter: number
  ) => void;
}

export const ChristmasTreeCanvas = React.memo(forwardRef<CanvasHandle, Props>(
  ({ settings, gestureDeltaX = 0, gestureDeltaY = 0, onCameraUpdate }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Chaos vs Formed scatter factor (0 = formed tree, 1 = dispersed galaxy)
    const scatterRef = useRef<number>(0);
    const zoomRef = useRef<number>(1.0);

  // Scene points refs
  const treePointsRef = useRef<TreePoint[]>([]);
  const orbitPointsRef = useRef<OrbitPoint[]>([]);
  const sparklesRef = useRef<Sparkle[]>([]);
  const petalsRef = useRef<Petal[]>([]);
  const meteorsRef = useRef<Meteor[]>([]);
  const burstsRef = useRef<BurstParticle[]>([]);
  const spritesRef = useRef<HTMLCanvasElement[]>([]);

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

    const palette = currentTheme.palette;

    // 1. Tree Helix Points
    const pts: TreePoint[] = [];
    const total = settings.totalPoints;
    const strings = settings.strings;
    const turns = settings.turns;

    for (let i = 0; i < total; i++) {
      const st = i % strings;
      const t = Math.floor(i / strings) / (total / strings);
      const radius = 6.9 * Math.pow(1 - t, 0.85) + 0.45;
      const ang = t * turns * TAU + (st * TAU) / strings;
      const j = 0.14;
      const ep = edgePos(w, h);
      const ornament = Math.random() < 0.035;

      // Generate dispersed cloud target coordinates for Chaos mode
      const phi = Math.random() * TAU;
      const costheta = Math.random() * 2 - 1;
      const theta = Math.acos(costheta);
      const rChaos = 8.0 + Math.random() * 11.0;
      const cx = rChaos * Math.sin(theta) * Math.cos(phi);
      const cy = rChaos * Math.cos(theta) - 1.5;
      const cz = rChaos * Math.sin(theta) * Math.sin(phi);

      pts.push({
        x: Math.cos(ang) * radius + rand(j, -j),
        y: -9 + t * 15.2 + rand(j, -j),
        z: Math.sin(ang) * radius + rand(j, -j),
        cx,
        cy,
        cz,
        t: t,
        c: Math.floor(Math.random() * palette.length),
        base: ornament ? rand(0.9, 1.25) : rand(0.15, 0.3),
        phase: rand(TAU),
        fade: t > 0.9 ? 1 - ((t - 0.9) / 0.1) * 0.6 : 1,
        sx: ep[0],
        sy: ep[1],
      });
    }
    treePointsRef.current = pts;

    // 2. Orbiting Points (Fairy dust)
    const orbits: OrbitPoint[] = [];
    for (let o = 0; o < settings.orbitCount; o++) {
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
    for (let s = 0; s < settings.sparkleCount; s++) {
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
    for (let p = 0; p < settings.petalCount; p++) {
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
    for (let m = 0; m < settings.meteorCount; m++) {
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
  }, [currentTheme, settings.totalPoints, settings.strings, settings.turns, settings.orbitCount, settings.sparkleCount, settings.petalCount, settings.meteorCount]);

  // Handle Resize
  const handleResize = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

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

  // Update sprites on theme change
  useEffect(() => {
    spritesRef.current = generateSprites(currentTheme.palette);
    rebuildScene();
  }, [currentTheme, rebuildScene]);

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
        manualRotRef.current.yaw += gDx * 4.5;
      }
      if (gDy !== 0) {
        manualRotRef.current.pitch = Math.max(
          -0.45,
          Math.min(0.45, manualRotRef.current.pitch - gDy * 3.0)
        );
      }

      // Camera Angle & Zoom
      const effFocal = focal * zoomRef.current;
      const autoAngle = settings.autoRotate ? time * settings.rotationSpeed + Math.sin(time * 0.4) * 0.1 : 0;
      const yaw = autoAngle + manualRotRef.current.yaw;
      const pitch = manualRotRef.current.pitch;
      const projectFrame = createProjector(yaw, pitch, w, h, effFocal);

      // Chaos vs Formed scatter factor (smooth spring interpolation)
      const targetScatter = settings.treeState === 'dispersed' ? 1 : 0;
      scatterRef.current += (targetScatter - scatterRef.current) * 0.06;
      const scatter = scatterRef.current;

      // Broadcast camera and scatter state to 3D floating photos overlay
      onCameraUpdateRef.current?.(yaw, pitch, w, h, effFocal, scatter);

      // 1. Background
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const bgGrad = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75);
      bgGrad.addColorStop(0, currentTheme.bgGradient[0]);
      bgGrad.addColorStop(0.5, currentTheme.bgGradient[1]);
      bgGrad.addColorStop(1, currentTheme.bgGradient[2]);
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
        ctx.globalAlpha = Math.min(1, f.alpha * (flick + flare));
        ctx.drawImage(sprites[0], f.x - size / 2, f.y - size / 2, size, size);
      }

      // 3. Meteors
      if (settings.showMeteors) {
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
          const c0 = currentTheme.palette[0];
          lg.addColorStop(0, `rgba(${c0[0]},${c0[1]},${c0[2]},0)`);
          lg.addColorStop(1, `rgba(255,255,255,${0.9 * a})`);

          ctx.globalAlpha = 1;
          ctx.strokeStyle = lg;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(x, y);
          ctx.stroke();

          const sz = 16 * a;
          ctx.globalAlpha = a;
          ctx.drawImage(sprites[0], x - sz / 2, y - sz / 2, sz, sz);
        }
      }

      // 4. Ground Glow
      if (settings.showGroundGlow) {
        const pGlow = projectFrame(0, -10.2, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(w / 2, pGlow.y);
        ctx.scale(1, 0.17);
        const pulse = 1 + 0.14 * Math.sin(time * 1.6);
        const R = effFocal * 0.44 * pulse;
        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        gg.addColorStop(0, currentTheme.groundGlow.inner);
        gg.addColorStop(0.45, currentTheme.groundGlow.mid);
        gg.addColorStop(1, currentTheme.groundGlow.outer);
        ctx.globalAlpha = Math.max(0, 1 - scatter * 1.5);
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      // 5. Tree Points
      ctx.globalCompositeOperation = 'lighter';
      const pts = treePointsRef.current;
      const breathe = settings.breatheEffect ? 1 + 0.07 * Math.sin(time * 0.9) : 1;
      const heartbeat = settings.breatheEffect ? 0.9 + 0.1 * Math.pow(Math.max(0, Math.sin(time * 1.8)), 6) : 1;

      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        // Interpolate between conical Christmas tree and dispersed star galaxy
        const curX = pt.x * (1 - scatter) + pt.cx * scatter;
        const curY = pt.y * (1 - scatter) + pt.cy * scatter;
        const curZ = pt.z * (1 - scatter) + pt.cz * scatter;

        const p = projectFrame(curX * breathe, curY, curZ * breathe);
        const px = w / 2 + (p.x - w / 2) * intro;
        const py = h / 2 + (p.y - h / 2) * intro;
        let cx = pt.sx + (px - pt.sx) * intro;
        let cy = pt.sy + (py - pt.sy) * intro;

        const drift = (1 - intro) * 6;
        cx += Math.sin(time * 2.5 + pt.phase) * drift;
        cy += Math.cos(time * 2.1 + pt.phase) * drift;

        let depth = (p.z + 8) / 15;
        if (depth < 0) depth = 0;
        if (depth > 1) depth = 1;

        const twinkle = 0.5 + 0.5 * Math.sin(time * 4 + pt.phase);
        const wave = 0.5 + 0.5 * Math.sin(time * 3.5 - pt.t * 26);
        const spark = Math.pow(Math.max(0, Math.sin(time * 2.2 + pt.phase * 2)), 16);
        const glow = (0.4 + 0.35 * twinkle + 0.45 * wave * wave + 0.6 * spark) * heartbeat;
        let size = pt.base * p.scale * (0.8 + 0.4 * twinkle + 0.3 * wave + 0.5 * spark);
        if (size < 1) size = 1;

        ctx.globalAlpha = Math.min(1, glow * (0.4 + 0.6 * depth) * pt.fade * (0.4 + 0.6 * intro));
        const spr = sprites[pt.c] || sprites[0];
        ctx.drawImage(spr, cx - size / 2, cy - size / 2, size, size);
      }

      // 6. Orbiting Points (fairy dust)
      if (settings.showOrbits) {
        ctx.globalCompositeOperation = 'lighter';
        const orbits = orbitPointsRef.current;
        for (let i = 0; i < orbits.length; i++) {
          const o = orbits[i];
          const a = o.a0 + time * o.spd;
          const yy = o.y + Math.sin(time * o.ws + o.ph) * 0.6;
          const p = projectFrame(Math.cos(a) * o.r, yy, Math.sin(a) * o.r);
          const tw = 0.5 + 0.5 * Math.sin(time * 3 + o.ph);
          const size = o.size * p.scale * (0.8 + 0.5 * tw);
          ctx.globalAlpha = (0.35 + 0.5 * tw) * 0.85;
          const spr = sprites[o.c] || sprites[0];
          ctx.drawImage(spr, p.x - size / 2, p.y - size / 2, size, size);
        }
      }

      // 7. Falling Petals
      if (settings.showPetals) {
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
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = currentTheme.petalColor;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }

      // 8. Top Star
      if (settings.showStar) {
        const pStar = projectFrame(0, 7.7 + scatter * 2.5, 0);
        const pulse = 1 + 0.14 * Math.sin(time * 3.2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(pStar.x, pStar.y);
        ctx.scale(pulse, pulse);

        const R = effFocal * 0.22;
        const gStar = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        gStar.addColorStop(0, currentTheme.star.inner);
        gStar.addColorStop(0.12, currentTheme.star.mid);
        gStar.addColorStop(0.4, currentTheme.star.outer);
        gStar.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = gStar;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, TAU);
        ctx.fill();

        // 10 Rays
        const rayLen = effFocal * 0.28;
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
        const sr = focal * 0.042;
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
        ctx.fillStyle = currentTheme.star.star;
        ctx.shadowColor = currentTheme.star.glow;
        ctx.shadowBlur = 45;
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
            ctx.globalAlpha = bp.alpha;
            const spr = sprites[bp.colorIdx] || sprites[0];
            const sz = bp.size * (1 + (1 - progress) * 2);
            ctx.drawImage(spr, bp.x - sz / 2, bp.y - sz / 2, sz, sz);
            activeBursts.push(bp);
          }
        }
        burstsRef.current = activeBursts;
      }

      // 10. Greeting Text
      if (settings.showGreeting && settings.greetingText.trim().length > 0) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const size = Math.max(34, Math.min(88, w * 0.075));
        let fontStr = `italic bold ${size}px "Brush Script MT", "Great Vibes", "Segoe Script", cursive`;
        if (settings.greetingFont === 'serif') {
          fontStr = `italic 800 ${size}px "Playfair Display", Georgia, serif`;
        } else if (settings.greetingFont === 'cinzel') {
          fontStr = `800 ${size * 0.85}px "Cinzel", "Times New Roman", serif`;
        }

        ctx.font = fontStr;
        const textY = h * 0.9;
        const shift = 0.5 + 0.5 * Math.sin(time * 0.9);

        const textGrad = ctx.createLinearGradient(0, textY - size / 2, 0, textY + size / 2);
        const [g0, g1, g2, g3] = currentTheme.greetingGradient;
        textGrad.addColorStop(0, g0);
        textGrad.addColorStop(0.35 + shift * 0.2, g1);
        textGrad.addColorStop(0.7, g2);
        textGrad.addColorStop(1, g3);

        ctx.fillStyle = textGrad;
        ctx.shadowColor = currentTheme.greetingGlow;
        ctx.shadowBlur = 28 + 12 * Math.sin(time * 2);
        ctx.fillText(settings.greetingText, w / 2, textY);
        ctx.shadowBlur = 0;
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize, currentTheme, settings]);

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
