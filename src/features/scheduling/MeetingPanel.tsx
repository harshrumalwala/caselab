import { useState } from 'react';
import { CalendarCheck, CalendarClock, CalendarPlus, Video } from 'lucide-react';
import { describeError } from '../../data/errors';
import { meetingLinkLabel, parseMeetingLink } from '../../domain/meeting';
import { describeSlot, durationLabel, isoToWall } from '../../domain/meetingTime';
import { openProposal, schedulingWith, zoneOfMember, type ScheduledMeeting } from '../../domain/scheduling';
import { Button } from '../../components/ui/Button';
import { useMeetings } from '../../state/SchedulingProvider';
import { useToast } from '../../state/ToastProvider';
import { AddLinkLine, asDuration, firstName, ProposeTimesDialog, type TimesDraft } from './TimesField';

type Open = null | { kind: 'propose' } | { kind: 'counter'; meeting: ScheduledMeeting } | { kind: 'change'; meeting: ScheduledMeeting };

/** The link the two of them were given, as a link when it is a web address and as a number when it is a phone. */
function MeetingLink({ m, name }: { m: ScheduledMeeting; name: string }) {
  const read = parseMeetingLink(m.meetingLink);
  const link = read.ok ? read.link : null;
  if (!link) return null;
  const mine = (m.meetingLinkFrom === 'host') === m.iHost;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Video className="size-4 text-accent-text" aria-hidden />
      {link.kind === 'phone' ? (
        <span className="font-semibold text-ink">{link.value}</span>
      ) : (
        <a href={link.value} target="_blank" rel="noreferrer noopener" className="break-all font-semibold text-accent-text hover:underline">
          {link.value}
        </a>
      )}
      <span className="text-xs text-muted">
        {meetingLinkLabel(link.kind)} · {mine ? 'your link' : `${name}'s link`}
      </span>
    </p>
  );
}

/**
 * Settling one practice time with one member: the time you have agreed at the top, the times waiting on one of you
 * underneath, and a way to start when there is neither.
 *
 * Nothing here reads as settled until the database says so. A refusal (someone picked first, a time that has since
 * passed, a member who blocked you) is shown in the words the rules use, and whatever the member picked stays put.
 */
export function MeetingPanel({
  otherId,
  otherName,
  conversationId = null,
  requestId = null,
  quiet = false,
}: {
  otherId: string;
  otherName: string;
  conversationId?: string | null;
  requestId?: string | null;
  /** Show what is being settled, but do not offer to start: for a card that is about something else. */
  quiet?: boolean;
}) {
  const { available, meetings, myZone, haveLink, propose, confirm, counter, decline, cancel, change } = useMeetings();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = firstName(otherName);

  if (!available) return null;

  const { confirmed, awaiting } = schedulingWith(meetings, otherId);
  const proposal = awaiting ? openProposal(awaiting) : null;
  const read = (iso: string, m: ScheduledMeeting) => describeSlot(iso, myZone, m.otherTimeZone, name);

  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      if (done) toast({ title: done });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const changeDraft = (m: ScheduledMeeting): TimesDraft => ({
    slots: [m.startsAt ? isoToWall(m.startsAt, myZone) : ''],
    durationMinutes: asDuration(m.durationMinutes),
  });

  return (
    <section aria-label={`Practice time with ${otherName}`} className="space-y-3">
      {confirmed && (
        <div className="sticker space-y-2 bg-teal-soft p-4">
          <p className="flex items-center gap-2 font-display text-sm font-extrabold text-ink">
            <CalendarCheck className="size-4" aria-hidden /> You're casing
          </p>
          <p className="font-display text-lg font-bold leading-snug text-ink">{read(confirmed.startsAt!, confirmed)}</p>
          <p className="text-sm text-ink-2">{durationLabel(confirmed.durationMinutes)}</p>
          {confirmed.meetingLink ? <MeetingLink m={confirmed} name={name} /> : !confirmed.blocked && !haveLink && <AddLinkLine name={name} />}
          <div className="flex flex-wrap gap-2 pt-1">
            {!confirmed.blocked && (
              <Button size="sm" disabled={busy} onClick={() => setOpen({ kind: 'change', meeting: confirmed })}>
                <CalendarClock className="size-3.5" aria-hidden /> Move it
              </Button>
            )}
            <Button size="sm" disabled={busy} onClick={() => void act(() => cancel(confirmed.id), 'Called off')}>
              Call it off
            </Button>
          </div>
        </div>
      )}

      {awaiting && proposal && !awaiting.blocked && (
        <div className="sticker space-y-3 bg-sun-soft p-4">
          {awaiting.myTurn ? (
            <>
              <p className="font-display text-sm font-extrabold text-ink">{proposal.isChange ? `${name} asked to move your time` : `${name} proposed times`}</p>
              <ul className="space-y-2">
                {proposal.slots.map((slot) => (
                  <li key={slot}>
                    <Button
                      variant="primary"
                      className="w-full justify-start text-left"
                      disabled={busy}
                      onClick={() => void act(() => confirm(awaiting.id, slot), 'Time settled')}
                    >
                      {read(slot, awaiting)}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-ink-2">{durationLabel(proposal.durationMinutes)}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => setOpen({ kind: 'counter', meeting: awaiting })}>
                  Suggest other times
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void act(() => decline(awaiting.id), proposal.isChange ? 'Your time stands' : 'Times declined')}>
                  {proposal.isChange ? 'Keep our time' : 'No thanks'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="font-display text-sm font-extrabold text-ink">Waiting for {name} to pick</p>
              <ul className="space-y-1 text-sm text-ink">
                {proposal.slots.map((slot) => (
                  <li key={slot}>{read(slot, awaiting)}</li>
                ))}
              </ul>
              <p className="text-sm text-ink-2">{durationLabel(proposal.durationMinutes)}</p>
              {!proposal.isChange && (
                <Button size="sm" disabled={busy} onClick={() => void act(() => cancel(awaiting.id), 'Called off')}>
                  Call it off
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {!confirmed && !awaiting && !quiet && (
        <Button disabled={busy} onClick={() => setOpen({ kind: 'propose' })}>
          <CalendarPlus className="size-4" aria-hidden /> Schedule a time
        </Button>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad-text">
          {error}
        </p>
      )}

      {open?.kind === 'propose' && (
        <ProposeTimesDialog
          title={`Propose times to ${name}`}
          submitLabel="Send times"
          otherName={otherName}
          otherZone={zoneOfMember(meetings, otherId)}
          onClose={() => setOpen(null)}
          onSubmit={async (times) => {
            await propose(otherId, times, { conversationId, requestId });
            toast({ title: `Times sent to ${name}` });
          }}
        />
      )}

      {open?.kind === 'counter' && (
        <ProposeTimesDialog
          title={`Suggest other times to ${name}`}
          submitLabel="Send times"
          otherName={otherName}
          otherZone={open.meeting.otherTimeZone}
          onClose={() => setOpen(null)}
          onSubmit={async (times) => {
            await counter(open.meeting.id, times);
            toast({ title: `Times sent to ${name}` });
          }}
        />
      )}

      {open?.kind === 'change' && (
        <ProposeTimesDialog
          title="Move your case"
          description={`The time you have stands until ${name} picks a new one.`}
          submitLabel="Ask to move it"
          otherName={otherName}
          otherZone={open.meeting.otherTimeZone}
          initial={changeDraft(open.meeting)}
          onClose={() => setOpen(null)}
          onSubmit={async (times) => {
            await change(open.meeting.id, times);
            toast({ title: `Asked ${name} to move it` });
          }}
        />
      )}
    </section>
  );
}
