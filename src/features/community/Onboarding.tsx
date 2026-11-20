import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Logo } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { describeError } from '../../data/errors';
import { NO_SHARING, type SharingPrefs } from '../../domain/community';
import { useAuth } from '../../state/AuthProvider';
import { useCommunity } from '../../state/CommunityProvider';
import { AudienceSwitch } from './AudienceSwitch';
import { SharingSwitches } from './SharingSwitches';

const CLASS_SUGGESTIONS = ['Class of 2026', 'Class of 2027', 'Class of 2028', 'Class of 2029', 'Evening MBA', 'Weekend MBA', 'Executive MBA'];

/** First sign-in: a short profile and your sharing choices. Everything starts private except your level, which starts on. */
export function Onboarding() {
  const { saveProfile } = useCommunity();
  const { signOut } = useAuth();
  const [name, setName] = useState('');
  const [mbaClass, setMbaClass] = useState('');
  const [listed, setListed] = useState(true);
  const [publicProfile, setPublicProfile] = useState(false);
  const [sharing, setSharing] = useState<SharingPrefs>({ ...NO_SHARING, level: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Enter the name other members should see.');
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ displayName: name, mbaClass, listed, publicProfile, burnedBooks: [], burnedCases: [], sharing });
      // The community provider now has a profile, so the app takes over.
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form onSubmit={submit} className="card space-y-6 p-6 sm:p-7" aria-labelledby="onboarding-title">
          <div>
            <h1 id="onboarding-title" className="text-xl font-semibold tracking-tight text-ink">
              Set up your profile
            </h1>
            <p className="mt-1 text-sm text-muted">
              Two minutes, once. Your cases and scores stay private unless you choose to share them.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="profile-name">
                Your name <span className="text-bad-text">*</span>
              </label>
              <input
                id="profile-name"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="profile-class">
                MBA class <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="profile-class"
                className="field"
                list="class-options"
                value={mbaClass}
                onChange={(e) => setMbaClass(e.target.value)}
                maxLength={40}
              />
              <datalist id="class-options">
                {CLASS_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--accent)]"
              checked={listed}
              onChange={(e) => setListed(e.target.checked)}
            />
            <span>
              <span className="font-medium text-ink">Let other members find me by name</span>
              <span className="block text-xs text-muted">
                Your name and class appear in People for verified CaseLab members. Your email is never shown.
              </span>
            </span>
          </label>

          <AudienceSwitch checked={publicProfile} onChange={setPublicProfile} />

          <div>
            <h2 className="mb-1 text-sm font-semibold text-ink">What would you like to share?</h2>
            <p className="mb-3 text-xs text-muted">
              Everything is off by default except your level (a small badge with your job title, nothing more), you can change any of
              it at any time, and you can keep individual cases private.
            </p>
            <SharingSwitches value={sharing} onChange={setSharing} disabled={!(listed || publicProfile)} />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad-text">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <button type="button" className="text-sm text-muted hover:text-ink hover:underline" onClick={() => void signOut()}>
              Sign out
            </button>
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : (
                'Start casing'
              )}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
