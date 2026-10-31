import { Zap } from 'lucide-react';

/** A small nudge toward the Warm-up sprint, shown next to advice about Quant / Math. */
export function WarmupLink({ className = '' }: { className?: string }) {
  return (
    <a
      href="#/warmup"
      className={`inline-flex items-center gap-1.5 rounded-full border-2 border-ink/80 bg-sun px-3 py-1 text-xs font-bold text-on-sun shadow-[1px_2px_0_0_rgb(28_26_24/0.85)] transition hover:brightness-95 ${className}`}
    >
      <Zap className="size-3.5" aria-hidden /> Warm up with a 60-second sprint
    </a>
  );
}
