import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BarChart3, Check, ChevronRight, Compass, EyeOff, FileSpreadsheet, Lock, Search, ShieldCheck, Timer, Users } from 'lucide-react';
import { Logo } from '../../components/layout/Header';
import { describeError } from '../../data/errors';
import type { PublicReader, RecentCaser } from '../../data/community';
import { formatDate } from '../../domain/dates';
import { quipOfTheDay } from '../../domain/quips';
import { chipClass } from '../../components/ui/chips';
import { HeroScene, Sparkle, Sticky } from '../../components/ui/Doodles';
import type { Profile } from '../../domain/community';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../state/AuthProvider';
import { rememberImportIntent } from '../../state/afterSignup';
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

const BUTTON = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold shadow-sm transition active:translate-y-px';
const PRIMARY = `${BUTTON} bg-accent text-accent-ink hover:bg-accent-hover`;
const SECONDARY = `${BUTTON} border-2 border-ink/80 bg-surface text-ink hover:bg-surface-2`;
const SUNNY = `${BUTTON} border-2 border-ink/80 bg-sun text-on-sun hover:brightness-95`;

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

type Tone = 'sun' | 'teal' | 'coral' | 'lilac' | 'sky';

const TONES: Record<Tone, { chip: string; card: string }> = {
  sun: { chip: 'bg-sun text-on-sun', card: 'bg-sun-soft' },
  teal: { chip: 'bg-teal text-on-color', card: 'bg-teal-soft' },
  coral: { chip: 'bg-coral text-on-color', card: 'bg-coral-soft' },
  lilac: { chip: 'bg-lilac text-on-color', card: 'bg-lilac-soft' },
  sky: { chip: 'bg-sky text-on-color', card: 'bg-sky-soft' },
};

