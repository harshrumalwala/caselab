import { useMemo } from 'react';
import { FlaskConical, Gauge, Layers, Lightbulb, Plus, Upload } from 'lucide-react';
import { milestones } from '../../domain/milestones';
import { nextPracticeFocus } from '../../domain/suggestions';
import {
  caseTypeCounts,
  coverageMatrix,
  industryCounts,
  overallTrend,
  overview,
  skillStats,
  weeklyHistory,
} from '../../domain/stats';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useData } from '../../state/DataProvider';
import { useUI } from '../../state/ui';
import { useNow } from '../../state/useToday';
import { CaseTypeCoverage, IndustryCoverage } from './Coverage';
import { CoverageMatrix } from './CoverageMatrix';
import { NextFocus } from './NextFocus';
import { OverallTrend } from './OverallTrend';
import { Overview } from './Overview';
import { Milestones, ProgressOverTime } from './Progress';
import { SkillsPerformance } from './SkillsPerformance';
import { WeeklyPractice } from './WeeklyPractice';

export function Dashboard() {
  const { cases, data, enterDemo } = useData();
  const { openLogCase, openSettings } = useUI();
  const now = useNow();
  const customs = data.customIndustries;

  const view = useMemo(
    () => ({
      overview: overview(cases, now),
      skills: skillStats(cases),
      trend: overallTrend(cases),
      weeks: weeklyHistory(cases, now, 8),
      types: caseTypeCounts(cases),
      industries: industryCounts(cases, customs),
      matrix: coverageMatrix(cases, customs),
      suggestions: nextPracticeFocus(cases),
      achieved: milestones(cases),
    }),
    [cases, customs, now],
  );

  const total = cases.length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted">
          {total === 0
            ? 'Your preparation command center. It fills in as you log cases.'
            : `${total} ${total === 1 ? 'case' : 'cases'} logged. Here is where you stand.`}
        </p>
      </div>

      {total === 0 && (
        <Card className="relative overflow-hidden">
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Your case prep starts here</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              After each practice case, spend about a minute logging it: a title, case type, industry and a rating. Your
              dashboard builds itself from there. Nothing on this page is made up, so every number comes from cases you
              log.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button variant="primary" size="lg" onClick={() => openLogCase()}>
                <Plus className="size-4" /> Log your first case
              </Button>
              <Button size="lg" onClick={() => void enterDemo()}>
                <FlaskConical className="size-4" /> Explore with demo data
              </Button>
              <Button size="lg" variant="ghost" onClick={openSettings}>
                <Upload className="size-4" /> Import a backup or MCG log
              </Button>
            </div>
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Gauge, title: 'Skills', text: 'Averages for each MCG skill, ignoring anything you did not rate.' },
              { icon: Layers, title: 'Coverage', text: 'Which case types and industries you have and have not seen.' },
              { icon: Lightbulb, title: 'Next focus', text: 'Specific suggestions drawn from your own history.' },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-xl border border-line bg-surface-2/60 p-4">
                <Icon className="size-4 text-accent-text" />
                <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Overview stats={view.overview} cases={cases} now={now} />

      {total > 0 && (
        <>
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <SkillsPerformance stats={view.skills} total={total} />
            </div>
            <div className="lg:col-span-5">
              <NextFocus suggestions={view.suggestions} total={total} />
            </div>
          </div>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <OverallTrend points={view.trend} />
            </div>
            <div className="lg:col-span-5">
              <WeeklyPractice weeks={view.weeks} total={total} />
            </div>
          </div>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <CaseTypeCoverage counts={view.types} total={total} />
            <IndustryCoverage counts={view.industries} />
          </div>

          <CoverageMatrix matrix={view.matrix} total={total} />

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <ProgressOverTime stats={view.skills} />
            <Milestones achieved={view.achieved} total={total} />
          </div>
        </>
      )}
    </div>
  );
}
