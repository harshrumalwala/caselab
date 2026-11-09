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
import { ShortcutsDialog } from './features/help/ShortcutsDialog';
import { PromotedDialog } from './features/progress/PromotedDialog';
import { useLevelUp } from './features/progress/useLevelUp';
import { useShareLevel } from './features/progress/useShareLevel';
import { progressFor } from './domain/progress';
import { Tour } from './features/tour/Tour';
import { hasSeenTour } from './features/tour/seen';
import { GO_KEYS, GO_WINDOW_MS, isTyping } from './features/help/shortcuts';
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
import { takeImportIntent } from './state/afterSignup';
import { useRoute } from './state/route';
import { MessagesProvider } from './state/MessagesProvider';
import { PracticeProvider } from './state/PracticeProvider';
import { GameProvider, useGame } from './state/game';
import { ThemeProvider } from './state/theme';
import { GoalProvider } from './state/GoalProvider';
import { InsightsProvider } from './state/InsightsProvider';
import { InterviewedProvider } from './state/InterviewedProvider';
import { WarmupSyncContext, type WarmupSync } from './state/warmupSync';
import { ToastProvider } from './state/ToastProvider';
import { UIContext, type UIContextValue } from './state/ui';

interface LogState {
  key: number;
  editId: string | null;
  prefill: Partial<CaseInput> | null;
}

function Shell() {
  const { status, loadError, reload, mode, cases } = useData();
  const { signOut } = useAuth();
  const session = useSession();
  const warmupSync = useContext(WarmupSyncContext);
  const [location, navigate] = useRoute();
  const [logState, setLogState] = useState<LogState | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Levels: notice a new highest level and celebrate it once, when nothing else is open (demo mode never counts, it is sample data).
  const { enabled: gameOn } = useGame();
  const level = useMemo(() => progressFor(cases).level, [cases]);
  const levelUp = useLevelUp(session.userId, level, status === 'ready' && mode !== 'demo');
  // Members who chose to show their level get it kept up to date (never from sample data).
  useShareLevel(level, status === 'ready' && mode !== 'demo');
  // A brand-new account gets the tour once: not people who already have cases, and not after it was finished or skipped.
  const [tourPending] = useState(() => !hasSeenTour(session.userId));
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
      openShortcuts: () => setShortcutsOpen(true),
      openBurned: () => {
        setProfileFocus('burned');
        setProfileOpen(true);
      },
    }),
    [location, navigate],
  );

  // Keyboard shortcuts work from anywhere, as long as you're not typing or in a dialog:
  // "n" logs a case, "?" lists the shortcuts, and "g" then a letter jumps to a screen.
  useEffect(() => {
    let goUntil = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (Date.now() < goUntil) {
        goUntil = 0;
        const target = GO_KEYS.find((g) => g.key === key);
        if (target) {
          e.preventDefault();
          ui.navigate(target.route);
          return;
        }
      }
      if (key === 'n') {
        e.preventDefault();
        ui.openLogCase();
      } else if (e.key === '?') {
        e.preventDefault();
        ui.openShortcuts();
      } else if (key === 'g') {
        goUntil = Date.now() + GO_WINDOW_MS;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ui]);

  // Someone who chose "Create account and import" on the landing page gets the import as soon as their new account opens.
  useEffect(() => {
    if (status !== 'ready' || mode === 'demo') return;
    if (takeImportIntent() && cases.length === 0) setImportOpen(true);
    // Only when the account has just loaded; later changes to the cases must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
        {/* The first stop for someone using the keyboard: skip past the navigation. (A link to #main would change the page address.) */}
        <button
          type="button"
          onClick={() => document.getElementById('main-content')?.focus()}
          className="fixed left-3 top-3 z-[120] -translate-y-24 rounded-xl border-2 border-ink/80 bg-surface px-4 py-2 text-sm font-bold text-ink shadow-pop transition-transform focus:translate-y-0"
        >
          Skip to main content
        </button>
        <Header />
        <Banners />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 sm:pt-8 lg:pb-12">
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
          . Press{' '}
          <button type="button" className="font-semibold text-accent-text hover:underline" onClick={ui.openShortcuts}>
            ?
          </button>{' '}
          for keyboard shortcuts.
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
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {gameOn && levelUp.promotion && !logState && !viewId && !settingsOpen && !importOpen && !profileOpen && !shortcutsOpen && (
        <PromotedDialog from={levelUp.promotion.from} to={levelUp.promotion.to} onClose={levelUp.dismiss} />
      )}
      <Tour
        userId={session.userId}
        active={
          tourPending &&
          mode !== 'demo' &&
          cases.length === 0 &&
          location.route === 'dashboard' &&
          !logState &&
          !viewId &&
          !settingsOpen &&
          !importOpen &&
          !profileOpen &&
          !shortcutsOpen
        }
      />
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
            goal: backend.createGoal(userId),
            insights: backend.createInsights(),
            interviewed: backend.createInterviewed(),
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
            <GoalProvider repository={repos.goal}>
              <InsightsProvider repository={repos.insights}>
                <InterviewedProvider repository={repos.interviewed}>
                  <PracticeProvider practice={repos.practice}>
                    <MessagesProvider messages={repos.messages}>
                      <Shell />
                    </MessagesProvider>
                  </PracticeProvider>
                </InterviewedProvider>
              </InsightsProvider>
            </GoalProvider>
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
      <GameProvider>
        <ToastProvider>
          {'problem' in resolved ? (
            <ConfigProblem problem={resolved.problem} />
          ) : (
            <AuthProvider auth={resolved.backend.auth} linkProblem={resolved.backend.linkProblem}>
              <AuthGate backend={resolved.backend} />
            </AuthProvider>
          )}
        </ToastProvider>
      </GameProvider>
    </ThemeProvider>
  );
}