function Tile({ icon, title, joke, tone, tilt, children }: { icon: ReactNode; title: string; joke: string; tone: Tone; tilt: number; children: ReactNode }) {
  return (
    <li
      className={`sticker flex flex-col gap-3 p-5 transition hover:-translate-y-1 hover:rotate-0 ${TONES[tone].card}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <span className={`flex size-11 items-center justify-center rounded-xl border-2 border-ink/80 ${TONES[tone].chip}`} aria-hidden>
        {icon}
      </span>
      <h3 className="font-display text-lg font-bold leading-tight text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-2">{children}</p>
      <p className="mt-auto text-xs font-semibold italic text-ink-2/80">{joke}</p>
    </li>
  );
}

const ASSURANCES: { icon: ReactNode; title: string; text: string; tone: Tone }[] = [
  { icon: <ShieldCheck className="size-5" />, title: 'Members choose', text: 'Everything starts private. Each person switches on only what they’re comfortable showing.', tone: 'teal' },
  { icon: <EyeOff className="size-5" />, title: 'No email addresses', text: 'Names and class years only. Nobody can look up or contact someone through this page.', tone: 'sun' },
  { icon: <Lock className="size-5" />, title: 'Detail is opt-in', text: 'Written feedback and notes are shown only if a member chooses to open everything. Otherwise they stay with members.', tone: 'lilac' },
];

const RECENT_COUNT = 5;

/** The members who have cased most recently, newest first, so there is something to see before searching. */
function RecentCasers({ reader, onOpen }: { reader: PublicReader; onOpen: (id: string) => void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; people: RecentCaser[] }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    reader
      .recentPeople(RECENT_COUNT)
      .then((people) => current && setState({ status: 'ready', people }))
      .catch((e) => current && setState({ status: 'error', message: describeError(e) }));
    return () => {
      current = false;
    };
  }, [reader, attempt]);

  if (state.status === 'loading') return null;
  if (state.status === 'error') {
    return (
      <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 text-sm text-ink-2">
        <span>Couldn’t load recent members. {state.message}</span>
        <Button onClick={() => { setState({ status: 'loading' }); setAttempt((n) => n + 1); }}>Try again</Button>
      </div>
    );
  }
  if (state.people.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="eyebrow">Cased recently</h3>
      <ul className="mt-3 space-y-2.5">
        {state.people.map(({ person, lastCased }) => (
          <li key={person.userId}>
            <button
              type="button"
              onClick={() => onOpen(person.userId)}
              className="sticker flex w-full items-center justify-between gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:bg-sun-soft"
            >
              <span className="flex min-w-0 items-center gap-3.5">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink/80 font-display font-bold ${chipClass(person.displayName)}`} aria-hidden>
                  {person.displayName.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{person.displayName}</span>
                  <span className="block truncate text-xs text-muted">
                    {person.mbaClass ? `${person.mbaClass} · ` : ''}Last cased {formatDate(lastCased)}
                  </span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const IMPORT_STEPS: { title: string; text: string; tone: Tone }[] = [
  { title: 'Create your free account', text: 'It takes a minute.', tone: 'coral' },
  { title: 'Choose your Excel file', text: 'Your case log, saved as an .xlsx file.', tone: 'sun' },
  { title: 'Review, then import', text: 'You see everything first. Nothing is saved until you say so.', tone: 'teal' },
];

/** The migration message, given a section of its own so nobody hesitates to switch because of the work already in a spreadsheet. */
function ImportCallout() {
  return (
    <section
      aria-labelledby="import-title"
      className="sticker relative overflow-hidden bg-sun-soft p-6 sm:p-8 md:p-10"
    >
      <Sparkle className="absolute right-6 top-5 size-8 text-coral" />
      <Sparkle className="absolute bottom-8 right-1/3 hidden size-5 text-lilac md:block" />
      <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-10">
        <div>
          <span className="flex size-14 items-center justify-center rounded-2xl border-2 border-ink/80 bg-accent text-accent-ink" aria-hidden>
            <FileSpreadsheet className="size-7" />
          </span>
          <p className="eyebrow mt-5 text-sun-ink">Switching from Excel?</p>
          <h2 id="import-title" className="mt-1.5 text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
            Bring your whole case log with you
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink-2">
            Already logging cases in Excel? Import it in one step. Your cases, ratings, feedback and Opportunity Areas
            lists all come across, so there is nothing to retype and you never start from zero.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <a href="#/signup" className={PRIMARY} onClick={() => rememberImportIntent()}>
              Create account and import <ArrowRight className="size-4" aria-hidden />
            </a>
            <span className="text-sm font-medium text-ink-2">Cases already in your log are skipped, so it is safe to try.</span>
          </div>
        </div>

        <ol className="space-y-3" aria-label="How importing works">
          {IMPORT_STEPS.map(({ title, text, tone }, i) => (
            <li key={title} className="flex items-start gap-4 rounded-2xl border-2 border-ink/80 bg-surface p-4" style={{ transform: `rotate(${i % 2 ? 1 : -1}deg)` }}>
              <span className={`num flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-ink/80 font-display text-base font-bold ${TONES[tone].chip}`} aria-hidden>
                {i + 1}
              </span>
              <div>
                <p className="font-display font-bold text-ink">{title}</p>
                <p className="mt-0.5 text-sm text-ink-2">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

interface LandingProps {
  reader: PublicReader;
  onOpen: (id: string) => void;
  /** Whether the member list has been asked for. It isn't loaded or shown until then. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Landing({ reader, onOpen, open, onOpenChange }: LandingProps) {
  const findRef = useRef<HTMLElement>(null);
  const cameBackOpen = useRef(open);
  const quip = useMemo(() => quipOfTheDay(), []);

  // Coming back from a profile with the list already open: land on it, not at the top of the page.
  useEffect(() => {
    if (cameBackOpen.current) findRef.current?.scrollIntoView?.();
  }, []);

  const scrollToFind = () => findRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <section className="relative overflow-hidden border-b-2 border-ink/80 bg-gradient-to-br from-sun-soft via-bg to-coral-soft">
        <div className="relative mx-auto grid max-w-5xl items-center gap-4 px-4 pb-10 pt-10 sm:px-6 sm:pb-16 sm:pt-16 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="sticker inline-block rotate-[-2deg] bg-surface px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-text">
              Consulting case practice
            </p>
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-7xl">
              Case <span className="marker">smarter.</span>
              <br />
              Track your progress.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-2">
              Practicing casing for consulting? CaseLab is a simple log of every case you do. See how you&rsquo;re improving, where
              you&rsquo;re still weak, and what to practice next. <span className="font-semibold">Fewer spreadsheets, more offers.</span>
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#/signup" className={PRIMARY}>
                Start your log, it’s free <ArrowRight className="size-4" aria-hidden />
              </a>
              <button type="button" onClick={scrollToFind} className={SUNNY}>
                <Users className="size-4" aria-hidden /> See who&rsquo;s casing
              </button>
            </div>
            <p className="mt-4 text-sm text-ink-2">Your practice is private by default. Nothing is shown to anyone unless you switch it on.</p>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <HeroScene className="w-full" />
            <Sticky tone="teal" tilt={-6} className="absolute left-0 top-[58%] hidden sm:block">
              MECE <Check className="inline size-4" />
            </Sticky>
            <Sticky tone="lilac" tilt={5} className="absolute right-2 top-[44%] hidden sm:block">
              Quant 4/5
            </Sticky>
            <Sticky tone="coral" tilt={-3} className="absolute bottom-0 left-8 hidden sm:block">
              Next: break-even drills
            </Sticky>
          </div>
        </div>
      </section>

      <div className="border-b-2 border-ink/80 bg-ink py-3 text-center text-sm text-bg">
        <p className="mx-auto max-w-5xl px-4 font-display font-semibold">
          <Sparkle className="mr-2 inline size-4 text-sun" />
          {quip.text} <span className="font-normal opacity-70">— {quip.by}</span>
        </p>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-16 px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <ImportCallout />

        <section aria-labelledby="what-title">
          <h2 id="what-title" className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Practice with a plan, <span className="marker">not just volume</span>
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-2">
            Most people just count cases. CaseLab keeps the details that tell you what to do differently next time.
          </p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Tile icon={<Timer className="size-5" />} title="Log in two minutes" tone="sun" tilt={-1.5} joke="Faster than debating the framework.">
              Date, case, type and industry are all it takes. Add 1 to 5 ratings and notes on the skills you want to track, only if you want to.
            </Tile>
            <Tile icon={<BarChart3 className="size-5" />} title="See the patterns" tone="teal" tilt={1} joke="Yes, the chart goes up and to the right.">
              Trends over time, your strongest and weakest skills, and which case types and industries you haven’t touched yet.
            </Tile>
            <Tile icon={<Compass className="size-5" />} title="Get a next step" tone="coral" tilt={-0.5} joke="A recommendation. Finally, one with next steps.">
              Plain, explainable suggestions drawn from your own ratings and coverage, so you know what to work on in your next session.
            </Tile>
          </ul>
        </section>

        <section id="find" ref={findRef} aria-labelledby="find-title" className="scroll-mt-24">
          <div className="max-w-xl">
            <h2 id="find-title" className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Find someone to case with
            </h2>
            <p className="mt-1.5 text-base leading-relaxed text-ink-2">
              People who are casing can choose to be listed, and to share as much or as little of their practice as they like. Search
              by name to see what someone has practiced, and pick a case to run with them.
            </p>
          </div>
          <RecentCasers reader={reader} onOpen={onOpen} />
          {open ? (
            <div className="mt-8">
              <h3 className="eyebrow mb-3">Everyone</h3>
              <Directory reader={reader} publicView onOpen={onOpen} />
            </div>
          ) : (
            <button type="button" onClick={() => onOpenChange(true)} aria-expanded={false} className={`${SECONDARY} mt-6`}>
              <Search className="size-4" aria-hidden /> Search all members
            </button>
          )}
        </section>

        <section aria-labelledby="control-title">
          <h2 id="control-title" className="sr-only">
            How privacy works
          </h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {ASSURANCES.map((item, i) => (
              <li key={item.title} className={`sticker flex gap-3.5 p-5 ${TONES[item.tone].card}`} style={{ transform: `rotate(${i === 1 ? 1 : -1}deg)` }}>
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink/80 ${TONES[item.tone].chip}`} aria-hidden>
                  {item.icon}
                </span>
                <div>
                  <h3 className="font-display font-bold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="sticker relative overflow-hidden bg-accent px-6 py-10 text-accent-ink sm:px-12 sm:py-14">
          <Sparkle className="absolute right-8 top-6 size-10 text-sun" />
          <Sparkle className="absolute bottom-6 right-24 size-6 text-coral" />
          <h2 className="max-w-lg text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to start tracking your cases?</h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-accent-ink/90">
            A free account gives you your own case log, dashboard and improvement plan. Appearing in the list of people casing is optional
            and stays off until you switch it on.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#/signup" className={`${BUTTON} border-2 border-ink/80 bg-sun text-on-sun hover:brightness-95`}>
              Create your free account
            </a>
            <a href="#/signin" className={`${BUTTON} border-2 border-white/60 text-accent-ink hover:bg-white/10`}>
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
export function PublicSite({ reader }: { reader: PublicReader }) {
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
            <a href="#/signin" className="whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold text-ink-2 transition hover:bg-sun-soft hover:text-ink sm:px-3.5">
              Sign in
            </a>
            <a
              href="#/signup"
              aria-label="Create account"
              className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-xl border-2 border-ink/80 bg-accent px-4 text-sm font-bold text-accent-ink shadow-[2px_2px_0_0_rgb(28_26_24/0.85)] transition hover:bg-accent-hover"
            >
              <span aria-hidden className="sm:hidden">Join</span>
              <span aria-hidden className="hidden sm:inline">Create account</span>
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
        CaseLab: for people who say “let me structure my thoughts” and mean it. Members decide what to share.
      </footer>
    </div>
  );
}
