import { CountDot } from '../../components/ui/CountDot';
import { splitTabClass, splitTabsClass } from '../../components/ui/splitTab';
import { useNavBadge } from '../../state/badge';

/**
 * The two views of the Community tab: the member directory, and your Inbox (practice requests and conversations together).
 * One control split across the full width, each half the same size, so the two views read as a pair. The Inbox carries the count
 * of things that need you.
 */
export function CommunityTabs({ current }: { current: 'members' | 'inbox' }) {
  const badge = useNavBadge();
  return (
    <nav aria-label="Community" className={splitTabsClass}>
      <a href="#/people" aria-current={current === 'members' ? 'page' : undefined} className={splitTabClass(current === 'members')}>
        Members
      </a>
      <a
        href="#/inbox"
        aria-current={current === 'inbox' ? 'page' : undefined}
        aria-label={badge.total > 0 && badge.spoken ? `Inbox, ${badge.spoken}` : 'Inbox'}
        className={splitTabClass(current === 'inbox')}
      >
        Inbox
        {badge.total > 0 && <CountDot n={badge.total} inline />}
      </a>
    </nav>
  );
}
