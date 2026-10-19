import type { ReactNode } from 'react';
import { TONE, scoreTone, type Tone } from './tones';

export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${t.soft} ${t.text} ${t.border} ${className}`}
    >
      {children}
    </span>
  );
}

/** A 1-5 rating as a coloured pill; null renders as a quiet dash (never as 0). */
export function RatingBadge({ value, className = '' }: { value: number | null; className?: string }) {
  if (value === null) {
    return (
      <span className={`text-sm text-muted ${className}`} aria-label="Not rated">
        –
      </span>
    );
  }
  const t = TONE[scoreTone(value)];
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return (
    <span
      className={`num inline-flex min-w-8 items-center justify-center rounded-lg px-2 py-0.5 text-sm font-semibold ${t.soft} ${t.text} ${className}`}
      aria-label={`Rated ${shown} out of 5`}
    >
      {shown}
    </span>
  );
}
