import { Timer } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useData } from '../../state/DataProvider';
import { useUI } from '../../state/ui';

/** The way in to the live case: a timed, typed practice case with Bucket as the interviewer. */
export function LiveCaseCard() {
  const { navigate } = useUI();
  const { mode } = useData();
  if (mode === 'demo') return null;
  return (
    <Card strip="sun" aria-labelledby="live-card-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 id="live-card-title" className="flex items-center gap-2 text-lg font-bold text-ink">
            <Timer className="size-5 text-accent-text" aria-hidden /> Practise a whole case with Bucket
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            30 minutes, typed: Bucket gives you the prompt, answers your clarifying questions, shows the exhibits and keeps the case moving. Then you get feedback on what you wrote, and the
            case is logged for you.
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('live')}>
          Start a live case
        </Button>
      </div>
    </Card>
  );
}
