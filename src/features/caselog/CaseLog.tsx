import { useMemo, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, Filter, Flame, Lock, LockOpen, Mic, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { CASE_TYPES, INDUSTRIES } from '../../domain/constants';
import {
  applyFilters,
  DEFAULT_FILTERS,
  hasActiveFilters,
  keyImprovement,
  type CaseFilters,
} from '../../domain/caseFilters';
import { describeError } from '../../data/errors';
import { formatDate } from '../../domain/dates';
import { canonicalIndustry } from '../../domain/stats';
import type { CaseRecord } from '../../domain/types';
import { Badge, RatingBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';
import { useUI } from '../../state/ui';
import { useNow } from '../../state/useToday';
import { chipClass } from '../../components/ui/chips';
import { pillTabClass } from '../../components/ui/pillTab';
import { useMyProfile } from '../../state/CommunityProvider';
import { BurnedPanel } from './BurnedPanel';
import { InterviewedPanel } from './InterviewedPanel';
import { useInterviewed } from '../../state/InterviewedProvider';
import { useExportExcel } from './useExportExcel';
import { useTogglePrivate } from './useTogglePrivate';

function ImprovementCell({ c }: { c: CaseRecord }) {
  const k = keyImprovement(c);
  if (!k) return <span className="text-muted">–</span>;
  return k.source === 'tag' ? (
    <Badge tone="accent">{k.label}</Badge>
  ) : (
    <span className="text-xs text-muted" title={`Your lowest-rated skill in this case: ${k.label}`}>
      {k.label}
    </span>
  );
}

/** A line under the title that notices how far along you are. */
function logQuip(count: number): string {
  if (count < 5) return 'A good start. Everyone starts somewhere (usually airline profitability).';
  if (count < 15) return 'Getting somewhere. A pattern is forming, and so are opinions.';
  if (count < 30) return 'That is a serious stack of cases. Your case partners are impressed.';
  return 'Veteran status. Please remember to eat, sleep and occasionally not case.';
}

/** My cases, and the solo cases I've burned (which are listed here but never counted). */
type LogTab = 'cases' | 'burned' | 'interviewed';

function LogTabs({ tab, onChange, burned, interviewed }: { tab: LogTab; onChange: (t: LogTab) => void; burned: number; interviewed: number }) {
  return (
    <div role="tablist" aria-label="Case log views" className="flex flex-wrap gap-2">
      {(
        [
          ['cases', 'My cases'],
          ['interviewed', `Interviewed (${interviewed})`],
          ['burned', `Burned (${burned})`],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onChange(id)}
          className={pillTabClass(tab === id)}
        >
          {id === 'burned' && <Flame className="size-4" aria-hidden />}
          {id === 'interviewed' && <Mic className="size-4" aria-hidden />}
          {label}
        </button>
      ))}
    </div>
  );
}

function PrivateBadge({ c }: { c: CaseRecord }) {
  if (c.shareMode !== 'private') return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2" title="Hidden from every other member">
      <Lock className="size-3" aria-hidden /> Private
    </span>
  );
}

function RowActions({ c, onDelete }: { c: CaseRecord; onDelete: (c: CaseRecord) => void }) {
  const { editCase } = useUI();
  const togglePrivate = useTogglePrivate();
  const isPrivate = c.shareMode === 'private';
  return (
    <div className="flex justify-end gap-0.5 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
      <IconButton
        label={isPrivate ? `Stop keeping ${c.title} private` : `Make ${c.title} private`}
        aria-pressed={isPrivate}
        onClick={(e) => {
          e.stopPropagation();
          void togglePrivate(c);
        }}
      >
        {isPrivate ? <Lock className="size-4 text-accent-text" /> : <LockOpen className="size-4" />}
      </IconButton>
      <IconButton
        label={`Edit ${c.title}`}
        onClick={(e) => {
          e.stopPropagation();
          editCase(c.id);
        }}
      >
        <Pencil className="size-4" />
      </IconButton>
      <IconButton
        label={`Delete ${c.title}`}
        className="hover:!text-bad-text"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(c);
        }}
      >
        <Trash2 className="size-4" />
      </IconButton>
    </div>
  );
}

const SELECT = 'field !py-2 text-sm';

