import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthSession {
  userId: string;
  email: string;
}

/** Why the auth state changed. `recovery` = the user followed a password-reset link. */
export type AuthEvent = 'signed_in' | 'signed_out' | 'recovery' | 'updated';

export interface SignUpResult {
  /**
   * True when the account exists but must confirm its email before it can sign in. We show the same
   * "check your email" screen whether or not the address was already registered, so the form never
   * reveals who has an account.
   */
  needsVerification: boolean;
}

/** The little the app needs from an auth provider; Supabase Auth implements it below. */
export interface AuthApi {
  getSession(): Promise<AuthSession | null>;
  /** Called whenever the user signs in or out (including a session that expires). */
  onChange(listener: (session: AuthSession | null, event: AuthEvent) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  resendConfirmation(email: string): Promise<void>;
  /** Email a password-reset link. */
  requestPasswordReset(email: string): Promise<void>;
  /** Set a new password for the signed-in (or recovering) user. */
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Permanently delete the signed-in member's account and everything they own, then end this browser's session. */
  deleteAccount(): Promise<void>;
}

/** Where email links (verify, reset) should send people back to: this app, without any #fragment. */
function returnUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
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
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const kind: AuthEvent =
          event === 'PASSWORD_RECOVERY'
            ? 'recovery'
            : event === 'SIGNED_OUT'
              ? 'signed_out'
              : event === 'USER_UPDATED'
                ? 'updated'
                : 'signed_in';
        listener(toSession(session), kind);
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: returnUrl() } });
      if (error) throw error;
      // With "Confirm email" on (required for CaseLab) there is no session until the link is clicked.
      return { needsVerification: !data.session };
    },
    async resendConfirmation(email) {
      const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: returnUrl() } });
      if (error) throw error;
    },
    async requestPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account', { p_confirm: 'DELETE' });
      if (error) throw error;
      // The login is gone, so end this browser's session without asking the server about a user that no longer exists.
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    },
  };
}
