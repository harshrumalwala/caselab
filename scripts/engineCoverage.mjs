// Says which parts of the live-case engine the scripted dry run never executes, so "can the harness reach what I just changed?" has an
// answer from a command rather than a guess. It runs `scripts/liveCaseDryRun.mjs` under V8's own coverage (NODE_V8_COVERAGE) and reads the
// JSON V8 writes, for the two files the Edge Function's decisions live in: supabase/functions/_shared/liveCase.ts and liveCaseCoach.ts.
//
//   npm run coverage:engine                          # the whole catalogue (about 8 minutes), prints the list, writes reports/engine-coverage.md
//   npm run coverage:engine -- --cases 40            # a quick look: only the first 40 cases (the list is longer, since less is played)
//   npm run coverage:engine -- --dir <path> --out <file>
//
// THIS IS AN INSTRUMENT FOR A PERSON TO READ, NOT A GATE. It prints names, so it reads as a to-do and not a score. Some unreached code is
// right to be unreached (the timer-driven hint is dead in the deployed function too), and a threshold would invite someone to write a
// candidate to satisfy a number. Nothing here fails on what it finds; it exits non-zero only if the dry run itself crashes or no coverage
// of the engine was written.
//
// PR #183's figures on the whole catalogue were 1 function unreached in liveCaseCoach.ts and 0 in liveCase.ts (from 16 and 9).
//
// Like `audit:live` and `dryrun:live` it needs the git-ignored write-ups in private-data/solutions/ (the same --dir) and Node 22.6+ (the
// engine is TypeScript; the dry run restarts itself with type stripping when this Node has none), so it cannot run in CI. The report is
// written under reports/ (git-ignored) and the raw V8 files go to the system temp folder and are removed. The report holds function names
// and line numbers of our own source, never a word of a write-up.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = 'reports/engine-coverage.md';
export const ENGINE_FILES = ['supabase/functions/_shared/liveCase.ts', 'supabase/functions/_shared/liveCaseCoach.ts'];

const lineStarts = (source) => {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  return starts;
};
const lineAt = (starts, offset) => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};

/**
 * What one source file never ran, given V8's coverage for it (one entry per process that loaded it; a function or block counts as
 * reached if any of them ran it). Type stripping blanks types with spaces, so V8's offsets are offsets into the file as it is on disk.
 * `functions`: every function that never ran, by name and line. `blocks`: a stretch inside a function that did run that never did
 * (the untaken side of an `if`, a `??` fallback, an early return), by line. Code inside an unreached function is not repeated as a block.
 */
export function unreachedIn(source, entries) {
  const starts = lineStarts(source);
  const whole = (f) => f.ranges[0].startOffset === 0 && f.ranges[0].endOffset >= source.length;
  const textAt = (offset) => source.slice(starts[lineAt(starts, offset) - 1]).split('\n', 1)[0].trim().slice(0, 90);
  const byFunction = new Map();
  for (const entry of entries) {
    for (const f of entry.functions) {
      if (whole(f)) continue;
      const key = `${f.ranges[0].startOffset}:${f.ranges[0].endOffset}`;
      const zero = new Set(f.ranges.slice(1).filter((r) => r.count === 0).map((r) => `${r.startOffset}:${r.endOffset}`));
      const seen = byFunction.get(key);
      if (!seen) {
        byFunction.set(key, { f, ran: f.ranges[0].count > 0, zero });
      } else {
        seen.ran = seen.ran || f.ranges[0].count > 0;
        seen.zero = new Set([...seen.zero].filter((z) => zero.has(z)));
      }
    }
  }
  const functions = [];
  const blocks = [];
  for (const { f, ran, zero } of byFunction.values()) {
    const line = lineAt(starts, f.ranges[0].startOffset);
    if (!ran) {
      functions.push({ name: f.functionName || '(anonymous)', line, text: f.functionName ? '' : textAt(f.ranges[0].startOffset) });
      continue;
    }
    for (const r of f.ranges.slice(1)) {
      if (!zero.has(`${r.startOffset}:${r.endOffset}`)) continue;
      blocks.push({ inFunction: f.functionName || '(anonymous)', line: lineAt(starts, r.startOffset), endLine: lineAt(starts, r.endOffset), text: textAt(r.startOffset) });
    }
  }
  const byLine = (a, b) => a.line - b.line;
  return { total: byFunction.size, functions: functions.sort(byLine), blocks: blocks.sort(byLine) };
}

