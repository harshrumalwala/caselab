import { Switch } from '../../components/ui/Switch';

/**
 * "Also show me to visitors without an account." Off by default. Free-text fields (written feedback, learning
 * notes) are never shown to visitors, whatever else is switched on.
 */
export function AudienceSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">Also show me to visitors without an account</p>
        <p className="text-xs text-muted">
          Anyone, even without signing in, could then see your name, class and the case history and scores you share (but
          never written feedback or learning notes, which stay members-only). Off by default.
        </p>
      </div>
      <Switch label="Visible without an account" checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}
