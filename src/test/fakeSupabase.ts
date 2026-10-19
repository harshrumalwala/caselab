import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type Failure = { message: string; code?: string };

/**
 * Just enough of supabase-js's query builder to exercise SupabaseRepository: it records what
 * was sent, fills `user_id` like the database default would, and lets a test fail an operation.
 */
export function fakeSupabaseClient(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { cases: [], opportunities: [], ...initial };
  const sent: { op: string; table: string; payload?: unknown }[] = [];
  const failures = new Map<string, Failure>();

  class Query implements PromiseLike<{ data: unknown; error: Failure | null }> {
    private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | undefined;
    private payload: unknown;
    private returning = false;
    private single_ = false;
    private filters: ((r: Row) => boolean)[] = [];
    private ordering: { col: string; asc: boolean }[] = [];
    private window: [number, number] | null = null;

    constructor(private readonly table: string) {}

    select() {
      if (!this.op) this.op = 'select';
      else this.returning = true;
      return this;
    }
    insert(p: unknown) {
      this.op = 'insert';
      this.payload = p;
      return this;
    }
    update(p: unknown) {
      this.op = 'update';
      this.payload = p;
      return this;
    }
    upsert(p: unknown) {
      this.op = 'upsert';
      this.payload = p;
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    eq(col: string, v: unknown) {
      this.filters.push((r) => r[col] === v);
      return this;
    }
    in(col: string, vs: unknown[]) {
      this.filters.push((r) => vs.includes(r[col]));
      return this;
    }
    not(col: string, _op: string, v: unknown) {
      this.filters.push((r) => r[col] !== v);
      return this;
    }
    order(col: string, o: { ascending?: boolean } = {}) {
      this.ordering.push({ col, asc: o.ascending !== false });
      return this;
    }
    range(a: number, b: number) {
      this.window = [a, b];
      return this;
    }
    single() {
      this.single_ = true;
      return this;
    }

    private run(): { data: unknown; error: Failure | null } {
      const op = this.op ?? 'select';
      sent.push({ op, table: this.table, payload: this.payload });
      const failure = failures.get(`${op} ${this.table}`);
      if (failure) return { data: null, error: failure };

      const rows = tables[this.table];
      const matches = () => rows.filter((r) => this.filters.every((f) => f(r)));
      const shape = (out: Row[]) =>
        this.single_
          ? out.length === 1
            ? { data: out[0], error: null }
            : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
          : { data: out, error: null };

      switch (op) {
        case 'select': {
          let out = matches();
          for (const { col, asc } of [...this.ordering].reverse()) {
            out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
          }
          if (this.window) out = out.slice(this.window[0], this.window[1] + 1);
          return shape(out);
        }
        case 'insert': {
          const added: Row[] = ([] as Row[]).concat(this.payload as Row | Row[]).map((r) => ({ user_id: 'user-1', ...r }));
          for (const r of added) {
            if (rows.some((x) => x.id === r.id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          rows.push(...added);
          return this.returning ? shape(added) : { data: null, error: null };
        }
        case 'update': {
          const hit = matches();
          hit.forEach((r) => Object.assign(r, this.payload));
          return this.returning ? shape(hit) : { data: null, error: null };
        }
        case 'upsert': {
          for (const r of ([] as Row[]).concat(this.payload as Row | Row[])) {
            const i = rows.findIndex((x) => x.id === r.id);
            if (i === -1) rows.push({ user_id: 'user-1', ...r });
            else Object.assign(rows[i], r);
          }
          return { data: null, error: null };
        }
        case 'delete': {
          const gone = new Set(matches());
          tables[this.table] = rows.filter((r) => !gone.has(r));
          return { data: null, error: null };
        }
      }
    }

    then<A, B>(
      onfulfilled?: ((v: { data: unknown; error: Failure | null }) => A | PromiseLike<A>) | null,
      onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ) {
      return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
    }
  }

  const client = { from: (table: string) => new Query(table) } as unknown as SupabaseClient;
  return {
    client,
    tables,
    sent,
    failOn(operation: string, failure: Failure) {
      failures.set(operation, failure);
    },
    heal() {
      failures.clear();
    },
  };
}
