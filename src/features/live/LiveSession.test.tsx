import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LiveView, Message } from '../../data/liveCase';
import { LiveSessionScreen } from './LiveSession';
import type { LiveSession } from './useLiveSession';

const NOW = Date.parse('2026-11-18T10:00:00Z');

const msg = (stage: Message['stage'], kind: Message['kind'], text: string, id = 1): Message => ({ id, at: NOW, from: 'coach', stage, kind, text });

const liveView = (over: Partial<LiveView> = {}): LiveView => ({
  sessionId: 'live-1',
  serverNow: NOW,
  startedAt: NOW - 10 * 60_000,
  endsAt: NOW + 5 * 60_000,
  stage: 'recommend_think',
  stageStartedAt: NOW,
  stageEndsAt: NOW + 30_000,
  plannedEndsAt: NOW + 30_000,
  frameworkPhase: 'framework',
  messages: [],
  exhibits: [],
  drafts: {},
  scratchpad: '',
  submissions: [],
  clarifyCount: 0,
  beatsTotal: 3,
  beatsShown: 3,
  exhibitsTotal: 3,
  hasBrainstorm: true,
  status: 'active',
  endReason: null,
  mode: 'practice',
  pausedAt: null,
  feedback: null,
  feedbackAttempts: 0,
  caseInfo: null,
  loggedCaseId: null,
  ...over,
});

/** Enough of the running case for the screen to draw itself; nothing in these tests presses anything. */
const session = () => ({ now: NOW, busy: false, pending: null, error: null }) as unknown as LiveSession;

/**
 * A thinking stage is a card and shows none of the conversation, so the thanks for the work just handed in is read back out of what
 * Bucket said as the stage opened and put in front of the stage's own line (issue #195).
 */
describe('the thanks for work handed in, on a thinking stage', () => {
  it('is said in front of the stage\'s own line when the member handed their ideas in', () => {
    const view = liveView({
      messages: [msg('brainstorm_write', 'notice', 'Write your ideas now. You have a minute and a half.'), msg('recommend_think', 'text', 'Thanks, I have your ideas.', 2)],
    });
    render(<LiveSessionScreen s={session()} view={view} />);
    expect(screen.getByText(/^Thanks, I have your ideas\./)).toBeInTheDocument();
    expect(screen.getByText(/Thanks, I have your ideas\..+/)).toBeInTheDocument(); // one thing Bucket says, with the stage's own line after it
    expect(screen.getByText('Think about your recommendation')).toBeInTheDocument();
  });

  it('is not there when the clock took the box away', () => {
    const view = liveView({ messages: [msg('brainstorm_write', 'notice', 'Write your ideas now. You have a minute and a half.')] });
    render(<LiveSessionScreen s={session()} view={view} />);
    expect(screen.queryByText(/Thanks, I have your/)).not.toBeInTheDocument();
    expect(screen.getByText('Think about your recommendation')).toBeInTheDocument();
  });
});
