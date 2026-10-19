import { Moon, Plus, Settings, Sun } from 'lucide-react';
import { ROUTES } from '../../state/route';
import { useTheme } from '../../state/theme';
import { useUI } from '../../state/ui';
import { Button, IconButton } from '../ui/Button';

export function Logo() {
  return (
    <a href="#/dashboard" className="flex items-center gap-2.5 rounded-lg" aria-label="CaseLab home">
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <rect x="3.5" y="12" width="4" height="8" rx="1.4" fill="#fff" fillOpacity=".55" />
          <rect x="10" y="8" width="4" height="12" rx="1.4" fill="#fff" fillOpacity=".8" />
          <rect x="16.5" y="3.5" width="4" height="16.5" rx="1.4" fill="#fff" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-ink">CaseLab</span>
    </a>
  );
}

export function Header() {
  const { route, openLogCase, openSettings } = useUI();
  const { isDark, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
          {ROUTES.map((r) => (
            <a
              key={r.id}
              href={`#/${r.id}`}
              aria-current={route === r.id ? 'page' : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                route === r.id ? 'bg-accent-soft text-accent-text' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {r.label}
            </a>
          ))}
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
          <IconButton label="Data and settings" onClick={openSettings}>
            <Settings className="size-[18px]" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
