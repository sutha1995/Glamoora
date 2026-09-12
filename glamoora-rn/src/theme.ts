import { Platform } from 'react-native';

export const C = {
  brand: '#A87182',
  brand600: '#96626F',
  brand700: '#7E4F5C',
  brand800: '#5F3A46',
  brand100: '#F2E4E7',
  brand50: '#FAF3F5',
  bg: '#FDFAFB',
  ink: '#332227',
  ink2: '#5C464C',
  ink3: '#93797F',
  line: '#F0E1E4',
  line2: '#E5D2D6',
  white: '#FFFFFF',
  gold: '#B98A3E',
  goldBg: '#F7EEDD',
  green: '#3E7C59',
  greenBg: '#E4F0E9',
  amber: '#A9761F',
  amberBg: '#F9EFDC',
  red: '#B04A4A',
  redBg: '#F7E4E4',
  plum: '#4A3238',
};

export const R = { sm: 9, md: 12, lg: 16, xl: 22, pill: 999 };

export const SERIF = Platform.select({
  web: "Georgia, 'Times New Roman', serif",
  default: 'serif',
});

export const GRADS: Record<string, [string, string]> = {
  g1: ['#A87182', '#7E4F5C'],
  g2: ['#C99AA5', '#96626F'],
  g3: ['#8A5A66', '#5F3A46'],
  g4: ['#B98A3E', '#8A6524'],
  g5: ['#6E5A63', '#46363E'],
  g6: ['#C4A0AB', '#7E4F5C'],
};
export const AV_COLORS = ['#A87182', '#8A5A66', '#B98A3E', '#6E5A63', '#96626F', '#7E4F5C'];
