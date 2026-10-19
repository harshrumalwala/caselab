import { SKILLS } from '../domain/constants';
import { emptySkills, newId, normalizeCase, normalizeOpportunity } from '../domain/factory';
import type { CaseRecord, OpportunityItem } from '../domain/types';

/** Shape of a row in public.cases (see supabase/migrations). Optional text columns are nullable. */
export interface CaseRow {
  id: string;
  user_id?: string;
  case_date: string;
  title: string;
  source: string | null;
  case_type: string;
  industry: string | null;
  partner: string | null;
  overall: number | null;
  overall_feedback: string | null;
  skills: unknown;
  went_well: string | null;
  struggled: string | null;
  concepts: string | null;
  next_focus: string | null;
  improvement_area: string | null;
  other_notes: string | null;
  share_mode?: string;
  created_at: string;
  updated_at: string;
}

export interface OpportunityRow {
  id: string;
  user_id?: string;
  kind: string;
  text: string;
  created_at: string;
}

const blankToNull = (s: string): string | null => (s.trim() === '' ? null : s);

/** user_id is never sent: the database fills it from the signed-in user's token. */
export function caseToRow(c: CaseRecord): CaseRow {
  const skills: Record<string, unknown> = {};
  for (const s of SKILLS) skills[s.key] = { rating: c.skills[s.key].rating, feedback: c.skills[s.key].feedback };
  return {
    id: c.id,
    case_date: c.date,
    title: c.title.trim() || 'Untitled case',
    source: blankToNull(c.source),
    case_type: c.caseType,
    industry: blankToNull(c.industry),
    partner: blankToNull(c.partner),
    overall: c.overall,
    overall_feedback: blankToNull(c.overallFeedback),
    skills,
    went_well: blankToNull(c.wentWell),
    struggled: blankToNull(c.struggled),
    concepts: blankToNull(c.concepts),
    next_focus: blankToNull(c.nextFocus),
    improvement_area: c.improvementArea,
    other_notes: blankToNull(c.otherNotes),
    share_mode: c.shareMode,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export function rowToCase(row: CaseRow): CaseRecord {
  const record = normalizeCase({
    id: row.id,
    date: row.case_date,
    title: row.title,
    source: row.source ?? '',
    caseType: row.case_type,
    industry: row.industry ?? '',
    partner: row.partner ?? '',
    overall: row.overall,
    overallFeedback: row.overall_feedback ?? '',
    skills: row.skills ?? {},
    wentWell: row.went_well ?? '',
    struggled: row.struggled ?? '',
    concepts: row.concepts ?? '',
    nextFocus: row.next_focus ?? '',
    improvementArea: row.improvement_area,
    otherNotes: row.other_notes ?? '',
    shareMode: row.share_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  // normalizeCase only returns null for non-objects, which a database row never is.
  return record ?? { ...emptyRecord(row.id), title: row.title };
}

function emptyRecord(id: string): CaseRecord {
  const now = new Date().toISOString();
  return {
    id,
    date: now.slice(0, 10),
    title: '',
    source: '',
    caseType: 'Other',
    industry: '',
    partner: '',
    overall: null,
    overallFeedback: '',
    skills: emptySkills(),
    wentWell: '',
    struggled: '',
    concepts: '',
    nextFocus: '',
    improvementArea: null,
    otherNotes: '',
    shareMode: 'profile',
    createdAt: now,
    updatedAt: now,
  };
}

export function opportunityToRow(o: OpportunityItem): OpportunityRow {
  return { id: o.id, kind: o.kind, text: o.text, created_at: o.createdAt };
}

export function rowToOpportunity(row: OpportunityRow): OpportunityItem {
  return (
    normalizeOpportunity({ id: row.id, kind: row.kind, text: row.text, createdAt: row.created_at }) ?? {
      id: row.id,
      kind: 'exposure',
      text: row.text,
      createdAt: new Date().toISOString(),
    }
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => UUID.test(s);

/**
 * The database keys rows by uuid. Anything imported with a different kind of id (an old
 * export, a hand-edited file) gets a fresh uuid before it is stored.
 */
export function withUuidIds<T extends { id: string }>(items: T[]): T[] {
  return items.map((item) => (isUuid(item.id) ? item : { ...item, id: newId() }));
}
