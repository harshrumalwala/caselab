/**
 * Dry case-interview humour for the odd quiet corner of the app. These are jokes, not real quotes: the "by" line says so.
 * One is picked per calendar day, so the same day always shows the same line (and tests stay steady).
 */
export interface Quip {
  text: string;
  by: string;
}

export const QUIPS: Quip[] = [
  { text: '“It depends” is not a framework.', by: 'Every interviewer, eventually' },
  { text: 'Everything is a profitability case if you stare at it long enough.', by: 'Case folklore' },
  { text: 'MECE: mutually exclusive, collectively exhausted. Also you, after case twelve.', by: 'Case folklore' },
  { text: 'A 5% error is a rounding error. A 500% error is a conversation.', by: 'Quant tip, unverified' },
  { text: "Don't boil the ocean. Boil one clearly defined lake.", by: 'Consultant proverb' },
  { text: 'Somebody has to count the piano tuners.', by: 'Market sizing, forever' },
  { text: 'Say the answer first. Your future self is already impatient.', by: 'On synthesis' },
  { text: "Clarifying questions are free. Use them like it's a buffet.", by: 'Day-one advice' },
  { text: 'If the chart looks too easy, read the axis.', by: 'Learned the hard way' },
  { text: '“So what?” is the most powerful two-word framework.', by: 'Every partner, always' },
  { text: 'Your quick recommendation should be quicker than your quick intro.', by: 'On timing' },
  { text: 'Progress isn’t linear. Neither is a break-even point, apparently.', by: 'Case folklore' },
  { text: 'One more case, then bed. (You said that an hour ago.)', by: 'Your past self' },
  { text: 'Feedback is a gift. Sometimes it comes with a gift receipt.', by: 'Case partners, kindly' },
  { text: 'Calm is a skill. File it under Behavioral.', by: 'Overheard at the library' },
  { text: 'Brainstorm in buckets, not in bullets of chaos.', by: 'On structure' },
  { text: 'The best structure is the one you can say out loud without sounding like a cult.', by: 'Mock-interview wisdom' },
  { text: 'There are only two kinds of math mistakes: the ones you catch, and the ones the interviewer does.', by: 'Quant tip, unverified' },
  { text: 'A framework is just a checklist with confidence.', by: 'Case folklore' },
  { text: 'Slow is smooth, smooth is fast, and a pause before the math is free.', by: 'On pacing' },
];

/** The line for a given day. */
export function quipOfTheDay(date: Date = new Date()): Quip {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return QUIPS[day % QUIPS.length];
}
