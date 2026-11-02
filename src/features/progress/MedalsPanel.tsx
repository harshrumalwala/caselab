import { Medal } from 'lucide-react';
import { MEDAL_AT, MEDAL_TIERS, MEDAL_WINDOW, skillMedals, type MedalTier } from '../../domain/medals';
import type { CaseRecord } from '../../domain/types';

const TIER_LABEL: Record<MedalTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
/** Spelled out in full so Tailwind can see each class. */
const TIER_BG: Record<MedalTier, string> = { bronze: 'bg-[#c98a54]', silver: 'bg-[#c4cbd4]', gold: 'bg-[#f2c744]' };

const one = (v: number) => v.toFixed(1);

/** One medal slot per tier: filled in the tier's colour once earned, an empty outline until then. */
function Slots({ tier }: { tier: MedalTier | null }) {
  const reached = tier === null ? -1 : MEDAL_TIERS.indexOf(tier);
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden>
      {MEDAL_TIERS.map((t, i) => (
        <span
          key={t}
          className={`flex size-8 items-center justify-center rounded-full border-2 ${
            i <= reached ? `${TIER_BG[t]} border-ink/80 text-ink shadow-[1px_2px_0_0_rgb(28_26_24/0.85)]` : 'border-dashed border-line bg-bg text-muted/50'
          }`}
        >
          <Medal className="size-4" />
        </span>
      ))}
    </span>
  );
}

/** A medal for each skill, from your best five ratings in a row. */
export function MedalsPanel({ cases }: { cases: CaseRecord[] }) {
  const medals = skillMedals(cases);
  const won = medals.filter((m) => m.tier !== null).length;
  return (
    <div>
      <p className="text-sm text-ink-2">
        Bronze at an average of {MEDAL_AT.bronze} over {MEDAL_WINDOW} ratings in a row, silver at {MEDAL_AT.silver}, gold at {MEDAL_AT.gold}. It is your best run that counts, so a rough week never takes a
        medal back.
      </p>
      <p className="mt-3 font-display text-lg font-extrabold text-ink">{won === 0 ? 'No medals yet' : `${won} of ${medals.length} skills with a medal`}</p>
      <ul className="mt-3 space-y-2" aria-label="Skill medals">
        {medals.map((m) => (
          <li key={m.key} className="flex items-center gap-3 rounded-2xl border-2 border-ink/80 bg-surface p-3">
            <Slots tier={m.tier} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-ink">{m.label}</span>
                {m.tier && <span className="text-xs font-bold uppercase tracking-wide text-ink-2">{TIER_LABEL[m.tier]}</span>}
              </span>
              <span className="num block text-xs text-ink-2">
                {m.best === null
                  ? `${m.ratings} of ${MEDAL_WINDOW} ratings so far`
                  : m.next
                    ? `Best run ${one(m.best)}. ${TIER_LABEL[m.next.tier]} needs ${one(m.next.at)}.`
                    : `Best run ${one(m.best)}. The top medal.`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
