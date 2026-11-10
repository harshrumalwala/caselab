import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Star, X } from 'lucide-react';
import { libraryLabel, type LibraryCase } from '../../domain/library';
import { useLibrary } from '../../state/LibraryProvider';

const MIN_CHARS = 2;
const WAIT_MS = 200;

/**
 * The case title, which suggests casebook cases as you type it. Pick one and the title, the book (as the source), the case type and
 * the industry fill themselves in, and the form remembers which casebook case it was. Only what any member may know about a case is
 * shown (never anything about the case itself). Suggestions are a convenience: they can fail or find nothing without a word, and a
 * title that is not in any book is typed exactly as before.
 */
export function CaseTitleInput({
  id,
  value,
  onChange,
  onPick,
  linked,
  onClear,
  suggest,
  invalid,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  onPick: (c: LibraryCase) => void;
  linked: LibraryCase | null;
  onClear: () => void;
  /** False when editing a case or in demo mode: just a plain title box. */
  suggest: boolean;
  invalid: boolean;
  autoFocus: boolean;
}) {
  const library = useLibrary();
  const [results, setResults] = useState<LibraryCase[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // -1: nothing chosen yet, so Enter never picks by surprise
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const picked = useRef<string | null>(null); // the title a pick just wrote, so it doesn't suggest itself again
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;

  // Look a moment after you stop typing; an answer that arrives after a newer question is ignored.
  useEffect(() => {
    const q = value.trim();
    const off = !suggest || !library || q.length < MIN_CHARS || q === picked.current;
    if (off) {
      latest.current += 1;
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      library.search(q).then(
        (found) => {
          if (ticket !== latest.current) return;
          setResults(found);
          setActive(-1);
          setBusy(false);
        },
        () => {
          if (ticket !== latest.current) return;
          setResults([]);
          setBusy(false);
        },
      );
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [library, suggest, value]);

  const pick = (c: LibraryCase) => {
    picked.current = c.name.trim();
    onPick(c);
    setResults([]);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!suggest || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === 'Enter' && open && active >= 0 && results[active]) {
      e.preventDefault(); // a suggestion was chosen with the arrows: take it, don't submit the form
      pick(results[active]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation(); // close the list, not the whole dialog
      setOpen(false);
    }
  };

  const showList = suggest && open && !busy && results.length > 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          id={id}
          role={suggest ? 'combobox' : undefined}
          aria-expanded={suggest ? showList : undefined}
          aria-controls={suggest ? listId : undefined}
          aria-autocomplete={suggest ? 'list' : undefined}
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          maxLength={200}
          className="field"
          value={value}
          onChange={(e) => {
            picked.current = null;
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="e.g. Regional airline profitability, or start typing a casebook case"
          aria-invalid={invalid}
          data-autofocus={autoFocus ? '' : undefined}
          autoComplete="off"
        />
        {suggest && busy && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-label="Looking in the casebooks" />}
        {suggest && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Casebook cases"
            hidden={!showList}
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border-2 border-ink/80 bg-surface p-1 shadow-[2px_3px_0_0_rgb(28_26_24/0.85)]"
          >
            <li role="presentation" className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              From the casebooks: pick one to fill in the rest
            </li>
            {results.map((c, i) => (
              <li
                key={c.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: the input would lose focus (and close the list) before a click landed
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer rounded-lg px-3 py-2 ${i === active ? 'bg-lilac-soft' : ''}`}
              >
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="text-sm font-semibold text-ink">{c.name}</span>
                  {c.cochairPick && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sun-soft px-1.5 py-0.5 text-[10px] font-bold text-sun-ink">
                      <Star className="size-3" aria-hidden /> Co-chair pick
                    </span>
                  )}
                </span>
                <span className="block text-xs text-ink-2">
                  {c.book} · {c.caseType} · {c.industry}
                </span>
                {c.alsoIn.length > 0 && <span className="block text-[11px] text-muted">Also in {c.alsoIn.join(', ')}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {linked && (
        <p className="inline-flex max-w-full items-center gap-2 rounded-full border-2 border-ink/80 bg-lilac-soft py-1 pl-3 pr-1.5 text-xs font-semibold text-lilac-ink">
          <span className="truncate">Filled in from {libraryLabel(linked)}</span>
          <button
            type="button"
            onClick={onClear}
            aria-label="Remove the link to the casebook case"
            className="flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-surface"
          >
            <X className="size-3" aria-hidden />
          </button>
        </p>
      )}
    </div>
  );
}
