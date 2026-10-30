import { useMemo, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { ImportError } from '../../data/backup';
import { describeError } from '../../data/errors';
import { readMcgWorkbook, type McgImportResult } from '../../data/mcgImport';
import { INDUSTRIES } from '../../domain/constants';
import { caseKey } from '../../domain/caseKey';
import { formatShortDate } from '../../domain/dates';
import type { ShareMode } from '../../domain/constants';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Stage =
  | { kind: 'pick'; error?: string }
  | { kind: 'reading' }
  | { kind: 'review'; fileName: string; result: McgImportResult };

/** What to do about a workbook the person just picked. */
function useReview(result: McgImportResult | null, existing: { date: string; title: string }[]) {
  return useMemo(() => {
    if (!result) return { duplicates: new Set<number>() };
    const seen = new Set(existing.map(caseKey));
    const duplicates = new Set<number>();
    result.rows.forEach((row, i) => {
      const key = caseKey(row.record);
      if (seen.has(key)) duplicates.add(i);
      else seen.add(key);
    });
    return { duplicates };
  }, [result, existing]);
}

function Review({ fileName, result, onBack, onDone }: { fileName: string; result: McgImportResult; onBack: () => void; onDone: () => void }) {
  const { cases, data, importCases } = useData();
  const toast = useToast();
  const { duplicates } = useReview(result, cases);
  // List entries you already have (same text, same list) aren't offered again.
  const newOpportunities = useMemo(() => {
    const have = new Set(data.opportunities.map((o) => `${o.kind}|${o.text.trim().toLowerCase()}`));
    return result.opportunities.filter((o) => !have.has(`${o.kind}|${o.text.toLowerCase()}`));
  }, [data.opportunities, result.opportunities]);

  const [included, setIncluded] = useState<Set<number>>(() => new Set(result.rows.map((_, i) => i).filter((i) => !duplicates.has(i))));
  const [industries, setIndustries] = useState<Record<number, string>>(() => Object.fromEntries(result.rows.map((r, i) => [i, r.suggestedIndustry])));
  const [withLists, setWithLists] = useState(newOpportunities.length > 0);
  const [shareMode, setShareMode] = useState<Extract<ShareMode, 'private' | 'profile'>>('private');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = result.rows.filter((_, i) => included.has(i));
  const guessed = result.rows.filter((r, i) => !r.record.industry && r.suggestedIndustry && industries[i] === r.suggestedIndustry).length;
  const flagged = result.rows.filter((r) => r.notes.length > 0).length;
  const listItems = withLists ? newOpportunities.length : 0;
  const nothingToDo = chosen.length === 0 && listItems === 0;

  const toggle = (i: number) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const incoming = result.rows
        .map((row, i) => ({ row, i }))
        .filter(({ i }) => included.has(i))
        .map(({ row, i }) => ({ ...row.record, industry: industries[i] ?? '', shareMode }));
      const { added, skipped, opportunitiesAdded } = await importCases(incoming, withLists ? newOpportunities : []);
      toast({
        title: `Imported ${plural(added, 'case', 'cases')}`,
        body: [
          skipped > 0 && `${plural(skipped, 'duplicate was', 'duplicates were')} skipped.`,
          opportunitiesAdded > 0 && `${plural(opportunitiesAdded, 'list entry', 'list entries')} added to Improvement Areas.`,
          added > 0 && shareMode === 'private' && 'They are private; change any case to share it.',
        ]
          .filter(Boolean)
          .join(' '),
      });
      onDone();
    } catch (e) {
      setError(describeError(e));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
        <p className="font-semibold text-ink">{fileName}</p>
        <p className="mt-0.5">
          {plural(result.rows.length, 'case', 'cases')} found
          {duplicates.size > 0 && `, ${duplicates.size} already in your log`}
          {newOpportunities.length > 0 && `, plus ${plural(newOpportunities.length, 'list entry', 'list entries')} from Opportunity Areas`}.
          {result.blankRows > 0 && ` ${plural(result.blankRows, 'empty row was', 'empty rows were')} ignored.`}
        </p>
        <p className="mt-1 text-xs text-muted">Nothing is saved until you press Import. Your file is read in this browser and isn't uploaded anywhere else.</p>
      </div>

      {newOpportunities.length > 0 && (
        <label className="flex items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={withLists} onChange={(e) => setWithLists(e.target.checked)} />
          <span>
            <span className="font-medium text-ink">Bring in my Opportunity Areas lists</span>
            <span className="block text-xs text-muted">
              {plural(newOpportunities.filter((o) => o.kind === 'exposure').length, 'case/concept to explore', 'cases/concepts to explore')} and{' '}
              {plural(newOpportunities.filter((o) => o.kind === 'skill').length, 'skill to improve', 'skills to improve')}, added to Improvement Areas.
            </span>
          </span>
        </label>
      )}

      <fieldset className="space-y-2">
        <legend className="label">Who can see the imported cases</legend>
        {(
          [
            ['private', 'Keep them private', 'Recommended. Nobody else sees them until you choose to share a case.'],
            ['profile', 'Follow my profile settings', 'They are shared exactly as your Profile & privacy switches say, like any case you log.'],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className="flex items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm">
            <input type="radio" name="import-share" className="mt-0.5 size-4 accent-[var(--accent)]" checked={shareMode === value} onChange={() => setShareMode(value)} />
            <span>
              <span className="font-medium text-ink">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {result.rows.length > 0 && (
        <section aria-labelledby="import-cases-title">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="import-cases-title" className="text-sm font-semibold text-ink">
              Cases to import ({chosen.length} of {result.rows.length})
            </h3>
            <p className="text-xs text-muted">
              {guessed > 0
                ? `The template has no industry column, so industries are suggested from the case titles for ${plural(guessed, 'case', 'cases')}. Check them.`
                : 'Pick an industry for any case so it counts toward your coverage map.'}
            </p>
          </div>
          {flagged > 0 && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-warn">
              <AlertTriangle className="size-3.5" aria-hidden /> {plural(flagged, 'row has', 'rows have')} something worth a look, shown under the case.
            </p>
          )}
          <ul className="max-h-[38vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {result.rows.map((row, i) => {
              const dup = duplicates.has(i);
              const current = industries[i] ?? '';
              const options = current && !INDUSTRIES.some((x) => x === current) ? [current] : [];
              return (
                <li key={row.sheetRow} className={`grid gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[auto_1fr_15.5rem] ${dup ? 'bg-surface-2/60' : ''}`}>
                  <input
                    type="checkbox"
                    aria-label={`Import ${row.record.title}`}
                    className="mt-1 size-4 accent-[var(--accent)]"
                    checked={included.has(i)}
                    disabled={dup}
                    onChange={() => toggle(i)}
                  />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${dup ? 'text-muted' : 'text-ink'}`}>{row.record.title}</p>
                    <p className="text-xs text-muted">
                      {formatShortDate(row.record.date)} · {row.record.caseType}
                      {row.record.source ? ` · ${row.record.source}` : ''}
                      {dup && ' · Already in your log'}
                    </p>
                    {row.notes.map((n) => (
                      <p key={n} className="mt-0.5 text-xs text-warn">
                        {n}
                      </p>
                    ))}
                  </div>
                  <select
                    aria-label={`Industry for ${row.record.title}`}
                    className="field !py-1.5 text-xs sm:self-start"
                    value={current}
                    disabled={dup}
                    onChange={(e) => setIndustries((prev) => ({ ...prev, [i]: e.target.value }))}
                  >
                    <option value="">Industry not set</option>
                    {[...options, ...INDUSTRIES].map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-bad">
          Couldn't import. {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onBack} disabled={saving}>
          Choose another file
        </Button>
        <Button variant="primary" onClick={() => void submit()} disabled={saving || nothingToDo}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {saving ? 'Importing…' : chosen.length > 0 ? `Import ${plural(chosen.length, 'case', 'cases')}` : 'Import lists'}
        </Button>
      </div>
    </div>
  );
}

/** Bring a case log in from an Excel file shaped like the MCG template, after a look at what will be added. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { mode } = useData();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [dragging, setDragging] = useState(false);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setStage({ kind: 'reading' });
    try {
      const result = await readMcgWorkbook(file);
      if (result.rows.length === 0 && result.opportunities.length === 0) {
        setStage({ kind: 'pick', error: 'That workbook has no filled-in rows on its Log sheet, so there is nothing to import.' });
        return;
      }
      setStage({ kind: 'review', fileName: file.name, result });
    } catch (e) {
      setStage({ kind: 'pick', error: e instanceof ImportError ? e.message : describeError(e) });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void read(e.dataTransfer.files[0]);
  };

  return (
    <Dialog open onClose={onClose} title="Import from Excel" description="Bring your MCG case log into CaseLab" width="lg">
      {mode === 'demo' ? (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          You're in demo mode, so importing is switched off to keep sample data away from your real log. Exit demo mode to import.
        </p>
      ) : stage.kind === 'review' ? (
        <Review fileName={stage.fileName} result={stage.result} onBack={() => setStage({ kind: 'pick' })} onDone={onClose} />
      ) : (
        <div className="space-y-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? 'border-accent bg-accent-soft' : 'border-line-strong'}`}
          >
            <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
              {stage.kind === 'reading' ? <Loader2 className="size-6 animate-spin" /> : <FileSpreadsheet className="size-6" />}
            </span>
            <p className="font-semibold text-ink">{stage.kind === 'reading' ? 'Reading your workbook…' : 'Drop your Excel file here'}</p>
            <p className="mt-1 text-sm text-muted">or</p>
            <Button className="mt-2" variant="primary" onClick={() => input.current?.click()} disabled={stage.kind === 'reading'}>
              <Upload className="size-4" /> Choose a file (.xlsx)
            </Button>
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              aria-label="Choose your Excel workbook"
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          {stage.kind === 'pick' && stage.error && (
            <p role="alert" className="text-sm font-medium text-bad">
              {stage.error}
            </p>
          )}

          <div className="space-y-2 text-sm text-ink-2">
            <p className="font-semibold text-ink">What comes across</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Every row of the <strong className="font-medium text-ink-2">Log</strong> tab: date, title, source, case type, interviewer, the overall rating, all eight skill ratings and their feedback, and the Other column.</li>
              <li>Your <strong className="font-medium text-ink-2">Opportunity Areas</strong> lists, if you filled them in.</li>
              <li>Any extra columns you added, kept in each case's private notes, and an Industry column if you have one.</li>
            </ul>
            <p className="text-xs text-muted">
              Columns are found by their headings, so reordered ones work. Odd case types and ratings are cleaned up and listed for you to review before anything is saved. Cases already in your log (same date and title) are skipped, so importing twice is safe.
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
