/** Hex values for SVG charts (CSS variables don't resolve reliably inside every SVG attribute). */
export function chartColors(isDark: boolean) {
  return isDark
    ? {
        accent: '#ea8f8f',
        accentFill: 'rgba(234,143,143,0.14)',
        line: '#9d968e',
        grid: '#2d2a27',
        axis: '#9d968e',
        surface: '#1b1a18',
        ink: '#f4f2ef',
      }
    : {
        accent: '#800000',
        accentFill: 'rgba(128,0,0,0.08)',
        line: '#8b857d',
        grid: '#ebe8e3',
        axis: '#8b857d',
        surface: '#ffffff',
        ink: '#1c1a18',
      };
}
