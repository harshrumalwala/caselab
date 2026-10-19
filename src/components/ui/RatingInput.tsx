import { RATINGS, RATING_LABELS, type Rating } from '../../domain/constants';
import { TONE, scoreTone } from './tones';

interface Props {
  value: Rating | null;
  onChange: (value: Rating | null) => void;
  /** Accessible name of the whole control, e.g. "Framework". */
  label: string;
  size?: 'sm' | 'lg';
  /** Show the meaning of the chosen rating next to the buttons. */
  showMeaning?: boolean;
}

/** Five tappable buttons. Tapping the selected one again clears it, since ratings are optional. */
export function RatingInput({ value, onChange, label, size = 'sm', showMeaning = false }: Props) {
  const dims = size === 'lg' ? 'size-11 text-base sm:size-12' : 'size-9 text-sm';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5">
        {RATINGS.map((n) => {
          const selected = value === n;
          const tone = TONE[scoreTone(n)];
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label}: ${n}, ${RATING_LABELS[n]}`}
              title={`${n} · ${RATING_LABELS[n]}${selected ? ' (click to clear)' : ''}`}
              onClick={() => onChange(selected ? null : n)}
              className={`num ${dims} rounded-xl border font-semibold transition active:scale-95 ${
                selected
                  ? `${tone.solid} border-transparent text-white shadow-sm`
                  : 'border-line-strong bg-surface text-ink-2 hover:border-muted hover:bg-surface-2'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      {showMeaning && (
        <span className="min-h-5 text-sm text-muted" aria-live="polite">
          {value ? RATING_LABELS[value] : 'Not rated'}
        </span>
      )}
    </div>
  );
}
