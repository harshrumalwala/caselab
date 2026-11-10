import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { describeError } from '../../data/errors';
import { libraryLabel } from '../../domain/library';
import { changesFor, type CaseMatch } from '../../domain/libraryMatch';
import type { CaseInput } from '../../domain/types';
import { useData } from '../../state/DataProvider';
import { useLibrary } from '../../state/LibraryProvider';
import { useToast } from '../../state/ToastProvider';

type How = 'update' | 'link';

/**
 * Cases you logged by hand that look like casebook cases. A banner above the log offers to review them; in the review you choose, case
 * by case, which ones to match, and whether that means updating the title, book, case type and industry to the book's, or only linking
 * the case (so it counts as done) and leaving your own wording alone. Nothing changes until you press the button, and only for the cases
 * you leave ticked. Cases that are only a maybe (the book isn't named) start unticked.
 */
export function MatchCases() {
  const library = useLibrary();
  const { cases, mode, updateCase } = useData();
  const toast = useToast();
  const [matches, setMatches] = useState<CaseMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [how, setHow] = useState<How>('update');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!library || mode !== 'real') return;
    try {
      setMatches(await library.matchMyCases());
    } catch {
      setMatches([]); // a convenience: with no answer there is simply nothing to review
    }
  }, [library, mode]);

  // Look again when the number of cases changes (a case added, deleted or updated can add or remove matches).
  const caseCount = cases.length;
  useEffect(() => {
    void load();
  }, [load, caseCount]);

  const openReview = () => {
    setTicked(new Set(matches.filter((m) => m.sure || m.linked).map((m) => m.caseId)));
    setHow('update');
    setOpen(true);
  };

  const changed = useMemo(() => matches.filter((m) => ticked.has(m.caseId)), [matches, ticked]);

  const apply = async () => {
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const m of changed) {
      const existing = cases.find((c) => c.id === m.caseId);
      if (!existing) continue;
      const { id: _id, createdAt: _created, updatedAt: _updated, ...rest } = existing;
      const input: CaseInput = {
        ...rest,
        libraryId: m.library.id,
        ...(how === 'update' ? { title: m.library.name, source: m.library.book, caseType: m.library.caseType, industry: m.library.industry } : {}),
      };
      try {
        await updateCase(m.caseId, input);
        done += 1;
      } catch (e) {
        failed.push(`${m.title}: ${describeError(e)}`);
      }
    }
    setBusy(false);
    if (failed.length === 0) setOpen(false);
    toast(
      failed.length === 0
        ? { title: how === 'update' ? `${done} ${done === 1 ? 'case' : 'cases'} updated` : `${done} ${done === 1 ? 'case' : 'cases'} linked`, body: 'Matched to the casebooks.' }
        : { kind: 'error', title: `${done} done, ${failed.length} not`, body: failed[0] },
    );
    await load();
  };

  if (matches.length === 0 && !open) return null;

  return (
    <>
      {matches.length > 0 && (
        <section aria-label="Cases that look like casebook cases" className="sticker flex flex-wrap items-center justify-between gap-3 bg-lilac-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-lilac-ink">
            <BookOpen className="size-4 shrink-0" aria-hidden />
            {matches.length === 1 ? '1 of your cases looks like a casebook case.' : `${matches.length} of your cases look like casebook cases.`}
          </p>
          <Button onClick={openReview}>Review</Button>
        </section>
      )}

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Match your cases to the casebooks"
        description="Nothing changes until you press the button, and only for the cases you leave ticked."
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void apply()} disabled={busy || changed.length === 0}>
              {how === 'update' ? 'Update' : 'Link'} {changed.length} {changed.length === 1 ? 'case' : 'cases'}
            </Button>
          </>
        }
      >
        <div role="radiogroup" aria-label="What matching does" className="mb-4 space-y-2">
          {(
            [
              ['update', 'Update my cases to match the book', "Their title, book, case type and industry become the casebook's."],
              ['link', 'Just link them', 'Keep my own title, book, type and industry. They only count as done.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 text-sm has-[:checked]:border-ink/80 has-[:checked]:bg-lilac-soft">
              <input type="radio" name="how" className="mt-0.5 size-4 accent-[var(--accent)]" checked={how === value} onChange={() => setHow(value)} disabled={busy} />
              <span>
                <span className="block font-semibold text-ink">{label}</span>
                <span className="block text-xs text-ink-2">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <ul className="space-y-2" aria-label="Cases to match">
          {matches.map((m) => {
            const changes = changesFor(m);
            return (
              <li key={m.caseId} className="rounded-xl border border-line p-3">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--accent)]"
                    checked={ticked.has(m.caseId)}
                    disabled={busy}
                    onChange={(e) =>
                      setTicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(m.caseId);
                        else next.delete(m.caseId);
                        return next;
                      })
                    }
                    aria-label={`${m.title}: ${how === 'update' ? 'update' : 'link'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink">
                      {m.title}
                      <ArrowRight className="size-3.5 text-muted" aria-hidden />
                      {libraryLabel(m.library)}
                      {!m.sure && !m.linked && <span className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold text-warn-text">Not sure</span>}
                    </span>
                    {!m.sure && !m.linked && (
                      <span className="mt-0.5 block text-xs text-ink-2">
                        {m.source.trim() ? `Your book says "${m.source}", which isn't one of the books this case is in.` : "You didn't say which book it was from, and other books reuse this name."}
                      </span>
                    )}
                    {how === 'update' && changes.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
                        {changes.map((c) => (
                          <li key={c.field}>
                            <span className="font-semibold">{c.label}:</span> {c.from || 'blank'} <span aria-hidden>→</span> <span className="sr-only">becomes</span> {c.to}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="mt-0.5 block text-xs text-ink-2">{how === 'update' ? 'Already matches the book; only the link is added.' : 'Only the link is added.'}</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
