import type { ReactNode } from 'react';

/** Hand-drawn-looking scenery. Everything here is decoration: hidden from screen readers and drawn from the colour tokens. */

/** A four-point sparkle. */
export function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 1c1 7 4 10 11 11-7 1-10 4-11 11-1-7-4-10-11-11 7-1 10-4 11-11Z" fill="currentColor" />
    </svg>
  );
}

/** A wobbly underline to sit under a word. */
export function Squiggle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 12" preserveAspectRatio="none" className={className} aria-hidden>
      <path d="M2 7c8-8 14 6 22 0s14-6 22 0 14 6 22 0 14-6 22 0 14 6 24 0" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** A little note that looks stuck on, tilted and bobbing. */
export function Sticky({
  children,
  tone = 'sun',
  tilt = -4,
  className = '',
}: {
  children: ReactNode;
  tone?: 'sun' | 'teal' | 'coral' | 'lilac' | 'sky';
  tilt?: number;
  className?: string;
}) {
  const tones = {
    sun: 'bg-sun-soft text-sun-ink',
    teal: 'bg-teal-soft text-teal-ink',
    coral: 'bg-coral-soft text-coral-ink',
    lilac: 'bg-lilac-soft text-lilac-ink',
    sky: 'bg-sky-soft text-sky-ink',
  } as const;
  return (
    <div
      aria-hidden
      className={`sticker animate-bob px-3.5 py-2 text-sm font-semibold motion-reduce:animate-none ${tones[tone]} ${className}`}
      style={{ ['--tilt' as string]: `${tilt}deg`, transform: `rotate(${tilt}deg)` }}
    >
      {children}
    </div>
  );
}

/**
 * The hero picture: a whiteboard with a chart heading the right way, a coffee, a light bulb, a pencil and a sticky note.
 * Drawn with plain shapes so it needs no image files and follows light and dark mode.
 */
export function HeroScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 400" className={className} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* soft colour blobs behind everything */}
      <path d="M70 120C40 40 200 10 300 40c120 30 160 140 130 230-30 90-170 120-270 80C60 310 100 200 70 120Z" className="fill-sun-soft" />
      <path d="M300 60c60-30 150 20 150 110 0 70-60 120-120 110-70-10-70-90-40-140 10-40 0-60 10-80Z" className="fill-lilac-soft" opacity=".9" />
      <path d="M40 250c-20 40 20 110 90 120 50 7 70-30 40-60-30-30-100 20-130-60Z" className="fill-teal-soft" />

      {/* whiteboard */}
      <rect x="70" y="72" width="300" height="214" rx="18" className="fill-surface stroke-ink" strokeWidth="4" />
      <rect x="116" y="290" width="208" height="12" rx="6" className="fill-ink" />
      <path d="M110 108q10-14 20 0t20 0 20 0 20 0" className="stroke-ink-2" strokeWidth="3" opacity=".55" />
      <path d="M262 108h72" className="stroke-line-strong" strokeWidth="3" />
      {/* chart */}
      <path d="M110 254H338M110 254V128" className="stroke-ink-2" strokeWidth="3.5" />
      <path d="M110 226H338M110 198H338" className="stroke-line-strong" strokeWidth="1.5" strokeDasharray="3 7" />
      <rect x="128" y="206" width="36" height="48" rx="7" className="fill-teal" />
      <rect x="178" y="180" width="36" height="74" rx="7" className="fill-sun" />
      <rect x="228" y="152" width="36" height="102" rx="7" className="fill-coral" />
      <rect x="278" y="128" width="36" height="126" rx="7" className="fill-lilac" />
      {/* the line that goes up and to the right */}
      <path d="M122 190C190 188 240 150 318 98" className="stroke-accent" strokeWidth="5" strokeDasharray="1 11" />
      <path d="M300 94l24-3-5 24" className="stroke-accent" strokeWidth="5" />

      {/* coffee */}
      <path d="M356 262h68v46a22 22 0 0 1-22 22h-24a22 22 0 0 1-22-22Z" className="fill-coral stroke-ink" strokeWidth="4" />
      <path d="M424 276h10a14 14 0 0 1 0 28h-10" className="stroke-ink" strokeWidth="4" />
      <path d="M374 244q-8-12 0-22t0-20M394 244q-8-12 0-22t0-20" className="stroke-ink-2" strokeWidth="3.5" opacity=".6" />
      <path d="M370 282h40" className="stroke-white" strokeWidth="3" opacity=".7" />

      {/* sticky note */}
      <g transform="rotate(9 410 100)">
        <rect x="366" y="48" width="92" height="92" rx="6" className="fill-sun stroke-ink" strokeWidth="4" />
        <path d="M382 78h58M382 96h44M382 114h30" className="stroke-ink" strokeWidth="3.5" opacity=".7" />
      </g>

      {/* light bulb */}
      <g transform="translate(40 40)">
        <circle cx="26" cy="26" r="20" className="fill-sun-soft stroke-ink" strokeWidth="4" />
        <path d="M18 50h16M20 58h12" className="stroke-ink" strokeWidth="4" />
        <path d="M26 -8v-10M-2 4l-8-6M54 4l8-6M-10 26h-10M62 26h10" className="stroke-sun" strokeWidth="4" />
      </g>

      {/* pencil */}
      <g transform="rotate(-24 150 350)">
        <rect x="60" y="340" width="150" height="20" rx="4" className="fill-sun stroke-ink" strokeWidth="4" />
        <path d="M210 340l34 10-34 10Z" className="fill-surface stroke-ink" strokeWidth="4" />
        <rect x="60" y="340" width="22" height="20" rx="4" className="fill-coral stroke-ink" strokeWidth="4" />
      </g>

      {/* sparkles */}
      <path d="M440 20c1 7 6 12 13 13-7 1-12 6-13 13-1-7-6-12-13-13 7-1 12-6 13-13Z" className="fill-coral" />
      <path d="M20 190c1 5 4 8 9 9-5 1-8 4-9 9-1-5-4-8-9-9 5-1 8-4 9-9Z" className="fill-lilac" />
      <path d="M230 30c1 5 4 8 9 9-5 1-8 4-9 9-1-5-4-8-9-9 5-1 8-4 9-9Z" className="fill-teal" />
    </svg>
  );
}
