import { useState } from 'react';
import { BellOff, ChevronDown, FlaskConical, Loader2, MessageCircle } from 'lucide-react';
import { conversationSections, formatWhen, preview, type Conversation } from '../../domain/messages';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { chipClass } from '../../components/ui/chips';
import { EmptyState } from '../../components/ui/EmptyState';
import { useData } from '../../state/DataProvider';
import { useMessages } from '../../state/MessagesProvider';
import { useUI } from '../../state/ui';
import { Thread } from './Thread';

function Row({ c }: { c: Conversation }) {
  const fresh = c.unread > 0 && !c.muted;
  return (
    <li>
      <a
        href={`#/messages/${encodeURIComponent(c.id)}`}
        className="sticker flex items-center gap-3.5 p-4 transition hover:-translate-y-0.5 hover:bg-sun-soft"
        aria-label={`${c.otherName}${c.unread > 0 ? `, ${c.unread} unread` : ''}`}
      >
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink/80 font-display font-bold ${chipClass(c.otherName)}`} aria-hidden>
          {c.otherName.trim().charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`truncate ${fresh ? 'font-extrabold' : 'font-semibold'} text-ink`}>{c.otherName}</span>
            {c.muted && <BellOff className="size-3.5 shrink-0 text-muted" aria-label="Muted" />}
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

/** Your private conversations. They start when someone accepts a practice request. */
function List() {
  const { status, loadError, conversations, reload } = useMessages();
  const [showArchived, setShowArchived] = useState(false);
  const { active, archived } = conversationSections(conversations);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <a href="#/people" className="text-sm font-medium text-accent-text hover:underline">
          ← People
        </a>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Messages</h1>
        <p className="text-sm text-ink-2">Private conversations with members you've agreed to case with. They start when a practice request is accepted.</p>
      </div>

      {status === 'loading' && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" /> Loading your messages…
        </div>
      )}

      {status === 'error' && (
        <Card>
          <div role="alert" className="space-y-3 text-sm">
            <p className="font-semibold text-ink">Couldn't load your messages</p>
            <p className="text-ink-2">{loadError}</p>
            <Button onClick={() => void reload()}>Try again</Button>
          </div>
        </Card>
      )}

      {status === 'ready' && conversations.length === 0 && (
        <Card>
          <EmptyState icon={<MessageCircle className="size-6" />} title="No conversations yet" compact actions={<Button onClick={() => (window.location.hash = '#/requests')}>See your requests</Button>}>
            Ask someone to case from their profile in People. When they accept, you can talk here.
          </EmptyState>
        </Card>
      )}

      {active.length > 0 && (
        <ul className="space-y-2.5" aria-label="Conversations">
          {active.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section aria-labelledby="archived-title">
          <button
            type="button"
            id="archived-title"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"
          >
            <ChevronDown className={`size-4 transition ${showArchived ? '' : '-rotate-90'}`} aria-hidden /> Archived <span className="num text-muted">({archived.length})</span>
          </button>
          {showArchived && (
            <ul className="mt-3 space-y-2.5" aria-label="Archived conversations">
              {archived.map((c) => (
                <Row key={c.id} c={c} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** `#/messages` is the list; `#/messages/<id>` is one conversation. */
export function Messages() {
  const { mode, exitDemo } = useData();
  const { routeParam } = useUI();

  if (mode === 'demo') {
    return (
      <Card>
        <EmptyState icon={<FlaskConical className="size-6" />} title="Messages aren't available in demo mode" actions={<Button variant="primary" onClick={exitDemo}>Exit demo mode</Button>}>
          Demo mode uses sample data. Exit demo mode to see your real conversations.
        </EmptyState>
      </Card>
    );
  }
  return routeParam ? <Thread key={routeParam} conversationId={routeParam} /> : <List />;
}
