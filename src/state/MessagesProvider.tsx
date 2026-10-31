import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MessagesRepository } from '../data/messages';
import { describeError } from '../data/errors';
import { unreadChats, type Conversation } from '../domain/messages';
import { usePractice } from './PracticeProvider';

type Status = 'loading' | 'ready' | 'error';

interface MessagesContextValue {
  /** For screens that read and write one conversation. */
  repository: MessagesRepository;
  status: Status;
  loadError: string | null;
  /** Your conversations, newest first. */
  conversations: Conversation[];
  /** Conversations with new messages (not muted, not archived). Shown on the People tab. */
  unreadChats: number;
  reload(): Promise<void>;
}

export const MessagesContext = createContext<MessagesContextValue | null>(null);

/** How often to look for new messages while the app is open and visible (an open conversation looks more often). */
const REFRESH_MS = 60_000;

/**
 * The list of your conversations and the count of new messages. Lives inside the practice requests provider because
 * accepting a request is what opens a conversation, so the list is reloaded when that happens.
 */
export function MessagesProvider({ messages, children }: { messages: MessagesRepository; children: ReactNode }) {
  const { requests } = usePractice();
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    try {
      setConversations(await messages.conversations());
      loaded.current = true;
      setLoadError(null);
      setStatus('ready');
    } catch (e) {
      // A failed refresh in the background keeps what is already on screen.
      if (!loaded.current) {
        setLoadError(describeError(e));
        setStatus('error');
      }
    }
  }, [messages]);

  useEffect(() => {
    void reload();
    const again = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const timer = window.setInterval(again, REFRESH_MS);
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', again);
    };
  }, [reload]);

  // Accepting a request opens a conversation: look again whenever the number of accepted requests changes.
  const accepted = requests.filter((r) => r.status === 'accepted').length;
  useEffect(() => {
    if (loaded.current) void reload();
  }, [accepted, reload]);

  const value = useMemo<MessagesContextValue>(
    () => ({ repository: messages, status, loadError, conversations, unreadChats: unreadChats(conversations), reload }),
    [messages, status, loadError, conversations, reload],
  );
  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages(): MessagesContextValue {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages must be used inside MessagesProvider');
  return ctx;
}

/** The conversation with one member, if there is one. */
export function useConversationWith(userId: string): Conversation | undefined {
  return useContext(MessagesContext)?.conversations.find((c) => c.otherId === userId);
}
