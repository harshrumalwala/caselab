import { useId, useState, type ReactNode } from 'react';
import { CalendarPlus, Trash2 } from 'lucide-react';
import { describeError } from '../../data/errors';
import { describeSlot, earliestWall, wallToIso } from '../../domain/meetingTime';
import { checkMeetingTimes, MAX_MEETING_SLOTS, MEETING_DURATIONS, type MeetingDuration, type NewMeetingTimes } from '../../domain/scheduling';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useMeetings } from '../../state/SchedulingProvider';
import { useUI } from '../../state/ui';

/** What the boxes hold: wall clocks in the member's own zone, and the length. */
export interface TimesDraft {
  slots: string[];
  durationMinutes: MeetingDuration;
}

/** 45 minutes is the usual length of a case, so that is what a box starts on. */
export const emptyTimes = (): TimesDraft => ({ slots: [''], durationMinutes: 45 });

export const anyTime = (draft: TimesDraft) => draft.slots.some((s) => s.trim() !== '');

/** A length the rules accept, for filling a box from a record that already has one. */
export const asDuration = (minutes: number): MeetingDuration => ((MEETING_DURATIONS as readonly number[]).includes(minutes) ? minutes : 45) as MeetingDuration;

/** The boxes as the database wants them: UTC instants, read as wall clocks in the member's own zone. */
export function draftToTimes(draft: TimesDraft, zone: string): NewMeetingTimes {
  const slots: string[] = [];
  for (const s of draft.slots) {
    const iso = wallToIso(s, zone);
    if (iso) slots.push(iso);
  }
  return { slots, durationMinutes: draft.durationMinutes };
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Your link goes to the one person a time is settled with, so a member without one is offered the way to add it. */
export function AddLinkLine({ name }: { name: string }) {
  const { openMeetingPrefs } = useUI();
  return (
    <p className="text-xs text-ink-2">
      Add a meeting link and {name} gets it with the time.{' '}
      <button type="button" className="font-semibold text-accent-text hover:underline" onClick={openMeetingPrefs}>
        Add one
      </button>
    </p>
  );
}

interface FieldProps {
  draft: TimesDraft;
  onChange: (draft: TimesDraft) => void;
  /** Who the times are for, so the preview can read them in their zone too. */
  otherName: string;
  otherZone: string;
  disabled?: boolean;
  legend?: string;
}

/**
 * Up to three date-and-time boxes and a length, with each time read back in both zones as it is typed, so nobody
 * sends a time without having seen what the other person will see.
 *
 * The boxes are the browser's own `datetime-local`: a phone opens its wheel, a keyboard walks the parts, and a
 * screen reader reads each one from its label. Their wall clock is read in the member's saved zone, not the
 * browser's, which is what `wallToIso` is for.
 */
export function TimesField({ draft, onChange, otherName, otherZone, disabled = false, legend = 'Propose times' }: FieldProps) {
  const { myZone } = useMeetings();
  const id = useId();
  const min = earliestWall(myZone);
  const name = firstName(otherName);

  const setSlot = (i: number, value: string) => onChange({ ...draft, slots: draft.slots.map((s, n) => (n === i ? value : s)) });
  const removeSlot = (i: number) => onChange({ ...draft, slots: draft.slots.filter((_, n) => n !== i) });

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="label mb-1">{legend}</legend>
      <ol className="space-y-3">
        {draft.slots.map((slot, i) => {
          const iso = wallToIso(slot, myZone);
          const previewId = `${id}-read-${i}`;
          return (
            <li key={i}>
              <label className="label" htmlFor={`${id}-slot-${i}`}>
                Time {i + 1}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`${id}-slot-${i}`}
                  type="datetime-local"
                  className="field"
                  value={slot}
                  min={min}
                  aria-describedby={iso ? previewId : undefined}
                  onChange={(e) => setSlot(i, e.target.value)}
                />
                {i > 0 && (
                  <Button size="sm" aria-label={`Remove time ${i + 1}`} onClick={() => removeSlot(i)}>
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                )}
              </div>
              {iso && (
                <p id={previewId} className="mt-1 text-xs font-medium text-ink-2">
                  {describeSlot(iso, myZone, otherZone, name)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {draft.slots.length < MAX_MEETING_SLOTS && (
        <Button size="sm" onClick={() => onChange({ ...draft, slots: [...draft.slots, ''] })}>
          <CalendarPlus className="size-3.5" aria-hidden /> Add another time
        </Button>
      )}
      <div>
        <label className="label" htmlFor={`${id}-length`}>
          How long
        </label>
        <select
          id={`${id}-length`}
          className="field sm:max-w-[12rem]"
          value={draft.durationMinutes}
          onChange={(e) => onChange({ ...draft, durationMinutes: Number(e.target.value) as MeetingDuration })}
        >
          {MEETING_DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d} minutes
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

interface DialogProps {
  title: string;
  description?: string;
  submitLabel: string;
  otherName: string;
  otherZone: string;
  initial?: TimesDraft;
  extra?: ReactNode;
  onSubmit: (times: NewMeetingTimes) => Promise<void>;
  onClose: () => void;
}

/**
 * Proposing, countering or moving a time, in a window of its own. Nothing closes until the database has taken it:
 * a refusal is shown here, in its own words, with everything the member picked still in the boxes.
 */
export function ProposeTimesDialog({ title, description, submitLabel, otherName, otherZone, initial, extra, onSubmit, onClose }: DialogProps) {
  const { myZone, haveLink } = useMeetings();
  const [draft, setDraft] = useState<TimesDraft>(initial ?? emptyTimes());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const checked = checkMeetingTimes(draftToTimes(draft, myZone));
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(checked.times);
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      width="sm"
      layer="top"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Sending…' : submitLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TimesField draft={draft} onChange={setDraft} otherName={otherName} otherZone={otherZone} disabled={busy} />
        {!haveLink && <AddLinkLine name={firstName(otherName)} />}
        {extra}
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad-text">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
