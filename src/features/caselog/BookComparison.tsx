import { useEffect, useState } from 'react';
import { Check, Loader2, Target } from 'lucide-react';
import { formatDate } from '../../domain/dates';
import type { CaseRecord } from '../../domain/types';
import { Button } from '../../components/ui/Button';
import { describeError } from '../../data/errors';
import type { CaseComparison } from '../../data/feedbackInsights';
import { useData } from '../../state/DataProvider';
import { useInsights } from '../../state/InsightsProvider';
import { BucketAvatar } from '../improvement/BucketAvatar';
import { hasWriting } from '../improvement/CoachCard';

const minutes = (seconds: number) => (seconds < 90 ? 'a minute' : `${Math.ceil(seconds / 60)} minutes`);

/**
 * "Compare with the book": for a case you did that is linked to a casebook case we have analysed, Bucket compares the feedback you wrote with
 * what a strong answer covers. Only when you ask, only for your own case and writing, and only after you have done the case (the database
 * releases our analysis to a member who logged it). Not shown at all when the case has no link, no writing, or in demo mode.
 */
export function BookComparison({ c }: { c: CaseRecord }) {
  const insights = useInsights();
  const { mode } = useData();
  const [saved, setSaved] = useState<CaseComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!insights || mode === 'demo' || !c.libraryId) return;
    let live = true;
    insights.savedComparison(c.id).then(
      (s) => live && setSaved(s),
      () => undefined, // a hiccup just means no stored comparison is shown
    );
    return () => {
      live = false;
    };
  }, [insights, mode, c.id, c.libraryId]);

  if (!insights || mode === 'demo' || !c.libraryId || !hasWriting(c)) return null;

  const ask = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await insights.compareCase(c.id);
      switch (r.status) {
        case 'ok':
          setSaved(r.result);
          break;
        case 'too_soon':
          setNotice(`Bucket just compared this. Try again in ${minutes(r.retryInSeconds)}.`);
          break;
        case 'no_notes':
          setNotice("Bucket hasn't read this casebook case yet, so there's nothing to compare it with.");
          break;
        case 'nothing_written':
          setNotice('Add some feedback on this case first.');
          break;
        case 'unavailable':
          setNotice("Bucket isn't available yet.");
          break;
        case 'no_match':
          setNotice("This case isn't linked to a casebook case.");
          break;
        default:
          setNotice("Bucket couldn't compare that just now. Nothing was changed, so try again in a moment.");
      }
    } catch (e) {
      setNotice(`Couldn't reach Bucket. ${describeError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const outdated = saved ? c.updatedAt > saved.updatedAt : false;

  return (
    <section aria-label="Compare with the book" className="space-y-3 rounded-2xl border-2 border-ink/80 bg-lilac-soft/40 p-4">
      <div className="flex items-start gap-3">
        <BucketAvatar className="size-10 shrink-0 -rotate-3" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink">Compare with the book</h3>
          <p className="text-xs text-muted">Bucket checks the feedback you wrote against what a strong answer to this case covers. Private to you.</p>
        </div>
      </div>

      <Button variant="secondary" onClick={() => void ask()} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden /> Bucket is comparing…
          </>
        ) : saved ? (
          'Compare again'
        ) : (
          'Compare with the book'
        )}
      </Button>

      <p role="status" aria-live="polite" className="text-sm font-medium text-ink-2 empty:hidden">
        {notice}
      </p>

      {saved && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">{saved.comparison.summary}</p>
          {saved.comparison.covered.length > 0 && (
            <div>
              <h4 className="eyebrow">You covered</h4>
              <ul className="mt-1 space-y-1">
                {saved.comparison.covered.map((t) => (
                  <li key={t} className="flex gap-2 text-sm text-ink-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-teal-ink" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {saved.comparison.missed.length > 0 && (
            <div>
              <h4 className="eyebrow">A strong answer also covers</h4>
              <ul className="mt-1 space-y-1">
                {saved.comparison.missed.map((t) => (
                  <li key={t} className="flex gap-2 text-sm text-ink-2">
                    <Target className="mt-0.5 size-4 shrink-0 text-coral-ink" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-ink">
            <span className="font-semibold">Next time:</span> {saved.comparison.tip}
          </p>
          <p className="text-xs text-muted">
            Compared {formatDate(saved.updatedAt.slice(0, 10))}.{outdated && ' You have changed this case since: compare again to include it.'}
          </p>
        </div>
      )}
    </section>
  );
}
