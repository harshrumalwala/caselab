// @vitest-environment node
//
// Contrast between the design tokens, read straight from index.css so a colour change can't quietly make text hard to read.
// WCAG AA asks for 4.5:1 for normal text. (A browser scan with axe-core found the same pairs; this keeps them fixed.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

function tokens(block: RegExp): Record<string, string> {
  const body = block.exec(css)?.[1] ?? '';
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
}

const light = tokens(/:root\s*\{([\s\S]*?)\n\}/);
const dark = { ...light, ...tokens(/\n\.dark\s*\{([\s\S]*?)\n\}/) };

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const PLAIN = ['bg', 'surface', 'surface-2'];
const TEXT_ON_PLAIN = ['ink', 'ink-2', 'muted', 'accent-text'];
const SCORE_TEXT = [
  ['good-text', 'good-soft'],
  ['warn-text', 'warn-soft'],
  ['bad-text', 'bad-soft'],
] as const;
const STICKERS = ['sun', 'teal', 'coral', 'lilac', 'sky'];

describe.each([
  ['light', light],
  ['dark', dark],
])('contrast in %s mode', (_name, t) => {
  it('reads the tokens it needs', () => {
    for (const k of [...PLAIN, ...TEXT_ON_PLAIN, 'good-text', 'warn-text', 'bad-text', 'sun-ink', 'teal-ink']) expect(t[k], k).toBeDefined();
  });

  it('keeps body text readable on the page and cards', () => {
    for (const fg of TEXT_ON_PLAIN) for (const bg of PLAIN) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps good, needs-work and warning words readable on the page, cards and their own tint', () => {
    for (const [fg, soft] of SCORE_TEXT) {
      for (const bg of [...PLAIN, soft]) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps text readable on every sticker tint', () => {
    for (const name of STICKERS) {
      expect(contrast(t[`${name}-ink`], t[`${name}-soft`]), `${name}-ink on ${name}-soft`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the white-on-colour and dark-on-yellow buttons readable', () => {
    expect(contrast(t['accent-ink'], t.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['on-sun'], t.sun)).toBeGreaterThanOrEqual(4.5);
  });
});
