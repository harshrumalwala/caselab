import { useEffect, useState, type FormEvent } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { describeError } from '../../data/errors';
import { sharingSummary, type Profile, type SharedCase, type SharingPrefs } from '../../domain/community';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Switch } from '../../components/ui/Switch';
import { useCommunity, useMyProfile } from '../../state/CommunityProvider';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';
import { SharedCaseRow } from './SharedCaseRow';
import { SharingSwitches } from './SharingSwitches';

/** What other members can see right now: read back from the same table they read, so it can't drift from reality. */
function Preview({ profile }: { profile: Profile }) {
  const { community } = useCommunity();
  const { cases } = useData();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; shared: SharedCase[] }>({
    status: 'loading',
  });

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    community
      .getSharedCases(profile.userId)
      .then((shared) => current && setState({ status: 'ready', shared }))
      .catch((e) => current && setState({ status: 'error', message: describeError(e) }));
    return () => {
      current = false;
    };
  }, [community, profile]);

  return (
    <section aria-labelledby="preview-title" className="rounded-2xl border border-line bg-surface-2/50 p-4 sm:p-5">
      <h3 id="preview-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Eye className="size-4 text-accent-text" /> What other members see
      </h3>
      <p className="mt-1 text-xs text-muted">Live from the same data they see. Updates as soon as you change a setting.</p>

      {!profile.listed ? (
        <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-ink-2">
          You're not listed in People, so other members can't find you and see nothing about you.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-surface px-4 py-3">
            <p className="font-semibold text-ink">{profile.displayName}</p>
            <p className="text-xs text-muted">
              {profile.mbaClass || 'MBA class not shown'} · Shares {sharingSummary(profile.sharing)}
            </p>
          </div>

          {state.status === 'loading' && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Loader2 className="size-4 animate-spin" /> Checking…
            </p>
          )}
          {state.status === 'error' && (
            <p role="alert" className="text-sm font-medium text-bad">
              Couldn't load the preview. {state.message}
            </p>
          )}
          {state.status === 'ready' &&
            (state.shared.length === 0 ? (
              <p className="rounded-xl bg-surface px-4 py-3 text-sm text-ink-2">
                No cases are visible to other members. Your {cases.length === 1 ? '1 case is' : `${cases.length} cases are`} private.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted">
                  {state.shared.length} of your {cases.length} case{cases.length === 1 ? '' : 's'} visible. The rest are private.
                </p>
                <ul className="space-y-2.5">
                  {state.shared.slice(0, 4).map((s) => (
                    <SharedCaseRow key={s.caseId} shared={s} />
                  ))}
                </ul>
                {state.shared.length > 4 && <p className="text-xs text-muted">…and {state.shared.length - 4} more.</p>}
              </>
            ))}
        </div>
      )}
    </section>
  );
}

export function ProfileSettingsDialog({ onClose }: { onClose: () => void }) {
  const profile = useMyProfile();
  const { saveProfile } = useCommunity();
  const toast = useToast();

  const [name, setName] = useState(profile.displayName);
  const [mbaClass, setMbaClass] = useState(profile.mbaClass);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const detailsChanged = name.trim() !== profile.displayName || mbaClass.trim() !== profile.mbaClass;

  /** Saves immediately; the switches show whatever was actually stored. */
  const save = async (next: Partial<Omit<Profile, 'userId'>>, success?: string) => {
    setSaving(true);
    try {
      await saveProfile({
        displayName: next.displayName ?? profile.displayName,
        mbaClass: next.mbaClass ?? profile.mbaClass,
        listed: next.listed ?? profile.listed,
        sharing: next.sharing ?? profile.sharing,
      });
      if (success) toast({ title: success });
    } catch (e) {
      toast({ kind: 'error', title: 'Not saved', body: describeError(e) });
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setNameError('Enter the name other members should see.');
    setNameError(null);
    void save({ displayName: name, mbaClass }, 'Profile saved');
  };

  const setSharing = (sharing: SharingPrefs) => void save({ sharing });

  return (
    <Dialog open onClose={onClose} title="Profile & privacy" description="Choose what other CaseLab members can see" width="lg">
      <div className="space-y-6">
        <form onSubmit={saveDetails} className="space-y-4" aria-label="Profile details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pf-name">
                Your name
              </label>
              <input
                id="pf-name"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                aria-invalid={Boolean(nameError)}
              />
              {nameError && (
                <p className="mt-1.5 text-xs font-medium text-bad" role="alert">
                  {nameError}
                </p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="pf-class">
                MBA class <span className="font-normal text-muted">(optional)</span>
              </label>
              <input id="pf-class" className="field" value={mbaClass} onChange={(e) => setMbaClass(e.target.value)} maxLength={40} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving || !detailsChanged}>
              Save name and class
            </Button>
          </div>
        </form>

        <section aria-labelledby="visibility-title" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="visibility-title" className="text-sm font-semibold text-ink">
              Who can see me
            </h3>
            {saving && (
              <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
                <Loader2 className="size-3.5 animate-spin" /> Saving…
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Appear in People search</p>
              <p className="text-xs text-muted">
                Verified members can find your name and class. Your email is never shown. Turn this off to disappear completely.
              </p>
            </div>
            <Switch label="Appear in People search" checked={profile.listed} disabled={saving} onChange={(listed) => void save({ listed })} />
          </div>

          <p className="pt-1 text-xs text-muted">
            What to share with members. Everything starts off, and each change applies immediately. Only verified, signed-in
            members can see it.
          </p>
          <SharingSwitches value={profile.sharing} onChange={setSharing} disabled={saving || !profile.listed} />
          <p className="text-xs text-muted">
            You can override any single case when you log or edit it: keep it private, share only its name, or share it in full.
            "Other notes" and your practice partner are never shared.
          </p>
        </section>

        <Preview profile={profile} />
        {profile.listed && <Badge tone="neutral">Changes apply as soon as they're saved.</Badge>}
      </div>
    </Dialog>
  );
}
