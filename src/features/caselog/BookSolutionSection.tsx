import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { BookSolution } from '../../domain/bookSolution';
import type { CaseRecord } from '../../domain/types';
import { useData } from '../../state/DataProvider';
import { useLibrary } from '../../state/LibraryProvider';

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="eyebrow">{label}</h4>
      <div className="mt-1 text-sm leading-relaxed text-ink">{children}</div>
    </div>
  );
}

const Bullets = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-1 pl-5 text-ink-2">
    {items.map((t) => (
      <li key={t}>{t}</li>
    ))}
  </ul>
);

function SolutionBody({ s }: { s: BookSolution }) {
  return (
    <div className="space-y-5">
      <Block label="The question">
        <p>{s.prompt}</p>
      </Block>

      {s.facts.length > 0 && (
        <Block label="What the interviewer gives you">
          <Bullets items={s.facts} />
        </Block>
      )}

      {s.structure.length > 0 && (
        <Block label="The book's structure">
          <ul className="space-y-2">
            {s.structure.map((g) => (
              <li key={g.heading}>
                <p className="font-semibold text-ink">{g.heading}</p>
                {g.points.length > 0 && <Bullets items={g.points} />}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block label="The solution, step by step">
        <ol className="space-y-3">
          {s.steps.map((st, i) => (
            <li key={`${i}-${st.title}`} className="rounded-xl border border-line bg-surface px-3.5 py-3">
              <p className="font-semibold text-ink">
                <span className="mr-2 text-muted">{i + 1}.</span>
                {st.title}
              </p>
              {st.body && <p className="mt-1 text-ink-2">{st.body}</p>}
              {st.calc.length > 0 && (
                <ul className="mt-2 space-y-0.5 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-ink">
                  {st.calc.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </Block>

      {s.exhibits.map((e) => (
        <figure key={e.title} className="space-y-1.5">
          <figcaption className="text-sm font-semibold text-ink">
            {e.title}
            {e.approx && <span className="ml-2 text-xs font-normal text-muted">(values read off a chart, approximate)</span>}
          </figcaption>
          {e.caption && <p className="text-xs text-muted">{e.caption}</p>}
          <div className="overflow-x-auto rounded-xl border border-line">
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
        </figure>
      ))}

      <Block label="The recommendation">
        <p>{s.recommendation}</p>
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

      {s.bookErrors.length > 0 && (
        <Block label="Slips in the book">
          <Bullets items={s.bookErrors} />
        </Block>
      )}
      {s.confidence === 'partial' && <p className="text-xs text-muted">Part of this case couldn't be read in full, so some of it is incomplete.</p>}
    </div>
  );
}

/**
 * "Full solution": the book's own solution to a case you did, written up in our own words with its numbers, and each exhibit rebuilt as a
 * table of its figures. Released by the database only to a member who logged the case and shown only to you. It starts closed, and the
 * section is not there at all when the case has no link, no write-up yet, the lookup fails, or in demo mode.
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
          <span className="block text-xs text-muted">The book's own solution with its numbers and exhibits, in our own words. Private to you.</span>
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
