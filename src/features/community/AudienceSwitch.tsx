import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';

interface Props {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** The address of this member's profile, shown for copying whenever the switch is on. */
  profileLink?: string;
}

/** The profile address that opens a member's public view, for anyone who has it. */
export function profileAddress(userId: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/people/${encodeURIComponent(userId)}`;
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access: the address is in the box below, ready to select.
    }
  };
  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        readOnly
        aria-label="Your profile address"
        className="field !py-2 text-xs"
        value={link}
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button size="md" onClick={() => void copy()} aria-live="polite">
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}

/**
 * "People with my link can see my profile." Off by default, and the only way anyone without an account can reach a
 * member: there is no public list or search. Written feedback, learning notes and other notes reach them only if the
 * member has also opened everything.
 */
export function AudienceSwitch({ checked, disabled, onChange, profileLink }: Props) {
  return (
    <div className="rounded-2xl border border-line px-4 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">People with my link can see my profile</p>
          <p className="text-xs text-muted">
            Anyone you give your link to can open it without signing in, and see your name, class and the case history and
            scores you share. Your link is the only way there, so your profile goes where you send it. Written feedback and
            notes stay members-only unless you turn on Open everything. Off by default.
          </p>
        </div>
        <Switch label="People with my link can see my profile" checked={checked} disabled={disabled} onChange={onChange} />
      </div>

      {checked && profileLink && (
        <div className="mt-4">
          <p className="text-xs text-muted">
            Share this address with the people you want to see your profile. It contains your member ID, so anyone you give it
            to can pass it on. The only way to cut it off is to turn this switch off.
          </p>
          <CopyLink link={profileLink} />
        </div>
      )}
    </div>
  );
}
