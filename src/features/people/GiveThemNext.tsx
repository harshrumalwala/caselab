import { useMemo } from 'react';
import { Compass } from 'lucide-react';
import type { Profile, SharedCase } from '../../domain/community';
import { whatToGiveNext } from '../../domain/giveNext';
import { Card, CardHeader } from '../../components/ui/Card';

/** How many names to print before falling back to "+ n more": a list to read, not a spreadsheet. */
const NAMED = 3;

const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Chips({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, NAMED);
  const rest = names.length - shown.length;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <ul className="flex flex-wrap gap-1.5" aria-label={label}>
        {shown.map((n) => (
          <li key={n} className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-sm text-ink">
            {n}
          </li>
        ))}
        {rest > 0 && <li className="px-1 py-0.5 text-sm text-muted">+ {rest} more</li>}
      </ul>
    </div>
  );
}

/** One side of the suggestion: case types, or industries. */
function Lane({ title, unseen, once, allCovered }: { title: string; unseen: string[]; once: string[]; allCovered: string }) {
  return (
    <div className="space-y-3" role="group" aria-label={title}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {unseen.length === 0 && once.length === 0 ? (
        <p className="text-sm text-ink-2">{allCovered}</p>
      ) : (
        <>
          <Chips label="Nothing shared yet" names={unseen} />
          <Chips label="Shared once" names={once} />
        </>
      )}
    </div>
  );
}

/**
 * "What to give them next" for someone holding this member's profile link. A visitor has no log of their own,
 * so they can't be shown the overlap answer members get; this is built only from the rows the link already
 * hands out, and it stays quiet when those rows can't support it.
 */
export function GiveThemNext({ person, shared }: { person: Profile; shared: SharedCase[] }) {
  const ideas = useMemo(() => whatToGiveNext(shared), [shared]);
  const name = first(person.displayName);

  // Nothing shared, nothing to say.
  if (ideas.total === 0) return null;

  return (
    <Card strip="lilac" aria-labelledby="give-next-title">
      <CardHeader
        titleId="give-next-title"
        title={`What to give ${name} next`}
        subtitle={`From the ${plural(ideas.total, 'case')} ${name} shares.`}
        icon={<Compass className="size-4" />}
      />

      {ideas.enough ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <Lane
            title="Case types"
            unseen={ideas.unseenTypes}
            once={ideas.onceTypes}
            allCovered={`${name} has shared at least two of every case type we list. Pick by industry instead.`}
          />
          <Lane
            title="Industries"
            unseen={ideas.unseenIndustries}
            once={ideas.onceIndustries}
            allCovered={`${name} has shared at least two cases in every industry we list. Anything goes.`}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">Only {plural(ideas.total, 'case')} shared so far. Here's what's in them.</p>
          <Chips label="Case types" names={ideas.coveredTypes.map((c) => c.name)} />
          <Chips label="Industries" names={ideas.coveredIndustries.map((c) => c.name)} />
        </div>
      )}
    </Card>
  );
}
