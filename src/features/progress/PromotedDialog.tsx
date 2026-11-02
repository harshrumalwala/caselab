import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Confetti } from '../../components/ui/Motion';
import { titleForLevel } from '../../domain/progress';

/** The moment a new level is reached: a stamp, the new level and title, and a joke that fits the job. A new job title is a promotion. */
export function PromotedDialog({ from, to, onClose }: { from: number; to: number; onClose: () => void }) {
  const now = titleForLevel(to);
  const promoted = now.from > titleForLevel(from).from;
  return (
    <Dialog open onClose={onClose} title={promoted ? `Promoted to ${now.title}` : `Level ${to}`} description={promoted ? 'A new job title' : 'You levelled up'} width="sm">
      <Confetti pieces={promoted ? 180 : 110} />
      <div className="text-center">
        <span className="stamp" aria-hidden>
          {promoted ? 'Promoted' : 'Level up'}
        </span>
        <p className="num mt-4 font-display text-7xl font-extrabold leading-none text-ink">{to}</p>
        <p className="mt-2 font-display text-xl font-extrabold text-ink">{now.title}</p>
        <p className="mt-1 text-sm text-ink-2">{now.joke}</p>
        {to - from > 1 && <p className="mt-3 text-sm font-semibold text-accent-text">Up {to - from} levels in one go. That's a lot of cases.</p>}
        <Button variant="primary" size="lg" className="mt-6" onClick={onClose} autoFocus>
          Keep casing
        </Button>
      </div>
    </Dialog>
  );
}
