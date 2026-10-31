import { CountDot } from '../../components/ui/CountDot';
import { pillTabClass } from '../../components/ui/pillTab';
import { useNavBadge } from '../../state/badge';

/**
 * The two views of the Community tab: the member directory, and your Inbox (practice requests and conversations together).
 * The Inbox carries the count of things that need you.
 */
export function CommunityTabs({ current }: { current: 'members' | 'inbox' }) {
  const badge = useNavBadge();
  return (
    <nav aria-label="Community" className="flex flex-wrap gap-2">
      <a href="#/people" aria-current={current === 'members' ? 'page' : undefined} className={pillTabClass(current === 'members')}>
        Members
      </a>
      <a
        href="#/inbox"
        aria-current={current === 'inbox' ? 'page' : undefined}
        aria-label={badge.total > 0 && badge.spoken ? `Inbox, ${badge.spoken}` : 'Inbox'}
        className={pillTabClass(current === 'inbox')}
      >
        Inbox
        {badge.total > 0 && <CountDot n={badge.total} inline />}
      </a>
    </nav>
  );
}
