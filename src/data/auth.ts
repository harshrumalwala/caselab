import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthSession {
  userId: string;
  email: string;
}

/** The little the app needs from an auth provider; Supabase Auth implements it below. */
export interface AuthApi {
  getSession(): Promise<AuthSession | null>;
  /** Called whenever the user signs in or out (including a session that expires). */
  onChange(listener: (session: AuthSession | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export function createSupabaseAuth(client: SupabaseClient): AuthApi {
  const toSession = (s: { user: { id: string; email?: string } } | null): AuthSession | null =>
    s ? { userId: s.user.id, email: s.user.email ?? '' } : null;

  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return toSession(data.session);
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toSession(session)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
  };
}
