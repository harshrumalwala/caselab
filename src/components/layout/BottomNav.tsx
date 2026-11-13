import { LayoutDashboard, ListChecks, Target, Timer, Users, type LucideIcon } from 'lucide-react';
import { CountDot } from '../ui/CountDot';
import { useNavBadge } from '../../state/badge';
import { ROUTES, UNDER_COMMUNITY, type NavRoute } from '../../state/route';
import { BucketAvatar } from '../../features/improvement/BucketAvatar';
import { useUI } from '../../state/ui';

const ICONS: Record<Exclude<NavRoute, 'live'>, LucideIcon> = {
  dashboard: LayoutDashboard,
  log: ListChecks,
  improve: Target,
  people: Users,
  warmup: Timer,
};

/** The live case has Bucket for an icon, a little bigger than the rest, because it is the one to find. */
function NavIcon({ id }: { id: NavRoute }) {
  if (id === 'live') return <BucketAvatar className="size-6" />;
  const Icon = ICONS[id];
  return <Icon className="size-5" />;
}

/** Phone navigation: the same sections, within thumb reach. */
export function BottomNav() {
  const { route } = useUI();
  const badge = useNavBadge();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-6">
        {ROUTES.map((r) => {
          const on = route === r.id || (r.id === 'people' && UNDER_COMMUNITY.includes(route)); // The Inbox and conversations live under Community
          const waiting = r.id === 'people' ? badge.total : 0;
          const spoken = r.id === 'people' ? badge.spoken : null;
          return (
            <li key={r.id}>
              <a
                href={`#/${r.id}`}
                aria-current={on ? 'page' : undefined}
                aria-label={waiting > 0 && spoken ? `${r.label}, ${spoken}` : r.label}
                data-tour={r.id === 'people' ? 'community' : r.id === 'live' ? 'live' : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  on ? 'text-accent-text' : 'text-muted'
                }`}
              >
                <span className="relative">
                  <NavIcon id={r.id} />
                  {waiting > 0 && <CountDot n={waiting} />}
                </span>
                {r.short}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
