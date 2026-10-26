import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { Logo } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { describeAuthError } from '../../data/errors';
import { useAuth } from '../../state/AuthProvider';

export const MIN_PASSWORD = 8;

export type Mode = 'signin' | 'signup' | 'forgot';
type Sent = { kind: 'verify' | 'reset'; email: string } | null;

function Shell({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {onBack && (
          <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline">
            <ArrowLeft className="size-4" /> Back to CaseLab
          </button>
        )}
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        {children}
      </div>
    </main>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad">
      {children}
    </p>
  );
}

function Busy({ label }: { label: string }) {
  return (
    <>
      <Loader2 className="size-4 animate-spin" /> {label}
    </>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-semibold text-accent-text hover:underline">
      {children}
    </button>
  );
}

/** "Check your email" after creating an account or asking for a password reset. */
function CheckEmail({ sent, onBack }: { sent: NonNullable<Sent>; onBack: () => void }) {
  const { resendConfirmation, requestPasswordReset } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (sent.kind === 'verify') await resendConfirmation(sent.email);
      else await requestPasswordReset(sent.email);
      setNote('Sent again. It can take a minute to arrive; check your spam folder too.');
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-5 p-6 text-center sm:p-7" role="status">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
        <MailCheck className="size-6" />
      </span>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {sent.kind === 'verify' ? (
            <>
              We sent a verification link to <strong className="font-semibold text-ink">{sent.email}</strong>. Open it to
              confirm your address and you'll be signed in. If you already have an account, sign in or reset your
              password instead.
            </>
          ) : (
            <>
              If an account exists for <strong className="font-semibold text-ink">{sent.email}</strong>, a password reset
              link is on its way.
            </>
          )}
        </p>
      </div>
      {note && <p className="text-sm font-medium text-good">{note}</p>}
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex flex-col gap-2">
        <Button onClick={() => void resend()} disabled={busy}>
          {busy ? <Busy label="Sending…" /> : 'Send it again'}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    </div>
  );
}

/** Sign in, create an account, or reset a password. Shown instead of the app until you are signed in. */
export function LoginScreen({ initialMode = 'signin', onBack }: { initialMode?: Mode; onBack?: () => void } = {}) {
  const { signIn, signUp, requestPasswordReset, startupError, linkProblem } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    linkProblem ?? (startupError ? describeAuthError(startupError) : null),
  );
  const [sent, setSent] = useState<Sent>(null);
  const [unverified, setUnverified] = useState(false);

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setUnverified(false);
    setConfirm('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const address = email.trim();
    setError(null);
    setUnverified(false);

    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD) return setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
      if (password !== confirm) return setError('The two passwords do not match.');
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(address, password);
        return; // the auth provider switches to the app
      }
      if (mode === 'signup') {
        const { needsVerification } = await signUp(address, password);
        if (needsVerification) setSent({ kind: 'verify', email: address });
        return;
      }
      await requestPasswordReset(address);
      setSent({ kind: 'reset', email: address });
    } catch (err) {
      setError(describeAuthError(err));
      if (mode === 'signin' && /not verified|not confirmed/i.test(describeAuthError(err))) setUnverified(true);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Shell onBack={onBack}>
        <CheckEmail
          sent={sent}
          onBack={() => {
            setSent(null);
            go('signin');
          }}
        />
      </Shell>
    );
  }

  const title = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset your password';
  const blurb =
    mode === 'signin'
      ? 'Your cases are saved to your account and follow you across devices.'
      : mode === 'signup'
        ? "We'll email a link to verify your address. After that you'll set up a short profile."
        : "Enter your email and we'll send you a link to choose a new password.";

  return (
    <Shell onBack={onBack}>
      <form onSubmit={submit} className="card space-y-5 p-6 sm:p-7" aria-labelledby="login-title">
        <div>
          <h1 id="login-title" className="text-xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted">{blurb}</p>
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

        {mode !== 'forgot' && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label !mb-0" htmlFor="login-password">
                Password
              </label>
              {mode === 'signin' && (
                <span className="text-xs">
                  <LinkButton onClick={() => go('forgot')}>Forgot password?</LinkButton>
                </span>
              )}
            </div>
            <input
              id="login-password"
              type="password"
              className="field"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
            />
            {mode === 'signup' && <p className="mt-1.5 text-xs text-muted">At least {MIN_PASSWORD} characters.</p>}
          </div>
        )}

        {mode === 'signup' && (
          <div>
            <label className="label" htmlFor="login-confirm">
              Confirm password
            </label>
            <input
              id="login-confirm"
              type="password"
              className="field"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
        )}

        {error && <ErrorLine>{error}</ErrorLine>}
        {unverified && (
          <p className="text-sm text-muted">
            Didn't get the email?{' '}
            <LinkButton
              onClick={() => {
                setSent({ kind: 'verify', email: email.trim() });
              }}
            >
              Send a new verification link
            </LinkButton>
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !email || (mode !== 'forgot' && !password)}>
          {busy ? (
            <Busy label={mode === 'signin' ? 'Signing in…' : mode === 'signup' ? 'Creating account…' : 'Sending…'} />
          ) : mode === 'signin' ? (
            'Sign in'
          ) : mode === 'signup' ? (
            'Create account'
          ) : (
            'Email me a reset link'
          )}
        </Button>

        <p className="text-center text-sm text-muted">
          {mode === 'signin' ? (
            <>
              New to CaseLab? <LinkButton onClick={() => go('signup')}>Create an account</LinkButton>
            </>
          ) : (
            <>
              Already have an account? <LinkButton onClick={() => go('signin')}>Sign in</LinkButton>
            </>
          )}
        </p>
      </form>
    </Shell>
  );
}

/** Shown after following a password-reset link, until a new password is chosen. */
export function SetNewPasswordScreen() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_PASSWORD) return setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password); // on success the app continues, signed in
    } catch (err) {
      setError(describeAuthError(err));
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="card space-y-5 p-6 sm:p-7" aria-labelledby="new-password-title">
        <div>
          <h1 id="new-password-title" className="text-xl font-semibold tracking-tight text-ink">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-muted">You're verified. Pick a new password to finish.</p>
        </div>
        <div>
          <label className="label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            className="field"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
          <p className="mt-1.5 text-xs text-muted">At least {MIN_PASSWORD} characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="new-password-confirm">
            Confirm new password
          </label>
          <input
            id="new-password-confirm"
            type="password"
            className="field"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error && <ErrorLine>{error}</ErrorLine>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !password || !confirm}>
          {busy ? <Busy label="Saving…" /> : 'Save new password'}
        </Button>
        <p className="text-center text-sm text-muted">
          <LinkButton onClick={() => void signOut()}>Cancel and sign out</LinkButton>
        </p>
      </form>
    </Shell>
  );
}
