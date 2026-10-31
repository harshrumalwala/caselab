import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';

// Only the top-most dialog reacts to Escape (a confirm dialog can sit on top of a drawer).
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** `modal`: centered card (full-screen sheet on phones). `drawer`: right-hand panel. */
  variant?: 'modal' | 'drawer';
  width?: 'sm' | 'md' | 'lg';
  /** Raise above another open dialog. */
  layer?: 'base' | 'top';
  /** Optional element shown next to the title (e.g. status badges). */
  headerExtra?: ReactNode;
}

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-2xl' };

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'modal',
  width = 'md',
  layer = 'base',
  headerExtra,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyFocusable, setBodyFocusable] = useState(false);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Runs after every render: the body's contents change as the dialog does (steps, errors, lists).
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const none = body.querySelector(FOCUSABLE) === null;
    setBodyFocusable((was) => (was === none ? was : none));
  });

  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    stack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus a field marked data-autofocus, else the panel itself (so phones don't pop the keyboard).
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>('[data-autofocus]');
      (first ?? panel).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const z = layer === 'top' ? 'z-[70]' : 'z-50';
  const isDrawer = variant === 'drawer';

  return createPortal(
    <div className={`fixed inset-0 ${z}`}>
      <div className="absolute inset-0 animate-fade bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        className={`absolute inset-0 flex ${isDrawer ? 'justify-end' : 'items-stretch justify-center sm:items-center sm:p-6'}`}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          className={`relative flex w-full flex-col bg-surface shadow-pop outline-none ${
            isDrawer
              ? 'animate-drawer h-full sm:max-w-xl sm:border-l sm:border-line'
              : `animate-sheet h-full sm:h-auto sm:max-h-[min(92vh,880px)] sm:rounded-3xl sm:border sm:border-line ${WIDTHS[width]}`
          }`}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7 sm:py-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-0.5 text-sm text-muted">
                  {description}
                </p>
              )}
              {headerExtra && <div className="mt-2">{headerExtra}</div>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1 shrink-0">
              <X className="size-5" />
            </IconButton>
          </header>
          <div
            ref={bodyRef}
            // With nothing to tab to inside, the keyboard still needs a way in to scroll a long body.
            tabIndex={bodyFocusable ? 0 : undefined}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent sm:px-7"
          >
            {children}
          </div>
          {footer && (
            <footer className="border-t border-line bg-surface-2/60 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-b-3xl sm:px-7">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
