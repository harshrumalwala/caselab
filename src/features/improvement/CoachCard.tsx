import { useEffect, useMemo, useState } from 'react';
import { Loader2, ThumbsUp, Wrench } from 'lucide-react';
import { skillGroupLabel } from '../../domain/constants';
import { formatDate } from '../../domain/dates';
import type { CaseRecord } from '../../domain/types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ALL_CASES_CAP, MIN_CASES, RECENT_CASES, type CoachRead, type FeedbackScope } from '../../data/feedbackInsights';
import { describeError } from '../../data/errors';
import type { LibraryCase } from '../../domain/library';
import { useData } from '../../state/DataProvider';
import { useInsights } from '../../state/InsightsProvider';
import { useLibrary } from '../../state/LibraryProvider';
import { BucketAvatar } from './BucketAvatar';

/** Whether a case has any writing for the coach to read: feedback, notes, what was learned, or feedback on a single skill. */
export function hasWriting(c: CaseRecord): boolean {
  const texts = [c.overallFeedback, c.wentWell, c.struggled, c.concepts, c.nextFocus, ...Object.values(c.skills).map((s) => s.feedback)];
  return texts.some((t) => t.trim() !== '');
}

const SCOPES: { value: FeedbackScope; label: string }[] = [
  { value: 'recent', label: `Last ${RECENT_CASES} cases` },
  { value: 'all', label: `All cases (latest ${ALL_CASES_CAP})` },
];

/**
 * A few casebook cases that exercise the skill Bucket says to work on and that you have not done. Only the case's name, book, type and
 * industry are shown (the same as the title suggestions); why it fits is only the skill you were told to work on. Silent when there are
 * none or the lookup fails.
 */
