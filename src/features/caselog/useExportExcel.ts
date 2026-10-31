import { useCallback, useState } from 'react';
import { backupFilename, downloadBlob } from '../../data/download';
import { describeError } from '../../data/errors';
import { loadMcgTemplate } from '../../data/mcgTemplate';
import { useCommunity } from '../../state/CommunityProvider';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';

/**
 * Download the case log as the real MCG workbook, filled in: Log (every case with all its feedback), Dashboard, Opportunity Areas and
 * Data Validation, plus extra columns for the details the template has no place for. Import from Excel reads it back.
 */
export function useExportExcel() {
  const { cases, data, mode } = useData();
  const { profile } = useCommunity();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      // Loaded on demand so the spreadsheet code stays out of the main bundle.
      const { buildMcgWorkbook, XLSX_MIME } = await import('../../data/mcgExport');
      const template = await loadMcgTemplate();
      // Demo data isn't anyone's, so it carries no name.
      const bytes = buildMcgWorkbook(template, cases, data.opportunities, { name: mode === 'demo' ? '' : (profile?.displayName ?? '') });
      downloadBlob(backupFilename('caselab-case-log', 'xlsx'), new Blob([bytes as BlobPart], { type: XLSX_MIME }));
      toast({
        title: 'Excel file downloaded',
        body: `${cases.length} ${cases.length === 1 ? 'case' : 'cases'} in the MCG workbook, with all your feedback and notes.`,
      });
    } catch (e) {
      toast({ kind: 'error', title: "Couldn't make the Excel file", body: describeError(e) });
    } finally {
      setBusy(false);
    }
  }, [cases, data.opportunities, mode, profile, toast]);

  return { exportExcel: run, busy };
}
