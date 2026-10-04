/**
 * RescueNet Mobile Design Tokens & Theme
 * White-themed, emergency-focused, high contrast (#FFFFFF background, #F8F9FA cards).
 * Touch targets >= 48dp for TalkBack accessibility and emergency operation.
 */

export const colors = {
  // Base backgrounds
  background: '#ffffff',
  surface: '#f8f9fa',
  surfaceElevated: '#ffffff',
  border: '#e5e7eb',
  borderActive: '#d1d5db',

  // Typography
  textPrimary: '#111111',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  textInverse: '#ffffff',

  // Status & Emergency Accents
  sosRed: '#dc2626',
  sosRedGlow: 'rgba(220, 38, 38, 0.25)',
  triageRed: '#dc2626',       // Immediate
  triageYellow: '#d97706',    // Delayed
  triageGreen: '#16a34a',     // Minor
  triageBlack: '#4b5563',     // Expectant / Deceased

  // System states
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  info: '#2563eb',
  purple: '#9333ea',

  // Mesh telemetry
  meshActive: '#16a34a',
  meshSearching: '#2563eb',
  meshOffline: '#6b7280',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  hero: 32,
};

export const typography = {
  fontSizes: {
    caption: 11,
    small: 13,
    body: 15,
    subtitle: 17,
    title: 20,
    headline: 24,
    display: 32,
  },
  fontWeights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
};

export const layout = {
  minTouchSize: 48, // 48dp minimum for accessible touch targets
  borderRadiusSm: 8,
  borderRadiusMd: 12,
  borderRadiusLg: 16,
  borderRadiusFull: 9999,
};
