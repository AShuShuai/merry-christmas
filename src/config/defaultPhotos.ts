import { MemoryPhoto } from '../types';

export const DEFAULT_PHOTOS: MemoryPhoto[] = [
  {
    id: 'photo-1',
    url: 'https://images.unsplash.com/photo-1543258103-a62bdc069871?auto=format&fit=crop&w=800&q=80',
    title: 'Il Nostro Natale Insieme ✨',
    subtitle: 'Momenti speciali e ricordi indimenticabili',
    angle: 0.2,
    y: 1.5,
    radius: 6.2,
  },
  {
    id: 'photo-2',
    url: 'https://images.unsplash.com/photo-1512474932049-78ac69ede12c?auto=format&fit=crop&w=800&q=80',
    title: 'Sotto le Luci Calde ❤️',
    subtitle: 'La magia delle feste con te',
    angle: (Math.PI * 2) / 5 + 0.2,
    y: -2.0,
    radius: 7.2,
  },
  {
    id: 'photo-3',
    url: 'https://images.unsplash.com/photo-1514897575457-c4db467cf78e?auto=format&fit=crop&w=800&q=80',
    title: 'Neve & Desideri ❄️',
    subtitle: 'Ogni fiocco di neve è un pensiero per te',
    angle: ((Math.PI * 2) * 2) / 5 + 0.2,
    y: 3.2,
    radius: 5.6,
  },
  {
    id: 'photo-4',
    url: 'https://images.unsplash.com/photo-1482517967863-00e15c9b44be?auto=format&fit=crop&w=800&q=80',
    title: 'Atmosfera d\'Inverno ☕',
    subtitle: 'Calore, sorrisi e sogni condivisi',
    angle: ((Math.PI * 2) * 3) / 5 + 0.2,
    y: -4.5,
    radius: 7.8,
  },
  {
    id: 'photo-5',
    url: 'https://images.unsplash.com/photo-1576919228236-a097c32a5cd4?auto=format&fit=crop&w=800&q=80',
    title: 'Il Regalo Più Bello 🎁',
    subtitle: 'Averti vicino in ogni istante',
    angle: ((Math.PI * 2) * 4) / 5 + 0.2,
    y: -0.5,
    radius: 6.8,
  },
];
