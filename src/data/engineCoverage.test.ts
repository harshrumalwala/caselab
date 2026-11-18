// @vitest-environment node
//
// The engine coverage reader (scripts/engineCoverage.mjs): it reads V8's coverage JSON and names what never ran. These tests use a
// hand-written source and hand-written V8 output, so they need no write-ups and say nothing about any case.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCoverage, readCoverage, unreachedIn } from '../../scripts/engineCoverage.mjs';

const source = [
  'export function ran(x) {', //                    line 1
  '  if (x) return 1;', //                           line 2
  '  return 2;', //                                  line 3
  '}',
  'export function neverRan() {', //                 line 5
  '  return 3;',
  '}',
  'export const arrow = () => 4;', //               line 8
].join('\n');
const at = (needle: string) => source.indexOf(needle);
const range = (from: string, to: string, count: number) => ({ startOffset: at(from), endOffset: at(to) + to.length, count });

const fixture = (ranCount = 2) => ({
  functions: [
    { functionName: '', ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }] },
    { functionName: 'ran', ranges: [range('function ran', '  return 2;\n}', ranCount), range('return 1;', 'return 1;', 0)] },
    { functionName: 'neverRan', ranges: [range('function neverRan', '  return 3;\n}', 0)] },
    { functionName: '', ranges: [range('() => 4', '4', 0)] },
  ],
});

describe('unreachedIn', () => {
  const found = unreachedIn(source, [fixture()]);

  it('names every function that never ran, with its line, and does not count the file itself', () => {
    expect(found.total).toBe(3);
    expect(found.functions.map((f) => [f.name, f.line])).toEqual([
      ['neverRan', 5],
      ['(anonymous)', 8],
    ]);
  });

  it('shows the source line of an anonymous function, so it can be found', () => {
    expect(found.functions[1].text).toBe('export const arrow = () => 4;');
  });

  it('names a block that never ran inside a function that did, and not inside one that never ran', () => {
    expect(found.blocks).toEqual([{ inFunction: 'ran', line: 2, endLine: 2, text: 'if (x) return 1;' }]);
  });

  it('counts a function or block as reached if any process ran it', () => {
    const other = fixture();
    other.functions[2].ranges[0].count = 1;
    other.functions[1].ranges[1].count = 1;
    const merged = unreachedIn(source, [fixture(), other]);
    expect(merged.functions.map((f) => f.name)).toEqual(['(anonymous)']);
    expect(merged.blocks).toEqual([]);
  });
});

describe('readCoverage and formatCoverage', () => {
  const root = mkdtempSync(join(tmpdir(), 'caselab-coverage-test-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'engine.ts'), source);
  const dir = join(root, 'v8');
  mkdirSync(dir);
  const url = pathToFileURL(join(root, 'src', 'engine.ts')).href;
  writeFileSync(join(dir, 'coverage-1.json'), JSON.stringify({ result: [{ url: 'file:///elsewhere.js', functions: [] }, { url, ...fixture() }] }));

  it('reads the files named, ignores other scripts, and reports a file nothing loaded as missing', () => {
    const per = readCoverage(dir, ['src/engine.ts', 'src/absent.ts'], root);
    rmSync(root, { recursive: true, force: true });
    expect(per[0]).toMatchObject({ file: 'src/engine.ts', total: 3 });
    expect(per[1]).toEqual({ file: 'src/absent.ts', missing: true });
    const text = formatCoverage(per);
    expect(text).toContain('2 of 3 functions never ran, 1 blocks inside functions that ran never ran');
    expect(text).toContain('neverRan');
    expect(text).toContain('line    2  in ran  if (x) return 1;');
    expect(text).toContain('no coverage was written for this file');
  });
});
