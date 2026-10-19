import type { CaseType } from './constants';
import { canonicalIndustry, compareCases } from './stats';
import type { CaseRecord } from './types';

export interface ConceptSource {
  caseId: string;
  caseTitle: string;
  date: string;
  caseType: CaseType;
}

export interface Concept {
  key: string;
  text: string;
  /** '' = industry not specified. */
  industry: string;
  sources: ConceptSource[];
}

/**
 * Split a "concepts learned" note into individual items: one per line or per semicolon.
 * (Commas are left alone because they usually sit inside a sentence.)
 */
export function splitConcepts(text: string): string[] {
  return text
    .split(/\r?\n|;/)
    .map((part) => part.replace(/^[\s\-*•·•]+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Aggregate every concept you wrote down, merged across cases. Nothing is pre-populated. */
export function conceptsFromCases(cases: CaseRecord[], customs: string[] = []): Concept[] {
  const map = new Map<string, Concept>();
  for (const c of [...cases].sort(compareCases)) {
    const industry = canonicalIndustry(c.industry, customs);
    for (const text of splitConcepts(c.concepts)) {
      const key = `${industry.toLowerCase()}::${norm(text)}`;
      const source: ConceptSource = { caseId: c.id, caseTitle: c.title, date: c.date, caseType: c.caseType };
      const existing = map.get(key);
      if (existing) {
        if (!existing.sources.some((s) => s.caseId === c.id)) existing.sources.push(source);
      } else {
        map.set(key, { key, text, industry, sources: [source] });
      }
    }
  }
  return [...map.values()];
}

export interface KnowledgeFilter {
  industry: string; // 'all' or an industry name
  caseType: string; // 'all' or a case type
  query: string;
}

export const ALL = 'all';

export function filterConcepts(concepts: Concept[], f: KnowledgeFilter): Concept[] {
  const q = norm(f.query);
  return concepts.filter((c) => {
    if (f.industry !== ALL && c.industry !== f.industry) return false;
    if (f.caseType !== ALL && !c.sources.some((s) => s.caseType === f.caseType)) return false;
    if (q && !norm(c.text).includes(q) && !c.sources.some((s) => norm(s.caseTitle).includes(q))) return false;
    return true;
  });
}

export interface ConceptGroup {
  industry: string;
  label: string;
  concepts: Concept[];
}

export function groupConceptsByIndustry(concepts: Concept[]): ConceptGroup[] {
  const groups = new Map<string, Concept[]>();
  for (const c of concepts) groups.set(c.industry, [...(groups.get(c.industry) ?? []), c]);
  return [...groups.entries()]
    .map(([industry, list]) => ({
      industry,
      label: industry || 'Industry not specified',
      concepts: list,
    }))
    .sort((a, b) => {
      if (!a.industry) return 1;
      if (!b.industry) return -1;
      return b.concepts.length - a.concepts.length || a.label.localeCompare(b.label);
    });
}
