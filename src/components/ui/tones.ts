import { DEVELOPING_AT, STRONG_AT } from '../../domain/constants';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'accent';

/** Full class names are spelled out so Tailwind can see them. */
export const TONE: Record<Tone, { text: string; soft: string; solid: string; border: string; dot: string }> = {
  good: { text: 'text-good-text', soft: 'bg-good-soft', solid: 'bg-good', border: 'border-good/30', dot: 'bg-good' },
  warn: { text: 'text-warn-text', soft: 'bg-warn-soft', solid: 'bg-warn', border: 'border-warn/35', dot: 'bg-warn' },
  bad: { text: 'text-bad-text', soft: 'bg-bad-soft', solid: 'bg-bad', border: 'border-bad/30', dot: 'bg-bad' },
  neutral: { text: 'text-muted', soft: 'bg-surface-2', solid: 'bg-bar', border: 'border-line', dot: 'bg-bar' },
  accent: { text: 'text-accent-text', soft: 'bg-accent-soft', solid: 'bg-accent', border: 'border-accent/25', dot: 'bg-accent' },
};

/** Strength / developing / needs-attention bands for a 1-5 score. */
export function scoreTone(value: number | null): Tone {
  if (value === null) return 'neutral';
  if (value >= STRONG_AT) return 'good';
  if (value >= DEVELOPING_AT) return 'warn';
  return 'bad';
}