/** Reads every coverage file V8 wrote into `dir` and returns, per engine file, what never ran. A file nothing loaded is reported as missing. */
export function readCoverage(dir, files = ENGINE_FILES, root = ROOT) {
  const results = readdirSync(dir).filter((n) => n.endsWith('.json')).flatMap((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')).result ?? []);
  return files.map((file) => {
    const url = pathToFileURL(join(root, file)).href;
    const entries = results.filter((r) => r.url === url);
    if (entries.length === 0) return { file, missing: true };
    return { file, ...unreachedIn(readFileSync(join(root, file), 'utf8'), entries) };
  });
}

export function formatCoverage(per) {
  const lines = [];
  for (const p of per) {
    lines.push(p.file);
    if (p.missing) {
      lines.push('  no coverage was written for this file (the dry run did not load it)', '');
      continue;
    }
    lines.push(`  ${p.functions.length} of ${p.total} functions never ran, ${p.blocks.length} blocks inside functions that ran never ran`);
    if (p.functions.length > 0) lines.push('  functions never run:');
    for (const f of p.functions) lines.push(`    line ${String(f.line).padStart(4)}  ${f.name}${f.text ? `  ${f.text}` : ''}`);
    if (p.blocks.length > 0) lines.push('  blocks never run (in the function they sit in):');
    for (const b of p.blocks) lines.push(`    line ${String(b.line).padStart(4)}${b.endLine > b.line ? `-${b.endLine}` : ''}  in ${b.inFunction}  ${b.text}`);
    lines.push('');
  }
  return lines.join('\n');
}

const option = (argv, name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

function main(argv) {
  if (argv.includes('--help')) {
    console.log('Usage: node scripts/engineCoverage.mjs [--dir private-data/solutions] [--out reports/engine-coverage.md] [--cases N]');
    console.log('       (--modes and --candidates are passed to the dry run too)');
    return 0;
  }
  const out = option(argv, 'out', DEFAULT_OUT);
  // Everything else is the dry run's own arguments. Its own report goes to the temp folder: only the coverage is wanted here.
  const passed = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') i++;
    else passed.push(argv[i]);
  }
  const work = mkdtempSync(join(tmpdir(), 'caselab-coverage-'));
  try {
    const cov = join(work, 'v8');
    const flags = process.features.typescript ? [] : ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];
    const run = spawnSync(process.execPath, [...flags, join(ROOT, 'scripts/liveCaseDryRun.mjs'), ...passed, '--out', join(work, 'dry-run.md')], {
      stdio: ['inherit', 'ignore', 'inherit'],
      env: { ...process.env, NODE_V8_COVERAGE: cov },
    });
    if (run.error) throw new Error(`This script needs Node 22.6 or newer: ${run.error.message}`);
    // The dry run exits 1 when a run fails its bar; that is its own report to read, and the coverage is still good.
    if (run.status !== 0 && run.status !== 1) {
      console.error(`The dry run stopped with exit ${run.status}; no coverage to report.`);
      return 1;
    }
    const per = readCoverage(cov);
    const text = formatCoverage(per);
    console.log(text);
    if (run.status === 1) console.log('Note: the dry run itself reported failures; npm run dryrun:live gives that report.\n');
    const target = resolve(ROOT, out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `# Engine coverage by the dry run, ${new Date().toISOString()}\n\n${text}\n`);
    console.log(`Wrote ${out}`);
    return per.some((p) => p.missing) ? 1 : 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2));
