import { Building2, Layers } from 'lucide-react';
import type { CaseTypeCount, IndustryCount } from '../../domain/stats';
import { Card, CardHeader } from '../../components/ui/Card';
import { GrowBar } from '../../components/ui/Motion';
import { TONE, type Tone } from '../../components/ui/tones';

const EXPOSURE: Record<CaseTypeCount['exposure'], { tone: Tone; label: string }> = {
  none: { tone: 'bad', label: 'Not practiced' },
  once: { tone: 'warn', label: 'Practiced once' },
  multiple: { tone: 'good', label: 'Practiced multiple times' },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function CaseTypeCoverage({ counts, total }: { counts: CaseTypeCount[]; total: number }) {
  const covered = counts.filter((c) => c.count > 0).length;
  const once = counts.filter((c) => c.exposure === 'once').length;
  const multiple = counts.filter((c) => c.exposure === 'multiple').length;
  // With zero cases everything is "not practiced"; don't paint the whole grid red.
  const neutral = total === 0;

  return (
    <Card aria-labelledby="types-title">
      <CardHeader
        titleId="types-title"
        title="Case type coverage"
        subtitle={`${covered} of ${counts.length} types practiced · ${multiple} more than once · ${once} once`}
        icon={<Layers className="size-4" />}
      />

      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Cases practiced per type">
        {counts.map((c) => {
          // "Other" is a catch-all, so an empty one is never flagged; and with zero cases overall
          // nothing is painted red.
          const quiet = neutral || (c.caseType === 'Other' && c.count === 0);
          const tone: Tone = quiet ? 'neutral' : EXPOSURE[c.exposure].tone;
          const t = TONE[tone];
          return (
            <li
              key={c.caseType}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${t.soft} ${t.border}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug text-ink">{c.caseType}</p>
                <p className={`text-xs ${t.text}`}>{EXPOSURE[c.exposure].label}</p>
              </div>
              <span className="num shrink-0 text-sm font-semibold text-ink">{plural(c.count, 'case', 'cases')}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-muted">Exposure, not mastery: it counts how often you've seen a case type.</p>
    </Card>
  );
}

export function IndustryCoverage({ counts }: { counts: IndustryCount[] }) {
  const practiced = counts.filter((c) => c.count > 0).length;
  const max = Math.max(1, ...counts.map((c) => c.count));

  return (
    <Card aria-labelledby="industries-title">
      <CardHeader
        titleId="industries-title"
        title="Industry coverage"
        subtitle={`${practiced} ${practiced === 1 ? 'industry' : 'industries'} practiced`}
        icon={<Building2 className="size-4" />}
      />
      <ul className="space-y-2.5" aria-label="Cases practiced per industry">
        {counts.map((c) => (
          <li key={c.industry} className="grid grid-cols-[minmax(0,10.5rem)_1fr_auto] items-center gap-3 sm:grid-cols-[13rem_1fr_auto]">
            <span className={`truncate text-sm ${c.count ? 'font-medium text-ink' : 'text-muted'}`} title={c.industry}>
              {c.industry}
            </span>
            <div className="h-2 rounded-full bg-track" aria-hidden>
              {c.count > 0 && (
                <GrowBar className="h-full rounded-full bg-accent" pct={Math.max(6, (c.count / max) * 100)} />
              )}
            </div>
            <span className={`num w-6 text-right text-sm ${c.count ? 'font-semibold text-ink' : 'text-muted'}`}>
              {c.count || '–'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">
        An industry with no cases is simply unexplored, not a weakness. Custom industries appear here automatically.
      </p>
    </Card>
  );
}
