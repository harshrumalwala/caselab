export const ENGINE_FILES: string[];
export interface Unreached {
  total: number;
  functions: { name: string; line: number; text: string }[];
  blocks: { inFunction: string; line: number; endLine: number; text: string }[];
}
export type FileCoverage = { file: string; missing: true } | ({ file: string; missing?: undefined } & Unreached);
export function unreachedIn(
  source: string,
  entries: { functions: { functionName: string; ranges: { startOffset: number; endOffset: number; count: number }[] }[] }[],
): Unreached;
export function readCoverage(dir: string, files?: string[], root?: string): FileCoverage[];
export function formatCoverage(per: FileCoverage[]): string;
