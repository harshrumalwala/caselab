import { describe, expect, it } from 'vitest';
import { caseToRow, isUuid, rowToCase, withUuidIds, type CaseRow } from './mapping';
import { SupabaseRepository } from './supabaseRepository';
import { fakeSupabaseClient } from '../test/fakeSupabase';
import { makeCase, richCase } from '../test/builders';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('row mapping', () => {
  it('round-trips a fully populated case without loss', () => {
    const c = richCase();
    expect(rowToCase(caseToRow(c))).toEqual(c);
  });

  it('stores blank optional fields as null and reads null back as empty', () => {
    const row = caseToRow(makeCase({ source: '', partner: '  ', overall: null, concepts: '' }));
    expect(row).toMatchObject({ source: null, partner: null, overall: null, concepts: null, industry: 'Technology / SaaS' });
    expect('user_id' in row).toBe(false); // the database fills it from the signed-in user
    const back = rowToCase({ ...row, industry: null } as CaseRow);
    expect(back).toMatchObject({ source: '', partner: '', overall: null, concepts: '', industry: '' });
  });

  it('never sends an empty title (the database requires one)', () => {
    expect(caseToRow(makeCase({ title: '   ' })).title).toBe('Untitled case');
  });

  it('keeps the unrated skills unrated (null, not zero)', () => {
    const back = rowToCase(caseToRow(makeCase({ skills: { framework: 3 } })));
    expect(back.skills.framework.rating).toBe(3);
    expect(back.skills.quant.rating).toBeNull();
  });

  it('gives imported rows with non-uuid ids fresh uuids and keeps valid ones', () => {
    const [a, b] = withUuidIds([{ id: uuid(1) }, { id: 'demo-3' }]);
    expect(a.id).toBe(uuid(1));
    expect(isUuid(b.id)).toBe(true);
  });
});

describe('SupabaseRepository', () => {
  const setup = (initial = {}) => {
    const fake = fakeSupabaseClient(initial);
    return { ...fake, repo: new SupabaseRepository(fake.client) };
  };

  it('inserts a case without user_id and returns what the database stored', async () => {
    const { repo, sent, tables } = setup();
    const c = makeCase({ id: uuid(1), title: 'Airline', source: '' });
    const saved = await repo.insertCase(c);
    expect(saved).toEqual(c);
    expect(sent[0].payload).not.toHaveProperty('user_id');
    expect(tables.cases).toHaveLength(1);
    expect(tables.cases[0].user_id).toBe('user-1');
  });

  it('loads everything, including more rows than one page', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) =>
      ({ ...caseToRow(makeCase({ id: uuid(i + 1), date: '2026-09-01' })), created_at: `2026-09-01T00:00:${String(i % 60).padStart(2, '0')}.000Z` }),
    );
    const { repo, sent } = setup({ cases: rows });
    const { cases, opportunities } = await repo.loadAll();
    expect(cases).toHaveLength(2500);
    expect(new Set(cases.map((c) => c.id)).size).toBe(2500);
    expect(opportunities).toEqual([]);
    expect(sent.filter((s) => s.table === 'cases' && s.op === 'select')).toHaveLength(3);
  });

  it('updates in place without touching id, created_at or user_id', async () => {
    const { repo, sent, tables } = setup();
    const c = makeCase({ id: uuid(2), title: 'Before' });
    await repo.insertCase(c);
    const saved = await repo.updateCase({ ...c, title: 'After', updatedAt: '2026-10-02T00:00:00.000Z' });
    expect(saved.title).toBe('After');
    const patch = sent.find((s) => s.op === 'update')?.payload as Record<string, unknown>;
    expect(patch).not.toHaveProperty('id');
    expect(patch).not.toHaveProperty('created_at');
    expect(patch).not.toHaveProperty('user_id');
    expect(tables.cases[0].created_at).toBe(c.createdAt);
  });

  it('reports an update to a case that no longer exists instead of pretending it worked', async () => {
    const { repo } = setup();
    await expect(repo.updateCase(makeCase({ id: uuid(9) }))).rejects.toMatchObject({ code: 'PGRST116' });
  });

  it('deletes cases and opportunities', async () => {
    const { repo, tables } = setup();
    const c = makeCase({ id: uuid(3) });
    await repo.insertCase(c);
    await repo.insertOpportunity({ id: uuid(4), kind: 'skill', text: 'Mental math', createdAt: c.createdAt });
    await repo.deleteCase(c.id);
    await repo.deleteOpportunity(uuid(4));
    expect(tables.cases).toEqual([]);
    expect(tables.opportunities).toEqual([]);
  });

  it('surfaces database errors rather than swallowing them', async () => {
    const { repo, failOn } = setup();
    failOn('insert cases', { message: 'permission denied', code: '42501' });
    await expect(repo.insertCase(makeCase({ id: uuid(5) }))).rejects.toMatchObject({ code: '42501' });
    failOn('select cases', { message: 'TypeError: Failed to fetch' });
    await expect(repo.loadAll()).rejects.toMatchObject({ message: 'TypeError: Failed to fetch' });
  });

  it('upserts in chunks and never deletes', async () => {
    const { repo, tables, sent } = setup();
    const existing = makeCase({ id: uuid(1), title: 'Existing' });
    await repo.insertCase(existing);
    const many = Array.from({ length: 450 }, (_, i) => makeCase({ id: uuid(i + 2) }));
    await repo.upsertMany({ cases: [{ ...existing, title: 'Changed' }, ...many], opportunities: [] });
    expect(tables.cases).toHaveLength(451);
    expect(tables.cases.find((r) => r.id === uuid(1))?.title).toBe('Changed');
    expect(sent.filter((s) => s.op === 'upsert')).toHaveLength(3); // 451 rows in chunks of 200
    expect(sent.some((s) => s.op === 'delete')).toBe(false);
  });

  it('replaceAll writes the new data first and only then removes what is left over', async () => {
    const { repo, tables, sent } = setup();
    await repo.insertCase(makeCase({ id: uuid(1), title: 'Old one' }));
    await repo.insertCase(makeCase({ id: uuid(2), title: 'Old two' }));
    await repo.replaceAll({ cases: [makeCase({ id: uuid(2), title: 'Kept' }), makeCase({ id: uuid(3), title: 'New' })], opportunities: [] });
    expect(tables.cases.map((r) => r.title).sort()).toEqual(['Kept', 'New']);
    const ops = sent.map((s) => s.op);
    expect(ops.indexOf('upsert')).toBeLessThan(ops.lastIndexOf('delete'));
  });

  it('replaceAll never loses data if the cleanup step fails', async () => {
    const { repo, tables, failOn } = setup();
    await repo.insertCase(makeCase({ id: uuid(1), title: 'Old one' }));
    failOn('delete cases', { message: 'TypeError: Failed to fetch' });
    await expect(repo.replaceAll({ cases: [makeCase({ id: uuid(2), title: 'New' })], opportunities: [] })).rejects.toBeDefined();
    // The old case is still there and the new one was already written: a superset, never a hole.
    expect(tables.cases.map((r) => r.title).sort()).toEqual(['New', 'Old one']);
  });

  it('clearAll removes every case and opportunity', async () => {
    const { repo, tables } = setup();
    await repo.insertCase(makeCase({ id: uuid(1) }));
    await repo.insertOpportunity({ id: uuid(2), kind: 'exposure', text: 'x', createdAt: '2026-10-01T00:00:00.000Z' });
    await repo.clearAll();
    expect(tables.cases).toEqual([]);
    expect(tables.opportunities).toEqual([]);
  });
});
