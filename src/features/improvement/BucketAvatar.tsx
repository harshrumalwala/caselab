/**
 * Bucket, the coach: a cheerful teal bucket with a face. "Bucket" is consulting for a group in a structure (the MECE buckets), and
 * Bucket's job is to sort what you wrote into two of them: what you are good at, and what to work on. Drawn in the app's sticker style
 * (thick ink outline, flat fills), so it follows the theme in light and dark.
 */
export function BucketAvatar({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22C15 3 49 3 49 22" className="stroke-ink" strokeWidth="3" />
      <path d="M11 22H53L47.5 55C47 59 45 60 41 60H23C19 60 17 59 16.5 55Z" className="fill-teal stroke-ink" strokeWidth="3" />
      <rect x="8" y="17" width="48" height="9" rx="4" className="fill-sun stroke-ink" strokeWidth="3" />
      <circle cx="26" cy="39" r="3" className="fill-ink" />
      <circle cx="38" cy="39" r="3" className="fill-ink" />
      <path d="M26 47Q32 53 38 47" className="stroke-ink" strokeWidth="3" />
      <path d="M52 8l1.8 4.2L58 14l-4.2 1.8L52 20l-1.8-4.2L46 14l4.2-1.8Z" className="fill-sun stroke-ink" strokeWidth="2" />
    </svg>
  );
}
