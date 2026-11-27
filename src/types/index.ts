export type ColorRGB = [number, number, number];

export type ThemeId = 'pink' | 'classic' | 'frozen' | 'golden' | 'cyber' | 'snowglobe';

export interface Theme {
  id: ThemeId;
  name: string;
  tagline: string;
  palette: ColorRGB[];
  treePalette?: ColorRGB[];
  bgGradient: [string, string, string];
  groundGlow: {
    inner: string;
    mid: string;
    outer: string;
  };
  star: {
    inner: string;
    mid: string;
    outer: string;
    star: string;
    glow: string;
  };
  petalColor: string;
  greetingGradient: [string, string, string, string];
  greetingGlow: string;
}

export type GreetingFont = 'cursive' | 'serif' | 'cinzel';
export type PortraitLoadStatus = 'loading' | 'ready' | 'error';

export interface MemoryPhoto {
  id: string;
  url: string;
  title: string;
  subtitle?: string;
  angle: number;
  y: number;
  radius: number;
}

export interface PhotoTransitionOrigin {
  left: number;
  top: number;
  width: number;
  height: number;
  x: number;
  y: number;
  z: number;
  scale: number;
}

export interface HandGestureState {
  hasHand: boolean;
  gesture: 'none' | 'move' | 'pinch' | 'open_palm' | 'fist';
  cursorX: number; // Screen normalized 0-1
  cursorY: number; // Screen normalized 0-1
  deltaX: number;
  deltaY: number;
  pinchDistance: number;
  isPinching: boolean;
}

export interface TreeSettings {
  themeId: ThemeId;
  totalPoints: number;
  strings: number;
  turns: number;
  rotationSpeed: number;
  autoRotate: boolean;
  interactiveRotation: boolean;
  breatheEffect: boolean;
  showGreeting: boolean;
  greetingText: string;
  greetingFont: GreetingFont;
  showStar: boolean;
  showPetals: boolean;
  showMeteors: boolean;
  showGroundGlow: boolean;
  showOrbits: boolean;
  orbitCount: number;
  petalCount: number;
  meteorCount: number;
  sparkleCount: number;
  musicEnabled: boolean;
  // Hand Tracking, Photos & Chaos Mode
  showPhotos: boolean;
  photos: MemoryPhoto[];
  portraitUrl: string;
  treeState: 'formed' | 'dispersed';
}

export interface TreePoint {
  x: number;
  y: number;
  z: number;
  t: number;
  c: number;
  originalColor: ColorRGB;
  base: number;
  phase: number;
  fade: number;
  sx: number;
  sy: number;
  portraitX: number;
  portraitY: number;
  portraitLight: number;
}

export interface OrbitPoint {
  a0: number;
  r: number;
  y: number;
  spd: number;
  ws: number;
  ph: number;
  c: number;
  size: number;
}

export interface Sparkle {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  alpha: number;
}

export interface Petal {
  x: number;
  y: number;
  r: number;
  sp: number;
  sw: number;
  rot: number;
  rs: number;
}

export interface Meteor {
  t0: number;
  dur: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
}

export interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  colorIdx: number;
  life: number;
  maxLife: number;
}
