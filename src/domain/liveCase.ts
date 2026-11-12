import type { CaseInfo, Feedback, LiveView, Stage } from '../data/liveCase';
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
export function liveCaseToInput(view: Pick<LiveView, 'submissions' | 'endReason' | 'beatsShown' | 'beatsTotal'>, info: CaseInfo, feedback: Feedback, now: Date = new Date()): CaseInput {
  const skills = emptySkills();
  for (const { key } of SKILLS) {
    const f = feedback.skills[key];
    skills[key] = { rating: asRating(f.rating), feedback: f.feedback };
  }
  const timedOut = view.submissions.filter((s) => s.timedOut).map((s) => SUBMISSION_LABEL[s.kind] ?? s.kind);
  const notes = [
    'Practised live with Bucket: a typed, 30-minute timed case. The ratings and notes were drafted by the AI from what you wrote, so please check them and change anything that does not match how it went.',
    view.endReason === 'time_limit' ? 'The 30 minutes ran out before the end.' : '',
    timedOut.length ? `Saved as a draft when time ran out: ${timedOut.join(', ')}.` : '',
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