function TryNext({ skill }: { skill: string }) {
  const library = useLibrary();
  const { cases } = useData();
  const [found, setFound] = useState<LibraryCase[]>([]);
  const logged = cases.length; // a case you log now drops out of the list
  useEffect(() => {
    if (!library) return;
    let live = true;
    library.nextCases(skill, 3).then(
      (list) => live && setFound(list),
      () => live && setFound([]),
    );
    return () => {
      live = false;
    };
  }, [library, skill, logged]);
  if (found.length === 0) return null;
  return (
    <div className="mt-2 border-t border-ink/10 pt-2">
      <p className="text-xs font-semibold text-ink-2">Cases to try for this</p>
      <ul className="mt-1 space-y-1">
        {found.map((c) => (
          <li key={c.id} className="text-sm text-ink">
            <span className="font-semibold">{c.name}</span>
            {c.cochairPick && <span className="ml-1.5 rounded-full bg-lilac-soft px-1.5 py-0.5 text-[10px] font-bold text-lilac-ink">Co-chair pick</span>}
            <span className="block text-xs text-muted">{c.detailsKnown ? `${c.book} · ${c.caseType} · ${c.industry}` : c.book}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const minutes = (seconds: number) => (seconds < 90 ? 'a minute' : `${Math.ceil(seconds / 60)} minutes`);

/**
 * Bucket, the coach: reads the feedback and notes you wrote on your own cases and says, briefly, where you are strong and what to work on.
 * Nothing is read until you ask, only your own writing is used (never case titles, partner names or your other notes), and the answer is
 * kept so looking at it again costs nothing. The copy leads with what you get; how it works is in the README.
 */
export function CoachCard() {
  const insights = useInsights();
  const { cases, mode } = useData();
  const [read, setRead] = useState<CoachRead | null>(null);
  const [scope, setScope] = useState<FeedbackScope>('recent');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const written = useMemo(() => cases.filter(hasWriting).length, [cases]);
  const enough = written >= MIN_CASES;

  useEffect(() => {
    if (!insights || mode === 'demo') return;
    let live = true;
    insights.saved().then(
      (saved) => {
        if (!live) return;
        setRead(saved);
        if (saved) setScope(saved.scope);
        setLoaded(true);
      },
      () => live && setLoaded(true), // a hiccup just means no stored read is shown
    );
    return () => {
      live = false;
    };
  }, [insights, mode]);

  // Sample data has no account behind it to read from or store to.
  if (!insights || mode === 'demo') return null;

  const ask = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await insights.analyze(scope);
      switch (result.status) {
        case 'ok':
          setRead(result.read);
          break;
        case 'not_enough':
          setNotice(`Bucket needs written feedback on at least ${result.needed} cases, and ${result.caseCount === 0 ? 'none have' : `only ${result.caseCount} ${result.caseCount === 1 ? 'has' : 'have'}`} any yet.`);
          break;
        case 'too_soon':
          setNotice(`Bucket just sorted your notes. Try again in ${minutes(result.retryInSeconds)}.`);
          break;
        case 'unavailable':
          setNotice("Bucket isn't available yet.");
          break;
        default:
          setNotice("Bucket couldn't sort that just now. Nothing was changed, so try again in a moment.");
      }
    } catch (e) {
      setNotice(`Couldn't reach Bucket. ${describeError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const newer = read ? cases.some((c) => c.updatedAt > read.updatedAt) : false;

  return (
    <Card strip="lilac" aria-labelledby="coach-title">
      <div className="mb-5 flex items-start gap-3.5">
        <BucketAvatar className="size-14 shrink-0 -rotate-3" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id="coach-title" className="text-lg font-bold tracking-tight text-ink">
              Bucket
            </h2>
            <span className="rounded-full border-2 border-ink/80 bg-lilac-soft px-1.5 py-0.5 text-[10px] font-bold leading-none text-lilac-ink">AI</span>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Your case coach. Sorts the feedback you've written into what you're good at and what to fix next.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Which cases for Bucket to sort" className="inline-flex rounded-full border-2 border-ink/80 bg-surface p-0.5">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={scope === s.value}
              disabled={busy}
              onClick={() => setScope(s.value)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${scope === s.value ? 'bg-lilac text-on-color' : 'text-ink-2 hover:bg-lilac-soft'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => void ask()} disabled={busy || !enough || !loaded}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Bucket is sorting your notes…
            </>
          ) : read ? (
            'Re-bucket my feedback'
          ) : (
            'Bucket my feedback'
          )}
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted">
        {enough
          ? 'Private to you. Bucket uses only the feedback and notes you wrote, never titles or partner names, and only when you ask.'
          : `Add feedback or notes to at least ${MIN_CASES} cases and Bucket has something to sort. You have ${written} so far.`}
      </p>

      <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-ink-2 empty:hidden">
        {busy ? 'This can take up to a minute.' : notice}
      </p>

      {read && (
        <div className="mt-5 space-y-5">
          <div>
            <p className="font-display text-xl font-extrabold leading-snug text-ink">{read.insight.summary}</p>
            <p className="mt-1 text-xs text-muted">
              Updated {formatDate(read.updatedAt.slice(0, 10))} from {read.caseCount} {read.caseCount === 1 ? 'case' : 'cases'} ({read.scope === 'recent' ? 'most recent' : 'across your log'}).
              {newer && ' You have logged or changed cases since: ask again to include them.'}
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {read.insight.strengths.length > 0 && (
              <section aria-label="Where you are strong">
                <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink">
                  <ThumbsUp className="size-4 text-teal-ink" aria-hidden /> Where you're strong
                </h3>
                <ul className="space-y-2.5">
                  {read.insight.strengths.map((s) => (
                    <li key={s.title} className="rounded-xl bg-teal-soft px-3.5 py-3">
                      <p className="text-sm font-semibold text-teal-ink">{s.title}</p>
                      <p className="mt-0.5 text-sm text-ink-2">{s.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {read.insight.focus.length > 0 && (
              <section aria-label="What to work on">
                <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Wrench className="size-4 text-coral-ink" aria-hidden /> What to work on
                </h3>
                <ol className="space-y-2.5">
                  {read.insight.focus.map((f) => (
                    <li key={f.title} className="rounded-xl bg-coral-soft px-3.5 py-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-coral-ink">
                        {f.title}
                        {f.skill && <Badge>{skillGroupLabel(f.skill)}</Badge>}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-2">{f.detail}</p>
                      <p className="mt-1.5 text-sm text-ink">
                        <span className="font-semibold">Try:</span> {f.action}
                      </p>
                      {f.skill && <TryNext skill={f.skill} />}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
