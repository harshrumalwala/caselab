import { useEffect, useMemo, useRef, useState } from 'react';
import { Banners } from './components/layout/Banners';
import { BottomNav } from './components/layout/BottomNav';
import { Header } from './components/layout/Header';
import type { CaseInput } from './domain/types';
import { formatTimestamp } from './domain/dates';
import { CaseDetail } from './features/caselog/CaseDetail';
import { CaseLog } from './features/caselog/CaseLog';
import { Dashboard } from './features/dashboard/Dashboard';
import { ImprovementAreas } from './features/improvement/ImprovementAreas';
import { LogCaseDialog } from './features/logcase/LogCaseDialog';
import { SettingsDialog } from './features/settings/SettingsDialog';
import { DataProvider, useData } from './state/DataProvider';
import { useRoute } from './state/route';
import { ThemeProvider } from './state/theme';
import { ToastProvider } from './state/ToastProvider';
import { UIContext, type UIContextValue } from './state/ui';

interface LogState {
  key: number;
  editId: string | null;
  prefill: Partial<CaseInput> | null;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function Shell() {
  const { ready, mode, data } = useData();
  const [route, navigate] = useRoute();
  const [logState, setLogState] = useState<LogState | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const counter = useRef(0);

  // Switching between real and demo data must not leave a dialog open on the other dataset.
  useEffect(() => {
    setLogState(null);
    setViewId(null);
  }, [mode]);

  const ui = useMemo<UIContextValue>(
    () => ({
      route,
      navigate,
      openLogCase: (prefill) => setLogState({ key: ++counter.current, editId: null, prefill: prefill ?? null }),
      editCase: (id) => setLogState({ key: ++counter.current, editId: id, prefill: null }),
      viewCase: (id) => setViewId(id),
      openSettings: () => setSettingsOpen(true),
    }),
    [route, navigate],
  );

  // "n" opens the Log Case form from anywhere, as long as you're not typing or in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      ui.openLogCase();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ui]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted" role="status">
        Loading your cases…
      </div>
    );
  }

  return (
    <UIContext.Provider value={ui}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <Banners />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pb-12">
          {route === 'dashboard' && <Dashboard />}
          {route === 'log' && <CaseLog />}
          {route === 'improve' && <ImprovementAreas />}
        </main>
        <footer className="hidden border-t border-line px-6 py-5 text-center text-xs text-muted md:block">
          Your cases are saved in this browser only and don't sync between devices. Last backup:{' '}
          {formatTimestamp(data.lastExportAt)}.{' '}
          <button type="button" className="font-semibold text-accent-text hover:underline" onClick={ui.openSettings}>
            Back up in Settings
          </button>
        </footer>
        <BottomNav />
      </div>

      {viewId && <CaseDetail caseId={viewId} onClose={() => setViewId(null)} />}
      {logState && (
        <LogCaseDialog
          key={logState.key}
          editId={logState.editId}
          prefill={logState.prefill}
          onClose={() => setLogState(null)}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </UIContext.Provider>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <DataProvider>
          <Shell />
        </DataProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
