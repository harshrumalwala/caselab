import { Search, X } from 'lucide-react';
import { CASE_TYPES } from '../../domain/constants';
import { NO_FILTER, type CaseFilter } from '../../domain/pairing';

interface Props {
  value: CaseFilter;
  onChange: (next: CaseFilter) => void;
  industries: string[];
  sources: string[];
  /** Optional hint under the search box, e.g. "Search case name or casebook". */
  placeholder?: string;
}

const SELECT = 'field !py-2 text-sm';

/** Name / casebook / industry / case type filters, shared by every case list on the People screens. */
export function CaseFilterBar({ value, onChange, industries, sources, placeholder = 'Search case name or casebook' }: Props) {
  const set = <K extends keyof CaseFilter>(key: K, v: CaseFilter[K]) => onChange({ ...value, [key]: v });
  const active = value.query || value.industry !== 'all' || value.caseType !== 'all' || value.source !== 'all';

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          className="field !pl-10"
          type="search"
          placeholder={placeholder}
          aria-label="Search cases"
          value={value.query}
          onChange={(e) => set('query', e.target.value)}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={SELECT} aria-label="Filter by industry" value={value.industry} onChange={(e) => set('industry', e.target.value)}>
          <option value="all">All industries</option>
          {industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <select className={SELECT} aria-label="Filter by case type" value={value.caseType} onChange={(e) => set('caseType', e.target.value)}>
          <option value="all">All case types</option>
          {CASE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className={SELECT} aria-label="Filter by casebook" value={value.source} onChange={(e) => set('source', e.target.value)}>
          <option value="all">All casebooks</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {active && (
        <button type="button" onClick={() => onChange(NO_FILTER)} className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline">
          <X className="size-3.5" /> Clear filters
        </button>
      )}
    </div>
  );
}
