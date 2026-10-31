import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Compass, Flame, Info } from 'lucide-react';
import type { Profile, SharedCase } from '../../domain/community';
import {
  distinctValues,
  matchesFilter,
  NO_FILTER,
  pairCases,
  type CaseFilter,
  type Gap,
} from '../../domain/pairing';
import type { CaseRecord } from '../../domain/types';
import { Badge } from '../../components/ui/Badge';
import { chipClass } from '../../components/ui/chips';
import { Card, CardHeader } from '../../components/ui/Card';
import { CaseFilterBar } from '../community/CaseFilterBar';
import { SharedCaseRow } from '../community/SharedCaseRow';

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

function MyCaseRow({ c, note }: { c: CaseRecord; note?: string }) {
  return (
    <li className="sticker p-4">
      <p className="font-display text-lg font-bold text-ink">{c.title}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className={`rounded-full px-2.5 py-0.5 font-bold ${chipClass(c.caseType)}`}>{c.caseType}</span>
        {[c.industry, c.source].filter(Boolean).join(' · ')}
      </p>
      {note && <p className="mt-2 text-xs text-warn">{note}</p>}
    </li>
  );
}

function GapList({
  title,
  gaps,
  onPick,
  activeName,
}: {
  title: string;
  gaps: Gap[];
  onPick: (name: string) => void;
  activeName: string;
}) {
  // The thinnest areas first; keep it short.
  const shown = gaps.filter((g) => g.theirCount <= 1).slice(0, 6);
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-ink">{title}</h4>
      {shown.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-sm text-muted">No obvious gaps in what they've shared.</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((g) => (
            <li key={g.name}>
              <button
                type="button"
                onClick={() => onPick(activeName === g.name ? 'all' : g.name)}
                aria-pressed={activeName === g.name}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
                  activeName === g.name ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{g.name}</span>
                  <span className="block text-xs text-muted">
                    {g.theirCount === 0 ? 'None shared' : `${g.theirCount} shared`}
                  </span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${g.offerable ? 'text-good' : 'text-muted'}`}>
                  {g.offerable ? `${g.offerable} from you` : 'none from you'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * "Find a case for them": built only from my own cases and the cases this member chose to share.
 * It never claims a case is definitely new to them, because it can't know what they keep private.
 */
export function FindCase({ person, theirs, mine }: { person: Profile; theirs: SharedCase[]; mine: CaseRecord[] }) {
  const name = first(person.displayName);
  const [filter, setFilter] = useState<CaseFilter>(NO_FILTER);

  const pairing = useMemo(() => pairCases(mine, theirs, person.burnedBooks, person.burnedCases), [mine, theirs, person.burnedBooks, person.burnedCases]);
  const industries = useMemo(() => distinctValues([...mine, ...theirs], 'industry'), [mine, theirs]);
  const sources = useMemo(() => distinctValues([...mine, ...theirs], 'source'), [mine, theirs]);

  const offer = pairing.newToThem.filter((c) => matchesFilter(c, filter));
  const maybe = pairing.mayOverlap.filter((m) => matchesFilter(m.mine, filter));
  const done = pairing.theyHaveDone.filter((t) => matchesFilter(t.shared, filter));

  const sharesNothing = theirs.length === 0;

  return (
    <div className="space-y-5">
      <div
        className={`flex gap-3 rounded-2xl border px-4 py-3.5 text-sm ${
          sharesNothing ? 'border-warn/40 bg-warn-soft' : 'border-line bg-surface-2/60'
        }`}
        role="note"
      >
        {sharesNothing ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /> : <Info className="mt-0.5 size-4 shrink-0 text-muted" />}
        <p className="leading-relaxed text-ink-2">
          {sharesNothing ? (
            <>
              <strong className="font-semibold text-ink">{name} hasn't shared any case history</strong>, so there's no way to
              tell what they've already done. Everything below is just your own cases. Ask {name} before using one.
            </>
          ) : (
            <>
              This only uses what <strong className="font-semibold text-ink">{name} has chosen to share</strong>. Cases they keep
              private or haven't logged don't appear, so a case listed as new to them <em>may not be</em>. A quick check
              before you start avoids repeats.
            </>
          )}
        </p>
      </div>

      {person.burnedBooks.length === 0 && person.burnedCases.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-line bg-surface-2/60 px-4 py-3.5 text-sm" role="note">
          <Flame className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
          <p className="leading-relaxed text-ink-2">
            <strong className="font-semibold text-ink">
              {name} has burned {person.burnedCases.length} {person.burnedCases.length === 1 ? 'case' : 'cases'} on their own.
            </strong>{' '}
            {pairing.burnedCaseExcluded.length > 0
              ? `${pairing.burnedCaseExcluded.length === 1 ? '1 of your cases is' : `${pairing.burnedCaseExcluded.length} of your cases are`} left out below.`
              : 'None of yours are among them.'}
          </p>
        </div>
      )}

      {person.burnedBooks.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-line bg-surface-2/60 px-4 py-3.5 text-sm" role="note">
          <Flame className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
          <p className="leading-relaxed text-ink-2">
            <strong className="font-semibold text-ink">{name} has burned {person.burnedBooks.join(', ')}.</strong>{' '}
            {pairing.burnedExcluded.length > 0
              ? `${pairing.burnedExcluded.length === 1 ? '1 of your cases' : `${pairing.burnedExcluded.length} of your cases`} from ${
                  person.burnedBooks.length === 1 ? 'that book is' : 'those books are'
                } left out below.`
              : 'None of your cases come from those books.'}
            {person.burnedCases.length > 0 && (
              <>
                {' '}
                {name} has also burned {person.burnedCases.length} {person.burnedCases.length === 1 ? 'case' : 'cases'} on their own
                {pairing.burnedCaseExcluded.length > 0
                  ? `, and ${pairing.burnedCaseExcluded.length === 1 ? '1 more of yours is' : `${pairing.burnedCaseExcluded.length} more of yours are`} left out.`
                  : '.'}
              </>
            )}
          </p>
        </div>
      )}

      <CaseFilterBar value={filter} onChange={setFilter} industries={industries} sources={sources} />

      <Card aria-labelledby="offer-title">
        <CardHeader
          titleId="offer-title"
          title={`Cases you've done that ${name} hasn't shared`}
          subtitle="Good candidates to give them: you already know where the traps are."
          icon={<Compass className="size-4" />}
        />
        {offer.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
            {pairing.newToThem.length === 0
              ? 'Every case in your log appears to be in their shared history (or looks very similar).'
              : 'No cases match those filters.'}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {offer.map((c) => (
              <MyCaseRow key={c.id} c={c} />
            ))}
          </ul>
        )}

        {maybe.length > 0 && (
          <div className="mt-6 border-t border-line pt-5">
            <h4 className="text-sm font-semibold text-ink">Might overlap: check first</h4>
            <p className="mb-3 text-xs text-muted">Similar to something they've shared, but not an exact match.</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {maybe.map((m) => (
                <MyCaseRow key={m.mine.id} c={m.mine} note={`Looks similar to "${m.theirTitle}" in their history.`} />
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card aria-labelledby="gaps-title">
        <CardHeader
          titleId="gaps-title"
          title="Where their shared history is thin"
          subtitle="Tap one to show only your cases of that kind above."
          icon={<ArrowRight className="size-4" />}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <GapList
            title="Case types"
            gaps={pairing.caseTypeGaps}
            activeName={filter.caseType}
            onPick={(n) => setFilter({ ...filter, caseType: n })}
          />
          <GapList
            title="Industries"
            gaps={pairing.industryGaps}
            activeName={filter.industry}
            onPick={(n) => setFilter({ ...filter, industry: n })}
          />
        </div>
        <p className="mt-4 text-xs text-muted">Counts reflect only the cases {name} has shared.</p>
      </Card>

      <Card aria-labelledby="done-title">
        <CardHeader
          titleId="done-title"
          title={`Cases ${name} has shared`}
          subtitle="Please do not repeat these. They remember."
          icon={<Check className="size-4" />}
        />
        {done.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
            {theirs.length === 0 ? 'Nothing shared yet.' : 'No cases match those filters.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {done.map((t) => (
              <SharedCaseRow
                key={t.shared.caseId}
                shared={t.shared}
                extra={
                  t.mine ? (
                    <Badge tone={t.mine.match === 'same' ? 'accent' : 'warn'}>
                      {t.mine.match === 'same' ? "You've done this one too" : `Similar to your "${t.mine.title}"`}
                    </Badge>
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
