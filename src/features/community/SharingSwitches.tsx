import { INCLUDED_IN_DETAILS, SHARING_OPTIONS, type SharingPrefs } from '../../domain/community';
import { Switch } from '../../components/ui/Switch';

interface Props {
  value: SharingPrefs;
  onChange: (next: SharingPrefs) => void;
  disabled?: boolean;
}

/**
 * The sharing switches. Case history is the master switch: scores, feedback and notes only apply
 * to cases that are shared, so they are greyed out until it is on.
 */
export function SharingSwitches({ value, onChange, disabled = false }: Props) {
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line">
      {SHARING_OPTIONS.map((opt) => {
        const blocked = disabled || (opt.needsCases && !value.cases);
        // "Open everything" already covers these, so they show as on and can't be switched off separately.
        const included = value.details && INCLUDED_IN_DETAILS.includes(opt.key);
        return (
          <li key={opt.key} className={`flex items-center justify-between gap-4 px-4 py-3.5 ${opt.needsCases ? 'pl-8' : ''}`}>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${blocked ? 'text-muted' : 'text-ink'}`}>{opt.label}</p>
              <p className="text-xs text-muted">
                {opt.hint}
                {opt.needsCases && !value.cases && ' Turn on case history first.'}
                {included && ' Included in Open everything.'}
              </p>
            </div>
            <Switch
              label={opt.label}
              checked={value[opt.key] || Boolean(included)}
              disabled={blocked || Boolean(included)}
              onChange={(checked) => onChange({ ...value, [opt.key]: checked })}
            />
          </li>
        );
      })}
    </ul>
  );
}
