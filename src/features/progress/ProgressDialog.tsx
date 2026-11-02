import { Dialog } from '../../components/ui/Dialog';
import { splitMarkClass, splitTabClass, splitTabsClass } from '../../components/ui/splitTab';
import { SlideRow } from '../../components/ui/useSlidingMark';
import { questsForWeek } from '../../domain/quests';
import { startOfWeek, toISODate } from '../../domain/dates';
import { skillMedals } from '../../domain/medals';
import { stickerBook } from '../../domain/stickers';
import type { Progress } from '../../domain/progress';
import type { CaseRecord } from '../../domain/types';
import { LevelPanel } from './LevelPanel';
import { MedalsPanel } from './MedalsPanel';
import { QuestsPanel } from './QuestsPanel';
import { StickerBook } from './StickerBook';

export type ProgressTab = 'level' | 'quests' | 'medals' | 'stickers';

/** Everything the game tracks, in one window behind the level badge: the level, this week's quests, skill medals and the sticker book. */
export function ProgressDialog({
  progress,
  cases,
  now,
  tab,
  onTab,
  onClose,
}: {
  progress: Progress;
  cases: CaseRecord[];
  now: Date;
  tab: ProgressTab;
  onTab: (t: ProgressTab) => void;
  onClose: () => void;
}) {
  const quests = questsForWeek(cases, toISODate(startOfWeek(now)));
  const tabs: [ProgressTab, string][] = [
    ['level', 'Level'],
    ['quests', `Quests ${quests.filter((q) => q.done).length}/${quests.length}`],
    ['medals', `Medals ${skillMedals(cases).filter((m) => m.tier !== null).length}`],
    ['stickers', `Stickers ${stickerBook(cases).filter((s) => s.earned).length}`],
  ];
  return (
    <Dialog open onClose={onClose} title="Your progress" description={`Level ${progress.level}: ${progress.title}`} width="lg">
      <SlideRow role="tablist" aria-label="Progress views" activeKey={tab} markClass={splitMarkClass} className={`${splitTabsClass} mb-5`}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-slide-active={tab === id ? 'true' : undefined}
            onClick={() => onTab(id)}
            className={`${splitTabClass(tab === id)} !px-1.5 text-xs sm:!px-3 sm:text-sm`}
          >
            {label}
          </button>
        ))}
      </SlideRow>
      <div role="tabpanel" aria-label={tabs.find(([id]) => id === tab)?.[1]}>
        {tab === 'level' && <LevelPanel progress={progress} />}
        {tab === 'quests' && <QuestsPanel cases={cases} now={now} />}
        {tab === 'medals' && <MedalsPanel cases={cases} />}
        {tab === 'stickers' && <StickerBook cases={cases} />}
      </div>
    </Dialog>
  );
}
