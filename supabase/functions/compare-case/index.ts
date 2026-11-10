// compare-case: "Compare with the book". Reads the signed-in member's OWN written feedback on one casebook case they have done, and our
// analysis of that case (released by the database only to a member who logged it), asks Claude what they covered and missed, stores the
// answer, and sends it back.
//
// The app calls this only when the member clicks the button, with their own token. What is sent, how it is asked, what is accepted back and
// how often it can run live in ../_shared/caseComparison.ts and are tested there; this file only plugs in the real services.
//
// The case and our analysis are read with THEIR token, so row level security and library_notes_for() decide what is visible. The answer is
// stored with the service role, because members have no write access to that table. The Anthropic key exists only here.
//
// Secrets: ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL, default claude-sonnet-5-5); the same ones as analyze-feedback.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  COMPARE_COLUMNS,
  handleCompare,
  isCaseId,
  OUTPUT_SCHEMA,
  type CompareCaseRow,
  type CompareDeps,
  type LibraryNotes,
  type StoredComparison,
} from '../_shared/caseComparison.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await createClient(url, anonKey).auth.getUser(token);
  const user = auth.user;
  if (!user) return reply(401, { error: 'Sign in first' });
  if (!user.email_confirmed_at) return reply(403, { error: 'Verify your email first' });

  let body: { caseId?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Bad request' });
  }
  if (!isCaseId(body.caseId)) return reply(400, { error: 'Bad request' });
  const caseId = body.caseId;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.log('compare-case: ANTHROPIC_API_KEY is not set, so nothing can be compared');
    return reply(200, { status: 'unavailable' });
  }
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';

  const asMember = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const asService = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const anthropic = new Anthropic({ apiKey });

  const deps: CompareDeps = {
    now: () => Date.now(),
    model,
    getCase: async (id) => {
      const { data, error } = await asMember.from('cases').select(COMPARE_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as CompareCaseRow | null;
    },
    getNotes: async (libraryId) => {
      const { data, error } = await asMember.rpc('library_notes_for', { p_library_id: libraryId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return (row ?? null) as LibraryNotes | null;
    },
    getStored: async (id) => {
      const { data } = await asService.from('case_comparisons').select('result, model, updated_at, input_hash').eq('case_id', id).eq('user_id', user.id).maybeSingle();
      if (!data) return null;
      return { comparison: data.result, model: data.model, updatedAt: data.updated_at, inputHash: data.input_hash } as StoredComparison;
    },
    save: async (id, s) => {
      const { error } = await asService.from('case_comparisons').upsert(
        { case_id: id, user_id: user.id, input_hash: s.inputHash, result: s.comparison, model: s.model, created_at: s.updatedAt, updated_at: s.updatedAt },
        { onConflict: 'case_id' },
      );
      if (error) throw error;
    },
    ask: async (system, userText) => {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: userText }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      });
      const block = response.content.find((b) => b.type === 'text');
      return { text: block && block.type === 'text' ? block.text : '', stopReason: response.stop_reason };
    },
  };

  try {
    const result = await handleCompare(caseId, deps);
    console.log(`compare-case: ${result.status}${result.status === 'ok' ? (result.cached ? ' (stored)' : ' (new)') : result.status === 'failed' ? ` (${result.reason}${result.detail ? `: ${result.detail}` : ''})` : ''}`);
    return reply(200, result);
  } catch (e) {
    console.log(`compare-case: failed (${e instanceof Error ? e.message : String(e)})`);
    return reply(200, { status: 'failed', reason: 'ask_failed', detail: e instanceof Error ? e.message.slice(0, 200) : 'unknown' });
  }
});
