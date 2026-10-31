import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  children,
  actions,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6' : 'py-10 sm:py-14'}`}>
      {icon && (
        <span className="mb-4 flex size-12 -rotate-3 items-center justify-center rounded-2xl border-2 border-ink/80 bg-sun text-on-sun shadow-[2px_3px_0_0_rgb(28_26_24/0.85)]">
          {icon}
        </span>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
