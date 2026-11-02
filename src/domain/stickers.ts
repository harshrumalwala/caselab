import { MAIN_CASE_TYPES, SKILL_GROUPS } from './constants';
import { addDays, parseISODate, toISODate, weekStartISO } from './dates';
import { skillMedals } from './medals';
import { progressFor, skillGains, TITLES } from './progress';
import { questTotals } from './quests';
import { canonicalIndustry, caseSkillValue, sortAsc } from './stats';
import type { CaseRecord } from './types';

/**
 * The sticker book: a collection of small badges for things worth a nod, from your first case to making Partner. Like XP they are
 * worked out from the log every time and never stored, so nothing drifts, an import fills the book on arrival, and a sticker earned
 * by cases you later delete goes with them.
 */

export type StickerIcon =
  | 'flag' | 'shapes' | 'building' | 'factory' | 'star' | 'pen' | 'graduation' | 'flame' | 'calendarCheck' | 'calendarRange'
  | 'handshake' | 'trending' | 'medal' | 'trophy' | 'scroll' | 'compass' | 'calculator' | 'briefcase' | 'presentation' | 'clipboard' | 'crown';
export type StickerTone = 'sun' | 'teal' | 'coral' | 'lilac' | 'sky';

export interface Sticker {
  id: string;
  name: string;
  /** What earns it, written to read as a hint while it is still locked. */
  how: string;
  /** A short mark (a number) shown in place of the icon, for the stickers that count something. */
  mark?: string;
  icon: StickerIcon;
  tone: StickerTone;
  earned: boolean;
}

const hasFeedback = (c: CaseRecord) => c.overallFeedback.trim() !== '' || Object.values(c.skills).some((s) => s.feedback.trim() !== '');

/** The longest run of weeks in a row with at least one case. */
export function longestWeekRun(cases: CaseRecord[]): number {
  const weeks = [...new Set(cases.map((c) => weekStartISO(c.date)))].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of weeks) {
    run = prev !== null && toISODate(addDays(parseISODate(prev), 7)) === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return best;
}

const RANK_ICONS: Record<string, StickerIcon> = {
  Analyst: 'calculator',
  Associate: 'briefcase',
  Consultant: 'presentation',
  'Engagement Manager': 'clipboard',
  Partner: 'crown',
};

