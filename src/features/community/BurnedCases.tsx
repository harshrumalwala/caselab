import { useMemo, useState, type FormEvent } from 'react';
import { Flame, Plus, X } from 'lucide-react';
import { MAX_BOOK_NAME, MAX_BURNED_CASES, normalizeBurnedCases, parseBurnedTitles, type BurnedCase } from '../../domain/community';
import { Button } from '../../components/ui/Button';

interface Props {
  cases: BurnedCase[];
  /** Casebook names you already use, offered as you type. */
  suggestions: string[];
  disabled?: boolean;
  onChange: (cases: BurnedCase[]) => void;
}

/**
 * Cases you worked through on your own. They are NOT practice cases: they never appear in your Case Log or count in any
 * total, rating or coverage. Members picking a case for you just skip these exact cases.
 */
export function BurnedCases({ cases, suggestions, disabled = false, onChange }: Props) {
  const [book, setBook] = useState('');
  const [text, setText] = useState('');
  const titles = parseBurnedTitles(text);
  const full = cases.length >= MAX_BURNED_CASES;

  const grouped = useMemo(() => {
    const byBook = new Map<string, BurnedCase[]>();
    for (const c of cases) byBook.set(c.book, [...(byBook.get(c.book) ?? []), c]);
    return [...byBook.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [cases]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (titles.length === 0) return;
    const next = normalizeBurnedCases([...cases, ...titles.map((title) => ({ title, book }))]);
    setText('');
    if (next.length !== cases.length) onChange(next);
  };

  return (
    <section aria-labelledby="burned-cases-title" className="space-y-3">
      <div>
        <h3 id="burned-cases-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Flame className="size-4 text-accent-text" aria-hidden /> Cases I've burned
        </h3>
        <p className="mt-1 text-xs text-muted">
          Solo cases you've already worked through. These are just for you: they don't go in your Case Log and don't count as practice.
          Members choosing a case for you skip them. Only members who can see your profile can see this list.
        </p>
      </div>

      <form onSubmit={add} className="space-y-2">
        <input
          aria-label="Book for these cases"
          className="field"
          list="burned-case-books"
          value={book}
          maxLength={MAX_BOOK_NAME}
          disabled={disabled}
          onChange={(e) => setBook(e.target.value)}
          placeholder="Book (optional), e.g. Cosentino"
          autoComplete="off"
        />
        <datalist id="burned-case-books">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <textarea
          aria-label="Case titles, one per line"
          className="field min-h-24"
          value={text}
          disabled={disabled || full}
          onChange={(e) => setText(e.target.value)}
          placeholder={full ? `You can list up to ${MAX_BURNED_CASES} cases` : 'Paste the case titles, one per line'}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted" aria-live="polite">
            {titles.length === 0 ? 'Paste or type one title per line.' : `${titles.length} ${titles.length === 1 ? 'case' : 'cases'} ready to add.`}
          </p>
          <Button type="submit" disabled={disabled || full || titles.length === 0}>
            <Plus className="size-4" /> Burn {titles.length > 1 ? `${titles.length} cases` : 'case'}
          </Button>
        </div>
      </form>

      {cases.length > 0 && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <p className="text-xs font-semibold text-ink-2">
            {cases.length} {cases.length === 1 ? 'case' : 'cases'} burned
          </p>
          {grouped.map(([name, items]) => (
            <div key={name || '(no book)'}>
              <p className="eyebrow">{name || 'No book'}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`Burned cases${name ? ` from ${name}` : ''}`}>
                {items.map((c) => (
                  <li key={`${c.book}|${c.title}`} className="flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-0.5 text-sm text-ink">
                    {c.title}
                    <button
                      type="button"
                      aria-label={`Remove ${c.title}`}
                      disabled={disabled}
                      onClick={() => onChange(cases.filter((x) => x !== c))}
                      className="flex size-5 items-center justify-center rounded-full text-muted transition hover:bg-line hover:text-ink disabled:opacity-50"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
