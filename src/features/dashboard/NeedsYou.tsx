import { Inbox, MessageCircle } from 'lucide-react';
import { useNavBadge } from '../../state/badge';

/**
 * A strip near the top of the Dashboard when someone is waiting on you: practice requests to answer, or conversations with
 * new messages. It disappears when there is nothing, so it never takes space for nothing.
 */
export function NeedsYou() {
  const { requests, chats } = useNavBadge();
  if (requests === 0 && chats === 0) return null;

  const link = 'inline-flex items-center gap-2 rounded-xl border-2 border-ink/80 bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-sun-soft';
  return (
    <section aria-label="Needs you" className="sticker flex flex-wrap items-center gap-x-4 gap-y-2.5 bg-lilac-soft px-4 py-3">
      <p className="font-display text-sm font-extrabold text-ink">Needs you</p>
      {requests > 0 && (
        <a href="#/requests" className={link}>
          <Inbox className="size-4" aria-hidden /> {requests} request{requests === 1 ? '' : 's'} to look at
        </a>
      )}
      {chats > 0 && (
        <a href="#/messages" className={link}>
          <MessageCircle className="size-4" aria-hidden /> {chats} conversation{chats === 1 ? '' : 's'} with new messages
        </a>
      )}
    </section>
  );
}
