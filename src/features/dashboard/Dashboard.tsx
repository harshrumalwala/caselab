import { useMemo } from 'react';
import { FileSpreadsheet, FlaskConical, Gauge, Layers, Lightbulb, Plus, Upload } from 'lucide-react';
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
import { HeroScene } from '../../components/ui/Doodles';
import { QuipCard } from '../../components/ui/Quip';
import { useData } from '../../state/DataProvider';
import { useUI } from '../../state/ui';
import { useNow } from '../../state/useToday';
import { useGame } from '../../state/game';
import { LevelChip } from '../progress/LevelChip';
import { progressFor } from '../../domain/progress';
import { TodayStrip } from './TodayStrip';
import { CaseTypeCoverage, IndustryCoverage } from './Coverage';
import { CoverageMatrix } from './CoverageMatrix';
import { NeedsYou } from './NeedsYou';
import { NextFocus } from './NextFocus';
import { OverallTrend } from './OverallTrend';
import { Overview } from './Overview';
import { Milestones, ProgressOverTime } from './Progress';
import { SkillsPerformance } from './SkillsPerformance';
import { WeeklyPractice } from './WeeklyPractice';

export function Dashboard() {
  const { cases, data, enterDemo, mode } = useData();
  const { openLogCase, openImport } = useUI();
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
  const { enabled: gameOn } = useGame();
  const progress = useMemo(() => progressFor(cases), [cases]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Dashboard</h1>
            {total > 0 && gameOn && <LevelChip progress={progress} />}
          </div>
          <p className="text-sm text-ink-2">
            {total === 0
              ? 'Your prep command center. It is a little empty in here, which is fine. Log a case and it fills up.'
              : `${total} ${total === 1 ? 'case' : 'cases'} logged. Here is how you are really doing.`}
          </p>
        </div>
        <QuipCard className="sm:max-w-xs" />
      </div>

      {/* Real requests and messages have no place beside demo data. */}
      {mode !== 'demo' && <NeedsYou />}

      {total === 0 && (
        <Card strip="sun" className="relative">
          <div className="grid items-center gap-6 md:grid-cols-[1.2fr_1fr]">
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Your case prep starts here</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              After each practice case, spend about a minute logging it: a title, case type, industry and a rating. Your
              dashboard builds itself from there. Nothing on this page is made up, so every number comes from cases you
              log. (Think of it as a gym log for your brain.)
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button variant="primary" size="lg" onClick={() => openLogCase()}>
                <Plus className="size-4" /> Log your first case
              </Button>
              <Button size="lg" onClick={() => void enterDemo()}>
                <FlaskConical className="size-4" /> Explore with demo data
              </Button>
            </div>
          </div>
          <HeroScene className="hidden w-full max-w-xs justify-self-center md:block" />
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Gauge, title: 'Skills', text: 'Averages for each MCG skill, ignoring anything you did not rate.', tone: 'bg-sun-soft text-sun-ink' },
              { icon: Layers, title: 'Coverage', text: 'Which case types and industries you have and have not seen.', tone: 'bg-teal-soft text-teal-ink' },
              { icon: Lightbulb, title: 'Next focus', text: 'Specific suggestions drawn from your own history.', tone: 'bg-coral-soft text-coral-ink' },
            ].map(({ icon: Icon, title, text, tone }) => (
              <li key={title} className={`rounded-xl border-2 border-ink/80 p-4 ${tone}`}>
                <Icon className="size-4" />
                <p className="mt-2 font-display text-sm font-bold">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed opacity-90">{text}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {total === 0 && (
        <section aria-label="Import from Excel" className="sticker relative flex flex-col gap-4 overflow-hidden bg-teal-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex size-12 shrink-0 -rotate-3 items-center justify-center rounded-2xl border-2 border-ink/80 bg-teal text-on-color shadow-[2px_3px_0_0_rgb(28_26_24/0.85)]">
              <FileSpreadsheet className="size-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-extrabold leading-snug tracking-tight text-teal-ink sm:text-2xl">Already logging cases in Excel?</h2>
              <p className="mt-1 text-sm leading-relaxed text-teal-ink/90">
                Bring the whole log across in one step: cases, ratings, feedback and your lists. You see everything first, and nothing is saved until you say so.
              </p>
            </div>
          </div>
          <Button size="lg" className="shrink-0 self-start sm:self-center" onClick={openImport} data-tour="import">
            <Upload className="size-4" /> Import your Excel case log
          </Button>
        </section>
      )}

      {total > 0 && <TodayStrip cases={cases} now={now} next={view.suggestions[0]} />}


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
