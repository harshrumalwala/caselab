import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BarChart3, Compass, EyeOff, FileSpreadsheet, Lock, ShieldCheck, Timer, Users } from 'lucide-react';
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

const BUTTON = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-sm transition';
const PRIMARY = `${BUTTON} bg-accent text-accent-ink hover:bg-accent-hover`;
const SECONDARY = `${BUTTON} border border-line-strong bg-surface text-ink hover:bg-surface-2`;

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

/** The rising bars from the logo, drawn large and faint behind the headline. */
function HeroMark() {
  return (
    <svg
      viewBox="0 0 240 200"
      className="pointer-events-none absolute -right-6 bottom-0 hidden h-64 w-auto text-accent opacity-[0.07] md:block lg:right-6 lg:h-72"
      fill="currentColor"
      aria-hidden
    >
      <rect x="8" y="110" width="60" height="90" rx="16" opacity=".55" />
      <rect x="90" y="60" width="60" height="140" rx="16" opacity=".8" />
      <rect x="172" y="0" width="60" height="200" rx="16" />
    </svg>
  );
}

function Tile({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="card flex flex-col gap-3 p-5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text" aria-hidden>
        {icon}
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-2">{children}</p>
    </li>
  );
}

const ASSURANCES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <ShieldCheck className="size-5" />, title: 'Members choose', text: 'Everything starts private. Each person switches on only what they’re comfortable showing.' },
  { icon: <EyeOff className="size-5" />, title: 'No email addresses', text: 'Names and class years only. Nobody can look up or contact someone through this page.' },
  { icon: <Lock className="size-5" />, title: 'Feedback stays inside', text: 'Written feedback and learning notes are only ever shown to signed-in members.' },
];

interface LandingProps {
  reader: CommunityReader;
  onOpen: (id: string) => void;
  /** Whether the member list has been asked for. It isn't loaded or shown until then. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Landing({ reader, onOpen, open, onOpenChange }: LandingProps) {
  const findRef = useRef<HTMLElement>(null);
  const cameBackOpen = useRef(open);

  // Coming back from a profile with the list already open: land on it, not at the top of the page.
  useEffect(() => {
    if (cameBackOpen.current) findRef.current?.scrollIntoView?.();
  }, []);

  const reveal = () => {
    onOpenChange(true);
    // Wait for the list to render, then bring it into view.
    window.setTimeout(() => findRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0);
  };

  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-accent-soft/80 via-accent-soft/30 to-transparent">
        <HeroMark />
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-20">
          <p className="eyebrow text-accent-text">Consulting case practice</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-6xl">
            Case smarter. Track your progress.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
            Practicing casing for consulting? CaseLab is a simple log of every case you do. See how you&rsquo;re improving, where you&rsquo;re
            still weak, and what to practice next.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#/signup" className={PRIMARY}>
              Start your log, it’s free <ArrowRight className="size-4" aria-hidden />
            </a>
            <button type="button" onClick={reveal} className={SECONDARY}>
              <Users className="size-4" aria-hidden /> See who&rsquo;s casing
            </button>
          </div>
          <p className="mt-4 text-sm text-muted">Your practice is private by default. Nothing is shown to anyone unless you switch it on.</p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl space-y-16 px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <section aria-labelledby="what-title">
          <h2 id="what-title" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Practice with a plan, not just volume
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Most people just count cases. CaseLab keeps the details that tell you what to do differently next time.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile icon={<Timer className="size-5" />} title="Log in two minutes">
              Date, case, type and industry are all it takes. Add 1 to 5 ratings and notes on the skills you want to track, only if you want to.
            </Tile>
            <Tile icon={<BarChart3 className="size-5" />} title="See the patterns">
              Trends over time, your strongest and weakest skills, and which case types and industries you haven’t touched yet.
            </Tile>
            <Tile icon={<Compass className="size-5" />} title="Get a next step">
              Plain, explainable suggestions drawn from your own ratings and coverage, so you know what to work on in your next session.
            </Tile>
            <Tile icon={<FileSpreadsheet className="size-5" />} title="Bring your history">
              Already tracking cases in a spreadsheet? Import it, and export everything to a file whenever you like.
            </Tile>
          </ul>
        </section>

        <section id="find" ref={findRef} aria-labelledby="find-title" className="scroll-mt-24">
          <div className="max-w-xl">
            <h2 id="find-title" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Find someone to case with
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              People who are casing can choose to be listed, and to share as much or as little of their practice as they like. Search
              by name to see what someone has practiced, and pick a case to run with them.
            </p>
          </div>
          {open ? (
            <div className="mt-5">
              <Directory reader={reader} publicView onOpen={onOpen} />
            </div>
          ) : (
            <button type="button" onClick={reveal} aria-expanded={false} className={`${SECONDARY} mt-5`}>
              <Users className="size-4" aria-hidden /> Browse who&rsquo;s casing
            </button>
          )}
        </section>

        <section aria-labelledby="control-title" className="card overflow-hidden">
          <h2 id="control-title" className="sr-only">
            How privacy works
          </h2>
          <div className="grid gap-px bg-line md:grid-cols-3">
            {ASSURANCES.map((item) => (
              <div key={item.title} className="flex gap-3.5 bg-surface p-5">
                <span className="mt-0.5 text-accent-text" aria-hidden>
                  {item.icon}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-accent px-6 py-10 text-accent-ink sm:px-12 sm:py-14">
          <h2 className="max-w-lg text-2xl font-semibold tracking-tight sm:text-3xl">Ready to start tracking your cases?</h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-accent-ink/85">
            A free account gives you your own case log, dashboard and improvement plan. Appearing in the list of people casing is optional
            and stays off until you switch it on.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#/signup" className={`${BUTTON} bg-white text-accent hover:bg-accent-soft`}>
              Create your free account
            </a>
            <a href="#/signin" className={`${BUTTON} border border-white/40 text-accent-ink hover:bg-white/10`}>
              I already have one
            </a>
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * The front page for people who are not signed in (anyone): what the tool is, and a member
 * list that opens on request, showing only the members who chose to be visible and what they share. Sign-in and
 * sign-up live one click away; creating cases and "find a case for them" need an account.
 */
export function PublicSite({ reader }: { reader: CommunityReader }) {
  const { linkProblem } = useAuth();
  // An expired or already-used email link lands here with an error: show the sign-in form, which explains it.
  const [view, go] = useView(linkProblem ? { kind: 'signin' } : parse());
  // The member list stays closed until someone asks for it, and stays open when they come back from a profile.
  const [directoryOpen, setDirectoryOpen] = useState(false);

  if (view.kind === 'signin' || view.kind === 'signup') {
    return <LoginScreen key={view.kind} initialMode={view.kind} onBack={() => go('/')} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
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

      {view.kind === 'home' ? (
        <main className="flex-1">
          <Landing reader={reader} open={directoryOpen} onOpenChange={setDirectoryOpen} onOpen={(id) => go(`/people/${encodeURIComponent(id)}`)} />
        </main>
      ) : (
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
          <PersonProfile key={view.id} reader={reader} userId={view.id} mine={null} onBack={() => go('/')} signInPrompt={(p) => <JoinPrompt person={p} />} />
        </main>
      )}

      <footer className="border-t border-line px-6 py-5 text-center text-xs text-muted">
        CaseLab is a practice tracker for case interviews. Members decide what to share.
      </footer>
    </div>
  );
}
