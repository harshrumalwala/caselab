import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink shadow-sm hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-bad text-white hover:opacity-90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-sm',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }: Props) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...rest} />;
}

export function IconButton({
  label,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex size-9 items-center justify-center rounded-xl text-ink-2 transition hover:bg-surface-2 hover:text-ink active:scale-95 ${className}`}
      {...rest}
    />
  );
}
