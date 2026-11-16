import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Sparkle } from '../../components/ui/Doodles';
import { useData } from '../../state/DataProvider';
import { useUI } from '../../state/ui';
import { BucketAvatar } from '../improvement/BucketAvatar';

const POINTS = ['20 to 40 minutes, typed', 'Real cases, by type or industry', 'Feedback on what you wrote, logged for you'];

/**
 * The live case with Bucket, given the top of the Dashboard: it is the thing CaseLab does that a spreadsheet can't, so it is the first
 * thing a member sees, not a card at the bottom of another page. (It needs the member's own account, so demo mode doesn't show it.)
 */
export function LiveCaseBanner() {
  const { navigate } = useUI();
  const { mode } = useData();
  if (mode === 'demo') return null;
  return (
    <section aria-labelledby="live-banner-title" className="sticker relative overflow-hidden bg-teal-soft p-5 sm:p-7">
      <Sparkle className="absolute right-5 top-4 size-7 text-sun" />
      {/* On a phone Bucket sits beside the title, so the card stays short; from a tablet up it is three columns: Bucket, the words, the button. */}
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 md:grid-cols-[auto_1fr_auto] md:gap-x-8">
        <BucketAvatar className="col-start-1 row-start-1 size-16 animate-bob motion-reduce:animate-none sm:size-20 md:row-span-2 md:size-28" />
        <div className="col-start-2 row-start-1 min-w-0 pr-8 md:self-end">
          <p className="eyebrow text-teal-ink">Live case</p>
          <h2 id="live-banner-title" className="mt-0.5 font-display text-xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
            Practise a whole case with Bucket
          </h2>
        </div>
        <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2">
          <p className="max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">
            Bucket plays your interviewer: the prompt, your clarifying questions, the exhibits, the recommendation, against the clock or, in learning mode, at your own pace. Then you get feedback on what
            you actually wrote.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {POINTS.map((p) => (
              <li key={p} className="rounded-full border-2 border-ink/80 bg-surface px-3 py-1 text-xs font-bold text-ink">
                {p}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="primary" size="lg" className="col-span-2 row-start-3 justify-self-start md:col-span-1 md:col-start-3 md:row-span-2 md:row-start-1 md:self-center" onClick={() => navigate('live')}>
          Start a live case <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
