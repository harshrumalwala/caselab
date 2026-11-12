// live-case: "practise a whole case with Bucket". One request per thing the member does in the live case (start, answer, hand in, nudge, finish).
//
// What happens when, and what Bucket may say, lives in ../_shared/liveCase.ts and ../_shared/liveCaseCoach.ts and is tested there; this file
// only plugs in the real services: the database (through the service role, because members have no access to live_case_sessions and the
// book's write-up is released only here), and Claude.
//
// The member's own sign-in is checked here (the gateway's check cannot read this project's ES256 tokens; see supabase/config.toml).
// The Anthropic key exists only here.
//
// Secrets: ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL, default claude-sonnet-5-5); the same ones as compare-case.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleLive, type CaseInfo, type LiveAction, type LiveDeps, type StoredSession, type TurnRequest } from '../_shared/liveCaseCoach.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length <= 20_000;
const DRAFTS = ['clarify', 'framework', 'direction', 'exhibit', 'brainstorm', 'recommendation'] as const;

/** Accepts only the shapes of request the app sends; anything else is a bad request. */
function readAction(b: Record<string, unknown>): LiveAction | null {
  switch (b.type) {
    case 'start':
      return b.libraryId === undefined || b.libraryId === null || isId(b.libraryId) ? { type: 'start', libraryId: (b.libraryId as string | null | undefined) ?? null } : null;
    case 'resume':
      return b.sessionId === undefined || isId(b.sessionId) ? { type: 'resume', sessionId: b.sessionId as string | undefined } : null;
    case 'ready':
    case 'nudge':
    case 'finish':
      return isId(b.sessionId) ? { type: b.type, sessionId: b.sessionId } : null;
    case 'submit':
    case 'say':
    case 'scratch':
      return isId(b.sessionId) && isText(b.text) ? { type: b.type, sessionId: b.sessionId, text: b.text } : null;
    case 'draft':
      return isId(b.sessionId) && isText(b.text) && DRAFTS.some((k) => k === b.key) ? { type: 'draft', sessionId: b.sessionId, key: b.key as (typeof DRAFTS)[number], text: b.text } : null;
    case 'logged':
      return isId(b.sessionId) && isId(b.caseId) ? { type: 'logged', sessionId: b.sessionId, caseId: b.caseId } : null;
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(token);
  const user = auth.user;
  if (!user) return reply(401, { error: 'Sign in first' });
  if (!user.email_confirmed_at) return reply(403, { error: 'Verify your email first' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Bad request' });
  }
  const action = readAction(body && typeof body === 'object' ? body : {});
  if (!action) return reply(400, { error: 'Bad request' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.log('live-case: ANTHROPIC_API_KEY is not set, so there is no coach');
    return reply(200, { status: 'failed', message: 'The live case is not available right now.' });
  }
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const anthropic = new Anthropic({ apiKey });

  const COLUMNS = 'id, user_id, library_id, status, state, feedback, feedback_attempts, logged_case_id, actions, llm_calls, version, created_at';
  const toStored = (r: Record<string, unknown>): StoredSession => ({
    id: r.id as string,
    userId: r.user_id as string,
    libraryId: r.library_id as string,
    state: r.state as StoredSession['state'],
    status: r.status as StoredSession['status'],
    feedback: (r.feedback ?? null) as StoredSession['feedback'],
    feedbackAttempts: r.feedback_attempts as number,
    loggedCaseId: (r.logged_case_id ?? null) as string | null,
    actions: r.actions as number,
    llmCalls: r.llm_calls as number,
    version: r.version as number,
    createdAt: new Date(r.created_at as string).getTime(),
  });
  const fields = (s: StoredSession) => ({
    status: s.status,
    state: s.state,
    feedback: s.feedback,
    feedback_attempts: s.feedbackAttempts,
    logged_case_id: s.loggedCaseId,
    actions: s.actions,
    llm_calls: s.llmCalls,
    version: s.version,
    updated_at: new Date().toISOString(),
  });

  const deps: LiveDeps = {
    now: () => Date.now(),
    loadCase: async (libraryId) => {
      const [{ data: info }, { data: sol }] = await Promise.all([
        db.from('library_cases').select('name, book, case_type, industry').eq('id', libraryId).maybeSingle(),
        db.from('library_case_solutions').select('solution').eq('case_id', libraryId).maybeSingle(),
      ]);
      if (!info || !sol) return null;
      return { info: { name: info.name, book: info.book, caseType: info.case_type, industry: info.industry } as CaseInfo, solution: sol.solution };
    },
    pickCase: async (userId) => {
      const { data } = await db.rpc('live_case_pick_for', { p_user: userId });
      return (data as string | null) ?? null;
    },
    getSession: async (userId, id) => {
      const { data } = await db.from('live_case_sessions').select(COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle();
      return data ? toStored(data) : null;
    },
    getActive: async (userId) => {
      const { data } = await db.from('live_case_sessions').select(COLUMNS).eq('user_id', userId).eq('status', 'active').maybeSingle();
      return data ? toStored(data) : null;
    },
    getLatest: async (userId) => {
      const { data } = await db.from('live_case_sessions').select(COLUMNS).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      return data ? toStored(data) : null;
    },
    createSession: async (s) => {
      const { error } = await db.from('live_case_sessions').insert({ id: s.id, user_id: s.userId, library_id: s.libraryId, created_at: new Date(s.createdAt).toISOString(), ...fields(s) });
      if (error) throw error;
    },
    saveSession: async (s, expectedVersion) => {
      const { data, error } = await db.from('live_case_sessions').update(fields(s)).eq('id', s.id).eq('user_id', s.userId).eq('version', expectedVersion).select('id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    countStarts: async (userId, sinceMs) => {
      const { count } = await db.from('live_case_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', new Date(sinceMs).toISOString());
      return count ?? 0;
    },
    ask: async (request: TurnRequest) => {
      const response = await anthropic.messages.create({
        model,
        max_tokens: request.maxTokens,
        // The instructions and the case are the same on every request of a case, so they are cached for an hour (members think for minutes).
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
        messages: request.messages,
        output_config: { effort: request.effort, format: { type: 'json_schema', schema: request.schema } },
      });
      const block = response.content.find((b) => b.type === 'text');
      return { text: block && block.type === 'text' ? block.text : '', stopReason: response.stop_reason };
    },
  };

  try {
    const result = await handleLive(user.id, action, deps);
    console.log(`live-case ${action.type}: ${result.status}${result.status === 'refused' || result.status === 'failed' ? ` (${result.message})` : ''}`);
    return reply(200, result as unknown as Record<string, unknown>);
  } catch (e) {
    console.log(`live-case ${action.type}: failed (${e instanceof Error ? e.message : String(e)})`);
    return reply(200, { status: 'failed', message: 'Something went wrong. Your answers are saved: try again.' });
  }
});
