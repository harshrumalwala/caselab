import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Banners } from './components/layout/Banners';
import { BottomNav } from './components/layout/BottomNav';
import { Header } from './components/layout/Header';
import { createSupabaseBackend, type Backend, type BackendResult } from './data/backend';
import type { CaseInput } from './domain/types';
import { ConfigProblem, LoadFailed, Splash } from './features/auth/StatusScreens';
import { SetNewPasswordScreen } from './features/auth/LoginScreen';
import { CaseDetail } from './features/caselog/CaseDetail';
import { CaseLog } from './features/caselog/CaseLog';
import { Onboarding } from './features/community/Onboarding';
import { ProfileSettingsDialog } from './features/community/ProfileSettingsDialog';
import { Dashboard } from './features/dashboard/Dashboard';
import { ImprovementAreas } from './features/improvement/ImprovementAreas';
import { LogCaseDialog } from './features/logcase/LogCaseDialog';
import { People } from './features/people/People';
import { Warmup } from './features/warmup/Warmup';
import { ConversationScreen, Inbox } from './features/inbox/Inbox';
import { PublicSite } from './features/public/PublicSite';
import { ImportDialog } from './features/import/ImportDialog';
import { SettingsDialog } from './features/settings/SettingsDialog';
import { AuthProvider, useAuth, useSession } from './state/AuthProvider';
import { CommunityProvider, useCommunity } from './state/CommunityProvider';
import { DataProvider, useData } from './state/DataProvider';
import { useRoute } from './state/route';
import { MessagesProvider } from './state/MessagesProvider';
import { PracticeProvider } from './state/PracticeProvider';
import { ThemeProvider } from './state/theme';
import { WarmupSyncContext, type WarmupSync } from './state/warmupSync';
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
  const { status, loadError, reload, mode } = useData();
  const { signOut } = useAuth();
  const session = useSession();
  const warmupSync = useContext(WarmupSyncContext);
  const [location, navigate] = useRoute();
  const [logState, setLogState] = useState<LogState | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileFocus, setProfileFocus] = useState<'burned' | null>(null);
  const counter = useRef(0);

  // Arriving from the sign-in or sign-up page: drop that address and show the dashboard.
  useEffect(() => {
    if (/^#\/(signin|signup)/.test(window.location.hash)) navigate('dashboard');
  }, [navigate]);

  // Switching between real and demo data must not leave a dialog open on the other dataset.
  useEffect(() => {
    setLogState(null);
    setViewId(null);
  }, [mode]);

  const ui = useMemo<UIContextValue>(
    () => ({
      route: location.route,
      routeParam: location.param,
      navigate,
      openLogCase: (prefill) => setLogState({ key: ++counter.current, editId: null, prefill: prefill ?? null }),
      editCase: (id) => setLogState({ key: ++counter.current, editId: id, prefill: null }),
      viewCase: (id) => setViewId(id),
      openSettings: () => setSettingsOpen(true),
      openImport: () => setImportOpen(true),
      openProfile: () => {
        setProfileFocus(null);
        setProfileOpen(true);
      },
      openBurned: () => {
        setProfileFocus('burned');
        setProfileOpen(true);
      },
    }),
    [location, navigate],
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

  if (status === 'loading') return <Splash label="Dusting off your case log…" />;
  if (status === 'error') {
    return (
      <LoadFailed
        message={loadError ?? 'Something went wrong loading your cases.'}
        onRetry={() => void reload()}
        onSignOut={() => void signOut()}
      />
    );
  }

  return (
    <UIContext.Provider value={ui}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <Banners />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-12">
          {location.route === 'dashboard' && <Dashboard />}
          {location.route === 'log' && <CaseLog />}
          {location.route === 'improve' && <ImprovementAreas />}
          {location.route === 'people' && <People />}
          {location.route === 'inbox' && <Inbox />}
          {location.route === 'messages' && <ConversationScreen />}
          {location.route === 'warmup' && (
            // Demo mode never touches the account, so the record stays on this device there.
            <WarmupSyncContext.Provider value={mode === 'demo' ? null : warmupSync}>
              <Warmup />
            </WarmupSyncContext.Provider>
          )}
        </main>
        <footer className="hidden border-t border-line px-6 py-5 text-center text-xs text-muted lg:block">
          Saved to your account{session.email ? ` (${session.email})` : ''} and available on every device you sign in
          on. Your cases are private unless you choose to share them in{' '}
          <button type="button" className="font-semibold text-accent-text hover:underline" onClick={ui.openProfile}>
            Profile &amp; privacy
          </button>
          .
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
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
      {profileOpen && <ProfileSettingsDialog focus={profileFocus} onClose={() => setProfileOpen(false)} />}
    </UIContext.Provider>
  );
}

/** First sign-in: set up a profile before anything else. Later sign-ins skip straight through. */
function ProfileGate({ children }: { children: ReactNode }) {
  const { status, loadError, profile, reload } = useCommunity();
  const { signOut } = useAuth();
  if (status === 'loading') return <Splash label="Warming up your profile…" />;
  if (status === 'error') {
    return (
      <LoadFailed
        message={loadError ?? 'Something went wrong loading your profile.'}
        onRetry={() => void reload()}
        onSignOut={() => void signOut()}
      />
    );
  }
  if (!profile) return <Onboarding />;
  return <>{children}</>;
}

/** Not signed in, signed in via a reset link (choose a password), or signed in. */
function AuthGate({ backend }: { backend: Backend }) {
  const { state } = useAuth();
  const userId = state.status === 'signedIn' ? state.session.userId : null;
  // Visitors without an account read through a client that never holds a session.
  const publicReader = useMemo(() => backend.createPublicCommunity(), [backend]);
  // One set of repositories per signed-in user; a different user never reuses another's.
  const repos = useMemo(
    () =>
      userId
        ? {
            data: backend.createRepository(),
            community: backend.createCommunity(userId),
            warmup: { repository: backend.createWarmup(userId), userId } satisfies WarmupSync,
            practice: backend.createPractice(),
            messages: backend.createMessages(),
          }
        : null,
    [backend, userId],
  );

  if (state.status === 'loading') return <Splash label="Checking your session…" />;
  if (state.status === 'signedOut' || !repos) return <PublicSite reader={publicReader} />;
  if (state.recovery) return <SetNewPasswordScreen />;
  return (
    <CommunityProvider key={state.session.userId} community={repos.community}>
      <ProfileGate>
        <DataProvider repository={repos.data}>
          <WarmupSyncContext.Provider value={repos.warmup}>
            <PracticeProvider practice={repos.practice}>
              <MessagesProvider messages={repos.messages}>
                <Shell />
              </MessagesProvider>
            </PracticeProvider>
          </WarmupSyncContext.Provider>
        </DataProvider>
      </ProfileGate>
    </CommunityProvider>
  );
}

// Built once per page load from the VITE_SUPABASE_* settings.
let defaultBackend: ReturnType<typeof createSupabaseBackend> | null = null;

/** `backend` is injectable so tests can run the whole app against fakes. */
export function App({ backend }: { backend?: BackendResult } = {}) {
  const resolved = useMemo(() => {
    if (backend) return backend;
    defaultBackend ??= createSupabaseBackend();
    return defaultBackend;
  }, [backend]);

  return (
    <ThemeProvider>
      <ToastProvider>
        {'problem' in resolved ? (
          <ConfigProblem problem={resolved.problem} />
        ) : (
          <AuthProvider auth={resolved.backend.auth} linkProblem={resolved.backend.linkProblem}>
            <AuthGate backend={resolved.backend} />
          </AuthProvider>
        )}
      </ToastProvider>
    </ThemeProvider>
  );
}
