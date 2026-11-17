import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseInfo, ExhibitSignal, Feedback, LiveAction, LiveResponse, LiveView, PublicExhibit } from '../../supabase/functions/_shared/liveCaseCoach';
import type { DraftKey, LiveMode, Message, Stage } from '../../supabase/functions/_shared/liveCase';
import { DataError } from './errors';

export type { CaseInfo, DraftKey, ExhibitSignal, Feedback, LiveMode, LiveView, Message, PublicExhibit, Stage };

/** A casebook case that can be practised live. Names only: nothing about the case. */
export interface LiveCatalogCase {
  id: string;
  name: string;
  book: string;
  school: string;
  year: number;
  caseType: string;
  industry: string;
  cochairPick: boolean;
  /** You have logged this case already. */
  done: boolean;
  /**
   * Does the case have exhibits to work through, or does it run on discussion alone? Not part of the list the database returns: it comes
   * from `exhibitSignal()` and is folded in by `withExhibitSignal`, so it is undefined until that has arrived (or if it never does).
   */
  exhibits?: boolean;
}

/**
 * The live case for the signed-in member. Each call is one thing the member does; each returns the case as the member may now see it
 * (the clock, the conversation, the exhibits shown so far). A refusal or a failure rejects with a sentence fit to show.
 */
export interface LiveCaseRepository {
  catalog(): Promise<LiveCatalogCase[]>;
  /**
   * Which cases have exhibits to work through, by case id. Worked out where the case is run, from the plan the case will run on, so the
   * picker's label cannot disagree with what the member then gets.
   */
  exhibitSignal(): Promise<Record<string, boolean>>;
  /** Starts a case (a random one when `libraryId` is null), or returns the one already running. */
  start(libraryId: string | null, mode?: LiveMode): Promise<LiveView>;
  /** The running case, or the latest finished one; null if there has never been one. */
  resume(): Promise<LiveView | null>;
  ready(sessionId: string): Promise<LiveView>;
  submit(sessionId: string, text: string): Promise<LiveView>;
  say(sessionId: string, text: string): Promise<LiveView>;
  nudge(sessionId: string): Promise<LiveView>;
  /** Done with this exhibit: on to the next one, or the next section after the last. */
  next(sessionId: string): Promise<LiveView>;
  /** Stops the clock until `unpause`. */
  pause(sessionId: string): Promise<LiveView>;
  unpause(sessionId: string): Promise<LiveView>;
  /** Ends the case here: what was written goes to feedback. */
  end(sessionId: string): Promise<LiveView>;
  finish(sessionId: string): Promise<LiveView>;
  logged(sessionId: string, caseId: string): Promise<void>;
  saveDraft(sessionId: string, key: DraftKey, text: string): Promise<void>;
  saveScratchpad(sessionId: string, text: string): Promise<void>;
}

/** Everything the app asks of the live case goes through `send`; the real backend and the in-memory twin differ only in what `send` does. */
export class LiveClient implements LiveCaseRepository {
  constructor(
    private readonly send: (action: LiveAction) => Promise<LiveResponse>,
    private readonly list: () => Promise<LiveCatalogCase[]>,
  ) {}

  private async view(action: LiveAction): Promise<LiveView> {
    const r = await this.send(action);
    if (r.status === 'ok') return r.view;
    throw new DataError('message' in r ? r.message : 'Something went wrong. Try again.');
  }

  catalog = () => this.list();
  async exhibitSignal(): Promise<Record<string, boolean>> {
    const r = await this.send({ type: 'exhibits' });
    if (r.status !== 'exhibits') throw new DataError('message' in r ? r.message : 'Something went wrong. Try again.');
    return Object.fromEntries(r.cases.map((c) => [c.id, c.exhibits]));
  }
  start = (libraryId: string | null, mode: LiveMode = 'practice') => this.view({ type: 'start', libraryId, mode });
  async resume(): Promise<LiveView | null> {
    const r = await this.send({ type: 'resume' });
    if (r.status === 'ok') return r.view;
    if (r.status === 'refused') return null;
    throw new DataError(r.status === 'failed' ? r.message : 'Something went wrong. Try again.');
  }
  ready = (sessionId: string) => this.view({ type: 'ready', sessionId });
  submit = (sessionId: string, text: string) => this.view({ type: 'submit', sessionId, text });
  say = (sessionId: string, text: string) => this.view({ type: 'say', sessionId, text });
  nudge = (sessionId: string) => this.view({ type: 'nudge', sessionId });
  next = (sessionId: string) => this.view({ type: 'next', sessionId });
  pause = (sessionId: string) => this.view({ type: 'pause', sessionId });
  unpause = (sessionId: string) => this.view({ type: 'continue', sessionId });
  end = (sessionId: string) => this.view({ type: 'end', sessionId });
  finish = (sessionId: string) => this.view({ type: 'finish', sessionId });
  async logged(sessionId: string, caseId: string): Promise<void> {
    await this.send({ type: 'logged', sessionId, caseId });
  }
  async saveDraft(sessionId: string, key: DraftKey, text: string): Promise<void> {
    await this.send({ type: 'draft', sessionId, key, text });
  }
  async saveScratchpad(sessionId: string, text: string): Promise<void> {
    await this.send({ type: 'scratch', sessionId, text });
  }
}

interface CatalogRow {
  id: string;
  name: string;
  book: string;
  school: string;
  year: number;
  case_type: string;
  industry: string;
  cochair_pick: boolean;
  done: boolean;
}

export const rowToLiveCase = (r: CatalogRow): LiveCatalogCase => ({
  id: r.id,
  name: r.name,
  book: r.book,
  school: r.school,
  year: r.year,
  caseType: r.case_type,
  industry: r.industry,
  cochairPick: r.cochair_pick,
  done: r.done,
});

/** The real thing: the `live-case` Edge Function (which holds the case and the coach) and the list of cases from the database. */
export class SupabaseLive extends LiveClient {
  constructor(client: SupabaseClient) {
    super(
      async (action) => {
        const { data, error } = await client.functions.invoke('live-case', { body: action });
        if (error) throw error;
        return data as LiveResponse;
      },
      async () => {
        const { data, error } = await client.rpc('live_case_catalog');
        if (error) throw error;
        return ((data ?? []) as CatalogRow[]).map(rowToLiveCase);
      },
    );
  }
}
