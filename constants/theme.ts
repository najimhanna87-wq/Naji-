import { StyleSheet } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────
// APP_INFO — معلومات التطبيق
// ⚠️ مهم: عدّل `phone` و`server` بقيمك الحقيقية (كانت موجودة في النسخة
//    القديمة وفقدها مشروع Manus الجديد). بدون `server` الصحيح لن يتصل
//    تسجيل الدخول، وبدون `phone` لن يعمل زر واتساب.
// ─────────────────────────────────────────────────────────────────────────
export const APP_INFO = {
  version: '1.0.0',
  name: 'SimaStream',
  phone: '+231555505550',
  // الخادم الأساسي لتسجيل الدخول. بدائل إن لزم:
  //   http://forevertvs.com:8080
  //   http://foreversmart.me:8080
  server: 'https://forevertv.me:2087',
};

// ─────────────────────────────────────────────────────────────────────────
// SimaColors — مجموعة شاملة: تشمل مفاتيح ملفات SimaStream القديمة
// (textPrimary/bgCard/whatsapp...) ومفاتيح مشروع Manus (surface/primary...)
// معاً، بألوان تطابق الهوية: داكن + ذهبي التظليل.
// ─────────────────────────────────────────────────────────────────────────
export const SimaColors = {
  // خلفيات
  bg: '#0d111d',
  background: '#0d111d',
  surface: '#161b26',
  surfaceLight: '#212738',
  bgCard: '#161b26',
  bgCardDark: '#0f131c',

  // ألوان رئيسية / تمييز
  primary: '#4A90D9',
  accent: '#F5A623',        // ذهبي — يوحّد مع لون التظليل في الشاشات
  accentLight: '#FFCF6B',

  // نصوص
  text: '#ffffff',
  textPrimary: '#ffffff',
  textSecondary: '#c8cfd8',
  textMuted: '#8e9aa8',
  textGreen: '#4CAF50',

  // حدود وحالات
  border: 'rgba(255,255,255,0.1)',
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',

  // خدمات
  whatsapp: '#25D366',
};

export const Colors = {
  // كلا الوضعين معرّفان لمنع انهيار useColors/useTheme. التطبيق داكن دائماً،
  // فنجعل light = dark. أضفنا مفاتيح النصوص التي تستدعيها المكوّنات المزخرفة
  // (themed-view/themed-text) مثل textSecondary حتى تُعرض بلون صحيح لا undefined.
  light: {
    background: '#0d111d',
    surface: '#161b26',
    card: '#161b26',
    text: '#ffffff',
    textPrimary: '#ffffff',
    textSecondary: '#c8cfd8',
    textMuted: '#8e9aa8',
    primary: '#4A90D9',
    accent: '#F5A623',
    tint: '#4A90D9',
    tabIconDefault: '#8e9aa8',
    tabIconSelected: '#4A90D9',
  },
  dark: {
    background: '#0d111d',
    surface: '#161b26',
    card: '#161b26',
    text: '#ffffff',
    textPrimary: '#ffffff',
    textSecondary: '#c8cfd8',
    textMuted: '#8e9aa8',
    primary: '#4A90D9',
    accent: '#F5A623',
    tint: '#4A90D9',
    tabIconDefault: '#8e9aa8',
    tabIconSelected: '#4A90D9',
  },
};

// أبعاد التخطيط المطلوبة في بعض شاشات Manus (explore.tsx)
export const BottomTabInset = 49;
export const MaxContentWidth = 768;

export const Fonts = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

// دعم light/dark منعاً لانهيار شاشة المطورين
export const SchemeColors = {
  light: {
    background: '#0d111d',
    surface: '#161b26',
    card: '#161b26',
    foreground: '#ffffff',
    text: '#ffffff',
    muted: '#8e9aa8',
    primary: '#4A90D9',
    accent: '#F5A623',
    border: 'rgba(255,255,255,0.1)',
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336',
  },
  dark: {
    background: '#0d111d',
    surface: '#161b26',
    card: '#161b26',
    foreground: '#ffffff',
    text: '#ffffff',
    muted: '#8e9aa8',
    primary: '#4A90D9',
    accent: '#F5A623',
    border: 'rgba(255,255,255,0.1)',
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336',
  },
  background: '#0d111d',
  surface: '#161b26',
  card: '#161b26',
  foreground: '#ffffff',
  text: '#ffffff',
  muted: '#8e9aa8',
  primary: '#4A90D9',
  accent: '#F5A623',
  border: 'rgba(255,255,255,0.1)',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
};

export const ThemeColors = {
  background: '#0d111d',
  surface: '#161b26',
  primary: '#4A90D9',
  accent: '#F5A623',
  text: '#ffffff',
  textMuted: '#8e9aa8',
};

export const Spacing = {
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
};

export type ColorScheme = 'light' | 'dark';
export type ThemeColorPalette = typeof ThemeColors;
// نوع مفاتيح الألوان المسموح تمريرها لـ ThemedView/ThemedText
export type ThemeColor = keyof (typeof Colors)['dark'];
