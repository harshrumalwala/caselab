// analyze-feedback: the "Coach's read". Reads the signed-in member's OWN written feedback, asks Claude where they are strong and what to
// improve, stores the answer, and sends it back.
//
// The app calls this only when the member clicks the button, with their own token. What is read, how it is asked, what is accepted back
// and how often it can run all live in ../_shared/feedbackInsights.ts and are tested there; this file only plugs in the real services.
//
// The member's cases are read with THEIR token, so the database's row level security decides what is visible (only their own). The
// answer is stored with the service role, because members have no write access to that table (they cannot plant an answer or reset
// their own limit). The Anthropic key exists only here.
//
// Secrets to set (supabase secrets set ...):  ANTHROPIC_API_KEY, and optionally ANTHROPIC_MODEL (default claude-opus-5-5).
// Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY itself.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  FEEDBACK_COLUMNS,
  handleAnalyze,
  isScope,
  OUTPUT_SCHEMA,
  type AnalyzeDeps,
  type FeedbackCaseRow,
  type StoredInsight,
} from '../_shared/feedbackInsights.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** More rows than a read can use, so that cases with no writing in between do not starve it. */
const FETCH_ROWS = 150;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await createClient(url, anonKey).auth.getUser(token);
  const user = auth.user;
  if (!user) return reply(401, { error: 'Sign in first' });
  // Same bar as the community: a verified email. (Nobody can spend the key on an address they do not own.)
  if (!user.email_confirmed_at) return reply(403, { error: 'Verify your email first' });

  let body: { scope?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Bad request' });
  }
  if (!isScope(body.scope)) return reply(400, { error: 'Bad request' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.log('analyze-feedback: ANTHROPIC_API_KEY is not set, so nothing can be read');
    return reply(200, { status: 'unavailable' });
  }
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5-5';

  // Their cases, through their own token: row level security means only their own rows can ever come back.
  const asMember = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const asService = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const anthropic = new Anthropic({ apiKey });

  const deps: AnalyzeDeps = {
    now: () => Date.now(),
    model,
    getCases: async () => {
      const { data, error } = await asMember.from('cases').select(FEEDBACK_COLUMNS).order('case_date', { ascending: false }).limit(FETCH_ROWS);
      if (error) throw error;
      return (data ?? []) as FeedbackCaseRow[];
    },
    getStored: async () => {
      const { data } = await asService.from('feedback_insights').select('scope, case_count, input_hash, result, model, updated_at').eq('user_id', user.id).maybeSingle();
      if (!data) return null;
      return { insight: data.result, scope: data.scope, caseCount: data.case_count, model: data.model, updatedAt: data.updated_at, inputHash: data.input_hash } as StoredInsight;
    },
    save: async (s) => {
      const { error } = await asService.from('feedback_insights').upsert(
        { user_id: user.id, scope: s.scope, case_count: s.caseCount, input_hash: s.inputHash, result: s.insight, model: s.model, created_at: s.updatedAt, updated_at: s.updatedAt },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    ask: async (system, userText) => {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 8000,
        system,
        messages: [{ role: 'user', content: userText }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      });
      const block = response.content.find((b) => b.type === 'text');
      return { text: block && block.type === 'text' ? block.text : '', stopReason: response.stop_reason };
    },
  };

  try {
    const result = await handleAnalyze(body.scope, deps);
    console.log(`analyze-feedback ${body.scope}: ${result.status}${result.status === 'ok' ? (result.cached ? ' (stored)' : ' (new)') : ''}`);
    return reply(200, result);
  } catch (e) {
    console.log(`analyze-feedback: failed (${e instanceof Error ? e.message : String(e)})`);
    return reply(200, { status: 'failed' });
  }
});
