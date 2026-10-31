import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { Logo } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Sparkle } from '../../components/ui/Doodles';
import { quipOfTheDay } from '../../domain/quips';
import { describeAuthError } from '../../data/errors';
import { useAuth } from '../../state/AuthProvider';

export const MIN_PASSWORD = 8;

export type Mode = 'signin' | 'signup' | 'forgot';
type Sent = { kind: 'verify' | 'reset'; email: string } | null;

/**
 * A tile of tiny hand-drawn desk things (chart, coffee, pencil, bulb, magnifier) that repeats across the sign-in background,
 * drawn faintly in ink so it reads as paper, not as content.
 */
const DOODLES =
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220' fill='none' stroke='#1c1a18' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'>" +
  "<g transform='translate(18 22) rotate(-8)'><path d='M0 36h40M4 36V18M16 36V6M28 36V22'/></g>" +
  "<g transform='translate(128 18) rotate(6)'><path d='M2 10h30v18a10 10 0 0 1-10 10H12A10 10 0 0 1 2 28ZM32 14h5a6 6 0 0 1 0 12h-5M10 0q-3 4 0 7M20 0q-3 4 0 7'/></g>" +
  "<g transform='translate(22 126) rotate(-30)'><path d='M0 8h40v10H0zM40 8l12 5-12 5M8 8v10'/></g>" +
  "<g transform='translate(136 120)'><circle cx='14' cy='14' r='12'/><path d='M8 30h12M10 36h8M14 -6v-4M-4 4l-4-3M32 4l4-3'/></g>" +
  "<g transform='translate(84 78) rotate(10)'><circle cx='12' cy='12' r='9'/><path d='M19 19l11 11'/></g>" +
  "<g transform='translate(176 188)'><path d='M8 0c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10Z'/></g>" +
  '</svg>';
const DOODLE_TILE = `url("data:image/svg+xml,${encodeURIComponent(DOODLES)}")`;

function Shell({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  const quip = useMemo(() => quipOfTheDay(), []);
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sun-soft via-bg to-coral-soft px-4 py-10">
      <Sparkle className="absolute left-[12%] top-[14%] size-8 text-coral" />
      <Sparkle className="absolute right-[14%] top-[22%] size-5 text-lilac" />
      <Sparkle className="absolute bottom-[16%] left-[18%] size-5 text-teal" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] dark:invert" style={{ backgroundImage: DOODLE_TILE }} />
      <div className="relative w-full max-w-sm">
        {onBack && (
          <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline">
            <ArrowLeft className="size-4" /> Back to CaseLab
          </button>
        )}
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        {/* two loose sheets behind the card, like a case file */}
        <div className="relative isolate">
          <div aria-hidden className="absolute inset-0 -z-10 rotate-[3.5deg] rounded-2xl border-2 border-ink/80 bg-lilac-soft" />
          <div aria-hidden className="absolute inset-0 -z-10 -rotate-[2.5deg] rounded-2xl border-2 border-ink/80 bg-sun" />
          {children}
        </div>
        <p className="mt-8 text-center font-display text-sm font-semibold text-ink-2">{quip.text}</p>
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
    <div className="sticker space-y-5 p-6 text-center sm:p-7" role="status">
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
      ? 'Your cases are saved to your account and follow you across devices. No more "Case Log FINAL v7.xlsx".'
      : mode === 'signup'
        ? "We'll email a link to verify your address. After that, a short profile and you're in. No spreadsheets harmed."
        : "Enter your email and we'll send you a link to choose a new password. It happens to the best of us.";

  return (
    <Shell onBack={onBack}>
      <form onSubmit={submit} className="sticker space-y-5 p-6 sm:p-7" aria-labelledby="login-title">
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
      <form onSubmit={submit} className="sticker space-y-5 p-6 sm:p-7" aria-labelledby="new-password-title">
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
