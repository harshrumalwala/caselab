import {
  CASE_TYPES,
  SKILLS,
  SKILL_GROUPS,
  type CaseType,
  type Rating,
  type SkillGroupKey,
  type SkillKey,
} from './constants';
import { isValidISODate, todayISO } from './dates';
import {
  SCHEMA_VERSION,
  type AppData,
  type CaseInput,
  type CaseRecord,
  type OpportunityItem,
  type SkillEntry,
} from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptySkills(): Record<SkillKey, SkillEntry> {
  const out = {} as Record<SkillKey, SkillEntry>;
  for (const s of SKILLS) out[s.key] = { rating: null, feedback: '' };
  return out;
}

export function blankCaseInput(now: Date = new Date()): CaseInput {
  return {
    date: todayISO(now),
    title: '',
    source: '',
    caseType: '' as CaseType, // chosen by the user; validated before saving
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
  };
}

export function emptyAppData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    cases: [],
    opportunities: [],
    customIndustries: [],
    lastExportAt: null,
  };
}

export function toInput(c: CaseRecord): CaseInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = c;
  void _id;
  void _c;
  void _u;
  return { ...input, skills: cloneSkills(c.skills) };
}

export function cloneSkills(skills: Record<SkillKey, SkillEntry>): Record<SkillKey, SkillEntry> {
  const out = emptySkills();
  for (const s of SKILLS) out[s.key] = { ...skills[s.key] };
  return out;
}

export type CaseErrors = Partial<Record<'title' | 'caseType' | 'industry' | 'date', string>>;

export function validateCaseInput(input: CaseInput): CaseErrors {
  const errors: CaseErrors = {};
  if (!input.title.trim()) errors.title = 'Give the case a title';
  if (!CASE_TYPES.includes(input.caseType)) errors.caseType = 'Pick a case type';
  if (!input.industry.trim()) errors.industry = 'Pick an industry';
  if (!isValidISODate(input.date)) errors.date = 'Enter a valid date';
  return errors;
}

/** Trim free text fields and tidy the input before it is stored. */
export function cleanInput(input: CaseInput): CaseInput {
  const t = (s: string) => s.trim();
  const skills = emptySkills();
  for (const s of SKILLS) {
    skills[s.key] = { rating: input.skills[s.key]?.rating ?? null, feedback: t(input.skills[s.key]?.feedback ?? '') };
  }
  return {
    ...input,
    title: t(input.title),
    source: t(input.source),
    industry: t(input.industry),
    partner: t(input.partner),
    overallFeedback: t(input.overallFeedback),
    wentWell: t(input.wentWell),
    struggled: t(input.struggled),
    concepts: t(input.concepts),
    nextFocus: t(input.nextFocus),
    otherNotes: t(input.otherNotes),
    skills,
  };
}

// --- Lenient parsing, used when reading storage or importing a backup -------------------

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function normalizeRating(v: unknown): Rating | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? (r as Rating) : null;
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeCase(raw: unknown): CaseRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const createdAt = isoOrNull(r.createdAt) ?? nowIso;
  const updatedAt = isoOrNull(r.updatedAt) ?? createdAt;
  const date = isValidISODate(r.date) ? r.date : todayISO(new Date(createdAt));

  const rawSkills = (r.skills && typeof r.skills === 'object' ? r.skills : {}) as Record<string, unknown>;
  const skills = emptySkills();
  for (const s of SKILLS) {
    const e = rawSkills[s.key];
    if (e && typeof e === 'object') {
      const entry = e as Record<string, unknown>;
      skills[s.key] = { rating: normalizeRating(entry.rating), feedback: str(entry.feedback) };
    }
  }

  const caseType = (CASE_TYPES as readonly string[]).includes(str(r.caseType))
    ? (str(r.caseType) as CaseType)
    : 'Other';
  const area = SKILL_GROUPS.some((g) => g.key === r.improvementArea) ? (r.improvementArea as SkillGroupKey) : null;

  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    date,
    title: str(r.title),
    source: str(r.source),
    caseType,
    industry: str(r.industry).trim(),
    partner: str(r.partner),
    overall: normalizeRating(r.overall),
    overallFeedback: str(r.overallFeedback),
    skills,
    wentWell: str(r.wentWell),
    struggled: str(r.struggled),
    concepts: str(r.concepts),
    nextFocus: str(r.nextFocus),
    improvementArea: area,
    otherNotes: str(r.otherNotes),
    createdAt,
    updatedAt,
  };
}

export function normalizeOpportunity(raw: unknown): OpportunityItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = str(r.text).trim();
  if (!text) return null;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    kind: r.kind === 'skill' ? 'skill' : 'exposure',
    text,
    createdAt: isoOrNull(r.createdAt) ?? new Date().toISOString(),
  };
}
