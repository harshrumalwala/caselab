import { useRef, useState, type ReactNode } from 'react';
import {
  Cloud,
  Download,
  FileJson,
  FileSpreadsheet,
  FlaskConical,
  LogOut,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import { backupToJSON, ImportError, parseBackup, type ParsedBackup } from '../../data/backup';
import { casesToCSV } from '../../data/csv';
import { backupFilename, downloadText } from '../../data/download';
import { describeError } from '../../data/errors';
import { readMcgWorkbook } from '../../data/mcgImport';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth, useSession } from '../../state/AuthProvider';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-accent-text">{icon}</span> {title}
      </h3>
      {children}
    </section>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { data, cases, mode, replaceAll, mergeIn, importCases, clearAll, enterDemo, exitDemo } = useData();
  const { signOut } = useAuth();
  const session = useSession();
  const toast = useToast();
  const jsonInput = useRef<HTMLInputElement>(null);
  const xlsxInput = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<ParsedBackup | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const demo = mode === 'demo';

  const exportJSON = () => {
    downloadText(backupFilename('caselab-backup', 'json'), backupToJSON(data), 'application/json');
    toast({ title: 'Backup downloaded', body: `${plural(cases.length, 'case', 'cases')} saved to a JSON file.` });
  };

  const exportCSV = () => {
    downloadText(backupFilename('caselab-cases', 'csv'), casesToCSV(cases), 'text/csv');
    toast({ title: 'CSV downloaded', body: 'Open it in Excel or Google Sheets.' });
  };

  const onPickJSON = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPendingBackup(parseBackup(await file.text()));
    } catch (e) {
      toast({
        kind: 'error',
        title: "Couldn't read that file",
        body: e instanceof ImportError ? e.message : 'It does not look like a CaseLab backup.',
      });
    }
  };

  const onPickXlsx = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await readMcgWorkbook(file);
      if (result.cases.length === 0) {
        toast({ kind: 'info', title: 'No cases found', body: 'The Log sheet has no filled-in rows.' });
        return;
      }
      const { added, skipped } = await importCases(result.cases);
      toast({
        title: `Imported ${plural(added, 'case', 'cases')}`,
        body:
          (skipped > 0 ? `${plural(skipped, 'duplicate was', 'duplicates were')} skipped. ` : '') +
          'The template has no industry column, so open a case to add one.',
      });
    } catch (e) {
      toast({
        kind: 'error',
        title: "Couldn't import that workbook",
        body: e instanceof ImportError ? e.message : describeError(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (how: 'merge' | 'replace') => {
    if (!pendingBackup) return;
    setBusy(true);
    try {
      if (how === 'merge') await mergeIn(pendingBackup.data);
      else await replaceAll(pendingBackup.data);
      toast({
        title: how === 'merge' ? 'Backup merged' : 'Backup restored',
        body: `${plural(pendingBackup.caseCount, 'case', 'cases')} from the file.`,
      });
    } catch (e) {
      toast({ kind: 'error', title: 'Restore failed', body: describeError(e) });
    } finally {
      setBusy(false);
      setPendingBackup(null);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await clearAll();
      toast({ title: 'All data cleared', body: 'CaseLab is back to a clean slate.' });
      setConfirmClear(false);
      onClose();
    } catch (e) {
      toast({ kind: 'error', title: 'Nothing was deleted', body: describeError(e) });
      setConfirmClear(false);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    try {
      await signOut();
    } catch (e) {
      toast({ kind: 'error', title: "Couldn't sign out", body: describeError(e) });
    }
  };

  return (
    <>
      <Dialog open onClose={onClose} title="Data & settings" description="Your account, backups and demo mode" width="lg">
        <div className="space-y-4">
          {demo && (
            <div className="flex items-start gap-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-ink">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-warn" />
              <p>
                You're in demo mode, so backups, imports and clearing are switched off to keep sample data away from your
                real cases. Exit demo mode to manage your own data.
              </p>
            </div>
          )}

          <Section title="Your account" icon={<Cloud className="size-4" />}>
            <p className="text-sm leading-relaxed text-ink-2">
              Cases are saved to your CaseLab account in Supabase, so they're the same on your laptop and phone. Signed in
              as <strong className="font-semibold text-ink">{session.email || 'your account'}</strong>.
            </p>
            <p className="num mt-2 text-xs text-muted">{plural(cases.length, 'case', 'cases')} stored</p>
            <div className="mt-3">
              <Button onClick={() => void leave()}>
                <LogOut className="size-4" /> Sign out
              </Button>
            </div>
          </Section>

          <Section title="Download and import" icon={<FileJson className="size-4" />}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={exportJSON} disabled={demo}>
                <Download className="size-4" /> Download backup (JSON)
              </Button>
              <Button onClick={() => jsonInput.current?.click()} disabled={demo || busy}>
                <Upload className="size-4" /> Import backup (JSON)
              </Button>
              <Button onClick={exportCSV} disabled={demo || cases.length === 0}>
                <Table2 className="size-4" /> Export cases (CSV)
              </Button>
              <Button onClick={() => xlsxInput.current?.click()} disabled={demo || busy}>
                <FileSpreadsheet className="size-4" /> {busy ? 'Working…' : 'Import MCG Excel log'}
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Your data already lives in your account; a JSON download is an extra copy that contains everything (every
              case, rating, feedback note, learning and list item) and can be restored here. CSV is a one-row-per-case
              spreadsheet. The Excel import reads the “Log” sheet of the MCG template.
            </p>
            <input
              ref={jsonInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Choose a JSON backup file"
              onChange={(e) => {
                void onPickJSON(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <input
              ref={xlsxInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              aria-label="Choose an MCG Excel case log"
              onChange={(e) => {
                void onPickXlsx(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </Section>

          <Section title="Demo mode" icon={<FlaskConical className="size-4" />}>
            <p className="text-sm leading-relaxed text-ink-2">
              Explore the dashboard with clearly labeled sample cases. Demo data lives only in this tab's memory, is never
              sent to your account, and is never mixed into your real cases.
            </p>
            <div className="mt-3">
              {demo ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    exitDemo();
                    onClose();
                  }}
                >
                  Exit demo mode
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    enterDemo();
                    onClose();
                  }}
                >
                  Try demo mode
                </Button>
              )}
            </div>
          </Section>

          <Section title="Danger zone" icon={<Trash2 className="size-4 text-bad" />}>
            <p className="text-sm text-ink-2">Permanently delete every case and list in your account.</p>
            <div className="mt-3">
              <Button variant="danger" onClick={() => setConfirmClear(true)} disabled={demo}>
                <Trash2 className="size-4" /> Clear all data…
              </Button>
            </div>
          </Section>
        </div>
      </Dialog>

      <ConfirmDialog
        open={pendingBackup !== null}
        title="Restore this backup?"
        confirmLabel="Replace everything"
        busy={busy}
        onCancel={() => setPendingBackup(null)}
        onConfirm={() => void restore('replace')}
      >
        <p>
          The file contains <strong className="text-ink">{plural(pendingBackup?.caseCount ?? 0, 'case', 'cases')}</strong>.
          You currently have <strong className="text-ink">{plural(cases.length, 'case', 'cases')}</strong>.
        </p>
        <p>
          <strong className="text-ink">Merge</strong> adds the file's cases to yours (newer edits win, nothing is
          deleted). <strong className="text-ink">Replace everything</strong> swaps your current data for the file.
        </p>
        <Button className="w-full" variant="primary" disabled={busy} onClick={() => void restore('merge')}>
          Merge with current data
        </Button>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClear}
        title="Delete all data?"
        confirmLabel="Delete everything"
        requireText="DELETE"
        busy={busy}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clear()}
      >
        <p>
          This permanently removes all {plural(cases.length, 'case', 'cases')}, your lists and your learning history from
          your account, on every device. It can't be undone unless you have a JSON backup.
        </p>
      </ConfirmDialog>
    </>
  );
}
