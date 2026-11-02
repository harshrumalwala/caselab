import { useRef, useState, type ReactNode } from 'react';
import {
  Cloud,
  Download,
  FileJson,
  FileSpreadsheet,
  FlaskConical,
  Keyboard,
  LogOut,
  MonitorSmartphone,
  Table2,
  Trash2,
  Trophy,
  Upload,
  UserX,
} from 'lucide-react';
import { backupToJSON, ImportError, parseBackup, type ParsedBackup } from '../../data/backup';
import { casesToCSV } from '../../data/csv';
import { Switch } from '../../components/ui/Switch';
import { useGame } from '../../state/game';
import { useInstall } from '../../state/install';
import { useExportExcel } from '../caselog/useExportExcel';
import { backupFilename, downloadText } from '../../data/download';
import { describeError } from '../../data/errors';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth, useSession } from '../../state/AuthProvider';
import { useData } from '../../state/DataProvider';
import { useUI } from '../../state/ui';
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
  const { data, cases, mode, replaceAll, mergeIn, clearAll, enterDemo, exitDemo } = useData();
  const { signOut, deleteAccount } = useAuth();
  const session = useSession();
  const toast = useToast();
  const { openImport, openShortcuts } = useUI();
  const install = useInstall();
  const game = useGame();
  const jsonInput = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<ParsedBackup | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const demo = mode === 'demo';
  const { exportExcel, busy: exporting } = useExportExcel();

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

  const removeAccount = async () => {
    setBusy(true);
    try {
      await deleteAccount(); // on success this screen goes away with the sign-in state
      toast({ title: 'Your account was deleted', body: 'Everything in it has been removed. Thanks for using CaseLab.' });
    } catch (e) {
      toast({ kind: 'error', title: "Couldn't delete your account", body: describeError(e) });
      setBusy(false);
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
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-warn-text" />
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

          <Section title="Levels and rewards" icon={<Trophy className="size-4" />}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Show levels and XP</p>
                <p className="text-xs text-muted">
                  Earn XP for logging well and getting better, and level up from Intern to Partner. Turn it off to keep CaseLab plain: no levels, no XP, no celebrations. This is a
                  setting of this browser. Showing your level to other members is a separate switch in Profile and privacy.
                </p>
              </div>
              <Switch label="Show levels and XP" checked={game.enabled} onChange={game.setEnabled} />
            </div>
          </Section>

          <Section title="Shortcuts and install" icon={<Keyboard className="size-4" />}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                onClick={() => {
                  onClose();
                  openShortcuts();
                }}
              >
                <Keyboard className="size-4" /> Keyboard shortcuts
              </Button>
              {install.available && (
                <Button variant="primary" onClick={() => void install.install()}>
                  <MonitorSmartphone className="size-4" /> Install CaseLab
                </Button>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {install.installedApp
                ? 'You are using the installed app.'
                : install.available
                  ? 'Install CaseLab to open it from your home screen or desktop like any other app, with no browser bars.'
                  : 'To open CaseLab like an app: on an iPhone tap Share, then Add to Home Screen. On Android or Chrome, use the browser menu and choose Install app.'}
            </p>
          </Section>

          <Section title="Download and import" icon={<FileJson className="size-4" />}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={exportJSON} disabled={demo}>
                <Download className="size-4" /> Download backup (JSON)
              </Button>
              <Button onClick={() => jsonInput.current?.click()} disabled={demo || busy}>
                <Upload className="size-4" /> Import backup (JSON)
              </Button>
              <Button onClick={() => void exportExcel()} disabled={demo || cases.length === 0 || exporting}>
                <FileSpreadsheet className="size-4" /> Export to Excel
              </Button>
              <Button onClick={exportCSV} disabled={demo || cases.length === 0}>
                <Table2 className="size-4" /> Export cases (CSV)
              </Button>
              <Button
                onClick={() => {
                  onClose();
                  openImport();
                }}
                disabled={demo || busy}
              >
                <FileSpreadsheet className="size-4" /> Import from Excel
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Your data already lives in your account; a JSON download is an extra copy that contains everything (every
              case, rating, feedback note, learning and list item) and can be restored here. Export to Excel writes your log in the
              MCG template layout (ratings, feedback and your two lists), ready to open or import again. CSV is a one-row-per-case
              spreadsheet. Import from Excel brings in a case log shaped like the MCG template, after a preview.
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

          <Section title="Danger zone" icon={<Trash2 className="size-4 text-bad-text" />}>
            <p className="text-sm text-ink-2">Permanently delete every case and list in your account.</p>
            <div className="mt-3">
              <Button variant="danger" onClick={() => setConfirmClear(true)} disabled={demo}>
                <Trash2 className="size-4" /> Clear all data…
              </Button>
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-sm text-ink-2">
                Permanently delete your account and everything in it: your cases, profile, messages and requests, and your login.
              </p>
              <div className="mt-3">
                <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={demo}>
                  <UserX className="size-4" /> Delete my account…
                </Button>
              </div>
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
        open={confirmDelete}
        title="Delete your account?"
        confirmLabel="Delete my account"
        requireText="DELETE"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void removeAccount()}
      >
        <p>
          This permanently deletes your CaseLab account and removes <strong className="text-ink">everything</strong> in it, on every device:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your {plural(cases.length, 'case', 'cases')}, lists, weekly goal and Warm-up record</li>
          <li>your profile, and everything you shared or made public</li>
          <li>your requests and blocks, and every conversation you are in (the other person loses it too)</li>
          <li>your login, so you can't sign in again with this email</li>
        </ul>
        <p>
          It can't be undone. If you might want your cases later, download a backup or an Excel copy from this screen first. Anyone who
          reported a conversation with you keeps that report, but it no longer points to you.
        </p>
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
