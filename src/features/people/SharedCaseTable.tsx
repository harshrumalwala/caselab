import { Fragment, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SharedCase } from '../../domain/community';
import { formatDate } from '../../domain/dates';
import { nextSharedSort, type SharedSort, type SharedSortKey } from '../../domain/pairing';
import { RatingBadge } from '../../components/ui/Badge';
import { chipClass } from '../../components/ui/chips';
import { CaseSkillBadges, CaseWrittenDetail, hasSkillDetail, hasWrittenDetail } from '../community/sharedCaseDetail';

interface Props {
  rows: SharedCase[];
  sort: SharedSort | null;
  onSort: (next: SharedSort) => void;
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/** A heading you can order the table by. The arrow turns to point the way the column is running. */
function SortHeader({ label, column, sort, onSort, className = '' }: { label: string; column: SharedSortKey } & Omit<Props, 'rows'> & { className?: string }) {
  const on = sort?.key === column;
  return (
    <th scope="col" aria-sort={on ? ARIA_SORT[sort.dir] : 'none'} className={`px-3 py-3 ${className}`}>
      <button type="button" onClick={() => onSort(nextSharedSort(sort, column))} className="inline-flex items-center gap-1 hover:text-accent-text">
        {label}
        <ChevronDown className={`size-3.5 transition ${on ? (sort.dir === 'asc' ? 'rotate-180' : '') : 'opacity-30'}`} aria-hidden />
      </button>
    </th>
  );
}

/**
 * Someone's shared case history as a table, which is the shape the reading is: a visitor picking a case to
 * give them compares type, industry and score down a column. One line per case, with the per-skill scores,
 * their "Working on" tag and anything they wrote behind the row's own control, where they are one click from
 * the comparison without crowding it.
 *
 * Used above `lg` only, where the page is a single full-width column; narrower than that, and in the member's
 * view, the cards of `SharedCaseRow` are still the list.
 */
export function SharedCaseTable({ rows, sort, onSort }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="sticker overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="border-b-2 border-ink/80 bg-sun-soft text-xs font-bold text-ink-2">
          <tr>
            <SortHeader label="Date" column="date" sort={sort} onSort={onSort} className="w-32" />
            <th scope="col" className="px-3 py-3">
              Case
            </th>
            <th scope="col" className="px-3 py-3">
              Type
            </th>
            <th scope="col" className="px-3 py-3">
              Industry
            </th>
            <SortHeader label="Overall" column="overall" sort={sort} onSort={onSort} className="w-24" />
            <th scope="col" className="w-10 px-3 py-3">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((s) => {
            const more = hasSkillDetail(s) || hasWrittenDetail(s);
            const expanded = Boolean(open[s.caseId]);
            const under = [s.source, s.partner && `Cased by ${s.partner}`].filter(Boolean).join(' · ');
            return (
              <Fragment key={s.caseId}>
                <tr className={expanded ? 'bg-sun-soft/40' : 'transition hover:bg-sun-soft/60'}>
                  <td className="num whitespace-nowrap px-3 py-2 align-top text-xs text-ink-2">{formatDate(s.date)}</td>
                  <td className="px-3 py-2 align-top">
                    <span className="font-display font-bold leading-snug text-ink">{s.title}</span>
                    {under && <span className="block text-xs text-muted">{under}</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${chipClass(s.caseType)}`}>{s.caseType}</span>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-ink-2">{s.industry || <span className="text-muted">–</span>}</td>
                  <td className="px-3 py-2 align-top">
                    <RatingBadge value={s.overall} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    {more && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={`Details for ${s.title}`}
                        onClick={() => setOpen((o) => ({ ...o, [s.caseId]: !expanded }))}
                        className="rounded-lg p-1 text-accent-text hover:bg-surface-2"
                      >
                        <ChevronDown className={`size-4 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
                {more && expanded && (
                  <tr className="bg-sun-soft/40">
                    <td colSpan={6} className="px-3 pb-4 pt-0">
                      <CaseSkillBadges shared={s} className="mb-3" />
                      {hasWrittenDetail(s) && <CaseWrittenDetail shared={s} />}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
