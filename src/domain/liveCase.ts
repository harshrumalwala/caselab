import type { BucketMood } from '../features/improvement/BucketAvatar';
import type { CaseInfo, Feedback, LiveCatalogCase, LiveView, Stage } from '../data/liveCase';
import { CASE_TYPES, SKILLS, type CaseType, type Rating } from './constants';
import { emptySkills } from './factory';
import { todayISO } from './dates';
import type { CaseInput } from './types';

/** The interviewer's name in the case log's "Interviewer / partner" column. */
export const COACH_PARTNER = 'Bucket (AI coach)';

/** "m:ss" for a countdown; never negative. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const STAGE_LABEL: Record<Stage, string> = {
  prompt: 'Prompt and clarifying questions',
  framework_think: 'Framework: think',
  framework_write: 'Framework: write',
  exhibits: 'Exhibits and discussion',
  brainstorm_think: 'Brainstorm: think',
  brainstorm_write: 'Brainstorm: write',
  recommend_think: 'Recommendation: think',
  recommend_write: 'Recommendation: write',
  done: 'Finished',
};

/** The big steps, for the progress strip (thinking and writing are shown as one). */
export const STEPS: { id: string; label: string; stages: Stage[] }[] = [
  { id: 'prompt', label: 'Prompt', stages: ['prompt'] },
  { id: 'framework', label: 'Framework', stages: ['framework_think', 'framework_write'] },
  { id: 'exhibits', label: 'Exhibits', stages: ['exhibits'] },
  { id: 'brainstorm', label: 'Brainstorm', stages: ['brainstorm_think', 'brainstorm_write'] },
  { id: 'recommend', label: 'Recommendation', stages: ['recommend_think', 'recommend_write'] },
];

export const isThinking = (stage: Stage): boolean => stage === 'framework_think' || stage === 'brainstorm_think' || stage === 'recommend_think';
export const isWriting = (stage: Stage): boolean => stage === 'brainstorm_write' || stage === 'recommend_write' || stage === 'framework_write';

const asRating = (n: number | null): Rating | null => (n !== null && Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Rating) : null);

const SUBMISSION_LABEL: Record<string, string> = { framework: 'framework', direction: 'starting direction', brainstorm: 'brainstorm', recommendation: 'recommendation' };

/**
 * The case-log entry for a finished live case, filled in from the feedback. The ratings and the words are Bucket's draft from what the member
 * wrote: the notes say so, and the case opens in the usual editor for them to review.
 */
export function liveCaseToInput(view: Pick<LiveView, 'submissions' | 'endReason' | 'beatsShown' | 'beatsTotal'> & { mode?: LiveView['mode'] }, info: CaseInfo, feedback: Feedback, now: Date = new Date()): CaseInput {
  const skills = emptySkills();
  for (const { key } of SKILLS) {
    const f = feedback.skills[key];
    skills[key] = { rating: asRating(f.rating), feedback: f.feedback };
  }
  const timedOut = view.submissions.filter((s) => s.timedOut).map((s) => SUBMISSION_LABEL[s.kind] ?? s.kind);
  const notes = [
    'Practised live with Bucket: a typed, timed case. The ratings and notes were drafted by the AI from what you wrote, so please check them and change anything that does not match how it went.',
    view.mode === 'interview' ? 'Interview mode: the clock never stopped.' : '',
    view.endReason === 'time_limit' ? 'The time ran out before the end.' : view.endReason === 'ended_early' ? 'Ended early, by choice.' : '',
    timedOut.length ? `Saved as a draft when ${view.endReason === 'ended_early' ? 'the case ended' : 'time ran out'}: ${timedOut.join(', ')}.` : '',
    feedback.unfinished.length ? `Not finished: ${feedback.unfinished.join('; ')}.` : '',
  ].filter(Boolean);
  return {
    date: todayISO(now),
    title: info.name,
    source: info.book,
    caseType: ((CASE_TYPES as readonly string[]).includes(info.caseType) ? info.caseType : 'Other') as CaseType,
    industry: info.industry,
    partner: COACH_PARTNER,
    overall: asRating(feedback.overall.rating),
    overallFeedback: feedback.overall.feedback,
    skills,
    wentWell: feedback.wentWell,
    struggled: feedback.struggled,
    concepts: feedback.concepts,
    nextFocus: feedback.nextFocus,
    improvementArea: feedback.improvementArea,
    otherNotes: notes.join('\n\n'),
    shareMode: 'profile',
    libraryId: info.libraryId ?? null,
  };
}

