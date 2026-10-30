import { useEffect, useState, type FormEvent } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { describeError } from '../../data/errors';
import { publicSharingSummary, sharingSummary, type Profile, type SharedCase, type SharingPrefs } from '../../domain/community';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { Switch } from '../../components/ui/Switch';
import { useCommunity, useMyProfile } from '../../state/CommunityProvider';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';
import { AudienceSwitch, profileAddress } from './AudienceSwitch';
import { SharedCaseRow } from './SharedCaseRow';
import { SharingSwitches } from './SharingSwitches';

type Audience = 'members' | 'visitors';

/**
 * What each audience can see right now, read back the way that audience would read it, so the preview can't
 * drift from reality: members through their signed-in session, visitors through a request with no account at all.
 */
function Preview({ profile }: { profile: Profile }) {
  const { community } = useCommunity();
  const { cases } = useData();
  const [audience, setAudience] = useState<Audience>('members');
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; shared: SharedCase[] }>({
    status: 'loading',
  });

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    const read = audience === 'members' ? community.getSharedCases(profile.userId) : community.getPublicView(profile.userId);
    read
      .then((shared) => current && setState({ status: 'ready', shared }))
      .catch((e) => current && setState({ status: 'error', message: describeError(e) }));
    return () => {
      current = false;
    };
  }, [community, profile, audience]);

  const hidden =
    audience === 'members'
      ? !profile.listed && "You're not listed in People, so other members can't find you and see nothing about you."
      : !profile.publicProfile && "You haven't turned on visibility without an account, so visitors can't find you and see nothing about you.";

  return (
    <section aria-labelledby="preview-title" className="rounded-2xl border border-line bg-surface-2/50 p-4 sm:p-5">
      <h3 id="preview-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Eye className="size-4 text-accent-text" /> What others see
      </h3>
      <p className="mt-1 text-xs text-muted">Live from the same data they see. Updates as soon as you change a setting.</p>

      <div role="tablist" aria-label="Preview audience" className="mt-3 flex gap-1 rounded-xl bg-surface p-1 text-xs font-medium">
        {(
          [
            ['members', 'Signed-in members'],
            ['visitors', 'Visitors without an account'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={audience === id}
            onClick={() => setAudience(id)}
            className={`flex-1 rounded-lg px-3 py-2 transition ${audience === id ? 'bg-surface-2 text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {hidden ? (
        <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-ink-2">{hidden}</p>
      ) : (
        <div className="mt-4 space-y-3" role="tabpanel">
          <div className="rounded-xl bg-surface px-4 py-3">
            <p className="font-semibold text-ink">{profile.displayName}</p>
            <p className="text-xs text-muted">
              {profile.mbaClass || 'MBA class not shown'} · Shares{' '}
              {audience === 'members' ? sharingSummary(profile.sharing) : publicSharingSummary(profile.sharing)}
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
                No cases are visible to {audience === 'members' ? 'other members' : 'visitors'}. Your{' '}
                {cases.length === 1 ? '1 case is' : `${cases.length} cases are`} private.
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
          {audience === 'visitors' && profile.publicProfile && profile.publicLinkOnly && (
            <p className="text-xs text-muted">You're link only, so this is what people see when they open your link. You aren't on the front page or in search.</p>
          )}
          {audience === 'visitors' && (
            <p className="text-xs text-muted">
              {profile.sharing.details
                ? 'Open everything is on, so visitors can open each case to read your feedback and notes.'
                : "Visitors don't see written feedback, learning notes or other notes unless you turn on Open everything."}
            </p>
          )}
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
  const [confirmPublic, setConfirmPublic] = useState(false);
  // Opening everything while visible without an account changes what visitors read, so it asks first.
  const [pendingDetails, setPendingDetails] = useState<SharingPrefs | null>(null);

  const detailsChanged = name.trim() !== profile.displayName || mbaClass.trim() !== profile.mbaClass;

  /** Saves immediately; the switches show whatever was actually stored. */
  const save = async (next: Partial<Omit<Profile, 'userId'>>, success?: string) => {
    setSaving(true);
    try {
      const listed = next.listed ?? profile.listed;
      // Being public needs being listed, so unlisting also withdraws public visibility.
      const publicProfile = listed && (next.publicProfile ?? profile.publicProfile);
      await saveProfile({
        displayName: next.displayName ?? profile.displayName,
        mbaClass: next.mbaClass ?? profile.mbaClass,
        listed,
        publicProfile,
        // Link only needs public, so withdrawing public visibility clears it too.
        publicLinkOnly: publicProfile && (next.publicLinkOnly ?? profile.publicLinkOnly),
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

  const setSharing = (sharing: SharingPrefs) => {
    if (sharing.details && !profile.sharing.details && profile.publicProfile) setPendingDetails(sharing);
    else void save({ sharing });
  };

  return (
    <>
      <Dialog open onClose={onClose} title="Profile & privacy" description="Choose who can see what" width="lg">
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

            <AudienceSwitch
              checked={profile.publicProfile}
              disabled={saving || !profile.listed}
              onChange={(on) => (on ? setConfirmPublic(true) : void save({ publicProfile: false }))}
              linkOnly={profile.publicLinkOnly}
              onLinkOnlyChange={(linkOnly) => void save({ publicLinkOnly: linkOnly }, linkOnly ? 'Now only people with your link can find you' : 'Now on the front page')}
              profileLink={profileAddress(profile.userId)}
            />

            <p className="pt-1 text-xs text-muted">
              What to share. Everything starts off, and each change applies immediately. These choices apply to the audiences
              above.
            </p>
            <SharingSwitches value={profile.sharing} onChange={setSharing} disabled={saving || !profile.listed} />
            <p className="text-xs text-muted">
              You can override any single case when you log or edit it: keep it private, share only its name, or share it in
              full. "Other notes" are never shared, and your practice partner's name only appears if you turn on "Who cased me".
            </p>
          </section>

          <Preview profile={profile} />
          {profile.listed && <Badge tone="neutral">Changes apply as soon as they're saved.</Badge>}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmPublic}
        title="Show your profile to anyone?"
        confirmLabel="Make it visible"
        onCancel={() => setConfirmPublic(false)}
        onConfirm={() => {
          setConfirmPublic(false);
          void save({ publicProfile: true }, 'Now visible without an account');
        }}
      >
        <p>
          Anyone on the internet, signed in or not, will be able to find <strong className="text-ink">{profile.displayName}</strong> and
          see your class and whatever you share below: case history (the case names, casebook names and industries you typed) and
          any scores or improvement focus you've switched on.
        </p>
        <p>
          This includes every case you've set to "share the case name only" or "share this case in full". A case set to "full" shows
          visitors its scores and improvement focus even if those switches are off. To hide a case from everyone, set it to "keep this
          case private".
        </p>
        {profile.sharing.partner && (
          <p>
            "Who cased me" is on, so the name you entered as your practice partner will also be shown on each of these cases.
          </p>
        )}
        {profile.sharing.details ? (
          <p>
            <strong className="text-ink">Open everything is on</strong>, so visitors can also open each case to read your written feedback,
            learning notes and other notes. Turn Open everything off to keep those to members.
          </p>
        ) : (
          <p>Written feedback, learning notes and other notes are not shown to visitors unless you turn on Open everything. You can switch this off again at any time.</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingDetails !== null}
        title="Open everything to visitors too?"
        confirmLabel="Open everything"
        onCancel={() => setPendingDetails(null)}
        onConfirm={() => {
          const next = pendingDetails;
          setPendingDetails(null);
          if (next) void save({ sharing: next });
        }}
      >
        <p>
          You are visible without an account, so anyone who can see you will be able to open each case you share and read its{' '}
          <strong className="text-ink">scores, written feedback, learning notes and other notes</strong>, in full.
        </p>
        <p>Cases set to "keep this case private" or "share the case name only" stay as they are. You can turn this off at any time.</p>
      </ConfirmDialog>
    </>
  );
}
