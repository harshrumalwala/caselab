import { LayoutDashboard, ListChecks, Target, Timer, Users, type LucideIcon } from 'lucide-react';
import { CountDot } from '../ui/CountDot';
import { useNavBadge } from '../../state/badge';
import { ROUTES, UNDER_COMMUNITY, type NavRoute } from '../../state/route';
import { useUI } from '../../state/ui';

const ICONS: Record<NavRoute, LucideIcon> = {
  dashboard: LayoutDashboard,
  log: ListChecks,
  improve: Target,
  people: Users,
  warmup: Timer,
};

/** Phone navigation: the same sections, within thumb reach. */
export function BottomNav() {
  const { route } = useUI();
  const badge = useNavBadge();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ROUTES.map((r) => {
          const Icon = ICONS[r.id];
          const on = route === r.id || (r.id === 'people' && UNDER_COMMUNITY.includes(route)); // The Inbox and conversations live under Community
          const waiting = r.id === 'people' ? badge.total : 0;
          const spoken = r.id === 'people' ? badge.spoken : null;
          return (
            <li key={r.id}>
              <a
                href={`#/${r.id}`}
                aria-current={on ? 'page' : undefined}
                aria-label={waiting > 0 && spoken ? `${r.label}, ${spoken}` : r.label}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  on ? 'text-accent-text' : 'text-muted'
                }`}
              >
                <span className="relative">
                  <Icon className="size-5" />
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
