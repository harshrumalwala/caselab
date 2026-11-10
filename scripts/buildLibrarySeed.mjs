// Turns the casebook analyses in private-data/casebooks/*.json into one SQL seed file, supabase/seeds/library.sql, that loads them into
// the case library. Both the data and the generated seed are git-ignored: our write-ups of third-party casebooks stay out of git and
// reach only the database. The seed is safe to run again (it updates what is there, keyed by book and case name).
//
//   node scripts/buildLibrarySeed.mjs
//   npx supabase db push --linked --include-seed
//
// Needs the migration that creates the library tables (supabase/migrations/*_case_library.sql) to be applied first.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedSql } from './librarySeed.mjs';

const DIR = 'private-data/casebooks';
const OUT = 'supabase/seeds/library.sql';

const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.endsWith('.index.json')).sort();
if (files.length === 0) throw new Error(`No analyses found in ${DIR}`);

const { sql, count, dropped } = seedSql(
  files.map((file) => ({ file, cases: JSON.parse(readFileSync(join(DIR, file), 'utf8')) })),
);
mkdirSync('supabase/seeds', { recursive: true });
writeFileSync(OUT, sql);
console.log(`Wrote ${OUT}: ${count} cases from ${files.length} file(s).`);
if (dropped.length) console.log(`${dropped.length} copy/copies of a case already in a better book were folded in (see "also in").`);
