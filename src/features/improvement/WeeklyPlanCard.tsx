import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { SKILL_GROUPS, type SkillGroupKey } from '../../domain/constants';
import { limitedExposure } from '../../domain/improvement';
import { libraryPrefill } from '../../domain/library';
import { composePlan, gapsFrom, planSize, type PlanItem } from '../../domain/weeklyPlan';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { useData } from '../../state/DataProvider';
import { useGoal } from '../../state/GoalProvider';
import { useInsights } from '../../state/InsightsProvider';
import { useLibrary } from '../../state/LibraryProvider';
import { useUI } from '../../state/ui';

const isSkill = (k: unknown): k is SkillGroupKey => SKILL_GROUPS.some((g) => g.key === k);

/**
 * "This week's plan": a few casebook cases that mix what Bucket says to work on with the case types and industries you have done little or
 * none of. Plain code ranks them (src/domain/weeklyPlan.ts); nothing is asked of any model here, and only the case's name, book, type and
 * industry are shown. Sized by your weekly goal. Silent while loading, when there is nothing to suggest, when the casebook can't be reached,
 * and in demo mode.
 */
export function WeeklyPlanCard() {
  const library = useLibrary();
  const insights = useInsights();
  const { cases, data, mode } = useData();
  const { goal } = useGoal();
  const { openLogCase } = useUI();
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [hasRead, setHasRead] = useState(true);

  const gaps = useMemo(() => gapsFrom(limitedExposure(cases, data.customIndustries)), [cases, data.customIndustries]);
  const size = planSize(goal);
  const gapKey = gaps.map((g) => `${g.kind}:${g.name}:${g.once ? 1 : 0}`).join('|');

  useEffect(() => {
    if (!library || mode === 'demo') return;
    let live = true;
    (async () => {
      try {
        const read = insights ? await insights.saved().catch(() => null) : null;
        const focus = [...new Set((read?.insight.focus ?? []).map((f) => f.skill).filter(isSkill))].slice(0, 2);
        const types = gaps.filter((g) => g.kind === 'type').map((g) => g.name);
        const industries = gaps.filter((g) => g.kind === 'industry').map((g) => g.name);
        const [skillLists, gapCases] = await Promise.all([
          Promise.all(focus.map((s) => library.nextCases(s, 6))),
          types.length + industries.length > 0 ? library.gapCases(types, industries, 20) : Promise.resolve([]),
        ]);
        const skillCases = Object.fromEntries(focus.map((s, i) => [s, skillLists[i]]));
        if (!live) return;
        setHasRead(Boolean(read));
        setPlan(composePlan({ focus, skillCases, gapCases, gaps, size }));
      } catch {
        if (live) setPlan(null);
      }
    })();
    return () => {
      live = false;
    };
    // `gaps` is covered by gapKey; the cases themselves only matter through the gaps and what has been done.
  }, [library, insights, mode, gapKey, size, cases.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!library || mode === 'demo' || !plan || plan.length === 0) return null;

  return (
    <Card strip="teal" aria-labelledby="plan-title">
      <CardHeader
        titleId="plan-title"
        title="This week's plan"
        subtitle={`${plan.length} ${plan.length === 1 ? 'case' : 'cases'} to practise${goal ? `, to match your goal of ${goal} a week` : ''}: what Bucket says to work on, plus the case types and industries you haven't covered.`}
        icon={<CalendarCheck className="size-4" />}
      />
      <ol className="space-y-3">
        {plan.map(({ library: c, reasons }, i) => (
          <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                <span className="mr-2 text-muted">{i + 1}.</span>
                {c.name}
                {c.cochairPick && <span className="ml-2 rounded-full bg-lilac-soft px-1.5 py-0.5 text-[10px] font-bold text-lilac-ink">Co-chair pick</span>}
              </p>
              <p className="mt-0.5 text-xs text-muted">{c.detailsKnown ? `${c.book} · ${c.caseType} · ${c.industry}` : c.book}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {reasons.map((r) => (
                  <li key={r} className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-medium text-teal-ink">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="secondary" onClick={() => openLogCase(libraryPrefill(c))} aria-label={`Log ${c.name}`}>
              Log it
            </Button>
          </li>
        ))}
      </ol>
      {!hasRead && <p className="mt-3 text-xs text-muted">Ask Bucket to sort your feedback above and the plan will also target what to work on.</p>}
    </Card>
  );
}
