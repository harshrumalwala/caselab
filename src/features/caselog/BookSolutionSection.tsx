import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { BookSolution } from '../../domain/bookSolution';
import type { CaseRecord } from '../../domain/types';
import { useData } from '../../state/DataProvider';
import { useLibrary } from '../../state/LibraryProvider';
import { ExhibitChart } from './ExhibitChart';

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="eyebrow">{label}</h4>
      <div className="text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}

const Bullets = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-1 pl-5 text-ink-2">
    {items.map((t) => (
      <li key={t}>{t}</li>
    ))}
  </ul>
);

// What we add or suggest (anything that is not the book's own solution) is always purple and labelled as Bucket's tip, so it is never mistaken
// for the book. Everything else on this screen is the book's solution, reworded.
const OURS = 'text-lilac-ink';

function OurNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border-l-4 border-lilac bg-lilac-soft px-3 py-2 text-sm ${OURS}`}>
      <p className="text-xs font-bold uppercase tracking-wide">Bucket's tip · {label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

const OurBullets = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-1 pl-5">
    {items.map((t) => (
      <li key={t}>{t}</li>
    ))}
  </ul>
);

function SolutionBody({ s }: { s: BookSolution }) {
  // The member's own comparison with each step, kept for as long as the case is open: tick what you did, and what is left is where you differed.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const checks = useMemo(() => s.steps.flatMap((st, i) => st.checkYourself.map((q, j) => ({ key: `${i}-${j}`, step: st.title, q }))), [s.steps]);
  const touched = Object.values(ticked).some(Boolean);
  const missed = checks.filter((c) => !ticked[c.key]);
  const detail = s.recommendationDetail;

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">
        Plain text is the book's own solution, in our words. <span className={`font-semibold ${OURS}`}>Purple tips are from Bucket</span>: what Bucket suggests you notice, not what the book says.
      </p>

      <Block label="The question">
        <p>{s.prompt}</p>
      </Block>

      {s.facts.length > 0 && (
        <Block label="What the interviewer gives you">
          <Bullets items={s.facts} />
        </Block>
      )}

      {s.clarifyingQuestions.length > 0 && (
        <Block label="Clarifying questions to ask">
          <ol className="space-y-2.5">
            {s.clarifyingQuestions.map((q, i) => (
              <li key={q.question} className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
                <p className="font-semibold text-ink">
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  {q.question}
                </p>
                <p className="mt-1 text-ink-2">
                  <span className="font-semibold text-ink">They tell you:</span> {q.answer}
                </p>
                {q.why && <p className="mt-1 text-xs text-muted">{q.why}</p>}
              </li>
            ))}
          </ol>
        </Block>
      )}

      {s.hypothesis && (
        <Block label="The hypothesis">
          <p className="font-semibold text-ink">{s.hypothesis.statement}</p>
          {s.hypothesis.basis && <p className="mt-1 text-ink-2">{s.hypothesis.basis}</p>}
        </Block>
      )}

      {s.structure.length > 0 && (
        <Block label="The framework">
          <ol className="grid gap-3 sm:grid-cols-2">
            {s.structure.map((g, i) => (
              <li key={g.heading} className="rounded-xl border border-line bg-surface px-3.5 py-3">
                <p className="font-semibold text-ink">
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  {g.heading}
                </p>
                {g.keyQuestion && <p className="mt-1 text-xs font-medium text-ink-2">{g.keyQuestion}</p>}
                {g.why && <p className="mt-1 text-xs text-muted">{g.why}</p>}
                {g.points.length > 0 && (
                  <div className="mt-2">
                    <Bullets items={g.points} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Block>
      )}

      {s.exhibits.length > 0 && (
        <Block label="Exhibits">
          <div className="space-y-5">
            {s.exhibits.map((e) => (
              <figure key={e.title} className="space-y-2 rounded-xl border border-line bg-surface p-3.5">
                <figcaption className="text-sm font-semibold text-ink">
                  {e.title}
                  {e.approx && <span className="ml-2 text-xs font-normal text-muted">(values read off a chart, approximate)</span>}
                </figcaption>
                {e.caption && <p className="text-xs text-muted">{e.caption}</p>}
                {e.chart && <ExhibitChart exhibit={e} chart={e.chart} />}
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-muted">
                      <tr>
                        {e.columns.map((c, i) => (
                          <th key={`${i}-${c}`} scope="col" className="px-3 py-2 font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {e.rows.map((r, ri) => (
                        <tr key={ri}>
                          {e.columns.map((_, ci) => (
                            <td key={ci} className="px-3 py-1.5 text-ink">
                              {r[ci] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {e.howToRead && <OurNote label="How to read it fast">{e.howToRead}</OurNote>}
                {e.takeaways.length > 0 && (
                  <OurNote label="Takeaways">
                    <OurBullets items={e.takeaways} />
                  </OurNote>
                )}
              </figure>
            ))}
          </div>
        </Block>
      )}

      <Block label="The solution, step by step">
        <ol className="space-y-4">
          {s.steps.map((st, i) => (
            <li key={`${i}-${st.title}`} className="space-y-2 rounded-xl border border-line bg-surface px-3.5 py-3">
              <p className="font-semibold text-ink">
                <span className="mr-2 text-muted">{i + 1}.</span>
                {st.title}
              </p>
              {st.body && <p className="text-ink-2">{st.body}</p>}
              {st.calc.length > 0 && (
                <ul className="space-y-0.5 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-ink">
                  {st.calc.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              {st.whatToNotice && <OurNote label="What to notice">{st.whatToNotice}</OurNote>}
              {st.commonMiss.length > 0 && (
                <OurNote label="Where candidates slip">
                  <OurBullets items={st.commonMiss} />
                </OurNote>
              )}
              {st.checkYourself.length > 0 && (
                <fieldset className={`space-y-1 ${OURS}`}>
                  <legend className="text-xs font-bold uppercase tracking-wide">Bucket's tip · Check yourself</legend>
                  {st.checkYourself.map((q, j) => {
                    const key = `${i}-${j}`;
                    return (
                      <label key={key} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input type="checkbox" checked={Boolean(ticked[key])} onChange={(e) => setTicked((t) => ({ ...t, [key]: e.target.checked }))} className="mt-1" />
                        <span>{q}</span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </li>
          ))}
        </ol>
      </Block>

      <Block label="The recommendation">
        <p className="font-semibold text-ink">{s.recommendation}</p>
        {detail && detail.because.length > 0 && (
          <div className="mt-2">
            <Bullets items={detail.because} />
          </div>
        )}
        {detail?.delivery && (
          <div className="mt-3">
            <OurNote label="How to deliver it">
              <p className="whitespace-pre-line">{detail.delivery}</p>
            </OurNote>
          </div>
        )}
        {detail && detail.commonMisses.length > 0 && (
          <div className="mt-3">
            <OurNote label="What weaker recommendations leave out">
              <OurBullets items={detail.commonMisses} />
            </OurNote>
          </div>
        )}
      </Block>

      {s.risks.length > 0 && (
        <Block label="Risks">
          <Bullets items={s.risks} />
        </Block>
      )}
      {s.nextSteps.length > 0 && (
        <Block label="Next steps">
          <Bullets items={s.nextSteps} />
        </Block>
      )}

      {s.ourTakeaways.length > 0 && (
        <section aria-label="Bucket's top takeaways" className={`space-y-2 rounded-xl border-2 border-lilac bg-lilac-soft p-3.5 ${OURS}`}>
          <h4 className="text-sm font-bold">Bucket's top {s.ourTakeaways.length} takeaways</h4>
          <ol className="space-y-2">
            {s.ourTakeaways.map((t, i) => (
              <li key={t.title} className="text-sm">
                <p className="font-semibold">
                  {i + 1}. {t.title}
                  {t.from && <span className="ml-2 text-xs font-normal opacity-80">(from the {t.from})</span>}
                </p>
                <p className="mt-0.5">{t.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {touched && (
        <section aria-label="Where your attempt differed" className={`space-y-1.5 rounded-xl border-2 border-lilac p-3.5 ${OURS}`}>
          <h4 className="text-sm font-bold">Bucket · Where your attempt differed</h4>
          {missed.length === 0 ? (
            <p className="text-sm">You ticked every check. Nothing to revisit.</p>
          ) : (
            <>
              <p className="text-xs">
                You ticked {checks.length - missed.length} of {checks.length}. The rest is what to revisit:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {missed.map((c) => (
                  <li key={c.key}>
                    <span className="font-semibold">{c.step}:</span> {c.q}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {s.confidence === 'partial' && <p className="text-xs text-muted">Part of this case couldn't be read in full, so some of it is incomplete.</p>}
    </div>
  );
}

/**
 * "Full solution": the book's own solution to a case you did, written up in our own words with its numbers, step by step, so you can compare your
 * attempt with it at every stage. The book's content is plain text; everything we add (how to read an exhibit, what to notice, a model delivery,
 * Bucket's top three takeaways, the check-yourself list) is purple and labelled as Bucket's. Released by the database only to a member who logged the case
 * and shown only to you. It starts closed, and the section is not there at all when the case has no link, no write-up yet, the lookup fails, or in
 * demo mode.
 */
export function BookSolutionSection({ c }: { c: CaseRecord }) {
  const library = useLibrary();
  const { mode } = useData();
  const [solution, setSolution] = useState<BookSolution | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSolution(null);
    setOpen(false);
    if (!library || mode === 'demo' || !c.libraryId) return;
    let live = true;
    library.solutionFor(c.libraryId).then(
      (s) => live && setSolution(s),
      () => undefined, // a hiccup just means nothing is shown
    );
    return () => {
      live = false;
    };
  }, [library, mode, c.libraryId]);

  if (!solution) return null;

  return (
    <section aria-label="Full solution" className="rounded-2xl border border-line bg-surface-2 p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 text-left">
        <FileText className="size-5 shrink-0 text-accent-text" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">Full solution</span>
          <span className="block text-xs text-muted">The book's own solution, step by step, in our own words, with Bucket's tips in purple. Private to you.</span>
        </span>
        {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
      </button>

      {open && (
        <div className="mt-4 border-t border-line pt-4">
          <SolutionBody s={solution} />
        </div>
      )}
    </section>
  );
}
