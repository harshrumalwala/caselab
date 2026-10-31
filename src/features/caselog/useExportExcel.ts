import { useCallback, useState } from 'react';
import { backupFilename, downloadBlob } from '../../data/download';
import { describeError } from '../../data/errors';
import { buildWorkbook } from '../../data/mcgExport';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';

/** Download the case log as an Excel workbook in the MCG layout (the same one Import from Excel reads). */
export function useExportExcel() {
  const { cases, data } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const file = await buildWorkbook(cases, data.opportunities);
      downloadBlob(backupFilename('caselab-case-log', 'xlsx'), await file.toBlob());
      toast({ title: 'Excel file downloaded', body: `${cases.length} ${cases.length === 1 ? 'case' : 'cases'} in the MCG layout.` });
    } catch (e) {
      toast({ kind: 'error', title: "Couldn't make the Excel file", body: describeError(e) });
    } finally {
      setBusy(false);
    }
  }, [cases, data.opportunities, toast]);

  return { exportExcel: run, busy };
}
