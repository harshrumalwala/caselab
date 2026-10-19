import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Logo } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { describeError } from '../../data/errors';
import { useAuth } from '../../state/AuthProvider';

function loginMessage(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? '';
  if (/invalid login credentials/i.test(msg)) return 'That email and password do not match.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email address first (check your inbox), then sign in.';
  return describeError(e);
}

/** Shown instead of the app until you are signed in. No sign-up: accounts are created in Supabase. */
export function LoginScreen() {
  const { signIn, startupError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(startupError ? describeError(startupError) : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      // On success the auth provider switches to the app; nothing more to do here.
    } catch (err) {
      setError(loginMessage(err));
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form onSubmit={submit} className="card space-y-5 p-6 sm:p-7" aria-labelledby="login-title">
          <div>
            <h1 id="login-title" className="text-xl font-semibold tracking-tight text-ink">
              Sign in
            </h1>
            <p className="mt-1 text-sm text-muted">Your cases are saved to your account and follow you across devices.</p>
          </div>

          <div>
            <label className="label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              className="field"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="field"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !email || !password}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}
