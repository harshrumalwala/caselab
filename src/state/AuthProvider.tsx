import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthApi, AuthEvent, AuthSession, SignUpResult } from '../data/auth';
import { clearUserBrowserState } from './storageKeys';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  /** `recovery`: signed in through a password-reset link and still has to choose a new password. */
  | { status: 'signedIn'; session: AuthSession; recovery: boolean };

interface AuthContextValue {
  state: AuthState;
  /** Resolves when signed in; rejects with the provider's error (wrong password, offline, ...). */
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  resendConfirmation(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  /** Choose a new password; also ends the "recovering" state. */
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Set when the initial session check failed (e.g. offline), rather than assuming signed out. */
  startupError: unknown;
  /** Set when the page was opened from an email link that had expired. */
  linkProblem: string | undefined;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  auth,
  linkProblem,
  children,
}: {
  auth: AuthApi;
  linkProblem?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [startupError, setStartupError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    // Only change state when the *user* changes (or a reset link arrives), so token refreshes
    // don't reload the app.
    const apply = (session: AuthSession | null, event?: AuthEvent) => {
      if (cancelled) return;
      setState((prev) => {
        if (!session) return prev.status === 'signedOut' ? prev : { status: 'signedOut' };
        const recovery = event === 'recovery' || (prev.status === 'signedIn' && prev.recovery);
        if (prev.status === 'signedIn' && prev.session.userId === session.userId && prev.recovery === recovery) return prev;
        return { status: 'signedIn', session, recovery };
      });
    };
    const unsubscribe = auth.onChange(apply);
    auth
      .getSession()
      .then((s) => apply(s))
      .catch((e) => {
        if (cancelled) return;
        setStartupError(e);
        setState({ status: 'signedOut' });
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [auth]);

  const signIn = useCallback((email: string, password: string) => auth.signIn(email, password), [auth]);
  const signUp = useCallback((email: string, password: string) => auth.signUp(email, password), [auth]);
  const resendConfirmation = useCallback((email: string) => auth.resendConfirmation(email), [auth]);
  const requestPasswordReset = useCallback((email: string) => auth.requestPasswordReset(email), [auth]);

  const updatePassword = useCallback(
    async (password: string) => {
      await auth.updatePassword(password);
      setState((prev) => (prev.status === 'signedIn' ? { ...prev, recovery: false } : prev));
    },
    [auth],
  );

  const signOut = useCallback(async () => {
    clearUserBrowserState();
    await auth.signOut();
  }, [auth]);

  const value = useMemo(
    () => ({ state, signIn, signUp, resendConfirmation, requestPasswordReset, updatePassword, signOut, startupError, linkProblem }),
    [state, signIn, signUp, resendConfirmation, requestPasswordReset, updatePassword, signOut, startupError, linkProblem],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user. Only call from components rendered after sign-in. */
export function useSession(): AuthSession {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useSession needs a signed-in user');
  return state.session;
}
