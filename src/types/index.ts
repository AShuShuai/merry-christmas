export type ColorRGB = [number, number, number];

export type ThemeId = 'pink' | 'classic' | 'frozen' | 'golden' | 'cyber';

export interface Theme {
  id: ThemeId;
  name: string;
  tagline: string;
  palette: ColorRGB[];
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
}

export interface TreePoint {
  x: number;
  y: number;
  z: number;
  t: number;
  c: number;
  base: number;
  phase: number;
  fade: number;
  sx: number;
  sy: number;
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
