import { Dialog } from '../../components/ui/Dialog';
import { GO_KEYS } from './shortcuts';

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-7 items-center justify-center rounded-lg border-2 border-ink/80 bg-surface px-2 py-0.5 font-display text-sm font-bold text-ink shadow-[1px_2px_0_0_rgb(28_26_24/0.85)]">
      {children}
    </kbd>
  );
}

const ROW = 'flex items-center justify-between gap-4 px-4 py-2.5 text-sm text-ink-2';

/** Every keyboard shortcut in one place. They only work when you are not typing in a box or in a dialog. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="Keyboard shortcuts" description="For when your hands are already on the keys" width="sm">
      <ul className="divide-y divide-line rounded-2xl border-2 border-ink/80 bg-surface-2/50" aria-label="Shortcuts">
        <li className={ROW}>
          <span>Log a case</span>
          <Key>N</Key>
        </li>
        <li className={ROW}>
          <span>Show this list</span>
          <Key>?</Key>
        </li>
        {GO_KEYS.map((g) => (
          <li key={g.key} className={ROW}>
            <span>Go to {g.label}</span>
            <span className="flex items-center gap-1.5">
              <Key>G</Key>
              <span className="text-xs text-muted" aria-hidden>
                then
              </span>
              <Key>{g.key.toUpperCase()}</Key>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Shortcuts are paused while you type in a box or have a window open.</p>
    </Dialog>
  );
}
