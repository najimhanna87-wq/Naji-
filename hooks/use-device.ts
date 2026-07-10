import { Platform, useWindowDimensions } from 'react-native';
import { useDeviceContext } from '@/lib/device-context';

/**
 * Returns device capabilities and layout values.
 *
 * Priority:
 *  1. User's explicit choice saved in DeviceContext (TV / Phone)
 *  2. Auto-detection via Platform.isTV + screen dimensions (fallback)
 *
 * This means: if the user chose "TV" on a phone screen, isTV = true
 * (useful for testing TV layout on a phone, or for set-top boxes that
 * don't report Platform.isTV correctly).
 */
export function useDevice() {
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const { deviceType } = useDeviceContext();

  // Handle potential 0 dimensions on early startup
  const width = winWidth || 1280;
  const height = winHeight || 720;

  const isLandscape = width > height;

  // Resolve isTV from user choice first, then auto-detect
  let isTV: boolean;
  if (deviceType === 'tv') {
    isTV = true;
  } else if (deviceType === 'phone') {
    isTV = false;
  } else {
    // No choice yet — fall back to hardware detection
    isTV = Platform.isTV || (isLandscape && width >= 960);
  }

  const isTablet = !isTV && (width >= 600);
  const isPhone = !isTV && !isTablet;

  // Scaling factor for fonts and spacing
  const scale = isTV ? 1.6 : isTablet ? 1.2 : 1.0;

  // Column widths for 3-column layout
  const colLeftWidth = isTV ? 260 : isTablet ? 140 : 110;
  const colRightWidth = isTV ? 400 : isTablet ? 200 : 160;

  // Font sizes
  const fontSm = Math.round(11 * scale);
  const fontMd = Math.round(13 * scale);
  const fontLg = Math.round(16 * scale);
  const fontXl = Math.round(20 * scale);

  // Touch target sizes
  const touchTarget = isTV ? 56 : 44;
  const iconSize = isTV ? 32 : 22;
  const listItemHeight = isTV ? 60 : 44;

  return {
    isTV,
    isTablet,
    isPhone,
    isLandscape,
    width,
    height,
    scale,
    colLeftWidth,
    colRightWidth,
    fontSm,
    fontMd,
    fontLg,
    fontXl,
    touchTarget,
    iconSize,
    listItemHeight,
  };
}
