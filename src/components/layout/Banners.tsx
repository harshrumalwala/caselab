import { AlertTriangle, FlaskConical } from 'lucide-react';
import { useData } from '../../state/DataProvider';
import { Button } from '../ui/Button';

function Banner({ tone, children }: { tone: 'warn' | 'bad'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={`px-4 py-2.5 text-sm sm:px-6 ${tone === 'bad' ? 'bg-bad-soft text-bad-text' : 'bg-warn-soft text-ink'}`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3">{children}</div>
    </div>
  );
}

export function Banners() {
  const { mode, exitDemo, refreshError, reload } = useData();

  return (
    <>
      {mode === 'demo' && (
        <Banner tone="warn">
          <FlaskConical className="size-4 shrink-0 text-warn-text" />
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">Demo mode.</strong> Sample data only.
            <span className="hidden sm:inline"> Your real cases are untouched and nothing here is saved to them.</span>
          </p>
          <Button size="sm" onClick={exitDemo}>
            Exit demo
          </Button>
        </Banner>
      )}
      {refreshError && (
        <Banner tone="bad">
          <AlertTriangle className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">Couldn't refresh your cases, so what you see may be out of date. {refreshError}</p>
          <Button size="sm" onClick={() => void reload()}>
            Retry
          </Button>
        </Banner>
      )}
    </>
  );
}
