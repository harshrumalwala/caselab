import { useContext } from 'react';
import { chatsHaveNew } from '../domain/messages';
import { needYou } from '../domain/requests';
import { MessagesContext } from './MessagesProvider';
import { PracticeContext } from './PracticeProvider';

export interface NavBadge {
  /** Practice requests waiting for your answer, plus answers you haven't seen. Shown on People. */
  requests: number;
  /** Conversations with new messages (not muted, not archived). Shown on Messages. */
  chats: number;
  /** For each link's spoken name, or null when there is nothing. */
  requestsSpoken: string | null;
  chatsSpoken: string | null;
}

/** The two counts. Zero (and no label) where requests and messages aren't loaded. */
export function useNavBadge(): NavBadge {
  const requests = useContext(PracticeContext)?.badge ?? 0;
  const chats = useContext(MessagesContext)?.unreadChats ?? 0;
  return {
    requests,
    chats,
    requestsSpoken: requests > 0 ? needYou(requests) : null,
    chatsSpoken: chats > 0 ? chatsHaveNew(chats) : null,
  };
}
