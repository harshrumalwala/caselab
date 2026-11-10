import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { skillGroupLabel, type SkillGroupKey } from '../../domain/constants';
import type { CaseRecord } from '../../domain/types';
import { Badge } from '../../components/ui/Badge';
import type { BookNotes } from '../../data/caseLibrary';
import { useData } from '../../state/DataProvider';
import { useLibrary } from '../../state/LibraryProvider';

const DIFFICULTY = ['', 'Easy', 'Fairly easy', 'Medium', 'Hard', 'Very hard'];

const isSkill = (k: string): k is SkillGroupKey => ['behavioral', 'prompt', 'framework', 'quant', 'exhibits', 'brainstorm', 'recommendation'].includes(k);

/**
 * "From the book": for a case you did that is linked to a casebook case we have analysed, what a strong answer covers, the ideas it tests and
 * the common mistakes, so you do not have to go back to the casebook. It is our own write-up in our own words (never the book's text), the
 * database releases it only to a member who logged the case, and nothing is shown when the case has no link, has not been read yet, or the
 * lookup fails. Not shown in demo mode.
 */
export function BookTakeaways({ c }: { c: CaseRecord }) {
  const library = useLibrary();
  const { mode } = useData();
  const [notes, setNotes] = useState<BookNotes | null>(null);

  useEffect(() => {
    setNotes(null);
    if (!library || mode === 'demo' || !c.libraryId) return;
    let live = true;
    library.notesFor(c.libraryId).then(
      (n) => live && setNotes(n),
      () => undefined, // a hiccup just means nothing is shown
    );
    return () => {
      live = false;
    };
  }, [library, mode, c.libraryId]);

  if (!notes) return null;
  const skills = notes.skills.filter(isSkill);

  return (
    <section aria-label="From the book" className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
      <div className="flex items-start gap-2.5">
        <BookOpen className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink">From the book</h3>
          <p className="text-xs text-muted">Key takeaways in our own words, so you don't need to go back to the casebook. Private to you.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{DIFFICULTY[notes.difficulty] ?? 'Medium'}</Badge>
        {skills.map((s) => (
          <Badge key={s}>{skillGroupLabel(s)}</Badge>
        ))}
      </div>

      <p className="text-sm text-ink-2">{notes.summary}</p>

      <div>
        <h4 className="eyebrow">What a strong answer covers</h4>
        <p className="mt-1 text-sm leading-relaxed text-ink">{notes.strongAnswer}</p>
      </div>

      {notes.concepts.length > 0 && (
        <div>
          <h4 className="eyebrow">Ideas it tests</h4>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {notes.concepts.map((t) => (
              <li key={t} className="rounded-full bg-lilac-soft px-2 py-0.5 text-xs font-medium text-lilac-ink">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.pitfalls.length > 0 && (
        <div>
          <h4 className="eyebrow">Common mistakes</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {notes.pitfalls.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {notes.confidence === 'partial' && (
        <p className="text-xs text-muted">Some charts in this case couldn't be read, so part of this leans on the book's own solution pages.</p>
      )}
    </section>
  );
}
