interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name; the visible label is usually next to it. */
  label: string;
  disabled?: boolean;
}

/** An on/off switch (role="switch"), used for every sharing setting. */
export function Switch({ checked, onChange, label, disabled = false }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-track'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block size-4.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
