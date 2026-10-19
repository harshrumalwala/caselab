import { INDUSTRIES, MAIN_CASE_TYPES, type CaseType } from './constants';
import type { SharedCase } from './community';
import { canonicalIndustry, compareCases } from './stats';
import type { CaseRecord } from './types';

// ---------------------------------------------------------------------------------------
// Matching "equivalent" cases that different people typed slightly differently.
// Deliberately light: normalise the words, then compare. No casebook database.
// ---------------------------------------------------------------------------------------

const STOPWORDS = new Set([
  'case', 'cases', 'the', 'a', 'an', 'of', 'for', 'in', 'on', 'at', 'and', 'to', 'with', 'practice', 'interview', 'mock',
]);

/** Lower-case words with filler removed and plurals folded: "The Airline Profit Case" -> [airline, profit]. */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** Same word, or one is a long-enough prefix of the other ("profit" ~ "profitability"). */
function sameToken(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short);
}

export type Match = 'same' | 'similar';

/** How alike two case titles are: identical after tidying, similar enough to be worth double-checking, or not. */
export function compareTitles(a: string, b: string): Match | null {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.length === 0 || tb.length === 0) {
    return a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase() ? 'same' : null;
  }
  const shared = ta.filter((x) => tb.some((y) => sameToken(x, y))).length;
  const sharedB = tb.filter((y) => ta.some((x) => sameToken(x, y))).length;
  if (shared === ta.length && sharedB === tb.length) return 'same';

  const overlap = Math.min(shared, sharedB);
  const jaccard = overlap / (ta.length + tb.length - overlap);
  const smaller = Math.min(ta.length, tb.length);
  if (overlap >= 2 && (overlap / smaller >= 1 || jaccard >= 0.6)) return 'similar';
  return null;
}

// ---------------------------------------------------------------------------------------
// Pairing: what I could give them, what they have done, where their history is thin.
// Uses only my own cases and the cases THEY chose to share.
// ---------------------------------------------------------------------------------------

export interface TheyHaveDone {
  shared: SharedCase;
  /** One of my cases that looks like it, so you can see what you'd both be repeating. */
  mine: { title: string; match: Match } | null;
}

export interface Gap {
  name: string;
  /** How many of their shared cases fall here. */
  theirCount: number;
  /** How many of my cases (not already theirs) I could offer here. */
  offerable: number;
}

export interface Pairing {
  /** Cases they've shared (what NOT to repeat). */
  theyHaveDone: TheyHaveDone[];
  /** Mine with no match in what they've shared: the best candidates to give them. */
  newToThem: CaseRecord[];
  /** Mine that look similar to one of theirs: worth checking before using. */
  mayOverlap: { mine: CaseRecord; theirTitle: string }[];
  caseTypeGaps: Gap[];
  industryGaps: Gap[];
}

/** My cases, one per distinct title (the most recent), so repeating a case doesn't list it twice. */
function distinctMine(mine: CaseRecord[]): CaseRecord[] {
  const out: CaseRecord[] = [];
  for (const c of [...mine].sort(compareCases).reverse()) {
    const dup = out.some((o) => compareTitles(o.title, c.title) === 'same');
    if (!dup) out.push(c);
  }
  return out;
}

export function pairCases(mine: CaseRecord[], theirs: SharedCase[]): Pairing {
  const myCases = distinctMine(mine);

  const theyHaveDone: TheyHaveDone[] = theirs.map((shared) => {
    let best: TheyHaveDone['mine'] = null;
    for (const c of myCases) {
      const m = compareTitles(c.title, shared.title);
      if (m === 'same') {
        best = { title: c.title, match: 'same' };
        break;
      }
      if (m === 'similar' && !best) best = { title: c.title, match: 'similar' };
    }
    return { shared, mine: best };
  });

  const newToThem: CaseRecord[] = [];
  const mayOverlap: Pairing['mayOverlap'] = [];
  for (const c of myCases) {
    let seenSame = false;
    let similar: string | null = null;
    for (const s of theirs) {
      const m = compareTitles(c.title, s.title);
      if (m === 'same') {
        seenSame = true;
        break;
      }
      if (m === 'similar' && similar === null) similar = s.title;
    }
    if (seenSame) continue;
    if (similar !== null) mayOverlap.push({ mine: c, theirTitle: similar });
    else newToThem.push(c);
  }

  const offerableTypes = new Map<string, number>();
  const offerableIndustries = new Map<string, number>();
  for (const c of newToThem) {
    offerableTypes.set(c.caseType, (offerableTypes.get(c.caseType) ?? 0) + 1);
    const industry = canonicalIndustry(c.industry);
    if (industry) offerableIndustries.set(industry, (offerableIndustries.get(industry) ?? 0) + 1);
  }

  const theirTypes = new Map<string, number>();
  const theirIndustries = new Map<string, number>();
  for (const s of theirs) {
    theirTypes.set(s.caseType, (theirTypes.get(s.caseType) ?? 0) + 1);
    const industry = canonicalIndustry(s.industry);
    if (industry) theirIndustries.set(industry, (theirIndustries.get(industry) ?? 0) + 1);
  }

  const gapsSort = (a: Gap, b: Gap) => a.theirCount - b.theirCount || b.offerable - a.offerable || a.name.localeCompare(b.name);

  const caseTypeGaps = (MAIN_CASE_TYPES as CaseType[])
    .map((t): Gap => ({ name: t, theirCount: theirTypes.get(t) ?? 0, offerable: offerableTypes.get(t) ?? 0 }))
    .sort(gapsSort);

  const industryNames = [...new Set([...INDUSTRIES.filter((i) => i !== 'Other'), ...theirIndustries.keys(), ...offerableIndustries.keys()])];
  const industryGaps = industryNames
    .map((n): Gap => ({ name: n, theirCount: theirIndustries.get(n) ?? 0, offerable: offerableIndustries.get(n) ?? 0 }))
    .sort(gapsSort);

  return { theyHaveDone, newToThem, mayOverlap, caseTypeGaps, industryGaps };
}

// ---------------------------------------------------------------------------------------
// Filters shared by the "cases they've shared" list and the pairing sections
// ---------------------------------------------------------------------------------------

export interface CaseFilter {
  query: string;
  industry: string; // 'all' or a name
  caseType: string; // 'all' or a type
  source: string; // 'all' or a source
}

export const NO_FILTER: CaseFilter = { query: '', industry: 'all', caseType: 'all', source: 'all' };

export function matchesFilter(c: { title: string; source: string; industry: string; caseType: string }, f: CaseFilter): boolean {
  const q = f.query.trim().toLowerCase();
  if (q && !c.title.toLowerCase().includes(q) && !c.source.toLowerCase().includes(q)) return false;
  if (f.industry !== 'all' && canonicalIndustry(c.industry) !== f.industry) return false;
  if (f.caseType !== 'all' && c.caseType !== f.caseType) return false;
  if (f.source !== 'all' && c.source.trim().toLowerCase() !== f.source.trim().toLowerCase()) return false;
  return true;
}

/** Distinct values of a field, for filter drop-downs. */
export function distinctValues(items: { source: string; industry: string }[], key: 'source' | 'industry'): string[] {
  const seen = new Map<string, string>();
  for (const i of items) {
    const v = key === 'industry' ? canonicalIndustry(i.industry) : i.source.trim();
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
