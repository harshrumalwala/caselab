import { useMemo, useState } from 'react';
import { Loader2, Mic, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { describeError } from '../../data/errors';
import { formatDate } from '../../domain/dates';
import { searchInterviewed, type InterviewedCase } from '../../domain/interviewed';
import { Button, IconButton } from '../../components/ui/Button';
import { chipClass } from '../../components/ui/chips';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useInterviewed } from '../../state/InterviewedProvider';
import { useToast } from '../../state/ToastProvider';
import { InterviewedDialog } from './InterviewedDialog';

/**
 * Cases you ran as the interviewer. They are for the record, not the scoreboard: they sit in their own list, private to you,
 * and never count in a total, rating, trend, coverage or your weekly goal.
 */
export function InterviewedPanel() {
  const { items, status, loadError, remove, reload } = useInterviewed();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{ editing: InterviewedCase | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InterviewedCase | null>(null);
  const [deleting, setDeleting] = useState(false);

  const visible = useMemo(() => searchInterviewed(items, query), [items, query]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await remove(pendingDelete.id);
      toast({ title: 'Interviewed case deleted', body: pendingDelete.title });
    } catch (e) {
      toast({ kind: 'error', title: 'Not deleted', body: describeError(e) });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="sticker bg-teal-soft px-4 py-3 text-sm text-teal-ink" role="note">
        <strong className="font-bold">Interviewing is practice too, just not the kind that goes on the scoreboard.</strong> These stay private to you and
        don't count in your case total, ratings, trends, coverage or weekly goal.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="field !pl-10" type="search" placeholder="Search interviewed cases" aria-label="Search interviewed cases" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button variant="primary" onClick={() => setDialog({ editing: null })}>
          <Plus className="size-4" /> Log a case you interviewed
        </Button>
      </div>

      {status === 'loading' && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="sticker space-y-3 p-4 text-sm">
          <p className="font-semibold text-ink">Couldn't load your interviewed cases</p>
          <p className="text-ink-2">{loadError}</p>
          <Button onClick={() => void reload()}>Try again</Button>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <div className="sticker bg-sun-soft">
          <EmptyState icon={<Mic className="size-6" />} title="No interviewed cases yet" compact>
            Ran a case for a friend? Log it here, with what you told them and what it taught you.
          </EmptyState>
        </div>
      )}

      {status === 'ready' && items.length > 0 && visible.length === 0 && (
        <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">No interviewed cases match that search.</p>
      )}

      {visible.length > 0 && (
        <ul className="space-y-3" aria-label="Interviewed cases">
          {visible.map((c) => (
            <li key={c.id} className="sticker group p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold leading-snug text-ink">{c.title}</p>
                  <p className="num mt-0.5 text-xs text-muted">
                    {formatDate(c.date)}
                    {c.partner && <> · with {c.partner}</>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <IconButton label={`Edit ${c.title}`} onClick={() => setDialog({ editing: c })}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label={`Delete ${c.title}`} className="hover:!text-bad-text" onClick={() => setPendingDelete(c)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>
              <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span className={`rounded-full px-2.5 py-0.5 font-bold ${chipClass(c.caseType)}`}>{c.caseType}</span>
                {[c.industry, c.source].filter(Boolean).join(' · ')}
              </p>
              {c.feedback && (
                <p className="mt-3 text-sm text-ink-2">
                  <span className="font-semibold text-ink">You told them:</span> {c.feedback}
                </p>
              )}
              {c.learned && (
                <p className="mt-2 text-sm text-ink-2">
                  <span className="font-semibold text-ink">You learned:</span> {c.learned}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog && <InterviewedDialog editing={dialog.editing} onClose={() => setDialog(null)} />}

      <ConfirmDialog open={pendingDelete !== null} title="Delete this interviewed case?" confirmLabel="Delete case" busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void confirmDelete()}>
        <p>
          <span className="font-semibold text-ink">{pendingDelete?.title}</span> will be permanently removed. It was never part of your solved cases, so
          nothing else changes.
        </p>
      </ConfirmDialog>
    </div>
  );
}
