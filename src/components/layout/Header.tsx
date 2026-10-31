import { Moon, Plus, Settings, Sun, UserRound } from 'lucide-react';
import { ROUTES, UNDER_PEOPLE } from '../../state/route';
import { useTheme } from '../../state/theme';
import { useUI } from '../../state/ui';
import { useNavBadge } from '../../state/badge';
import { Button, IconButton } from '../ui/Button';
import { CountDot } from '../ui/CountDot';

export function Logo() {
  return (
    <a href="#/dashboard" className="flex items-center gap-2.5 rounded-lg" aria-label="CaseLab home">
      <span className="relative flex size-9 items-center justify-center rounded-xl border-2 border-ink/80 bg-accent shadow-[2px_2px_0_0_rgb(28_26_24/0.85)]">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <rect x="3.5" y="12" width="4" height="8" rx="1.4" fill="#fff" fillOpacity=".55" />
          <rect x="10" y="8" width="4" height="12" rx="1.4" fill="#fff" fillOpacity=".8" />
          <rect x="16.5" y="3.5" width="4" height="16.5" rx="1.4" fill="#fff" />
        </svg>
        <span className="absolute -right-1.5 -top-1.5 size-3.5 rounded-full border-2 border-ink/80 bg-sun" aria-hidden />
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight text-ink">CaseLab</span>
    </a>
  );
}

export function Header() {
  const { route, openLogCase, openSettings, openProfile } = useUI();
  const { isDark, toggle } = useTheme();
  const badge = useNavBadge();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
          {ROUTES.map((r) => {
            const on = route === r.id || (r.id === 'people' && UNDER_PEOPLE.includes(route)); // Requests and Messages live under People
            const waiting = r.id === 'people' ? badge.total : 0;
            return (
              <a
                key={r.id}
                href={`#/${r.id}`}
                aria-current={on ? 'page' : undefined}
                aria-label={waiting > 0 && badge.spoken ? `${r.label}, ${badge.spoken}` : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  on ? 'bg-sun text-on-sun shadow-[2px_2px_0_0_rgb(28_26_24/0.85)] ring-2 ring-ink/80' : 'text-ink-2 hover:bg-sun-soft hover:text-ink'
                }`}
              >
                {r.label}
                {waiting > 0 && <CountDot n={waiting} inline />}
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="primary" onClick={() => openLogCase()} aria-label="Log case">
            <Plus className="size-4" />
            <span>
              Log Case<span className="hidden sm:inline"> </span>
            </span>
          </Button>
          <IconButton label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle}>
            {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </IconButton>
          <IconButton label="Profile and privacy" onClick={openProfile}>
            <UserRound className="size-[18px]" />
          </IconButton>
          <IconButton label="Data and settings" onClick={openSettings}>
            <Settings className="size-[18px]" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
