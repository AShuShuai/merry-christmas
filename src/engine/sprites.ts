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
  grad.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.42, 'rgba(242,248,255,0.48)');
  grad.addColorStop(0.72, 'rgba(210,232,255,0.12)');
  grad.addColorStop(1, 'rgba(200,225,255,0)');

  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return cv;
}

export function generateSprites(palette: ColorRGB[]): HTMLCanvasElement[] {
  return palette.map((color) => makeSprite(color));
}
