import { useContext } from 'react';
import { chatsHaveNew } from '../domain/messages';
import { needsAnswer, needYou } from '../domain/requests';
import { timesNeedingYou, timesNeedYou } from '../domain/scheduling';
import { MessagesContext } from './MessagesProvider';
import { PracticeContext } from './PracticeProvider';
import { useMeetings } from './SchedulingProvider';

export interface NavBadge {
  /** Practice requests waiting for your answer, plus answers you haven't seen. */
  requests: number;
  /** Conversations with new messages (not muted, not archived). */
  chats: number;
  /** Times somebody proposed that are waiting for you to pick, counter or say no to. */
  times: number;
  /** What the number on the Community tab shows: all three together. */
  total: number;
  /** For the tab's spoken name, or null when there is nothing. */
  spoken: string | null;
}

/** Requests that need you, conversations with new messages, and times waiting for your answer. */
export function useNavBadge(): NavBadge {
  const practice = useContext(PracticeContext);
  const requests = practice?.badge ?? 0;
  const chats = useContext(MessagesContext)?.unreadChats ?? 0;
  // A request you haven't answered is already counted, and its times are picked by answering it.
  const times = timesNeedingYou(useMeetings().meetings, (practice?.requests ?? []).filter(needsAnswer).map((r) => r.id)).length;
  const parts = [requests > 0 && needYou(requests), chats > 0 && chatsHaveNew(chats), times > 0 && timesNeedYou(times)].filter(Boolean);
  return { requests, chats, times, total: requests + chats + times, spoken: parts.length ? parts.join(' and ') : null };
}
