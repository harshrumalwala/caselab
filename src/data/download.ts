/** Trigger a browser download of a text file. */
export function downloadText(filename: string, content: string, mime: string): void {
  downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));
}

/** Trigger a browser download of any file. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupFilename(prefix: string, ext: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${ext}`;
}
