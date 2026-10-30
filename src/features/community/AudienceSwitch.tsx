import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';

interface Props {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** When given (and the switch is on), offer the choice between the front page and "only people with my link". */
  linkOnly?: boolean;
  onLinkOnlyChange?: (linkOnly: boolean) => void;
  /** The address of this member's public profile, shown for copying once they are visible without an account. */
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
 * "Also show me to visitors without an account." Off by default. Written feedback, learning notes and other notes
 * reach visitors only if the member has also opened everything.
 */
export function AudienceSwitch({ checked, disabled, onChange, linkOnly = false, onLinkOnlyChange, profileLink }: Props) {
  return (
    <div className="rounded-2xl border border-line px-4 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Also show me to visitors without an account</p>
          <p className="text-xs text-muted">
            Anyone, even without signing in, could then see your name, class and the case history and scores you share.
            Written feedback and notes stay members-only unless you turn on Open everything. Off by default.
          </p>
        </div>
        <Switch label="Visible without an account" checked={checked} disabled={disabled} onChange={onChange} />
      </div>

      {checked && onLinkOnlyChange && (
        <fieldset className="mt-4 space-y-2 border-t border-line pt-4">
          <legend className="label">Where visitors can find you</legend>
          {(
            [
              [false, 'On the front page and in search', 'Anyone can find you by name and see you under "Cased recently".'],
              [true, 'Only people with my link', "You don't appear on the front page or in search. Anyone who has your link can still open your profile."],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={String(value)} className="flex items-start gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm">
              <input
                type="radio"
                name="where-visitors-find-me"
                className="mt-0.5 size-4 accent-[var(--accent)]"
                checked={linkOnly === value}
                disabled={disabled}
                onChange={() => onLinkOnlyChange(value)}
              />
              <span>
                <span className="font-medium text-ink">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {checked && profileLink && (
        <div className="mt-4">
          <p className="text-xs text-muted">
            {linkOnly
              ? 'Share this address with the people you want to see your profile. It contains your member ID, so anyone you give it to can pass it on. The only way to cut it off is to turn visibility off here.'
              : 'Your profile address, to share directly.'}
          </p>
          <CopyLink link={profileLink} />
        </div>
      )}
    </div>
  );
}
