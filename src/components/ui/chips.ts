/** Chip colours that take turns, chosen from the text so the same case type or name is always the same colour. */
export const CHIP_TONES = [
  'bg-sun-soft text-sun-ink',
  'bg-teal-soft text-teal-ink',
  'bg-coral-soft text-coral-ink',
  'bg-lilac-soft text-lilac-ink',
  'bg-sky-soft text-sky-ink',
] as const;

export const chipClass = (text: string): string => CHIP_TONES[[...text].reduce((n, ch) => n + ch.charCodeAt(0), 0) % CHIP_TONES.length];
