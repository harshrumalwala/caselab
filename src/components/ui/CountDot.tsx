/**
 * A small coral count for a tab ("2 things need you"). Decoration only: the link it sits on carries the spoken label, so
 * this is hidden from screen readers. On an icon it floats at the corner; `inline` sits it after a word.
 */
export function CountDot({ n, inline = false }: { n: number; inline?: boolean }) {
  return (
    <span
      aria-hidden
      className={`num inline-flex min-w-4.5 items-center justify-center rounded-full border-2 border-ink/80 bg-coral px-1 text-[10px] font-extrabold leading-4 text-on-color ${
        inline ? 'ml-1.5 align-middle' : 'absolute -right-2.5 -top-1.5'
      }`}
    >
      {n > 9 ? '9+' : n}
    </span>
  );
}
