import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, Video } from 'lucide-react';
import { describeError } from '../../data/errors';
import type { MeetingPrefs } from '../../data/meetingPrefs';
import { browserTimeZone, meetingLinkLabel, MEETING_LINK_MAX, parseMeetingLink, parseTimeZone, timeZoneChoices } from '../../domain/meeting';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useMeetingPrefs } from '../../state/meeting';
import { useToast } from '../../state/ToastProvider';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; saved: MeetingPrefs };

/**
 * How a member likes to meet: one link (or phone number) and one time zone, saved once. Nothing here is shown to
 * another member in this version of the app; the scheduling flow will hand the link to the one person a case is
 * scheduled with.
 */
export function MeetingSection() {
  const repository = useMeetingPrefs();
  const toast = useToast();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [link, setLink] = useState('');
  const [zone, setZone] = useState('');
  const [problem, setProblem] = useState<{ link?: string; zone?: string }>({});
  const [saving, setSaving] = useState(false);

  const zones = useMemo(() => {
    const all = new Set(timeZoneChoices());
    if (zone) all.add(zone);
    return [...all].sort((a, b) => a.localeCompare(b));
  }, [zone]);

  useEffect(() => {
    if (!repository) return;
    let current = true;
    repository
      .load()
      .then((saved) => {
        if (!current) return;
        setState({ status: 'ready', saved });
        setLink(saved.link);
        // First time through there is nothing stored, so the browser's own zone is offered, ready to save.
        setZone(saved.timeZone || browserTimeZone());
      })
      .catch((e) => current && setState({ status: 'error', message: describeError(e) }));
    return () => {
      current = false;
    };
  }, [repository]);

  if (!repository) return null;

  const stored = state.status === 'ready' ? state.saved : null;
  const changed = stored !== null && (link.trim() !== stored.link || zone.trim() !== stored.timeZone);
  const reading = parseMeetingLink(link);
  const kind = reading.ok ? reading.link?.kind : undefined;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const parsedLink = parseMeetingLink(link);
    const parsedZone = parseTimeZone(zone, zones);
    setProblem({ link: parsedLink.ok ? undefined : parsedLink.message, zone: parsedZone.ok ? undefined : parsedZone.message });
    if (!parsedLink.ok || !parsedZone.ok) return;

    setSaving(true);
    try {
      // Only what came back from the database is shown as saved; the boxes keep what was typed if it doesn't.
      const saved = await repository.save({ link: parsedLink.link?.value ?? '', timeZone: parsedZone.zone ?? '' });
      setState({ status: 'ready', saved });
      setLink(saved.link);
      setZone(saved.timeZone);
      toast({ title: 'Saved how you like to meet' });
    } catch (err) {
      toast({ kind: 'error', title: 'Not saved', body: describeError(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="meeting-title" className="space-y-3">
      <div>
        <h3 id="meeting-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Video className="size-4 text-accent-text" aria-hidden /> How I like to meet
        </h3>
        <p className="mt-1 text-xs text-muted">Only the person you schedule a case with will see this.</p>
      </div>

      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" /> Checking…
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="text-sm font-medium text-bad-text">
          Couldn't load this. {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <form onSubmit={save} className="space-y-4" aria-label="How I like to meet">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="meeting-link">
                Meeting link or phone number <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="meeting-link"
                className="field"
                inputMode="url"
                autoComplete="off"
                value={link}
                maxLength={MEETING_LINK_MAX}
                placeholder="https://us02web.zoom.us/j/1234567890"
                aria-invalid={Boolean(problem.link)}
                aria-describedby="meeting-link-hint"
                onChange={(e) => {
                  setLink(e.target.value);
                  setProblem((p) => ({ ...p, link: undefined }));
                }}
              />
              <p id="meeting-link-hint" className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                <span>Your Zoom room, Google Meet, Teams, or a phone number.</span>
                {kind && <Badge tone="neutral">{meetingLinkLabel(kind)}</Badge>}
              </p>
              {problem.link && (
                <p className="mt-1.5 text-xs font-medium text-bad-text" role="alert">
                  {problem.link}
                </p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="meeting-zone">
                Time zone <span className="font-normal text-muted">(optional)</span>
              </label>
              <select
                id="meeting-zone"
                className="field"
                value={zone}
                aria-invalid={Boolean(problem.zone)}
                onChange={(e) => {
                  setZone(e.target.value);
                  setProblem((p) => ({ ...p, zone: undefined }));
                }}
              >
                <option value="">No time zone</option>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              {problem.zone && (
                <p className="mt-1.5 text-xs font-medium text-bad-text" role="alert">
                  {problem.zone}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {saving && (
              <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
                <Loader2 className="size-3.5 animate-spin" /> Saving…
              </span>
            )}
            <Button type="submit" disabled={saving || !changed}>
              Save how I meet
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
