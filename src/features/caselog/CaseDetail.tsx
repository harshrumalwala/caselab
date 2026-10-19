import { useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { RATING_LABELS, SHARE_MODES, SKILLS, skillGroupLabel, type Rating } from '../../domain/constants';
import { formatDate } from '../../domain/dates';
import { describeError } from '../../data/errors';
import type { CaseRecord } from '../../domain/types';
import { Badge, RatingBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';
import { useUI } from '../../state/ui';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div>
      <h4 className="eyebrow">{label}</h4>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{text}</p>
    </div>
  );
}

export function CaseDetail({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const { cases, deleteCase } = useData();
  const { editCase } = useUI();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const c: CaseRecord | undefined = cases.find((x) => x.id === caseId);
  if (!c) return null;

  const rated = SKILLS.filter((s) => c.skills[s.key].rating !== null || c.skills[s.key].feedback);
  const unrated = SKILLS.length - rated.length;
  const hasTakeaways = [c.wentWell, c.struggled, c.concepts, c.nextFocus, c.otherNotes].some((t) => t.trim());

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteCase(c.id);
      toast({ title: 'Case deleted', body: c.title });
      setConfirming(false);
      onClose();
    } catch (e) {
      // Still there: say so, and leave the case in place.
      toast({ kind: 'error', title: 'Not deleted', body: describeError(e) });
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog
        open
        variant="drawer"
        onClose={onClose}
        title={c.title || 'Untitled case'}
        description={formatDate(c.date)}
        headerExtra={
          <div className="flex flex-wrap gap-1.5">
            <Badge>{c.caseType}</Badge>
            {c.industry && <Badge>{c.industry}</Badge>}
          </div>
        }
        footer={
          <div className="flex justify-between gap-2">
            <Button variant="ghost" className="hover:!text-bad" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                editCase(c.id);
              }}
            >
              <Pencil className="size-4" /> Edit case
            </Button>
          </div>
        }
      >
        <div className="space-y-7">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Detail label="Case source">{c.source || <span className="text-muted">–</span>}</Detail>
            <Detail label="Interviewer / partner">{c.partner || <span className="text-muted">–</span>}</Detail>
            <Detail label="Industry">{c.industry || <span className="text-muted">Not specified</span>}</Detail>
            <Detail label="Main improvement area">
              {c.improvementArea ? skillGroupLabel(c.improvementArea) : <span className="text-muted">–</span>}
            </Detail>
            <Detail label="Sharing">{SHARE_MODES.find((m) => m.value === c.shareMode)?.label}</Detail>
          </dl>

          <section aria-label="Ratings">
            <h3 className="eyebrow mb-3">Ratings</h3>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              <li className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Overall</p>
                  {c.overall !== null && <p className="text-xs text-muted">{RATING_LABELS[c.overall as Rating]}</p>}
                  {c.overallFeedback && <p className="mt-1 text-sm text-ink-2">{c.overallFeedback}</p>}
                </div>
                <RatingBadge value={c.overall} />
              </li>
              {rated.map((s) => {
                const e = c.skills[s.key];
                return (
                  <li key={s.key} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{s.label}</p>
                      {e.feedback && <p className="mt-0.5 text-sm text-ink-2">{e.feedback}</p>}
                    </div>
                    <RatingBadge value={e.rating} />
                  </li>
                );
              })}
            </ul>
            {unrated > 0 && (
              <p className="mt-2 text-xs text-muted">
                {unrated} {unrated === 1 ? 'skill was' : 'skills were'} not rated and don't affect any averages.
              </p>
            )}
          </section>

          {hasTakeaways && (
            <section aria-label="Takeaways" className="space-y-4">
              <h3 className="eyebrow">Takeaways</h3>
              <Note label="What went well" text={c.wentWell} />
              <Note label="What I struggled with" text={c.struggled} />
              <Note label="Concepts learned" text={c.concepts} />
              <Note label="Practice next" text={c.nextFocus} />
              <Note label="Other notes" text={c.otherNotes} />
            </section>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        title="Delete this case?"
        confirmLabel="Delete case"
        busy={deleting}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void remove()}
      >
        <p>
          <span className="font-semibold text-ink">{c.title || 'This case'}</span> and all of its ratings and notes will
          be permanently removed. This can't be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
