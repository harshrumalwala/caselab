import { useMemo } from 'react';
import { quipOfTheDay } from '../../domain/quips';

/** Today's piece of case-interview humour, on a tilted sticky note. Marked up as a figure so it reads as an aside. */
export function QuipCard({ className = '' }: { className?: string }) {
  const quip = useMemo(() => quipOfTheDay(), []);
  return (
    <figure className={`sticker rotate-[1deg] bg-sun-soft px-4 py-3 ${className}`}>
      <blockquote className="font-display text-sm font-bold leading-snug text-ink">{quip.text}</blockquote>
      <figcaption className="mt-1 text-xs text-ink-2">{quip.by}</figcaption>
    </figure>
  );
}
