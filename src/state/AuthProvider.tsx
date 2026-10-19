import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthApi, AuthSession } from '../data/auth';
import { clearUserBrowserState } from './storageKeys';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; session: AuthSession };

interface AuthContextValue {
  state: AuthState;
  /** Resolves when signed in; rejects with the provider's error (wrong password, offline, ...). */
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Set when the initial session check failed (e.g. offline), rather than assuming signed out. */
  startupError: unknown;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ auth, children }: { auth: AuthApi; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [startupError, setStartupError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    // Only change state when the *user* changes, so token refreshes don't reload the app.
    const apply = (session: AuthSession | null) => {
      if (cancelled) return;
      setState((prev) => {
        if (!session) return prev.status === 'signedOut' ? prev : { status: 'signedOut' };
        if (prev.status === 'signedIn' && prev.session.userId === session.userId) return prev;
        return { status: 'signedIn', session };
      });
    };
    const unsubscribe = auth.onChange(apply);
    auth
      .getSession()
      .then(apply)
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

  const signOut = useCallback(async () => {
    clearUserBrowserState();
    await auth.signOut();
  }, [auth]);

  const value = useMemo(() => ({ state, signIn, signOut, startupError }), [state, signIn, signOut, startupError]);
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
