import { StyleSheet } from 'react-native';

export type Scheme = 'light' | 'dark';

const shared = {
  // Terracotta, like clay roof tiles: white text on it is 5.6:1.
  primary: '#A63F24',
  // Deep teal for market data and charts.
  teal: '#11706B',
  gold: '#C98A12',
  danger: '#C62828',
  onColor: '#FFFFFF',
};

const light = {
  ...shared,
  primarySoft: '#F8E7E1',
  primaryText: '#A63F24',
  tealSoft: '#E0F2F0',
  tealText: '#0E625E',
  bg: '#F7F4F0',
  card: '#FFFFFF',
  surface: '#F1ECE6',
  text: '#1F1A17',
  muted: '#6E655E',
  line: '#E6DFD7',
  code: '#2A2420',
  codeText: '#F5EDE6',
  goodSoft: '#E3F4E6',
  goodText: '#1E6B2F',
  warnSoft: '#FDF1D6',
  warnText: '#8A5A00',
  dangerSoft: '#FDE4E1',
  dangerText: '#B3261E',
  overlay: 'rgba(0,0,0,0.45)',
};

export type Palette = typeof light;

const dark: Palette = {
  ...shared,
  primarySoft: '#3A1D15',
  primaryText: '#F08A6C',
  tealSoft: '#0D2C2A',
  tealText: '#5FD0C6',
  bg: '#121010',
  card: '#1C1918',
  surface: '#272220',
  text: '#F3EEEA',
  muted: '#A99F98',
  line: '#332D2A',
  code: '#0B0A09',
  codeText: '#F5EDE6',
  goodSoft: '#12301A',
  goodText: '#7FD28F',
  warnSoft: '#332608',
  warnText: '#F2C45A',
  dangerSoft: '#3A1513',
  dangerText: '#F28B82',
  overlay: 'rgba(0,0,0,0.65)',
};

const PALETTES: Record<Scheme, Palette> = { light, dark };
let current: Scheme = 'light';

/** Switch palettes. The root layout keys the tree on the scheme, so everything re-renders. */
export function setScheme(s: Scheme) {
  current = s;
}
export function getScheme(): Scheme {
  return current;
}

/** The active palette. */
export const C: Palette = new Proxy(light, {
  get: (_, key) => PALETTES[current][key as keyof Palette],
}) as Palette;

/** StyleSheet built once per scheme on first use; use instead of StyleSheet.create. */
export function themed<T extends StyleSheet.NamedStyles<T>>(build: () => T): T {
  const cache: Partial<Record<Scheme, T>> = {};
  return new Proxy({} as T, {
    get: (_, key) => (cache[current] ??= StyleSheet.create(build()))[key as keyof T],
  });
}

export const FONT = {
  // System fonts keep the bundle small and render well on every platform.
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

export const RADIUS = { sm: 8, md: 12, lg: 18, pill: 999 };
export const MAX_WIDTH = 1200;
