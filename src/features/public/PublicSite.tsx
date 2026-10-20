import { useEffect, useState } from 'react';
import { Logo } from '../../components/layout/Header';
import type { CommunityReader } from '../../data/community';
import type { Profile } from '../../domain/community';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../state/AuthProvider';
import { LoginScreen } from '../auth/LoginScreen';
import { Directory } from '../people/People';
import { PersonProfile } from '../people/PersonProfile';

type View = { kind: 'home' } | { kind: 'person'; id: string } | { kind: 'signin' } | { kind: 'signup' };

function parse(): View {
  const [first, second] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (first === 'signin') return { kind: 'signin' };
  if (first === 'signup') return { kind: 'signup' };
  if (first === 'people' && second) return { kind: 'person', id: decodeURIComponent(second) };
  return { kind: 'home' };
}

function useView(initial: View): [View, (hash: string) => void] {
  const [view, setView] = useState<View>(initial);
  useEffect(() => {
    const onChange = () => setView(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return [view, (hash) => (window.location.hash = hash)];
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

function JoinPrompt({ person }: { person: Profile }) {
  return (
    <Card>
      <p className="font-semibold text-ink">Casing {first(person.displayName)}?</p>
      <p className="mt-1 text-sm text-ink-2">
        Create an account and log your own cases to see which ones you could give them, and which they've already done.
        Browsing needs no account.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="#/signup" className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink shadow-sm transition hover:bg-accent-hover">
          Create an account
        </a>
        <a href="#/signin" className="inline-flex h-10 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-surface-2">
          Sign in
        </a>
      </div>
    </Card>
  );
}

/**
 * The front page for people who are not signed in (firm reps, second-years, anyone): browse and search the members
 * who chose to be visible, and read what they share. Sign-in and sign-up live one click away; creating cases and
 * "find a case for them" need an account.
 */
export function PublicSite({ reader }: { reader: CommunityReader }) {
  const { linkProblem } = useAuth();
  // An expired or already-used email link lands here with an error: show the sign-in form, which explains it.
  const [view, go] = useView(linkProblem ? { kind: 'signin' } : parse());

  if (view.kind === 'signin' || view.kind === 'signup') {
    return <LoginScreen key={view.kind} initialMode={view.kind} onBack={() => go('/')} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-2">
            <a href="#/signin" className="rounded-xl px-3.5 py-2 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink">
              Sign in
            </a>
            <a href="#/signup" className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink shadow-sm transition hover:bg-accent-hover">
              Create account
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        {view.kind === 'home' ? (
          <div className="space-y-8">
            <div className="max-w-2xl space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Find a case partner</h1>
              <p className="text-base leading-relaxed text-muted">
                Booth students log their practice cases in CaseLab and choose what to share. Browse the members below to see
                the cases they've practiced. No account needed. If you're a first-year casing someone tomorrow,{' '}
                <a href="#/signup" className="font-semibold text-accent-text hover:underline">
                  create an account
                </a>{' '}
                to see which of your cases to give them.
              </p>
            </div>
            <Directory reader={reader} publicView onOpen={(id) => go(`/people/${encodeURIComponent(id)}`)} />
          </div>
        ) : (
          <PersonProfile key={view.id} reader={reader} userId={view.id} mine={null} onBack={() => go('/')} signInPrompt={(p) => <JoinPrompt person={p} />} />
        )}
      </main>

      <footer className="border-t border-line px-6 py-5 text-center text-xs text-muted">
        Members decide what to share. Written feedback and learning notes are only ever shown to signed-in members.
      </footer>
    </div>
  );
}
