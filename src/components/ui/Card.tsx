import type { ReactNode } from 'react';
import { chipClass } from './chips';

const STRIP = {
  sun: 'bg-sun',
  teal: 'bg-teal',
  coral: 'bg-coral',
  lilac: 'bg-lilac',
  sky: 'bg-sky',
} as const;

export function Card({
  children,
  className = '',
  strip,
  flush = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Draws the card as a sticker with a coloured band across the top. */
  strip?: keyof typeof STRIP;
  /** With a strip: no padding inside, for content that runs edge to edge. */
  flush?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  if (strip) {
    return (
      <section className={`sticker overflow-hidden ${className}`} {...rest}>
        <div className={`h-3 border-b-2 border-ink/80 ${STRIP[strip]}`} aria-hidden />
        <div className={`font-sans ${flush ? '' : 'p-5 sm:p-6'}`}>{children}</div>
      </section>
    );
  }
  return (
    <section className={`card p-5 sm:p-6 ${className}`} {...rest}>
      {children}
    </section>
  );
}


export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  titleId,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  titleId?: string;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-ink/80 ${chipClass(title)}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