export interface BucketLine {
  mood: BucketMood;
  text: string;
}

/** A few ways to say it, so the same stage does not always sound the same: the choice depends on the case, not on chance, so a refresh keeps it. */
const pick = <T,>(options: readonly T[], seed: string): T => options[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % options.length];

const LINES: Record<Stage, readonly string[]> = {
  prompt: [
    "Hi, I'm Bucket, your interviewer today! Read the case, then ask me whatever you need. I only know what is in the case.",
    "Welcome in! Take a moment with the prompt, then fire away with your clarifying questions.",
    "Ready when you are! Ask me anything about the case. If I do not have it, I will say so.",
  ],
  framework_think: [
    "Shh, thinking time. I will sit very quietly. Scribble on your scratchpad, nobody is looking.",
    "Take your time with the structure. I will not peek, promise.",
  ],
  framework_write: [
    "Write your framework down, then tell me where you would start.",
    "Pen out! Put your structure on the page. Then it is your call where we begin.",
  ],
  exhibits: [
    "You are driving now. What do you notice? Show me your maths, and tell me what it means for the client.",
    "Over to you! Read it, work it, and tell me what you would do next.",
    "Your call where this goes. I will only nudge if you ask for it by getting stuck.",
  ],
  brainstorm_think: ["Brainstorm coming up. A moment to think first, I will keep quiet."],
  brainstorm_write: ["Ideas, ideas! Get them down, quantity first and sorting later."],
  recommend_think: [
    "Almost there! Pull it all together in your head. Answer first, then the why.",
    "Last stretch. Think about what you would tell the client, I am not going anywhere.",
  ],
  recommend_write: ["Write it up like you are talking to the client: answer, reasons, risks, next steps."],
  done: ["Nice work! You made it all the way through."],
};

/** What Bucket says (and how Bucket looks) right now, from the stage, the time left, and what just happened. */
export function bucketLine(view: Pick<LiveView, 'stage' | 'sessionId' | 'frameworkPhase' | 'serverNow' | 'endsAt'>, now: number, lastWasHint: boolean): BucketLine {
  const seed = view.sessionId;
  if (view.stage === 'done') return { mood: 'cheer', text: pick(LINES.done, seed) };
  if (view.endsAt - now <= 120_000) return { mood: 'worried', text: "Clock is getting low. Wrap up this thought and finish strong!" };
  if (view.stage === 'framework_write' && view.frameworkPhase === 'direction') return { mood: 'happy', text: 'Structure noted. Now, where would you begin?' };
  if (view.stage === 'exhibits' && lastWasHint) return { mood: 'hint', text: "A little nudge for you. Take it or leave it, you are still driving." };
  const thinking = view.stage === 'framework_think' || view.stage === 'brainstorm_think' || view.stage === 'recommend_think';
  return { mood: thinking ? 'thinking' : 'happy', text: pick(LINES[view.stage], seed) };
}

export interface Lane {
  name: string;
  cases: LiveCatalogCase[];
  /** How many of them the member has already logged. */
  done: number;
}

/** The cases gathered by case type or by industry, the biggest lane first. A case with no industry goes in "Other". */
export function groupLanes(cases: readonly LiveCatalogCase[], by: 'type' | 'industry'): Lane[] {
  const lanes = new Map<string, LiveCatalogCase[]>();
  for (const c of cases) {
    const name = (by === 'type' ? c.caseType : c.industry).trim() || 'Other';
    lanes.set(name, [...(lanes.get(name) ?? []), c]);
  }
  return [...lanes.entries()]
    .map(([name, list]) => ({ name, cases: list, done: list.filter((c) => c.done).length }))
    .sort((a, b) => b.cases.length - a.cases.length || a.name.localeCompare(b.name));
}

/** Cases whose name, book, type or industry contain every word typed. */
export function searchCases(cases: readonly LiveCatalogCase[], query: string): LiveCatalogCase[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return cases.filter((c) => words.every((w) => `${c.name} ${c.book} ${c.caseType} ${c.industry}`.toLowerCase().includes(w)));
}
