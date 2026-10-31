import { useContext } from 'react';
import { chatsHaveNew } from '../domain/messages';
import { needYou } from '../domain/requests';
import { MessagesContext } from './MessagesProvider';
import { PracticeContext } from './PracticeProvider';

export interface NavBadge {
  requests: number;
  chats: number;
  /** What the number on the People tab shows. */
  total: number;
  /** For the link's spoken name, or null when there is nothing. */
  spoken: string | null;
}

/** Requests that need you plus conversations with new messages. Zero (and no label) where neither is loaded. */
export function useNavBadge(): NavBadge {
  const requests = useContext(PracticeContext)?.badge ?? 0;
  const chats = useContext(MessagesContext)?.unreadChats ?? 0;
  const parts = [requests > 0 && needYou(requests), chats > 0 && chatsHaveNew(chats)].filter(Boolean);
  return { requests, chats, total: requests + chats, spoken: parts.length ? parts.join(' and ') : null };
}
