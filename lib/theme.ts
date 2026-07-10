// src/lib/_core/theme.ts

export const Colors = {
  dark: {
    background: '#0d111d',
    text: '#ffffff',
    tint: '#4A90D9',
    tabIconDefault: '#8e9aa8',
    tabIconSelected: '#4A90D9',
  },
};

export const Fonts = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

export const SchemeColors = {
  background: '#0d111d',
  card: '#161b26',
  text: '#ffffff',
  border: 'rgba(255,255,255,0.1)',
};

export const ThemeColors = {
  background: '#0d111d',
  surface: '#161b26',
  primary: '#4A90D9',
  text: '#ffffff',
  textMuted: '#8e9aa8',
};

export type ColorScheme = 'dark';
export type ThemeColorPalette = typeof ThemeColors;