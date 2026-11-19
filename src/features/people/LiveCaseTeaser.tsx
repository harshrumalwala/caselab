import { ArrowRight } from 'lucide-react';
import { Sparkle } from '../../components/ui/Doodles';
import { BucketAvatar } from '../improvement/BucketAvatar';

/**
 * A member's own link is the way in for someone without an account, so this page is where most people meet CaseLab. One compact band
 * says what a live case is and offers a way to sign up. It takes no props on purpose: it is the same band on every profile and says
 * nothing about the member whose page it sits on. Visitors only (`mine === null` in PersonProfile); a member already has the tab.
 */
export function LiveCaseTeaser() {
  return (
    <section aria-labelledby="live-teaser-title" className="sticker relative overflow-hidden bg-teal-soft p-5">
      <Sparkle className="absolute right-4 top-3 size-6 text-sun" />
      <div className="flex items-start gap-4">
        <BucketAvatar className="size-12 shrink-0 -rotate-3 sm:size-14" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="eyebrow text-teal-ink">Live case</p>
            <span className="rounded-full border-2 border-ink/80 bg-surface px-1.5 py-0.5 text-[10px] font-bold leading-none text-ink">AI</span>
          </div>
          <h2 id="live-teaser-title" className="mt-0.5 font-display text-xl font-extrabold leading-tight tracking-tight text-ink">
            Practise a whole case with Bucket
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">
            Bucket plays the interviewer on a real casebook case: the prompt, your clarifying questions, the exhibits, the
            recommendation. Typed, 23 to 40 minutes, then feedback on what you wrote.
          </p>
          <a
            href="#/signup"
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink shadow-sm transition hover:bg-accent-hover"
          >
            Create an account <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
