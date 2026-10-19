import { useState } from 'react';
import { AlertTriangle, FlaskConical, X } from 'lucide-react';
import { useData } from '../../state/DataProvider';
import { Button } from '../ui/Button';

function Banner({ tone, children, onDismiss }: { tone: 'warn' | 'bad'; children: React.ReactNode; onDismiss?: () => void }) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={`flex items-center gap-3 px-4 py-2.5 text-sm sm:px-6 ${
        tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-ink'
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 rounded-lg p-1 hover:bg-black/5">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Banners() {
  const { mode, exitDemo, saveError, persistent, loadWarning } = useData();
  const [warningHidden, setWarningHidden] = useState(false);

  return (
    <>
      {mode === 'demo' && (
        <Banner tone="warn">
          <FlaskConical className="size-4 shrink-0 text-warn" />
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">Demo mode.</strong> Sample data only.
            <span className="hidden sm:inline"> Your real cases are untouched and nothing here is saved to them.</span>
          </p>
          <Button size="sm" onClick={() => void exitDemo()}>
            Exit demo
          </Button>
        </Banner>
      )}
      {saveError && (
        <Banner tone="bad">
          <AlertTriangle className="size-4 shrink-0" />
          <p>{saveError}</p>
        </Banner>
      )}
      {!persistent && !saveError && (
        <Banner tone="bad">
          <AlertTriangle className="size-4 shrink-0" />
          <p>
            This browser is blocking storage, so CaseLab can't save between visits. Export a backup from Settings before
            you leave.
          </p>
        </Banner>
      )}
      {loadWarning && !warningHidden && (
        <Banner tone="warn" onDismiss={() => setWarningHidden(true)}>
          <AlertTriangle className="size-4 shrink-0 text-warn" />
          <p>{loadWarning}</p>
        </Banner>
      )}
    </>
  );
}
