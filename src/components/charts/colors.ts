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

/**
 * The bars on a profile: how much of an area someone has cased, and the scores they share. The theme's own
 * teal, yellow and lilac, with the track behind every bar so an area with nothing in it still has a row.
 * Hex for the same reason as above, and read by the legend beside the chart as well as by the chart.
 */
export function barColors(isDark: boolean) {
  return isDark
    ? {
        multiple: '#2ec4ae',
        once: '#ffc83d',
        none: '#3d3935',
        score: '#a28cff',
        track: '#2b2825',
      }
    : {
        multiple: '#0f9d8a',
        once: '#ffb800',
        none: '#d9d5ce',
        score: '#7c5cff',
        track: '#ece9e4',
      };
}
