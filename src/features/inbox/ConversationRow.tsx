import { BellOff, CalendarCheck, CalendarClock } from 'lucide-react';
import { formatWhen, preview, type Conversation } from '../../domain/messages';
import { formatDateTime } from '../../domain/meetingTime';
import { schedulingWith } from '../../domain/scheduling';
import { Badge } from '../../components/ui/Badge';
import { chipClass } from '../../components/ui/chips';
import { useMeetings } from '../../state/SchedulingProvider';

export function ConversationRow({ c }: { c: Conversation }) {
  const { meetings, myZone } = useMeetings();
  const fresh = c.unread > 0 && !c.muted;
  const { confirmed, awaiting } = schedulingWith(meetings, c.otherId);
  const pick = awaiting?.myTurn === true;
  return (
    <li>
      <a
        href={`#/messages/${encodeURIComponent(c.id)}`}
        className="sticker flex items-center gap-3.5 p-4 transition hover:-translate-y-0.5 hover:bg-sun-soft"
        aria-label={`${c.otherName}${c.unread > 0 ? `, ${c.unread} unread` : ''}${pick ? ', a time to pick' : ''}`}
      >
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink/80 font-display font-bold ${chipClass(c.otherName)}`} aria-hidden>
          {c.otherName.trim().charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`truncate ${fresh ? 'font-extrabold' : 'font-semibold'} text-ink`}>{c.otherName}</span>
            {c.muted && <BellOff className="size-3.5 shrink-0 text-muted" aria-label="Muted" />}
            {pick ? (
              <Badge tone="warn" className="shrink-0">
                <CalendarClock className="size-3" aria-hidden /> Time to pick
              </Badge>
            ) : (
              confirmed?.startsAt && (
                <Badge tone="good" className="hidden shrink-0 sm:inline-flex">
                  <CalendarCheck className="size-3" aria-hidden /> {formatDateTime(confirmed.startsAt, myZone)}
                </Badge>
              )
            )}
          </span>
          <span className={`block truncate text-sm ${fresh ? 'font-semibold text-ink' : 'text-muted'}`}>{preview(c)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-xs text-muted">{formatWhen(c.lastAt)}</span>
          {c.unread > 0 && (
            <span aria-hidden className={`num min-w-5 rounded-full border-2 border-ink/80 px-1.5 text-center text-[11px] font-extrabold leading-4 ${c.muted ? 'bg-surface-2 text-muted' : 'bg-coral text-on-color'}`}>
              {c.unread}
            </span>
          )}
        </span>
      </a>
    </li>
  );
}
