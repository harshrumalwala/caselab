import {
  ArrowRight,
  Building2,
  Layers,
  Lightbulb,
  Repeat,
  StickyNote,
  Target,
  TrendingDown,
  Shuffle,
  type LucideIcon,
} from 'lucide-react';
import { MIN_CASES_FOR_TRENDS, needsWarmup, type Suggestion, type SuggestionKind } from '../../domain/suggestions';
import { WarmupLink } from '../warmup/WarmupLink';
import { Card, CardHeader } from '../../components/ui/Card';
import { useUI } from '../../state/ui';

const KIND_ICON: Record<SuggestionKind, LucideIcon> = {
  skill: Target,
  decline: TrendingDown,
  concentration: Shuffle,
  caseType: Layers,
  industry: Building2,
  feedback: StickyNote,
  repeat: Repeat,
};

export function NextFocus({ suggestions, total }: { suggestions: Suggestion[]; total: number }) {
  const { openLogCase } = useUI();

  return (
    <Card strip="coral" aria-labelledby="next-title">
      <CardHeader
        titleId="next-title"
        title="What should I work on next?"
        subtitle="Based only on the cases you've logged. No crystal ball involved."
        icon={<Lightbulb className="size-4" />}
      />

      {total === 0 ? (
        <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
          Log a case and suggestions based on your coverage and feedback will appear here.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
          You've covered every case type and industry at least once. New suggestions will appear as patterns emerge in
          your ratings.
        </p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => {
            const Icon = KIND_ICON[s.kind];
            return (
              <li key={s.id} className="flex gap-3 rounded-xl border border-line bg-surface-2/50 p-3.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-ink">{s.text}</p>
                  {needsWarmup(s) && <WarmupLink className="mt-2" />}
                  {s.action && (
                    <button
                      type="button"
                      onClick={() => openLogCase({ caseType: s.action?.caseType, industry: s.action?.industry })}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline"
                    >
                      {s.action.label} <ArrowRight className="size-3" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > 0 && total < MIN_CASES_FOR_TRENDS && (
        <p className="mt-4 text-xs text-muted">
          Suggestions rely on coverage and your own notes until you have {MIN_CASES_FOR_TRENDS} cases ({total} so far);
          skill trends need more data to be reliable.
        </p>
      )}
    </Card>
  );
}
