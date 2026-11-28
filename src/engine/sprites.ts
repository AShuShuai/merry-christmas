import { ColorRGB } from '../types';

export function makeSprite(rgb: ColorRGB, size: number = 64): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return cv;

  const half = size / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.13, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.95)`);
  grad.addColorStop(0.38, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.3)`);
  grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);

  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return cv;
}

export function makeStarlightSprite(size: number = 64): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return cv;

  const half = size / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.48, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.78, 'rgba(225,240,255,0.18)');
  grad.addColorStop(1, 'rgba(200,225,255,0)');

  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return cv;
}

export function makeDiamondStarSprite(size: number = 64): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return cv;

  const half = size / 2;
  // Soft glowing circular center
  const grad = g.createRadialGradient(half, half, 0, half, half, half * 0.45);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.92)');
  grad.addColorStop(0.7, 'rgba(235,245,255,0.42)');
  grad.addColorStop(1, 'rgba(200,230,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(half, half, half * 0.45, 0, Math.PI * 2);
  g.fill();

  // 4 smooth tapered flare rays
  const drawRay = (angle: number) => {
    g.save();
    g.translate(half, half);
    g.rotate(angle);
    const rayGrad = g.createLinearGradient(0, 0, half * 0.95, 0);
    rayGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    rayGrad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
    rayGrad.addColorStop(0.7, 'rgba(220,240,255,0.2)');
    rayGrad.addColorStop(1, 'rgba(200,230,255,0)');
    g.fillStyle = rayGrad;
    g.beginPath();
    g.moveTo(0, -half * 0.08);
    g.lineTo(half * 0.95, 0);
    g.lineTo(0, half * 0.08);
    g.closePath();
    g.fill();
    g.restore();
  };

  drawRay(0);
  drawRay(Math.PI * 0.5);
  drawRay(Math.PI);
  drawRay(Math.PI * 1.5);

  return cv;
}

export function generateSprites(palette: ColorRGB[]): HTMLCanvasElement[] {
  return palette.map((color) => makeSprite(color));
}
