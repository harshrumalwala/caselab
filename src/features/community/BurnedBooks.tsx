import { useState, type FormEvent } from 'react';
import { Flame, Plus, X } from 'lucide-react';
import { MAX_BOOK_NAME, MAX_BURNED_BOOKS, normalizeBurnedBooks } from '../../domain/community';
import { Button } from '../../components/ui/Button';

interface Props {
  books: string[];
  /** Casebook names from your own cases, offered as you type. */
  suggestions: string[];
  disabled?: boolean;
  onChange: (books: string[]) => void;
}

/**
 * Casebooks you have already burned (worked through, for example solo). Members picking a case for you skip them.
 * Only members who can see your profile can see this list; it is never shown to visitors without an account.
 */
export function BurnedBooks({ books, suggestions, disabled = false, onChange }: Props) {
  const [text, setText] = useState('');
  const full = books.length >= MAX_BURNED_BOOKS;
  const offered = suggestions.filter((s) => !books.some((b) => b.toLowerCase() === s.toLowerCase()));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const next = normalizeBurnedBooks([...books, text]);
    setText('');
    if (next.length !== books.length) onChange(next);
  };

  return (
    <section aria-labelledby="burned-title" className="space-y-3">
      <div>
        <h3 id="burned-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Flame className="size-4 text-accent-text" aria-hidden /> Books I've burned
        </h3>
        <p className="mt-1 text-xs text-muted">
          Casebooks you've already worked through, for example on your own. Members choosing a case for you will skip these books.
          Only members who can see your profile can see this list.
        </p>
      </div>

      {books.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Burned books">
          {books.map((book) => (
            <li key={book} className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-sm text-ink">
              {book}
              <button
                type="button"
                aria-label={`Remove ${book}`}
                disabled={disabled}
                onClick={() => onChange(books.filter((b) => b !== book))}
                className="flex size-6 items-center justify-center rounded-full text-muted transition hover:bg-line hover:text-ink disabled:opacity-50"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          aria-label="Add a burned book"
          className="field"
          list="burned-book-options"
          value={text}
          maxLength={MAX_BOOK_NAME}
          disabled={disabled || full}
          onChange={(e) => setText(e.target.value)}
          placeholder={full ? `You can list up to ${MAX_BURNED_BOOKS} books` : 'e.g. Cosentino, Case in Point'}
          autoComplete="off"
        />
        <datalist id="burned-book-options">
          {offered.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Button type="submit" disabled={disabled || full || text.trim() === ''}>
          <Plus className="size-4" /> Add
        </Button>
      </form>
    </section>
  );
}