export function CaseLog() {
  const { cases, data, deleteCase } = useData();
  const { viewCase, openLogCase, openImport } = useUI();
  const burnedCount = useMyProfile().burnedCases.length;
  const interviewedCount = useInterviewed().items.length;
  const [tab, setTab] = useState<LogTab>('cases');
  const toast = useToast();
  const now = useNow();
  const { exportExcel, busy: exporting } = useExportExcel();

  const [filters, setFilters] = useState<CaseFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CaseRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const set = <K extends keyof CaseFilters>(key: K, value: CaseFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const visible = useMemo(() => applyFilters(cases, filters, now), [cases, filters, now]);

  const industryOptions = useMemo(() => {
    const used = new Set(cases.map((c) => canonicalIndustry(c.industry, data.customIndustries)).filter(Boolean));
    return [...new Set([...INDUSTRIES, ...data.customIndustries, ...used])];
  }, [cases, data.customIndustries]);

  const active = hasActiveFilters(filters);
  const activeCount = [
    filters.industry !== 'all',
    filters.caseType !== 'all',
    filters.datePreset !== 'all',
    filters.score !== 'all',
  ].filter(Boolean).length;

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteCase(pendingDelete.id);
      toast({ title: 'Case deleted', body: pendingDelete.title });
    } catch (e) {
      toast({ kind: 'error', title: 'Not deleted', body: describeError(e) });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  if (cases.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">My Case Log</h1>
        <LogTabs tab={tab} onChange={setTab} burned={burnedCount} interviewed={interviewedCount} />
        {tab === 'burned' && <BurnedPanel />}
        {tab === 'interviewed' && <InterviewedPanel />}
        {tab === 'cases' && (
        <div className="sticker bg-sun-soft">
          <EmptyState
            icon={<FileSpreadsheet className="size-6" />}
            title="No cases logged yet"
            actions={
              <>
                <Button variant="primary" onClick={() => openLogCase()}>
                  <Plus className="size-4" /> Log your first case
                </Button>
                <Button variant="ghost" onClick={openImport}>
                  Import from Excel
                </Button>
              </>
            }
          >
            Every case you log shows up here, searchable and filterable. It is much nicer than a folder of PDFs. Already tracking in the MCG spreadsheet? Import it and
            your history comes with you.
          </EmptyState>
        </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">My Case Log</h1>
        <p className="text-sm text-ink-2">
          {active ? `${visible.length} of ${cases.length} cases` : `${cases.length} ${cases.length === 1 ? 'case' : 'cases'}`}
          {burnedCount > 0 && <span className="ml-2 font-semibold">· {burnedCount} burned, not counted</span>}
          {interviewedCount > 0 && <span className="ml-2 font-semibold">· {interviewedCount} interviewed, not counted</span>}
        </p>
        <p className="text-sm font-semibold text-accent-text">{logQuip(cases.length)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={openImport} title="Bring in a case log from an Excel file">
          <Upload className="size-4" /> Import from Excel
        </Button>
        <Button onClick={() => void exportExcel()} disabled={exporting} title="Download your log as an Excel file in the MCG layout">
          <Download className="size-4" /> Export to Excel
        </Button>
      </div>
      </div>

      <LogTabs tab={tab} onChange={setTab} burned={burnedCount} interviewed={interviewedCount} />

      {tab === 'burned' && <BurnedPanel />}
      {tab === 'interviewed' && <InterviewedPanel />}

      {tab === 'cases' && (
        <>
      {/* ---- Toolbar ------------------------------------------------------------------ */}
      <div className="sticker space-y-3 p-3 sm:p-4">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              className="field !pl-10"
              type="search"
              placeholder="Search by case title, source or partner"
              aria-label="Search cases"
              value={filters.query}
              onChange={(e) => set('query', e.target.value)}
            />
          </div>
          <Button className="lg:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <Filter className="size-4" /> Filters
            {activeCount > 0 && (
              <span className="num rounded-full bg-accent px-1.5 text-[11px] text-accent-ink">{activeCount}</span>
            )}
            <ChevronDown className={`size-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        <div className={`${showFilters ? 'grid' : 'hidden'} gap-2 sm:grid-cols-2 lg:grid lg:grid-cols-5`}>
          <select
            className={SELECT}
            aria-label="Filter by industry"
            value={filters.industry}
            onChange={(e) => set('industry', e.target.value)}
          >
            <option value="all">All industries</option>
            {industryOptions.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            aria-label="Filter by case type"
            value={filters.caseType}
            onChange={(e) => set('caseType', e.target.value)}
          >
            <option value="all">All case types</option>
            {CASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            aria-label="Filter by date"
            value={filters.datePreset}
            onChange={(e) => set('datePreset', e.target.value as CaseFilters['datePreset'])}
          >
            <option value="all">Any date</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="custom">Custom range…</option>
          </select>
          <select
            className={SELECT}
            aria-label="Filter by performance"
            value={filters.score}
            onChange={(e) => set('score', e.target.value as CaseFilters['score'])}
          >
            <option value="all">Any performance</option>
            <option value="strong">Strong (4–5)</option>
            <option value="developing">Developing (3)</option>
            <option value="needs">Needs work (1–2)</option>
            <option value="unrated">Not rated</option>
          </select>
          <select
            className={SELECT}
            aria-label="Sort cases"
            value={filters.sort}
            onChange={(e) => set('sort', e.target.value as CaseFilters['sort'])}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
          </select>

          {filters.datePreset === 'custom' && (
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-5 lg:max-w-md">
              <label className="text-xs font-medium text-ink-2">
                From
                <input
                  type="date"
                  className={`${SELECT} mt-1`}
                  value={filters.from}
                  onChange={(e) => set('from', e.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-ink-2">
                To
                <input
                  type="date"
                  className={`${SELECT} mt-1`}
                  value={filters.to}
                  onChange={(e) => set('to', e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        {active && (
          <button
            type="button"
            onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline"
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* ---- Results ------------------------------------------------------------------ */}
      {visible.length === 0 ? (
        <div className="card">
          <EmptyState title="No cases match" compact>
            Try a different search or clear the filters.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Table on larger screens */}
          <div className="sticker hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-ink/80 bg-sun-soft text-xs font-bold text-ink-2">
                <tr>
                  <th className="px-5 py-3">Case</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Industry</th>
                  <th className="hidden px-3 py-3 xl:table-cell">Partner</th>
                  <th className="px-3 py-3 text-center">Overall</th>
                  <th className="px-3 py-3">Work on</th>
                  <th className="w-24 px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((c) => (
                  <tr
                    key={c.id}
                    className="group cursor-pointer transition hover:bg-sun-soft/60"
                    onClick={() => viewCase(c.id)}
                  >
                    <td className="max-w-80 px-5 py-3.5">
                      <button
                        type="button"
                        className="line-clamp-2 max-w-full break-words text-left font-display text-base font-bold leading-snug text-ink hover:text-accent-text"
                        onClick={(e) => {
                          e.stopPropagation();
                          viewCase(c.id);
                        }}
                      >
                        {c.title || 'Untitled case'}
                      </button>
                      <p className="flex items-center gap-2 truncate text-xs text-muted">
                        {c.source && <span className="truncate">{c.source}</span>}
                        <PrivateBadge c={c} />
                      </p>
                    </td>
                    <td className="num whitespace-nowrap px-3 py-3.5 text-ink-2">{formatDate(c.date)}</td>
                    <td className="px-3 py-3.5">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${chipClass(c.caseType)}`}>{c.caseType}</span>
                    </td>
                    <td className="px-3 py-3.5 text-ink-2">{c.industry || <span className="text-muted">–</span>}</td>
                    <td className="hidden px-3 py-3.5 text-ink-2 xl:table-cell">
                      {c.partner || <span className="text-muted">–</span>}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      <RatingBadge value={c.overall} />
                    </td>
                    <td className="px-3 py-3.5">
                      <ImprovementCell c={c} />
                    </td>
                    <td className="px-3 py-3.5">
                      <RowActions c={c} onDelete={setPendingDelete} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards on phones */}
          <ul className="space-y-3 md:hidden">
            {visible.map((c) => (
              <li key={c.id} className="sticker group p-4">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="min-w-0 text-left" onClick={() => viewCase(c.id)}>
                    <span className="line-clamp-2 break-words font-display text-lg font-bold leading-snug text-ink">{c.title || 'Untitled case'}</span>
                    <span className="num mt-0.5 block text-xs text-muted">{formatDate(c.date)}</span>
                  </button>
                  <RatingBadge value={c.overall} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${chipClass(c.caseType)}`}>{c.caseType}</span>
                  {c.industry && <Badge>{c.industry}</Badge>}
                  <PrivateBadge c={c} />
                </div>
                {(c.source || c.partner) && (
                  <p className="mt-2.5 truncate text-xs text-muted">
                    {[c.source, c.partner && `with ${c.partner}`].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <ImprovementCell c={c} />
                  <RowActions c={c} onDelete={setPendingDelete} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this case?"
        confirmLabel="Delete case"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        <p>
          <span className="font-semibold text-ink">{pendingDelete?.title || 'This case'}</span> and all of its ratings
          and notes will be permanently removed. This can't be undone, so export a backup first if you're unsure.
        </p>
      </ConfirmDialog>
    </div>
  );
}
