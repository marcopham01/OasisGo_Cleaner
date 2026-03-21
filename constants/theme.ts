/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

import { scale, verticalScale } from '@/utils/styling';

export const Colors = {
  light: {
    // --- BRAND COLORS (Blue Sapphire) ---
    primary: '#0d3b66',
    primaryLight: '#eff6ff',
    primaryDark: '#122c4f',
    primaryBg: 'rgba(13, 59, 102, 0.08)',

    secondary: '#84cc16',
    secondaryLight: '#d6f0acff',
    secondaryDark: '#4d7c0f',
    secondaryBg: 'rgba(132, 204, 22, 0.12)',

    // --- TEXT & NEUTRALS ---
    text: '#0f172a',
    textMuted: '#64748b',
    background: '#f3f3f3',
    surface: '#f1f5f9',
    border: '#d7e0edff',
    card: 'rgba(255, 255, 255, 1)',

    // --- SYSTEM ---
    success: '#10b981',
    error: '#f43f5e',
    warning: '#f59e0b',
    white: '#ffffff',
    black: '#000000',

    // --- NEUTRAL SHADES ---
    neutral50: '#f8fafc',
    neutral100: '#f1f5f9',
    neutral200: '#e2e8f0',
    neutral300: '#cbd5e1',
    neutral400: '#94a3b8',
    neutral500: '#64748b',
    neutral600: '#475569',
    neutral700: '#334155',
    neutral800: '#1e293b',
    neutral900: '#0f172a',

    // Compatibility keys for existing components
    tint: '#0d3b66',
    icon: '#64748b',
    tabIconDefault: '#64748b',
    tabIconSelected: '#0d3b66',
  },

  dark: {
    // --- BRAND COLORS (Glow Blue) ---
    primary: '#3b82f6',
    primaryLight: '#b7d1f4',
    primaryDark: '#195babff',
    primaryBg: 'rgba(59, 130, 246, 0.18)',

    secondary: '#75b11bff',
    secondaryLight: '#f1f6e9',
    secondaryDark: '#4d7c0f',
    secondaryBg: 'rgba(117, 177, 27, 0.18)',

    // --- TEXT & NEUTRALS ---
    text: '#f8fafc',
    textMuted: '#94a3b8',
    background: '#020617',
    surface: '#0f172a',
    border: '#1e293b',
    card: 'rgb(17,24,39)',

    // --- SYSTEM ---
    success: '#34d399',
    error: '#fb7185',
    warning: '#fbbf24',
    white: '#ffffff',
    black: '#000000',

    // --- NEUTRAL SHADES ---
    neutral50: '#0f172a',
    neutral100: '#1e293b',
    neutral200: '#334155',
    neutral300: '#475569',
    neutral400: '#64748b',
    neutral500: '#94a3b8',
    neutral600: '#cbd5e1',
    neutral700: '#e2e8f0',
    neutral800: '#f1f5f9',
    neutral900: '#f8fafc',

    // Compatibility keys for existing components
    tint: '#f8fafc',
    icon: '#94a3b8',
    tabIconDefault: '#94a3b8',
    tabIconSelected: '#f8fafc',
  },
};

export const spacingX = {
  _3: scale(3),
  _5: scale(5),
  _7: scale(7),
  _10: scale(10),
  _12: scale(12),
  _15: scale(15),
  _20: scale(20),
  _25: scale(25),
  _30: scale(30),
  _35: scale(35),
  _40: scale(40),
};

export const spacingY = {
  _5: verticalScale(5),
  _7: verticalScale(7),
  _10: verticalScale(10),
  _12: verticalScale(12),
  _15: verticalScale(15),
  _17: verticalScale(17),
  _20: verticalScale(20),
  _25: verticalScale(25),
  _30: verticalScale(30),
  _35: verticalScale(35),
  _40: verticalScale(40),
  _50: verticalScale(50),
  _60: verticalScale(60),
};

export const radius = {
  _3: verticalScale(3),
  _6: verticalScale(6),
  _10: verticalScale(10),
  _12: verticalScale(12),
  _15: verticalScale(15),
  _17: verticalScale(17),
  _20: verticalScale(20),
  _30: verticalScale(30),
  _40: verticalScale(40),
  _50: verticalScale(50),
  _60: verticalScale(60),
  _70: verticalScale(70),
  _80: verticalScale(80),
  _90: verticalScale(90),
  full: 200,
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
