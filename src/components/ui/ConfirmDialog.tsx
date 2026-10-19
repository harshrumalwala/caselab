import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** When set, the user must type this word before the confirm button enables. */
  requireText?: string;
  /** The confirmed action is running (waiting on the database). */
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  requireText,
  busy = false,
}: Props) {
  const [typed, setTyped] = useState('');
  const blocked = busy || (requireText !== undefined && typed.trim() !== requireText);

  const cancel = () => {
    if (busy) return;
    setTyped('');
    onCancel();
  };
  const confirm = () => {
    if (blocked) return;
    setTyped('');
    onConfirm();
  };

  return (
    <Dialog
      open={open}
      onClose={cancel}
      title={title}
      variant="modal"
      width="sm"
      layer="top"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={blocked}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm leading-relaxed text-ink-2">
        {children}
        {requireText !== undefined && (
          <div>
            <label className="label" htmlFor="confirm-text">
              Type <span className="font-mono font-bold text-ink">{requireText}</span> to confirm
            </label>
            <input
              id="confirm-text"
              className="field"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              data-autofocus
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
