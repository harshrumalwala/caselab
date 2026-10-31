import { CountDot } from '../../components/ui/CountDot';
import { useNavBadge } from '../../state/badge';

/**
 * The two views of the Community tab: the member directory, and your Inbox (practice requests and conversations together).
 * The Inbox carries the count of things that need you.
 */
export function CommunityTabs({ current }: { current: 'members' | 'inbox' }) {
  const badge = useNavBadge();
  const item = (on: boolean) =>
    `flex flex-1 items-center justify-center rounded-lg px-3 py-2 transition ${on ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`;
  return (
    <nav aria-label="Community" className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
      <a href="#/people" aria-current={current === 'members' ? 'page' : undefined} className={item(current === 'members')}>
        Members
      </a>
      <a
        href="#/inbox"
        aria-current={current === 'inbox' ? 'page' : undefined}
        aria-label={badge.total > 0 && badge.spoken ? `Inbox, ${badge.spoken}` : 'Inbox'}
        className={item(current === 'inbox')}
      >
        Inbox
        {badge.total > 0 && <CountDot n={badge.total} inline />}
      </a>
    </nav>
  );
}
