export type BucketMood = 'happy' | 'thinking' | 'hint' | 'cheer' | 'worried';

/**
 * Bucket, the coach: a cheerful teal bucket with a face. "Bucket" is consulting for a group in a structure (the MECE buckets), and
 * Bucket's job is to sort what you wrote into two of them: what you are good at, and what to work on. Drawn in the app's sticker style
 * (thick ink outline, flat fills), so it follows the theme in light and dark. In a live case Bucket shows how the moment feels: quietly
 * thinking while you think, a light bulb when giving a hint, cheering at the end, and a little worried when the clock runs low.
 */
export function BucketAvatar({ className = '', mood = 'happy' }: { className?: string; mood?: BucketMood }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22C15 3 49 3 49 22" className="stroke-ink" strokeWidth="3" />
      <path d="M11 22H53L47.5 55C47 59 45 60 41 60H23C19 60 17 59 16.5 55Z" className="fill-teal stroke-ink" strokeWidth="3" />
      <rect x="8" y="17" width="48" height="9" rx="4" className="fill-sun stroke-ink" strokeWidth="3" />

      {mood === 'thinking' ? (
        <>
          <circle cx="28" cy="37" r="3" className="fill-ink" />
          <circle cx="40" cy="37" r="3" className="fill-ink" />
          <path d="M27 49H37" className="stroke-ink" strokeWidth="3" />
          <circle cx="54" cy="12" r="2" className="fill-surface stroke-ink" strokeWidth="1.5" />
          <circle cx="58" cy="6" r="3" className="fill-surface stroke-ink" strokeWidth="1.5" />
        </>
      ) : mood === 'cheer' ? (
        <>
          <path d="M22 41Q26 35 30 41" className="stroke-ink" strokeWidth="3" />
          <path d="M34 41Q38 35 42 41" className="stroke-ink" strokeWidth="3" />
          <path d="M25 46Q32 58 39 46Z" className="fill-ink stroke-ink" strokeWidth="2" />
          <path d="M52 8l1.8 4.2L58 14l-4.2 1.8L52 20l-1.8-4.2L46 14l4.2-1.8Z" className="fill-sun stroke-ink" strokeWidth="2" />
          <path d="M8 6l1.4 3.2L12.6 10.6 9.4 12 8 15.2 6.6 12 3.4 10.6 6.6 9.2Z" className="fill-coral stroke-ink" strokeWidth="1.5" />
        </>
      ) : mood === 'worried' ? (
        <>
          <circle cx="26" cy="40" r="3" className="fill-ink" />
          <circle cx="38" cy="40" r="3" className="fill-ink" />
          <path d="M21 33L29 35.5M43 33L35 35.5" className="stroke-ink" strokeWidth="2.5" />
          <path d="M26 51Q29 47.5 32 51T38 51" className="stroke-ink" strokeWidth="3" />
          <path d="M53 28q3.5 5 0 7.5q-3.5-2.5 0-7.5Z" className="fill-sky stroke-ink" strokeWidth="1.5" />
        </>
      ) : (
        <>
          <circle cx="26" cy="39" r="3" className="fill-ink" />
          <circle cx="38" cy="39" r="3" className="fill-ink" />
          <path d="M26 47Q32 53 38 47" className="stroke-ink" strokeWidth="3" />
          {mood === 'hint' ? (
            <>
              <circle cx="54" cy="11" r="5" className="fill-sun stroke-ink" strokeWidth="2" />
              <path d="M52 17h4M54 3V1M62 11h2M46 11h-2" className="stroke-ink" strokeWidth="2" />
            </>
          ) : (
            <path d="M52 8l1.8 4.2L58 14l-4.2 1.8L52 20l-1.8-4.2L46 14l4.2-1.8Z" className="fill-sun stroke-ink" strokeWidth="2" />
          )}
        </>
      )}
    </svg>
  );
}