export function stickerBook(cases: CaseRecord[]): Sticker[] {
  const ordered = sortAsc(cases);
  const n = ordered.length;
  const types = new Set(ordered.map((c) => c.caseType));
  const industries = new Set<string>();
  for (const c of ordered) {
    const name = canonicalIndustry(c.industry).toLowerCase();
    if (name && name !== 'other') industries.add(name);
  }
  const partners = new Set(ordered.map((c) => c.partner.trim().toLowerCase()).filter(Boolean));
  const perWeek = new Map<string, number>();
  for (const c of ordered) perWeek.set(weekStartISO(c.date), (perWeek.get(weekStartISO(c.date)) ?? 0) + 1);
  const biggestWeek = Math.max(0, ...perWeek.values());
  const medals = skillMedals(ordered);
  const level = progressFor(ordered).level;
  const run = longestWeekRun(ordered);
  const quests = questTotals(ordered).done;

  const out: Sticker[] = [
    { id: 'first-case', name: 'First case', how: 'Log your first case', icon: 'flag', tone: 'sun', earned: n >= 1 },
    { id: 'cases-10', name: 'Double digits', how: 'Log 10 cases', mark: '10', icon: 'flag', tone: 'teal', earned: n >= 10 },
    { id: 'cases-25', name: 'Quarter century', how: 'Log 25 cases', mark: '25', icon: 'flag', tone: 'coral', earned: n >= 25 },
    { id: 'cases-50', name: 'Half century', how: 'Log 50 cases', mark: '50', icon: 'flag', tone: 'lilac', earned: n >= 50 },
    { id: 'cases-100', name: 'Century', how: 'Log 100 cases', mark: '100', icon: 'flag', tone: 'sun', earned: n >= 100 },
    { id: 'all-types', name: 'Well rounded', how: 'Practise every main case type', icon: 'shapes', tone: 'teal', earned: MAIN_CASE_TYPES.every((t) => types.has(t)) },
    { id: 'industries-5', name: 'Sector hopper', how: 'Practise 5 different industries', icon: 'building', tone: 'sky', earned: industries.size >= 5 },
    { id: 'industries-10', name: 'Industry insider', how: 'Practise 10 different industries', icon: 'factory', tone: 'coral', earned: industries.size >= 10 },
    {
      id: 'full-house',
      name: 'Full house',
      how: 'Rate every skill in one case',
      icon: 'star',
      tone: 'lilac',
      earned: ordered.some((c) => SKILL_GROUPS.every((g) => caseSkillValue(c, g.key) !== null)),
    },
    {
      id: 'show-your-work',
      name: 'Show your work',
      how: 'Write one case up in full: feedback, a lesson, a next focus and an improvement tag',
      icon: 'pen',
      tone: 'sun',
      earned: ordered.some((c) => hasFeedback(c) && c.concepts.trim() !== '' && c.nextFocus.trim() !== '' && c.improvementArea !== null),
    },
    { id: 'student', name: 'Student of the game', how: 'Write down what you learned in 10 cases', icon: 'graduation', tone: 'teal', earned: ordered.filter((c) => c.concepts.trim() !== '').length >= 10 },
    { id: 'big-week', name: 'Big week', how: 'Log 5 cases in one week', icon: 'flame', tone: 'coral', earned: biggestWeek >= 5 },
    { id: 'run-3', name: 'Three-week run', how: 'A case in each of 3 weeks in a row', icon: 'calendarCheck', tone: 'sun', earned: run >= 3 },
    { id: 'run-8', name: 'Two-month run', how: 'A case in each of 8 weeks in a row', icon: 'calendarRange', tone: 'lilac', earned: run >= 8 },
    { id: 'partners-5', name: 'Social butterfly', how: 'Case with 5 different partners', icon: 'handshake', tone: 'sky', earned: partners.size >= 5 },
    { id: 'glow-up', name: 'Glow-up', how: 'Raise a skill by a whole point', icon: 'trending', tone: 'teal', earned: skillGains(ordered).some((g) => g.gain >= 1 - 1e-9) },
    { id: 'first-medal', name: 'On the podium', how: 'Earn a skill medal', icon: 'medal', tone: 'sun', earned: medals.some((m) => m.tier !== null) },
    { id: 'gold', name: 'Gold standard', how: 'Earn a gold skill medal', icon: 'trophy', tone: 'coral', earned: medals.some((m) => m.tier === 'gold') },
    { id: 'quests-3', name: 'Quest log', how: 'Finish 3 weekly quests', icon: 'scroll', tone: 'lilac', earned: quests >= 3 },
    { id: 'quests-15', name: 'Questmaster', how: 'Finish 15 weekly quests', icon: 'compass', tone: 'teal', earned: quests >= 15 },
  ];

  for (const t of TITLES.filter((title) => title.from > 1)) {
    out.push({
      id: `rank-${t.title.toLowerCase().replace(/\s+/g, '-')}`,
      name: t.title,
      how: `Reach level ${t.from}`,
      icon: RANK_ICONS[t.title] ?? 'briefcase',
      tone: 'sun',
      earned: level >= t.from,
    });
  }
  return out;
}

/** Stickers earned by `after` that `before` did not have, e.g. what saving a case just won. */
export function newStickers(before: CaseRecord[], after: CaseRecord[]): Sticker[] {
  const had = new Set(stickerBook(before).filter((s) => s.earned).map((s) => s.id));
  return stickerBook(after).filter((s) => s.earned && !had.has(s.id));
}
