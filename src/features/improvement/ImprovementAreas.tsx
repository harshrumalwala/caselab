import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownRight,
  BookMarked,
  ChevronRight,
  Compass,
  Plus,
  Search,
  Target,
  X,
} from 'lucide-react';
import { CASE_TYPES, INDUSTRIES, SKILL_GROUPS, skillGroupLabel, type CaseType } from '../../domain/constants';
import { formatShortDate } from '../../domain/dates';
import { limitedExposure, skillsToImprove, MIN_CASES_FOR_SKILL_INSIGHTS } from '../../domain/improvement';
import {
  ALL,
  conceptsFromCases,
  filterConcepts,
  groupConceptsByIndustry,
  type KnowledgeFilter,
} from '../../domain/knowledge';
import { round1 } from '../../domain/stats';
import type { OpportunityItem } from '../../domain/types';
import { Badge, RatingBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { TONE, type Tone } from '../../components/ui/tones';
import { describeError } from '../../data/errors';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';
import { useUI } from '../../state/ui';
import { WarmupLink } from '../warmup/WarmupLink';

// ---------------------------------------------------------------------------------------

function ExposureGroup({
  title,
  hint,
  tone,
  items,
  emptyText,
  onPick,
}: {
  title: string;
  hint: string;
  tone: Tone;
  items: { name: string; note?: string }[];
  emptyText: string;
  onPick: (name: string) => void;
}) {
  const t = TONE[tone];
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`size-2 rounded-full ${t.dot}`} aria-hidden />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="num text-xs text-muted">{items.length}</span>
      </div>
      <p className="mb-3 text-xs text-muted">{hint}</p>
      {items.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.name}>
              <button
                type="button"
                onClick={() => onPick(item.name)}
                title={item.note ? `Seen once: ${item.note}. Click to log another.` : 'Click to log a case'}
                className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:shadow-sm ${t.soft} ${t.text} ${t.border}`}
              >
                {item.name}
                <Plus className="size-3 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManualList({
  title,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  title: string;
  placeholder: string;
  items: OpportunityItem[];
  onAdd: (text: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // Waits for the database; on failure the text stays in the box and the error is shown.
  const run = async (action: () => Promise<void>, failure: string, onDone?: () => void) => {
    setBusy(true);
    try {
      await action();
      onDone?.();
    } catch (e) {
      toast({ kind: 'error', title: failure, body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    void run(() => onAdd(text), 'Not saved', () => setText(''));
  };
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-2 text-sm text-ink">
              <span className="min-w-0 break-words">{o.text}</span>
              <button
                type="button"
                onClick={() => void run(() => onRemove(o.id), 'Not removed')}
                disabled={busy}
                aria-label={`Remove "${o.text}"`}
                className="shrink-0 rounded-lg p-1 text-muted transition hover:bg-surface hover:text-bad-text disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          className="field !py-2"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={title}
        />
        <Button type="submit" disabled={!text.trim() || busy}>
          <Plus className="size-4" /> Add
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------------------

export function ImprovementAreas() {
  const { cases, data, addOpportunity, removeOpportunity } = useData();
  const { openLogCase, viewCase } = useUI();
  const customs = data.customIndustries;
  const total = cases.length;

  const exposure = useMemo(() => limitedExposure(cases, customs), [cases, customs]);
  const priorities = useMemo(() => skillsToImprove(cases), [cases]);
  const concepts = useMemo(() => conceptsFromCases(cases, customs), [cases, customs]);

  const themes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cases) if (c.improvementArea) counts.set(c.improvementArea, (counts.get(c.improvementArea) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [cases]);

  const [filter, setFilter] = useState<KnowledgeFilter>({ industry: ALL, caseType: ALL, query: '' });
  const industriesWithConcepts = useMemo(
    () => [...new Set(concepts.map((c) => c.industry))].sort((a, b) => a.localeCompare(b)),
    [concepts],
  );
  const visibleConcepts = useMemo(() => filterConcepts(concepts, filter), [concepts, filter]);
  const groups = useMemo(() => groupConceptsByIndustry(visibleConcepts), [visibleConcepts]);

  const neutral = total === 0;
  const exposureOf = (tone: Tone): Tone => (neutral ? 'neutral' : tone);

  const opps = (kind: OpportunityItem['kind']) => data.opportunities.filter((o) => o.kind === kind);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Improvement Areas</h1>
        <p className="text-sm text-ink-2">Where your practice is thin, what to sharpen, and what you've learned so far. Think of it as honest friends with a spreadsheet.</p>
      </div>

      {/* ---- A. Limited exposure ------------------------------------------------------- */}
      <Card strip="coral" aria-labelledby="exposure-title">
        <CardHeader
          titleId="exposure-title"
          title="Areas with limited exposure"
          subtitle="Click any item to log a case in it. “Not practiced” and “practiced once” are different things (one is a gap, the other is a rumour)."
          icon={<Compass className="size-4" />}
        />
        <div className="grid gap-7 md:grid-cols-2">
          <ExposureGroup
            title="Case types not practiced"
            hint="Uncharted territory"
            tone={exposureOf('bad')}
            items={exposure.caseTypesNone.map((name) => ({ name }))}
            emptyText="Every main case type has at least one case."
            onPick={(name) => openLogCase({ caseType: name as CaseType })}
          />
          <ExposureGroup
            title="Case types practiced once"
            hint="Some exposure, one more case would help it stick"
            tone="warn"
            items={exposure.caseTypesOnce.map((e) => ({ name: e.name, note: e.caseTitle }))}
            emptyText={total === 0 ? 'Nothing yet.' : 'No case type sits at exactly one case.'}
            onPick={(name) => openLogCase({ caseType: name as CaseType })}
          />
          <ExposureGroup
            title="Industries not practiced"
            hint="Unexplored, not a weakness"
            tone="neutral"
            items={exposure.industriesNone.map((name) => ({ name }))}
            emptyText="You've seen every listed industry."
            onPick={(name) => openLogCase({ industry: name })}
          />
          <ExposureGroup
            title="Industries practiced once"
            hint="One case so far"
            tone="warn"
            items={exposure.industriesOnce.map((e) => ({ name: e.name, note: e.caseTitle }))}
            emptyText={total === 0 ? 'Nothing yet.' : 'No industry sits at exactly one case.'}
            onPick={(name) => openLogCase({ industry: name })}
          />
        </div>
        <p className="mt-5 text-xs text-muted">
          “Other” is a catch-all, so it is never listed as a gap. Case types: {CASE_TYPES.length - 1} main types.
          Industries: {INDUSTRIES.length - 1} listed plus any custom ones you add.
        </p>
        <ManualList
          title="Cases and concepts I want to explore"
          placeholder="e.g. Pricing cases, private equity due diligence"
          items={opps('exposure')}
          onAdd={(text) => addOpportunity('exposure', text)}
          onRemove={removeOpportunity}
        />
      </Card>

      {/* ---- B. Skills to improve ------------------------------------------------------ */}
      <Card strip="lilac" aria-labelledby="skills-improve-title">
        <CardHeader
          titleId="skills-improve-title"
          title="Skills to improve"
          subtitle="Ranked from your recent ratings, declines and the improvement tags you chose. Gentle, mostly."
          icon={<Target className="size-4" />}
        />

        {total < MIN_CASES_FOR_SKILL_INSIGHTS ? (
          <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
            Skill insights appear after {MIN_CASES_FOR_SKILL_INSIGHTS} logged cases
            {total > 0 ? ` (${total} so far)` : ''}, so one rough case doesn't get to define you.
          </p>
        ) : priorities.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
            No skill is flagged right now: your rated skills average 3.5 or higher, none is declining, and none has been
            tagged repeatedly.
          </p>
        ) : (
          <ol className="space-y-3">
            {priorities.map((p, i) => (
              <li key={p.key} className="flex gap-4 rounded-2xl border border-line p-4">
                <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-text">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">{p.label}</h3>
                    <div className="flex items-center gap-2">
                      {p.trend === 'declining' && (
                        <Badge tone="bad">
                          <ArrowDownRight className="size-3" /> declining
                        </Badge>
                      )}
                      <RatingBadge value={p.windowAverage === null ? null : round1(p.windowAverage)} />
                    </div>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-sm text-ink-2">
                    {p.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  {p.key === 'quant' && <WarmupLink className="mt-2.5" />}
                </div>
              </li>
            ))}
          </ol>
        )}

        {themes.length > 0 && (
          <div className="mt-5">
            <p className="eyebrow mb-2">Improvement themes you've tagged</p>
            <ul className="flex flex-wrap gap-2">
              {themes.map(([key, n]) => (
                <li key={key}>
                  <Badge tone="accent">
                    {skillGroupLabel(key as (typeof SKILL_GROUPS)[number]['key'])}
                    <span className="num font-semibold">×{n}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ManualList
          title="Skills I want to work on"
          placeholder="e.g. Faster mental math, cleaner synthesis"
          items={opps('skill')}
          onAdd={(text) => addOpportunity('skill', text)}
          onRemove={removeOpportunity}
        />
      </Card>

      {/* ---- C. Knowledge & learning history ------------------------------------------- */}
      <Card strip="teal" aria-labelledby="knowledge-title">
        <CardHeader
          titleId="knowledge-title"
          title="Knowledge and learning history"
          subtitle="Everything you noted under “Concepts I learned”, grouped by industry. Your future cheat sheet."
          icon={<BookMarked className="size-4" />}
        />

        {concepts.length === 0 ? (
          <EmptyState title="No concepts recorded yet" compact>
            Add what you learn in the “Concepts I learned” box when logging a case, one per line (for example, “Load
            factor” after an airline case). They collect here automatically, like a very organised friend.
          </EmptyState>
        ) : (
          <>
            <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_12rem_12rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  className="field !py-2 !pl-10"
                  type="search"
                  placeholder="Search concepts"
                  aria-label="Search concepts"
                  value={filter.query}
                  onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
                />
              </div>
              <select
                className="field !py-2"
                aria-label="Filter concepts by industry"
                value={filter.industry}
                onChange={(e) => setFilter((f) => ({ ...f, industry: e.target.value }))}
              >
                <option value={ALL}>All industries</option>
                {industriesWithConcepts.map((i) => (
                  <option key={i || 'none'} value={i}>
                    {i || 'Not specified'}
                  </option>
                ))}
              </select>
              <select
                className="field !py-2"
                aria-label="Filter concepts by case type"
                value={filter.caseType}
                onChange={(e) => setFilter((f) => ({ ...f, caseType: e.target.value }))}
              >
                <option value={ALL}>All case types</option>
                {CASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {groups.length === 0 ? (
              <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
                No concepts match those filters.
              </p>
            ) : (
              <div className="space-y-6">
                {groups.map((g) => (
                  <section key={g.industry || 'none'} aria-label={g.label}>
                    <h3 className="mb-2.5 flex items-baseline gap-2 text-sm font-semibold text-ink">
                      {g.label}
                      <span className="num text-xs font-normal text-muted">{g.concepts.length}</span>
                    </h3>
                    <ul className="divide-y divide-line rounded-2xl border border-line">
                      {g.concepts.map((c) => (
                        <li key={c.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                          <span className="text-sm text-ink">{c.text}</span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            {c.sources.slice(-2).map((s, i) => (
                              <span key={s.caseId} className="inline-flex items-center gap-1">
                                {i > 0 && <span aria-hidden>·</span>}
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-0.5 hover:text-accent-text hover:underline"
                                  onClick={() => viewCase(s.caseId)}
                                >
                                  {s.caseTitle || 'Untitled case'}
                                  <span className="num opacity-70">({formatShortDate(s.date)})</span>
                                  <ChevronRight className="size-3 opacity-60" />
                                </button>
                              </span>
                            ))}
                            {c.sources.length > 2 && <span>+{c.sources.length - 2} more</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
