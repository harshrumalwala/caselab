import { Flame } from 'lucide-react';
import { groupBurnedCases, type BurnedCase } from '../../domain/community';

/**
 * "Has burned Cosentino and 4 cases", with the burned cases listed underneath, grouped by book. Shows nothing when there is
 * nothing to show. Burned cases are solo practice, so the note says they aren't counted in anyone's totals.
 */
export function BurnedLine({ books, cases, name }: { books: string[]; cases: BurnedCase[]; name: string }) {
  if (books.length === 0 && cases.length === 0) return null;
  return (
    <>
      <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-2">
        <Flame className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
        <span>
          Has burned{' '}
          {books.length > 0 && <strong className="font-semibold text-ink">{books.join(', ')}</strong>}
          {books.length > 0 && cases.length > 0 && ' and '}
          {cases.length > 0 && (
            <strong className="font-semibold text-ink">
              {cases.length} {cases.length === 1 ? 'case' : 'cases'}
            </strong>
          )}
        </span>
      </p>
      {cases.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-accent-text hover:underline">
            See the burned {cases.length === 1 ? 'case' : 'cases'}
          </summary>
          <div className="mt-2 space-y-2">
            {groupBurnedCases(cases).map(([book, items]) => (
              <div key={book || '(no book)'}>
                <p className="eyebrow">{book || 'No book'}</p>
                <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`Burned cases${book ? ` from ${book}` : ''}`}>
                  {items.map((c) => (
                    <li key={c.title} className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-ink-2">
                      {c.title}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Burned cases are solo practice. They are not counted in {name}'s totals.</p>
        </details>
      )}
    </>
  );
}
