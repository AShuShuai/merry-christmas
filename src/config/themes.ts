import { Theme, ThemeId, TreeSettings } from '../types';
import { DEFAULT_PHOTOS } from './defaultPhotos';

export const THEMES: Record<ThemeId, Theme> = {
  frozen: {
    id: 'frozen',
    name: 'Regno di Ghiaccio (Blu di Default)',
    tagline: 'Azzurro artico, ciano glaciale e riflessi diamante',
    palette: [
      [0, 240, 255],   // Pure Luminous Cyan
      [147, 197, 253], // Sky Blue
      [224, 242, 254], // Icy White Diamond
      [59, 130, 246],  // Sapphire Blue
      [165, 180, 252], // Periwinkle Violet
      [255, 255, 255], // Pure Sparkle
    ],
    bgGradient: ['#081b33', '#040e1c', '#01050d'],
    groundGlow: {
      inner: 'rgba(0,240,255,0.38)',
      mid: 'rgba(59,130,246,0.16)',
      outer: 'rgba(2,132,199,0)',
    },
    star: {
      inner: 'rgba(255,255,255,1)',
      mid: 'rgba(186,230,253,0.85)',
      outer: 'rgba(0,240,255,0.28)',
      star: 'rgba(240,249,255,1)',
      glow: 'rgba(0,240,255,1)',
    },
    petalColor: '#e0f2fe',
    greetingGradient: ['#ffffff', '#bae6fd', '#38bdf8', '#0284c7'],
    greetingGlow: 'rgba(56,189,248,0.85)',
  },

  pink: {
    id: 'pink',
    name: 'Sogno Rosa',
    tagline: 'Fiori di ciliegio, magenta pastello e polvere di stelle',
    palette: [
      [255, 105, 180], // Hot Pink
      [255, 182, 193], // Light Pink
      [255, 240, 245], // Lavender Blush
      [255, 20, 147],  // Deep Pink
      [220, 130, 220], // Soft Plum
      [255, 140, 200], // Pastel Magenta
    ],
    bgGradient: ['#2a0d24', '#150616', '#080209'],
    groundGlow: {
      inner: 'rgba(255,120,190,0.36)',
      mid: 'rgba(255,60,150,0.13)',
      outer: 'rgba(255,40,120,0)',
    },
    star: {
      inner: 'rgba(255,245,252,1)',
      mid: 'rgba(255,160,210,0.75)',
      outer: 'rgba(255,60,150,0.22)',
      star: 'rgba(255,250,253,1)',
      glow: 'rgba(255,105,180,1)',
    },
    petalColor: '#ffb6d9',
    greetingGradient: ['#fff0f7', '#ff9ecb', '#ff4fa3', '#b3186b'],
    greetingGlow: 'rgba(255,80,170,0.85)',
  },

  classic: {
    id: 'classic',
    name: 'Natale Tradizionale',
    tagline: 'Verde abete smeraldo, rosso rubino e oro caldo',
    palette: [
      [34, 197, 94],   // Emerald Green
      [239, 68, 68],   // Scarlet Red
      [251, 191, 36],  // Warm Gold
      [245, 158, 11],  // Amber
      [255, 255, 255], // Pure White
      [16, 185, 129],  // Mint Green
    ],
    bgGradient: ['#0d2218', '#07150e', '#020905'],
    groundGlow: {
      inner: 'rgba(251,191,36,0.38)',
      mid: 'rgba(34,197,94,0.16)',
      outer: 'rgba(239,68,68,0)',
    },
    star: {
      inner: 'rgba(255,255,255,1)',
      mid: 'rgba(251,191,36,0.85)',
      outer: 'rgba(245,158,11,0.3)',
      star: 'rgba(255,248,220,1)',
      glow: 'rgba(251,191,36,1)',
    },
    petalColor: '#ffffff',
    greetingGradient: ['#ffffff', '#fde68a', '#f59e0b', '#dc2626'],
    greetingGlow: 'rgba(251,191,36,0.85)',
  },

  golden: {
    id: 'golden',
    name: 'Eleganza Dorata',
    tagline: 'Oro imperiale, champagne luccicante e bagliori caldi',
    palette: [
      [255, 223, 128], // Champagne Gold
      [255, 215, 0],   // Bright Gold
      [255, 250, 205], // Lemon Chiffon
      [218, 165, 32],  // Goldenrod
      [255, 239, 213], // Papaya Whip
      [255, 255, 255], // Brilliant Light
    ],
    bgGradient: ['#1f1709', '#120d04', '#050300'],
    groundGlow: {
      inner: 'rgba(255,215,0,0.38)',
      mid: 'rgba(218,165,32,0.15)',
      outer: 'rgba(180,120,0,0)',
    },
    star: {
      inner: 'rgba(255,255,255,1)',
      mid: 'rgba(255,223,128,0.85)',
      outer: 'rgba(255,215,0,0.3)',
      star: 'rgba(255,255,240,1)',
      glow: 'rgba(255,215,0,1)',
    },
    petalColor: '#fef08a',
    greetingGradient: ['#ffffff', '#fef08a', '#facc15', '#ca8a04'],
    greetingGlow: 'rgba(250,204,21,0.85)',
  },

  cyber: {
    id: 'cyber',
    name: 'Cyberpunk Neon',
    tagline: 'Viola ultravioletto, fucsia elettrico e ciano sintetico',
    palette: [
      [168, 85, 247], // Electric Purple
      [236, 72, 153], // Hot Magenta
      [6, 182, 212],  // Neon Cyan
      [244, 63, 94],  // Bright Crimson
      [192, 132, 252], // Violet Flare
      [255, 255, 255], // Laser White
    ],
    bgGradient: ['#1c082e', '#10031c', '#06000c'],
    groundGlow: {
      inner: 'rgba(168,85,247,0.36)',
      mid: 'rgba(236,72,153,0.15)',
      outer: 'rgba(6,182,212,0)',
    },
    star: {
      inner: 'rgba(255,255,255,1)',
      mid: 'rgba(192,132,252,0.8)',
      outer: 'rgba(236,72,153,0.3)',
      star: 'rgba(255,240,255,1)',
      glow: 'rgba(168,85,247,1)',
    },
    petalColor: '#f472b6',
    greetingGradient: ['#ffffff', '#f472b6', '#c084fc', '#06b6d4'],
    greetingGlow: 'rgba(192,132,252,0.85)',
  },
};

export const DEFAULT_SETTINGS: TreeSettings = {
  themeId: 'frozen', // Default Blue style per user request!
  totalPoints: 7200,
  strings: 3,
  turns: 27,
  rotationSpeed: 0.35,
  autoRotate: true,
  interactiveRotation: true,
  breatheEffect: true,
  showGreeting: true,
  greetingText: 'Merry Christmas',
  greetingFont: 'cursive',
  showStar: true,
  showPetals: true,
  showMeteors: true,
  showGroundGlow: true,
  showOrbits: true,
  orbitCount: 520,
  petalCount: 90,
  meteorCount: 4,
  sparkleCount: 150,
  musicEnabled: false,
  webcamEnabled: false,
  showPhotos: true,
  photos: DEFAULT_PHOTOS,
};
