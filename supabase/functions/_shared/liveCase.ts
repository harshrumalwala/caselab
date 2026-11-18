// The live case ("practise a whole case with Bucket"): the clock, the stages and the pacing rules, as plain functions over one saved state.
//
// The app and this file decide WHEN things happen: which stage the member is in, how long it lasts, when a hint is due, when the next exhibit
// comes out, and that the closing stages are always protected. The model (liveCaseCoach.ts) only writes the coach's words and judges what the
// member wrote. Everything here is deterministic, has no clock of its own (the time is always passed in) and is tested without a network.
//
// Nothing Deno-specific lives here, so the app, the Edge Function and the tests all run the same code.

export type Stage =
  | 'prompt'
  | 'framework_think'
  | 'framework_write'
  | 'exhibits'
  | 'brainstorm_think'
  | 'brainstorm_write'
  | 'recommend_think'
  | 'recommend_write'
  | 'done';

const SECOND = 1000;
/** The whole case, from the moment the prompt first appears. */
export const LIMIT_MS = 30 * 60 * SECOND;

/** The default plan: 25 minutes 30 seconds; the other 4 minutes 30 seconds are flexible time. */
export const PLANNED_MS: Record<Exclude<Stage, 'done'>, number> = {
  prompt: 3 * 60 * SECOND,
  framework_think: 90 * SECOND,
  framework_write: 3 * 60 * SECOND,
  exhibits: 15 * 60 * SECOND,
  brainstorm_think: 30 * SECOND,
  brainstorm_write: 90 * SECOND,
  recommend_think: 30 * SECOND,
  recommend_write: 90 * SECOND,
};

/** How much longer a writing stage may run for someone still typing when its time is up. */
export const WRITING_GRACE_MS = 30 * SECOND;
/** Typing within this long counts as working, not as being stuck. */
export const DRAFT_ACTIVE_MS = 20 * SECOND;
/** The exhibit discussion may run past its planned 15 minutes only while the member keeps making progress within this long. */
export const PROGRESS_WINDOW_MS = 60 * SECOND;

/** A saved response is cut to this long. */
export const MAX_RESPONSE_CHARS = 4000;

export const ORDER: Stage[] = [
  'prompt',
  'framework_think',
  'framework_write',
  'exhibits',
  'brainstorm_think',
  'brainstorm_write',
  'recommend_think',
  'recommend_write',
  'done',
];

export type DraftKey = 'clarify' | 'framework' | 'direction' | 'exhibit' | 'brainstorm' | 'recommendation';
export type SubmissionKind = 'framework' | 'direction' | 'brainstorm' | 'recommendation';
export type BeatOutcome = 'open' | 'independent' | 'hinted' | 'coach_moved' | 'member_moved' | 'timed_out';
/**
 * Practice mode can be paused and ended early; interview mode is the real thing, with the clock running from start to finish; learning mode has no
 * clock at all: nothing runs out, Bucket teaches as the case goes, and the member can stop whenever they like.
 */
export type LiveMode = 'practice' | 'interview' | 'learning';
export type NudgeLevel = 'none' | 'process_hint' | 'directional_hint' | 'lead' | 'advance';

/**
 * One part of the case to work through, in the book's own order: an exhibit the member is handed, a step of the book's analysis that has
 * no exhibit of its own and is put to them in conversation, or a brainstorm the book asks for, which is answered in its own two stages.
 * A case has whichever of the three it holds, and most hold more than one kind.
 */
export interface Beat {
  kind: 'exhibit' | 'step' | 'brainstorm';
  /** Where it is in the write-up: an exhibit's place among the exhibits, a step's (or a brainstorm's) place among the steps. */
  index: number;
  /**
   * What this part is about, from the book's own step title (never its working, and never its ideas): what a brainstorm asks for, and
   * what a step of the analysis is about, so the member is told which part they are on before they are asked to work on it. Missing on
   * an exhibit beat, on a step whose title is its own answer, and in plans saved before a step carried one.
   */
  topic?: string;
}

export interface CasePlan {
  /** The time the exhibit discussion is planned for. Plans saved before this existed use 15 minutes. */
  exhibitMs?: number;
  /** The whole case. Plans saved before this existed use 30 minutes. */
  limitMs?: number;
  beats: Beat[];
  hasBrainstorm: boolean;
  /** What the first brainstorm is about. Each brainstorm beat carries its own topic; this is what a brainstorm with no beat of its own uses. */
  brainstormTopic: string;
}

/** The little the plan needs to know about a case's write-up. */
export interface PlanSource {
  exhibits: readonly { title?: string; caption?: string; columns?: readonly string[]; rows?: readonly (readonly string[])[] }[];
  steps: readonly { title: string }[];
}

const BRAINSTORM = /brainstorm/i;
/**
 * The head of a brainstorm's title: the word itself, the book's numbering of it, and whatever separates that from the subject. The
 * screen puts "Brainstorm:" in front of the topic, so all of this has to come off, numbering included — "Brainstorm #1: Revenue
 * factors" is the book's way of telling two of them apart in print, and means nothing to the member being asked the question.
 *
 * The number comes off only when something separates it from the subject ("Brainstorm #1: ...", "Brainstorm 2 - ..."), so a title that
 * counts what it is asking for ("Brainstorm 3 ways to cut cost") keeps its own words.
 */
const BRAINSTORM_HEAD = /^\s*brainstorms?(?:ing)?\b[\s:.)\]\-–—]*(?:#\s*)?(?:\d{1,2}(?=\s*[:.)\]\-–—]|\s*$))?[\s:.)\]\-–—]*/i;
/** What a brainstorm asks for, in words a member can read: the book's own step title with its heading and numbering taken off. */
export const brainstormTopic = (title: string): string => title.replace(BRAINSTORM_HEAD, '').trim();
/** The same, for a brainstorm the write-up holds only as a table of ideas, whose title may name the exhibit first ("Exhibit 3: brainstorm ideas"). */
const tableTopic = (title: string): string => {
  const head = brainstormTopic(title);
  if (head !== title.trim()) return head;
  return title.includes(':') ? title.slice(title.indexOf(':') + 1).trim() : '';
};

/**
 * One number the books put on a step: "3", "3B", a roman numeral, or a bare letter. The roman numeral and the letter are followed by a
 * lookahead rather than a word boundary, because on their own they are also ordinary words ("Part is the key", "Phase in the new rota"):
 * they only count as numbering when the thing that separates the number from the subject comes next.
 */
const STEP_NUMBER = String.raw`(?:\d{1,2}[a-z]?|(?:i{1,3}|iv|vi{0,3}|ix|xi{0,2})(?=\s*[:.,)\](\-–—])|[a-z](?=\s*[:.,)\](\-–—]))`;
/** The numbering of a step that covers two of them at once ("Exhibits 1 and 2:", "Scenarios 2a and 2b:", "Steps 1 to 3:"). */
const STEP_NUMBERS = String.raw`${STEP_NUMBER}(?:\s*(?:and|&|,|to|through|[-–—/])\s*#?\s*${STEP_NUMBER})*`;
/** What the book hangs on its own numbering rather than on the subject: "Question 3 (optional):", "Step 2 (continued):", "Question 1 guidance:". */
const STEP_HEAD_TAIL = String.raw`(?:\s*\([^()]{1,24}\)|\s+(?:continued|cont|guidance))?`;
/** What has to come between the numbering and the subject for the numbering to be numbering at all. */
const STEP_HEAD_SEP = String.raw`\s*[:.,)\]\-–—]\s*`;
/** The nouns a step is numbered with that the books also use as ordinary words, so they come off only when a number follows them. */
const NUMBERED_NOUN = String.raw`(?:phases?|buckets?|analys[ei]s|options?|alternatives?|scenarios?|approach(?:es)?|ideas?|streams?|decisions?|answers?|data)`;
/** The nouns that head the book's numbering of a step, which come off with or without a number ("Question:", "Exhibit 2,"). */
const STEP_NOUN = String.raw`(?:questions?|q|parts?|steps?|sections?|prompts?|exhibits?|figures?|tables?|follow[-\s]?ups?)`;
/**
 * The book's own numbering of a step in print — "Question 3B:", "Q2.", "Part C -", "Step 1:", "Prompt #2, Question 1:", "Exhibit 2,
 * question 3:", "Part II:", "Phase 2A:", "Math question 1:", "Question 3 (optional):", "Exhibits 1 and 2:" — which tells the member
 * nothing about the part they are on. As with a brainstorm's head, the number comes off only when something separates it from the
 * subject, so a title that is a phrase of its own ("Question 4 and recommendation", "Parts and labour", "Break-even, part 1: fixed cost
 * only", "5 Cs: finding alternatives") keeps its own words.
 *
 * Two things widen it past the plain noun. A word of the book's own in front of the noun comes off with it ("Math question 2:",
 * "Work stream 1:", "Case data 3:"), because it is part of how the book numbers the step and not part of the subject. And a second list
 * of nouns — the ones a book also uses as ordinary words — comes off only when a number follows ("Phase 3:", "Bucket 1:", "Option 2:"),
 * so a step headed "Decision:" or "Analysis:" keeps its word.
 */
const STEP_HEAD = new RegExp(
  // The noun is followed by a lookahead rather than a word boundary, because "Q2" runs the two together.
  String.raw`^\s*(?:(?:[a-z][a-z'’]*\s+)?(?:${STEP_NOUN}(?![a-z])[\s#]*(?:${STEP_NUMBERS})?|${NUMBERED_NOUN}(?![a-z])[\s#]*(?:${STEP_NUMBERS}))${STEP_HEAD_TAIL}${STEP_HEAD_SEP})+`,
  'i',
);
/**
 * A title that answers the part instead of naming it. The books head a step both ways: most say what is to be worked out ("Break-even
 * volume", "Should the client invest?"), and some say what the working found ("Why the suburban shops lag", "Demand is driven by end
 * users"). The second kind is the member's own conclusion to reach, so it is never put on screen — the part keeps the opening line
 * that asks the question without naming it.
 */
const TITLE_IS_THE_ANSWER =
  /\bwhy\b|\bbecause\b|\bdue to\b|\b(?:driven|caused) by\b|\bexplain(?:s|ed)\b|\bconfirm\w*\b|\bturns out\b|\bin fact\b|\b(?:lacks?|lags?|lagging|underperform\w*|outperform\w*)\b/i;
/** The longest topic a member reads in one breath at the top of a part. Past this a title is a sentence rather than a subject. */
const MAX_TOPIC_CHARS = 80;
/** One title made comparable with another: lower case, one space between words. */
const normTitle = (title: string): string => title.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * What a part of the analysis is about, in words the member can read: the book's own step title with its numbering taken off — and
 * nothing at all when that title holds the answer, or is too long or too thin to be a subject. Only the title is ever used: a step's
 * `body`, `calc`, `whatToNotice`, `commonMiss` and `checkYourself` stay on the interviewer's side.
 */
export function stepTopic(title: string): string {
  if (TITLE_IS_THE_ANSWER.test(title)) return '';
  const topic = title.replace(STEP_HEAD, '').trim().replace(/\s+/g, ' ');
  return topic.length < 3 || topic.length > MAX_TOPIC_CHARS ? '' : topic;
}
// A step that is only about building the framework ("Framework", "Framework for revenue growth", "Framework: what to weigh", "Structure the problem"): the framework
// has its own stages, so it is not discussed again. ("Framework and Exhibit 1" has more in it, so it stays.)
const FRAMEWORK_STEP = /^\s*(framework|structure|structuring|clarifying questions?)(\s+for\b.*|\s*[:/].*|\s+the\s+(problem|approach|project)\b.*)?\s*$/i;
/**
 * A step that is the case's closing answer. The recommendation has two stages of its own at the end, so it is not also worked through in
 * the middle. The books head this step in many ways — "Recommendation", "Final recommendation", "Synthesis", "Conclusion to the CEO",
 * "Wrap-up and next steps", "Summary for the CEO", "Answer" — so what is read is the **head** of the title, not the whole of it: a step
 * that happens to use one of those words further along ("Close or invest: the ROIC test", "Closing the payback gap") is analysis and
 * keeps its beat.
 */
const RECOMMENDATION_STEP =
  /^\s*(?:(?:the|a|an|final|overall|closing|client'?s?)\s+)*(?:recommendations?|recommend|recommending|recommended|synthesis|synthesise|synthesize|synthesizing|conclusions?|conclude|concluding|wrap[-\s]?ups?|summary|summaries|summarise|summarize|verdict)\b/i;
/** "Answer" is the one of these words the books also use as a verb ("Answer the board's question on capacity"), so it closes a case only when it is the whole of the title. */
const ANSWER_STEP = /^\s*(?:the\s+|final\s+|your\s+)?answers?\s*[:.\-–—]?\s*$/i;
/** The same step said as a phrase rather than a heading ("Closing the case", "Bringing it all together"). */
const CLOSING_PHRASE = /^\s*(?:closing the case|(?:bring|pull|put|tie)(?:ing)?\s+it\s+(?:all\s+)?together|(?:bringing|pulling|putting|tying)\s+it\s+(?:all\s+)?together)\b/i;
const isRecommendationStep = (title: string): boolean => RECOMMENDATION_STEP.test(title) || ANSWER_STEP.test(title) || CLOSING_PHRASE.test(title);

/**
 * The book's own label for an exhibit, wherever it sits in a title: "Exhibit 2: ...", "Exhibit #1", "Financial analysis: Exhibit 1",
 * "Luxury market trend (Exhibit 1)", "Figure 3", "Table B". The books use the nouns interchangeably, so only the number or letter is
 * kept: a step that says "Table 1" and an exhibit called "Exhibit 1" are the same thing in every write-up we have. A label that is a
 * letter on its own has to be separated from the noun ("Exhibit B", "Exhibit #B"), so that the plural of the noun is not read as one
 * ("Read the exhibits and split the population" names no exhibit).
 */
const EXHIBIT_LABEL_ANYWHERE = /\b(?:exhibits?|exh|figures?|figs?|appendix|appendices|attachments?|charts?|tables?|graphs?)\s*#?\s*(\d{1,2}[a-z]?|(?<=[\s#])[a-z])\b/gi;
const exhibitLabels = (title: string): string[] => [...title.matchAll(EXHIBIT_LABEL_ANYWHERE)].map((m) => m[1].toLowerCase());

/**
 * A step the framework stages have already done, read the same way as the closing recommendation: by the **head** of the title. The
 * books write this step as "Framework and hypothesis", "Framework and the two parts of the case", "Clarifying questions and the goal",
 * "Structure / where to start" — the framework word first, then a connector. A member who has just written a framework and handed it in
 * should not meet it again as the first thing to work through.
 *
 * Two kinds of title keep their beat. One that only mentions a framework further along ("Revisiting the framework after Exhibit 2",
 * "Pick the framework", "Hypothesis and framework") is not headed by it, so the rule never sees it. And one that goes on to name a book
 * exhibit ("Framework and Exhibit 1") has an exhibit's worth of work in it, which is the exception the comment on `FRAMEWORK_STEP` has
 * always made.
 */
const FRAMEWORK_HEAD = /^\s*(?:framework|structure|structuring|clarifying\s+questions?)\s*(?:$|[:\-–—,;/()]|&|\b(?:and|plus|with|then|for|of|to)\b)/i;
const isFrameworkStep = (title: string): boolean => FRAMEWORK_STEP.test(title) || (FRAMEWORK_HEAD.test(title) && exhibitLabels(title).length === 0);

/** Words that say nothing about what a step or an exhibit is about, so they do not count towards two titles being the same subject. */
const SUBJECT_FILLER = new Set([
  'the', 'and', 'for', 'with', 'per', 'its', 'what', 'why', 'how', 'are', 'does', 'you', 'your', 'this', 'that', 'from', 'vs', 'versus',
  'into', 'over', 'under', 'about', 'case', 'step', 'steps', 'part', 'parts', 'analysis', 'analyse', 'analyze', 'exhibit', 'exhibits',
  'figure', 'chart', 'table', 'appendix', 'attachment', 'data', 'question', 'questions', 'client',
]);
/** What a title is about: its own content words, lower-cased, with the filler and anything under three letters dropped. */
const subjectWords = (title: string): Set<string> =>
  new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !SUBJECT_FILLER.has(w)),
  );
/** Two titles are about the same thing when the shorter one's content words are (almost) all in the longer one's. */
const SAME_SUBJECT = 0.8;
function sameSubject(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.min(a.size, b.size) >= SAME_SUBJECT;
}

/**
 * Which exhibit a step is the discussion of, as a place in the candidate list, or -1 for a step that stands on its own. The only link
 * between the two lists in a write-up is what the step calls itself, so it is read in two ways:
 *
 *  - **The book's label settles it.** "Exhibit 2: why the suburban shops lag" is the discussion of Exhibit 2 and nothing else. A step
 *    that names an exhibit the member is never handed (the interviewer's own) matches nothing and keeps its beat: it is then the only
 *    place that analysis happens.
 *  - **Otherwise the subject does.** "Cost structure" beside an exhibit called "Cost structure of the client" is the same thing said
 *    twice. A duplicated beat is worse than a dropped one, so the doubt goes this way: a step that shares nearly all of its words with
 *    an exhibit is that exhibit's beat.
 */
function stepsAbout(title: string, labels: readonly string[][], words: readonly Set<string>[]): number {
  const named = exhibitLabels(title);
  if (named.length > 0) return labels.findIndex((l) => named.some((n) => l.includes(n)));
  const mine = subjectWords(title);
  return words.findIndex((w) => sameSubject(mine, w));
}

/**
 * Some of a write-up's tables are the interviewer's own: guidance, solutions, a sample approach, "calculation to be performed by the candidate",
 * a list of brainstorm ideas. They are never shown to the member (they would give the case away); they are reference for Bucket only.
 *
 * A title says so in one of two ways. A **hard** marker belongs to the interviewer's sheet wherever it turns up, so it hides a table on its
 * own. A **soft** marker is a word the books also put in the titles of exhibits they hand the candidate ("Exhibit D – Expected Claims Per
 * Years of Warranty", "Exhibit 3: Annual Cost Calculation"), so on its own it hides a table only when the title is not the book's own name
 * for an exhibit (see `namesABookExhibit`). Hiding a candidate exhibit is still the safer way to be wrong (PR #70): a title that is not the
 * book's own name for an exhibit is hidden exactly as before, and one that is stays hidden by a hard marker, or by what its caption,
 * column headings or cells say.
 */
// ("Interviewee" is deliberately not here, though it is a caption and column marker: in a title it means the opposite — "Interviewee
// Handout", "Data for interviewee" is the sheet the candidate is given.)
const HARD_INTERVIEWER_SIDE = /interviewer|guidance|\bguide\b|\bsolution\b|performed by|answer key|keep private|not for (the )?candidate/i;
/** Matches every soft marker in a title, so that one list both spots them and takes them out. */
const SOFT_INTERVIEWER_SIDE = /sample|approach|answer|brainstorm|expected|calculation|\bmath\b/gi;
/**
 * The book's own numbering of an exhibit ("Exhibit 1:", "Exhibit #3 -", "Exhibit D – ...", "Figure 2", "Appendix A"). The number has to end
 * the title or be followed by a separator: "Exhibit 1 calculation" names the book's working *for* Exhibit 1, not the exhibit itself.
 */
const BOOK_EXHIBIT_LABEL = /^\s*(?:case\s+)?(?:exhibit|exh\.|figure|fig\.|appendix|attachment|chart|table)\s*#?\s*(?:\d+\s*[a-z]?|[a-z])\s*(?:[:.)\]|,\-–—]|$)/i;
/** Words that say nothing about what is in a table, so they do not count as naming its subject. */
const TITLE_FILLER = /\b(?:the|a|an|and|or|of|for|to|in|on|at|by|with|per|its|only|detail|details|exercise|table|tables|sheet|sheets|page|pages|part|step|steps|question|questions|notes?|summary|workings?|work)\b/gi;
/**
 * Is this title the book's own name for an exhibit the candidate is given? It has to start with the book's numbering **and** go on to say
 * what the table is about: "Exhibit 1: Answers" and "Exhibit 3: Calculations" name the book's working for an exhibit rather than an
 * exhibit, so they keep no exemption, while "Exhibit 3: Annual Cost Calculation" is a table of annual costs.
 */
const namesABookExhibit = (title: string, withoutSoftMarkers: string): boolean =>
  BOOK_EXHIBIT_LABEL.test(title) && /[a-z]{2,}/i.test(withoutSoftMarkers.replace(BOOK_EXHIBIT_LABEL, ' ').replace(TITLE_FILLER, ' '));
/** "Solutions" is the interviewer's when it is the book's answer ("Solutions to Exhibit 2"), but not when it is what the case is about ("Exhibit 1: Current solutions for retirees"). */
const SOLUTIONS_OF_THE_CASE = /\b(current|existing|possible|potential|alternative|competing|available|other|rival|today'?s)\s+solutions\b/i;
export const isInterviewerSide = (title: string): boolean => {
  if (HARD_INTERVIEWER_SIDE.test(title)) return true;
  if (/\bsolutions\b/i.test(title) && !SOLUTIONS_OF_THE_CASE.test(title)) return true;
  const withoutSoftMarkers = title.replace(SOFT_INTERVIEWER_SIDE, ' ');
  if (withoutSoftMarkers === title) return false;
  return !namesABookExhibit(title, withoutSoftMarkers);
};

/** Words in a table's caption, column headings or cells that mark it as the interviewer's sheet ("Information for Interviewee", "Keep Private", "interviewer's math page"). */
const INTERVIEWER_WORDS = /keep private|interviewee|interviewer|not for (the )?candidate|only when the candidate asks|given if prompted/i;

/** How a caption says the table is the book's own working or answer (the ordinary words "solution" and "working" are not enough on their own). */
const SOLUTION_CAPTION = /solution page|solution table|book'?s (working|solution|sizing|math)|\bworking for\b|completed in the book|math solution|guidance for/i;
/** A cell that gives the answer away. */
const ANSWER_CELL = /\(answer\b|answer key/i;

/** A table the member must not see: the interviewer's by its title, or by what its caption, headings or cells say. */
export function isInterviewerSideExhibit(e: { title?: string; caption?: string; columns?: readonly string[]; rows?: readonly (readonly string[])[] }): boolean {
  if (isInterviewerSide(e.title ?? '')) return true;
  if (INTERVIEWER_WORDS.test(e.caption ?? '') || SOLUTION_CAPTION.test(e.caption ?? '')) return true;
  if ((e.columns ?? []).some((c) => INTERVIEWER_WORDS.test(c))) return true;
  return (e.rows ?? []).slice(0, 80).some((r) => r.some((c) => INTERVIEWER_WORDS.test(c) || ANSWER_CELL.test(c)));
}

/**
 * How the exhibit discussion is sized: a few minutes to settle into the data section, plus a few for every thing to work through.
 * Four beats comes to exactly the 20 minutes every case used to get, so the common sizes are undisturbed; the ceiling is the 25 minutes
 * the longest cases already had.
 */
const EXHIBIT_SETUP_MS = 4 * 60 * SECOND;
const EXHIBIT_PER_BEAT_MS = 4 * 60 * SECOND;
/** A case with something to work through never gets less than this (the formula's own value at one beat), nor more than the ceiling. */
const EXHIBIT_MIN_MS = 8 * 60 * SECOND;
const EXHIBIT_MAX_MS = 25 * 60 * SECOND;
/** Everything around the discussion: 7:30 of prompt and framework, 4:00 the closing stages need (one brainstorm and the recommendation), 3:30 of flexible time. */
const AROUND_EXHIBITS_MS = 15 * 60 * SECOND;
/** One brainstorm, thinking and writing. */
const BRAINSTORM_MS = PLANNED_MS.brainstorm_think + PLANNED_MS.brainstorm_write;

/**
 * The time a case is planned for, from how much it has in it: the parts of the discussion, which a brainstorm is not one of (it has two
 * stages of its own). A case with nothing to work through has no exhibit stage at all, so it is given no exhibit time; the opening, the
 * closing and the flexible time are the same for every case, which is what keeps the closing stages safe at any size.
 *
 * **A second brainstorm does not make the case longer** (issue #133). The whole case is the same length it has always been for its size,
 * and every brainstorm after the first takes its two minutes out of the discussion instead: 40 minutes is the ceiling issue #82 set, and
 * the 21 cases of 847 that ask for two brainstorms are not a reason to raise it. Written this way the plan always leaves the same 3:30 of
 * flexible time, whatever a case holds.
 */
function planTimes(beats: number, brainstorms: number): { exhibitMs: number; limitMs: number } {
  const planned = beats <= 0 ? 0 : Math.min(Math.max(EXHIBIT_SETUP_MS + beats * EXHIBIT_PER_BEAT_MS, EXHIBIT_MIN_MS), EXHIBIT_MAX_MS);
  return { exhibitMs: Math.max(0, planned - Math.max(0, brainstorms - 1) * BRAINSTORM_MS), limitMs: planned + AROUND_EXHIBITS_MS };
}

/**
 * What the member works through, in the book's own order: every exhibit meant for the candidate, and every step of the book's analysis
 * that has no exhibit of its own.
 *
 * The two lists are ordered but nothing in a write-up says how they interleave, so the steps that name their exhibit are the sync
 * points: an exhibit comes out where the step that discusses it sits, and that step is not a beat of its own (the exhibit's beat is
 * its discussion). Three rules keep the result predictable:
 *
 *  - The exhibits come out in the write-up's order, always, and so do the steps; neither list is ever shuffled.
 *  - An exhibit no step claims is handed over before the step beats that would otherwise come between it and the next exhibit a step
 *    does claim — so in a case where nothing names anything (there is no link in the data to read), the exhibits are worked through
 *    first, exactly as they are today, and the steps that used to be dropped follow them.
 *  - A step whose work another stage does is left out: the framework and the closing recommendation.
 *
 * A brainstorm the book asks for is a part like any other and keeps its place in that order (issue #133): the books often ask for the
 * ideas *before* the exhibit that shows which of them the client chose, and a brainstorm run after it has nothing left to brainstorm.
 * It is answered in its own two stages rather than in the discussion, so it is marked as its own kind of beat and never claims an
 * exhibit.
 */
function planBeats(solution: PlanSource): Beat[] {
  const candidates = solution.exhibits.flatMap((e, index) => (isInterviewerSideExhibit(e) ? [] : [{ index, title: e.title ?? '' }]));
  const labels = candidates.map((c) => exhibitLabels(c.title));
  const words = candidates.map((c) => subjectWords(c.title));
  // What the member is never told the name of: the interviewer's own tables (issue #95). Some books head a step with the title of the
  // table the interviewer works it from, so a topic that names one is dropped and the part keeps the line that names nothing.
  const hiddenNames = solution.exhibits
    .filter((e) => isInterviewerSideExhibit(e))
    .flatMap((e) => [e.title ?? '', e.caption ?? ''])
    .map(normTitle)
    .filter(Boolean);
  const namesAHiddenTable = (topic: string): boolean => {
    const t = normTitle(topic);
    return hiddenNames.some((h) => h.includes(t) || t.includes(h));
  };

  // Which step discusses which exhibit, and which steps are a beat of their own.
  const claims = new Map<number, number>(); // step -> place in `candidates`
  const taken = new Set<number>();
  const ownBeat = new Set<number>();
  const brainstorms = new Set<number>();
  solution.steps.forEach((s, index) => {
    const title = s.title ?? '';
    if (BRAINSTORM.test(title)) {
      brainstorms.add(index);
      return;
    }
    if (isFrameworkStep(title) || isRecommendationStep(title)) return;
    const about = stepsAbout(title, labels, words);
    if (about >= 0) {
      // Two steps on one exhibit (reading it, then its implication) are still that exhibit's single beat: the second adds nothing new
      // to work through, and a beat the member meets twice is worse than one they never meet.
      if (!taken.has(about)) {
        claims.set(index, about);
        taken.add(about);
      }
      return;
    }
    ownBeat.add(index);
  });

  // The next exhibit a later step claims, read backwards over the steps: everything before it that nobody claimed comes out first.
  const nextClaim: number[] = [];
  let soonest = candidates.length;
  for (let i = solution.steps.length - 1; i >= 0; i -= 1) {
    nextClaim[i] = soonest;
    const claimed = claims.get(i);
    if (claimed !== undefined) soonest = Math.min(soonest, claimed);
  }

  const beats: Beat[] = [];
  let next = 0;
  const handOverUpTo = (stop: number): void => {
    while (next < stop) {
      beats.push({ kind: 'exhibit', index: candidates[next].index });
      next += 1;
    }
  };
  solution.steps.forEach((s, index) => {
    const claimed = claims.get(index);
    if (claimed !== undefined) {
      handOverUpTo(claimed + 1);
      return;
    }
    if (brainstorms.has(index)) {
      handOverUpTo(nextClaim[index]);
      beats.push({ kind: 'brainstorm', index, topic: brainstormTopic(s.title ?? '') });
      return;
    }
    if (!ownBeat.has(index)) return;
    handOverUpTo(nextClaim[index]);
    const topic = stepTopic(s.title ?? '');
    beats.push(topic && !namesAHiddenTable(topic) ? { kind: 'step', index, topic } : { kind: 'step', index });
  });
  handOverUpTo(candidates.length);
  return beats;
}

export function buildPlan(solution: PlanSource): CasePlan {
  const brainstormTable = solution.exhibits.find((e) => BRAINSTORM.test(e.title ?? ''));
  const beats = planBeats(solution);
  const brainstorms = beats.filter((b) => b.kind === 'brainstorm');
  // A brainstorm the write-up holds only as a table of ideas has no step to place it, so it stays where it has always been: at the end,
  // after the discussion.
  const trailing = brainstorms.length === 0 && Boolean(brainstormTable);
  // More to cover, more time: the case is as long as there is to work through, up to the 25-in-40 the busiest cases always had.
  return {
    ...planTimes(beats.length - brainstorms.length, brainstorms.length + (trailing ? 1 : 0)),
    beats,
    hasBrainstorm: brainstorms.length > 0 || trailing,
    brainstormTopic: brainstorms[0]?.topic ?? (trailing ? tableTopic(brainstormTable?.title ?? '') : ''),
  };
}

export interface Message {
  id: number;
  at: number;
  from: 'coach' | 'user';
  stage: Stage;
  kind: 'text' | 'hint' | 'exhibit' | 'notice';
  text: string;
  /** For an exhibit: its place in the plan's beats. */
  beat?: number;
}

export interface BeatRecord {
  /** Place in `plan.beats`. */
  index: number;
  revealedAt: number;
  /** The last time the member made progress here (or when it was revealed). Hints and the move-on rule count from it. */
  lastProgressAt: number;
  /** The last time the member wrote to Bucket about this exhibit (or when it appeared). */
  lastUserAt: number;
  lastNudgeAt: number;
  /** The time this one is worth, set when it comes out from what is left. */
  budgetMs: number;
  hints: number;
  userMessages: number;
  /** Messages the member has sent on this exhibit since they last made clear progress on it, not counting the ones that asked for data. How far up the help ladder they are. (Missing in sessions saved before this was kept: counts as none.) */
  asked?: number;
  /** Messages in a row scored 'partial' on this exhibit, since the last clear step forward, not counting the ones that asked for data. What tells nearly-there from circling (issue #184). (Missing in sessions saved before this was kept: counts as none.) */
  partials?: number;
  outcome: BeatOutcome;
}

export interface Submission {
  kind: SubmissionKind;
  text: string;
  at: number;
  /** A draft captured when time ran out, not something the member handed in. */
  timedOut: boolean;
}

export interface StageLogEntry {
  stage: Stage;
  startedAt: number;
  endedAt: number | null;
  endedBy: 'user' | 'timer' | 'coach' | 'limit' | null;
}

/** What the model used for this case, summed over its calls, so the real cost can be read back (see the README). */
export interface Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SessionState {
  version: 1;
  usage?: Usage;
  /** Bumped by every change, so a late reply from the model can tell that the session moved on. */
  rev: number;
  startedAt: number;
  plan: CasePlan;
  stage: Stage;
  stageStartedAt: number;
  frameworkPhase: 'framework' | 'direction';
  messages: Message[];
  drafts: Partial<Record<DraftKey, string>>;
  lastDraftAt: number;
  scratchpad: string;
  submissions: Submission[];
  beats: BeatRecord[];
  stageLog: StageLogEntry[];
  clarifyCount: number;
  directionFollowUps: number;
  endedAt: number | null;
  endReason: 'completed' | 'time_limit' | 'ended_early' | null;
  /** When the member paused the case: the clock stands still until they continue. Missing or null when it is running. */
  pausedAt?: number | null;
  /** How many times the case has been paused. */
  pauses?: number;
  /** Missing (a case from before there were modes) counts as practice. */
  mode?: LiveMode;
}

/** A learning case has no clock: no stage, and not the case, ever runs out. */
export const isUntimed = (s: Pick<SessionState, 'mode'>): boolean => s.mode === 'learning';

export const hardEnd = (s: SessionState): number => s.startedAt + (s.plan.limitMs ?? LIMIT_MS);
const exhibitPlanned = (s: SessionState): number => s.plan.exhibitMs ?? PLANNED_MS.exhibits;
const stageIndex = (stage: Stage): number => ORDER.indexOf(stage);
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);
const clip = (t: string): string => t.replace(/\r\n/g, '\n').trim().slice(0, MAX_RESPONSE_CHARS);

/** Adds one model call's tokens to the case's running total. Not a change the member can see, so the revision stays as it is. */
export function addUsage(state: SessionState, used: Partial<Omit<Usage, 'calls'>> | undefined): SessionState {
  if (!used) return state;
  const s = structuredClone(state);
  const u = s.usage ?? { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  s.usage = {
    calls: u.calls + 1,
    inputTokens: u.inputTokens + (used.inputTokens ?? 0),
    outputTokens: u.outputTokens + (used.outputTokens ?? 0),
    cacheReadTokens: u.cacheReadTokens + (used.cacheReadTokens ?? 0),
    cacheWriteTokens: u.cacheWriteTokens + (used.cacheWriteTokens ?? 0),
  };
  return s;
}

export function newSession(plan: CasePlan, now: number, promptText: string, mode: LiveMode = 'practice'): SessionState {
  const s: SessionState = {
    version: 1,
    mode,
    rev: 0,
    startedAt: now,
    plan,
    stage: 'prompt',
    stageStartedAt: now,
    frameworkPhase: 'framework',
    messages: [],
    drafts: {},
    lastDraftAt: 0,
    scratchpad: '',
    submissions: [],
    beats: [],
    stageLog: [{ stage: 'prompt', startedAt: now, endedAt: null, endedBy: null }],
    clarifyCount: 0,
    directionFollowUps: 0,
    endedAt: null,
    endReason: null,
  };
  say(s, now, promptText, 'notice');
  return s;
}

function say(s: SessionState, at: number, text: string, kind: Message['kind'], beat?: number, from: Message['from'] = 'coach'): void {
  const id = (s.messages[s.messages.length - 1]?.id ?? 0) + 1;
  s.messages.push({ id, at, from, stage: s.stage, kind, text, ...(beat === undefined ? {} : { beat }) });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The part of the plan the case has reached: every beat before it has been worked through, or passed over when the clock took it. The
 * beats are worked through in order, so the last one started says where the case is.
 */
const beatPointer = (s: SessionState): number => (s.beats.length === 0 ? 0 : s.beats[s.beats.length - 1].index + 1);

/**
 * The brainstorms the case has still to run. A plan with no brainstorm beat of its own and a brainstorm all the same (a write-up whose
 * brainstorm is only a table of ideas, or a case saved before the brainstorm had a place in the plan) has the one it always had, at
 * the end, until it has been run.
 */
function brainstormsLeft(s: SessionState): number {
  if (!s.plan.beats.some((b) => b.kind === 'brainstorm')) {
    return s.plan.hasBrainstorm && !s.stageLog.some((e) => e.stage === 'brainstorm_think') ? 1 : 0;
  }
  const from = beatPointer(s);
  return s.plan.beats.filter((b, i) => i >= from && b.kind === 'brainstorm').length;
}

/** How much of the discussion's time has already been used. A brainstorm in the middle splits it in two, and both halves come out of it. */
const exhibitSpent = (s: SessionState): number =>
  s.stageLog.reduce((total, e) => (e.stage === 'exhibits' && e.endedAt !== null ? total + Math.max(0, e.endedAt - e.startedAt) : total), 0);

/** What is still to come after this stage, in the planned time (the writing and thinking stages that have not happened yet). */
function laterPlanned(s: SessionState, stage: Stage): number {
  let total = 0;
  for (const next of ORDER.slice(stageIndex(stage) + 1)) {
    if (next === 'done') continue;
    if (next === 'exhibits') {
      if (s.plan.beats.length === 0) continue;
      total += Math.max(0, exhibitPlanned(s) - exhibitSpent(s));
      continue;
    }
    if (next === 'brainstorm_think' || next === 'brainstorm_write') {
      total += PLANNED_MS[next] * brainstormsLeft(s);
      continue;
    }
    total += PLANNED_MS[next];
  }
  return total;
}

/** The time the closing stages need at the least: every brainstorm the case has not run yet, and the recommendation. */
function closingNeeded(s: SessionState): number {
  return laterPlanned(s, 'exhibits');
}

/**
 * What is left of the discussion at `at`: its own planned time, less what it has already used, and never the time the closing stages
 * need. A learning case has no clock, so there is always more.
 */
const exhibitLeft = (s: SessionState, at: number): number =>
  isUntimed(s) ? Number.POSITIVE_INFINITY : Math.min(exhibitPlanned(s) - exhibitSpent(s), hardEnd(s) - closingNeeded(s) - at);

/** Less than this left is not worth picking the discussion up again for: it is the least a beat is ever given. */
const MIN_BEAT_MS = 30 * SECOND;

export interface Deadlines {
  /** The planned end. */
  soft: number;
  /** The latest end, using flexible time but never the time the closing stages need. */
  hard: number;
}

export function deadlines(s: SessionState, stage: Stage, startAt: number): Deadlines {
  const end = hardEnd(s);
  if (stage === 'done') return { soft: end, hard: end };
  if (stage === 'exhibits') {
    const latest = Math.max(startAt, end - closingNeeded(s));
    // What the discussion has left, not its whole planned time: a brainstorm in the middle of a case splits it into two sittings.
    return { soft: Math.min(startAt + Math.max(0, exhibitPlanned(s) - exhibitSpent(s)), latest), hard: latest };
  }
  const soft = Math.min(startAt + PLANNED_MS[stage], end);
  const writing = stage === 'framework_write' || stage === 'brainstorm_write' || stage === 'recommend_write';
  return { soft, hard: writing ? Math.min(soft + WRITING_GRACE_MS, Math.max(soft, end - laterPlanned(s, stage))) : soft };
}

const WRITING_DRAFT: Partial<Record<Stage, DraftKey>> = {
  framework_write: 'framework',
  brainstorm_write: 'brainstorm',
  recommend_write: 'recommendation',
};

function writingKey(s: SessionState): DraftKey | undefined {
  if (s.stage === 'framework_write') return s.frameworkPhase === 'direction' ? 'direction' : 'framework';
  return WRITING_DRAFT[s.stage];
}

export const openBeat = (s: SessionState): BeatRecord | undefined => s.beats.find((b) => b.outcome === 'open');

/** When the current stage ends if nothing else happens. It can move later while the member is typing or making progress (never past `hard`). */
export function stageEndsAt(s: SessionState): number {
  if (s.stage === 'done') return s.endedAt ?? hardEnd(s);
  const d = deadlines(s, s.stage, s.stageStartedAt);
  if (s.stage === 'exhibits') {
    const b = openBeat(s);
    return b ? clamp(b.lastProgressAt + PROGRESS_WINDOW_MS, d.soft, d.hard) : d.soft;
  }
  const key = writingKey(s);
  if (key && d.hard > d.soft && (s.drafts[key] ?? '').trim() && s.lastDraftAt > d.soft - DRAFT_ACTIVE_MS) return d.hard;
  return d.soft;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Moving between stages
// ---------------------------------------------------------------------------------------------------------------------------

const LINES = {
  prompt_ready: 'Framework time. You have 90 seconds to think about your structure. I will not interrupt, and your scratchpad is yours alone.',
  framework_write: 'Time to write. Put your framework down, then tell me where you would start.',
  direction: 'Thanks. Where would you start, and what would you want to understand first?',
  brainstorm_think: (topic: string) => `Brainstorm${topic ? `: ${topic}` : ''}. You have 30 seconds to think before you write.`,
  brainstorm_write: 'Write your ideas now. You have a minute and a half.',
  recommend_think: 'Time to bring it together. You have 30 seconds to think about your recommendation, using what you have worked through.',
  recommend_write: 'Write your recommendation now. You have a minute and a half.',
  wrap_up: 'Let us move to your recommendation using what you have so far.',
  to_brainstorm: 'Let us move on to brainstorming.',
};

/** The same lines without a stopwatch in them: a learning case has no time to give. */
const LEARNING_LINES: Partial<typeof LINES> = {
  prompt_ready: 'Framework time. Take as long as you like to think about your structure, and use your scratchpad. Choose "Ready to write" when you want to put it down.',
  brainstorm_think: (topic: string) => `Brainstorm${topic ? `: ${topic}` : ''}. Take a moment to think before you write, as long as you like.`,
  brainstorm_write: 'Write your ideas now. There is no rush.',
  recommend_think: 'Time to bring it together. Take as long as you like to think about your recommendation, using what you have worked through.',
  recommend_write: 'Write your recommendation now. There is no rush.',
};

const line = <K extends keyof typeof LINES>(s: SessionState, key: K): (typeof LINES)[K] => ((isUntimed(s) ? LEARNING_LINES[key] : undefined) ?? LINES[key]) as (typeof LINES)[K];

function logEnd(s: SessionState, at: number, by: StageLogEntry['endedBy']): void {
  const last = s.stageLog[s.stageLog.length - 1];
  if (last && last.endedAt === null) {
    last.endedAt = at;
    last.endedBy = by;
  }
}

function startStage(s: SessionState, stage: Stage, at: number): void {
  s.stage = stage;
  s.stageStartedAt = at;
  s.stageLog.push({ stage, startedAt: at, endedAt: null, endedBy: null });
  if (stage === 'framework_think') say(s, at, line(s, 'prompt_ready'), 'notice');
  else if (stage === 'framework_write') say(s, at, LINES.framework_write, 'notice');
  else if (stage === 'brainstorm_think') say(s, at, line(s, 'brainstorm_think')(openBrainstorm(s, at)), 'notice');
  else if (stage === 'brainstorm_write') say(s, at, line(s, 'brainstorm_write'), 'notice');
  else if (stage === 'recommend_think') say(s, at, line(s, 'recommend_think'), 'notice');
  else if (stage === 'recommend_write') say(s, at, line(s, 'recommend_write'), 'notice');
  else if (stage === 'exhibits') revealBeat(s, at);
}

/**
 * The brainstorm stages have started: the plan's brainstorm becomes the part of the case that is open, so that the case picks up
 * where it left off afterwards. Returns what this one is about (the plan's own topic for a brainstorm with no beat to place it).
 */
function openBrainstorm(s: SessionState, at: number): string {
  const from = beatPointer(s);
  // The next one the case has not reached yet. It is usually the part on the table; when the clock ended the discussion early, the
  // parts it did not reach are let go and the brainstorm after them is still run, because the closing time was kept for it.
  const index = s.plan.beats.findIndex((b, i) => i >= from && b.kind === 'brainstorm');
  if (index < 0) return s.plan.brainstormTopic;
  s.beats.push({ index, revealedAt: at, lastProgressAt: at, lastUserAt: at, lastNudgeAt: 0, budgetMs: BRAINSTORM_MS, hints: 0, userMessages: 0, asked: 0, partials: 0, outcome: 'open' });
  return s.plan.beats[index].topic ?? s.plan.brainstormTopic;
}

/** Saves what is typed in the box of a writing stage as a response handed in by the clock, not by the member. */
function captureTimedOut(s: SessionState, at: number): void {
  const key = writingKey(s);
  if (!key) return;
  const text = clip(s.drafts[key] ?? '');
  // The same words are never saved twice; a case with two brainstorms hands in two answers of the same kind, which is not the same thing.
  if (text && !s.submissions.some((x) => x.kind === key && x.text === text)) s.submissions.push({ kind: key as SubmissionKind, text, at, timedOut: true });
}

/**
 * Where the case goes when a stage ends. The opening and the closing are the same for every case; in between, the plan decides. A
 * brainstorm the book puts in the middle has two stages of its own, so the discussion stops for it and is picked up again after it,
 * as long as a part of it is left and there is time worth spending on it. When the clock ends the discussion, the parts still in the
 * plan are let go — but a brainstorm never is: the closing time was reserved for it.
 */
function nextStage(s: SessionState, from: Stage, at: number): Stage {
  if (from === 'prompt') return 'framework_think';
  if (from === 'framework_think') return 'framework_write';
  if (from === 'brainstorm_think') return 'brainstorm_write';
  if (from === 'recommend_think') return 'recommend_write';
  if (from === 'recommend_write') return 'done';
  // From the framework, the discussion, or a brainstorm that has just been handed in.
  const upcoming = s.plan.beats[beatPointer(s)];
  if (upcoming?.kind === 'brainstorm') return 'brainstorm_think';
  if (upcoming && from !== 'exhibits' && exhibitLeft(s, at) > MIN_BEAT_MS) return 'exhibits';
  return brainstormsLeft(s) > 0 ? 'brainstorm_think' : 'recommend_think';
}

function finish(s: SessionState, at: number, reason: 'completed' | 'time_limit' | 'ended_early'): void {
  s.stage = 'done';
  s.endedAt = at;
  s.endReason = reason;
  s.stageStartedAt = at;
}

/** What is said as the discussion is left: where the case goes next decides it. */
const leavingDiscussion = (s: SessionState, at: number): string => (nextStage(s, 'exhibits', at) === 'brainstorm_think' ? LINES.to_brainstorm : LINES.wrap_up);

/** Ends the current stage and starts the next one (or finishes the case). */
function endStage(s: SessionState, at: number, by: StageLogEntry['endedBy']): void {
  const from = s.stage;
  if (from === 'framework_write' || from === 'brainstorm_write' || from === 'recommend_write') {
    if (by === 'timer' || by === 'limit') captureTimedOut(s, at);
  }
  if (from === 'brainstorm_write') {
    // The brainstorm is over: the part of the plan it took is closed, so the case knows where to pick up.
    const b = openBeat(s);
    if (b && s.plan.beats[b.index]?.kind === 'brainstorm') b.outcome = by === 'user' ? 'member_moved' : by === 'coach' ? 'coach_moved' : 'timed_out';
  }
  if (from === 'exhibits') {
    const b = openBeat(s);
    if (b && (by === 'timer' || by === 'limit')) b.outcome = 'timed_out';
    if (by === 'timer') say(s, at, leavingDiscussion(s, at), 'notice');
  }
  logEnd(s, at, by);
  const next = nextStage(s, from, at);
  if (next === 'done') finish(s, at, 'completed');
  else startStage(s, next, at);
}

/**
 * Moves the session on to `now`: every stage whose time has run out ends in turn (each starting where the last one ended, so a member who
 * was away comes back to the right place), and at 30 minutes everything still open is saved and the case ends.
 */
export function settle(input: SessionState, now: number): SessionState {
  if (input.pausedAt != null) return input; // the clock is stopped: nothing runs out while the case is paused
  if (isUntimed(input)) return input; // learning mode has no clock: a stage ends only when the member (or Bucket, on the member's work) moves the case on
  const s = structuredClone(input);
  let guard = 0;
  // Eight stages, and three more for every brainstorm after the first (its two, and the discussion picked up again after it).
  const stages = 16 + 3 * s.plan.beats.filter((b) => b.kind === 'brainstorm').length;
  while (s.stage !== 'done' && guard++ < stages) {
    const limit = hardEnd(s);
    const end = stageEndsAt(s);
    // A stage that ended on its own clock before the 30 minutes is not a timeout, even if the member was away past it.
    if (end < limit && now >= end) {
      endStage(s, end, 'timer');
      continue;
    }
    if (now >= limit) {
      const key = writingKey(s);
      if (key) captureTimedOut(s, limit);
      const b = openBeat(s);
      if (b) b.outcome = 'timed_out';
      logEnd(s, limit, 'limit');
      finish(s, limit, 'time_limit');
    }
    break;
  }
  if (!sameShape(input, s)) s.rev = input.rev + 1;
  return s;
}

const sameShape = (a: SessionState, b: SessionState): boolean =>
  a.stage === b.stage && a.stageLog.length === b.stageLog.length && a.messages.length === b.messages.length && a.endedAt === b.endedAt;

// ---------------------------------------------------------------------------------------------------------------------------
// What the member does
// ---------------------------------------------------------------------------------------------------------------------------

export type ActionResult = { ok: true; state: SessionState } | { ok: false; reason: string };

const refuse = (reason: string): ActionResult => ({ ok: false, reason });
const PAUSED = 'The case is paused. Continue when you are ready.';
const INTERVIEW = 'Interview mode has no pause and no early end. The clock runs until the case is over.';
const NO_CLOCK = 'Learning mode has no clock to pause. Take as long as you like, or end the case when you want feedback.';

function bump(s: SessionState): SessionState {
  s.rev += 1;
  return s;
}

/** Stops the clock. Nothing runs out, nothing can be written or asked, until the member continues (or ends the case). */
export function pause(settled: SessionState, now: number): ActionResult {
  if (settled.mode === 'interview') return refuse(INTERVIEW);
  if (isUntimed(settled)) return refuse(NO_CLOCK);
  if (settled.stage === 'done') return refuse('The case is over.');
  if (settled.pausedAt != null) return refuse('The case is already paused.');
  const s = structuredClone(settled);
  s.pausedAt = now;
  s.pauses = (s.pauses ?? 0) + 1;
  return { ok: true, state: bump(s) };
}

/** Moves every moment in the case on by `ms`, so that what was left on the clock when it was paused is what is left when it starts again. */
function shiftTimes(s: SessionState, ms: number): void {
  s.startedAt += ms;
  s.stageStartedAt += ms;
  if (s.lastDraftAt > 0) s.lastDraftAt += ms;
  for (const e of s.stageLog) {
    e.startedAt += ms;
    if (e.endedAt !== null) e.endedAt += ms;
  }
  for (const m of s.messages) m.at += ms;
  for (const x of s.submissions) x.at += ms;
  for (const b of s.beats) {
    b.revealedAt += ms;
    b.lastProgressAt += ms;
    b.lastUserAt += ms;
    if (b.lastNudgeAt > 0) b.lastNudgeAt += ms;
  }
}

/** Starts the clock again, with exactly the time that was left. */
export function continueCase(settled: SessionState, now: number): ActionResult {
  if (settled.pausedAt == null) return refuse('The case is not paused.');
  const s = structuredClone(settled);
  shiftTimes(s, Math.max(0, now - settled.pausedAt));
  s.pausedAt = null;
  return { ok: true, state: bump(s) };
}

/**
 * The member ends the case here (paused or not). What is in the box they were writing in is kept as an unfinished draft, whatever stages are
 * left are left, and the case goes to feedback like any other that ends.
 */
export function endEarly(settled: SessionState, now: number): ActionResult {
  if (settled.mode === 'interview') return refuse(INTERVIEW);
  if (settled.stage === 'done') return refuse('The case is already over.');
  const s = structuredClone(settled);
  const at = settled.pausedAt ?? now; // a paused case ends at the moment it was paused
  captureTimedOut(s, at);
  const b = openBeat(s);
  if (b) b.outcome = 'timed_out';
  logEnd(s, at, 'user');
  finish(s, at, 'ended_early');
  s.pausedAt = null;
  say(s, at, 'You ended the case here.', 'notice');
  return { ok: true, state: bump(s) };
}

/** "Ready": ends the prompt stage or a thinking stage early. The time saved stays in the case's flexible time. */
export function ready(settled: SessionState, now: number): ActionResult {
  if (settled.pausedAt != null) return refuse(PAUSED);
  if (!['prompt', 'framework_think', 'brainstorm_think', 'recommend_think'].includes(settled.stage)) return refuse('Nothing to move on from right now.');
  const s = structuredClone(settled);
  endStage(s, now, 'user');
  return { ok: true, state: bump(s) };
}

/** Hands in the response of a writing stage. The framework is followed by "where would you start?"; the other two move the case on. */
export function submit(settled: SessionState, text: string, now: number): ActionResult {
  if (settled.pausedAt != null) return refuse(PAUSED);
  const body = clip(text);
  if (!body) return refuse('Write something first.');
  const s = structuredClone(settled);
  if (s.stage === 'framework_write' && s.frameworkPhase === 'framework') {
    s.submissions.push({ kind: 'framework', text: body, at: now, timedOut: false });
    s.frameworkPhase = 'direction';
    delete s.drafts.framework;
    say(s, now, LINES.direction, 'text');
    return { ok: true, state: bump(s) };
  }
  if (s.stage === 'brainstorm_write' || s.stage === 'recommend_write') {
    const kind: SubmissionKind = s.stage === 'brainstorm_write' ? 'brainstorm' : 'recommendation';
    s.submissions.push({ kind, text: body, at: now, timedOut: false });
    delete s.drafts[kind];
    endStage(s, now, 'user');
    return { ok: true, state: bump(s) };
  }
  return refuse('There is nothing to hand in right now.');
}

/** The starting direction is settled (or time for it is up): on to the first exhibit. */
export function endFrameworkStage(settled: SessionState, now: number): SessionState {
  if (settled.stage !== 'framework_write') return settled;
  const s = structuredClone(settled);
  endStage(s, now, 'coach');
  return bump(s);
}

/** A chat message from the member: a clarifying question, their starting direction, or their reasoning on an exhibit. */
export function userSays(settled: SessionState, text: string, now: number): ActionResult {
  if (settled.pausedAt != null) return refuse(PAUSED);
  const body = clip(text);
  if (!body) return refuse('Write something first.');
  const s = structuredClone(settled);
  if (s.stage === 'prompt') {
    s.clarifyCount += 1;
    delete s.drafts.clarify;
  } else if (s.stage === 'framework_write' && s.frameworkPhase === 'direction') {
    const prior = s.submissions.find((x) => x.kind === 'direction');
    if (prior) prior.text = clip(`${prior.text}\n${body}`);
    else s.submissions.push({ kind: 'direction', text: body, at: now, timedOut: false });
    delete s.drafts.direction;
  } else if (s.stage === 'exhibits') {
    const b = openBeat(s);
    if (b) {
      b.userMessages += 1;
      b.asked = (b.asked ?? 0) + 1;
      b.lastUserAt = now;
    }
    delete s.drafts.exhibit;
  } else {
    return refuse('There is nothing to answer right now.');
  }
  say(s, now, body, 'text', undefined, 'user');
  return { ok: true, state: bump(s) };
}

/** The coach's reply, if the session is still where the member's message left it. */
export function coachSays(s0: SessionState, text: string, now: number, kind: Message['kind'] = 'text'): SessionState {
  const s = structuredClone(s0);
  say(s, now, text, kind);
  return bump(s);
}

export function saveDraft(settled: SessionState, key: DraftKey, text: string, now: number): SessionState {
  if (settled.pausedAt != null) return settled;
  const s = structuredClone(settled);
  const allowed: Record<DraftKey, boolean> = {
    clarify: s.stage === 'prompt',
    framework: s.stage === 'framework_write' && s.frameworkPhase === 'framework',
    direction: s.stage === 'framework_write' && s.frameworkPhase === 'direction',
    exhibit: s.stage === 'exhibits',
    brainstorm: s.stage === 'brainstorm_write',
    recommendation: s.stage === 'recommend_write',
  };
  if (!allowed[key]) return settled;
  const body = text.slice(0, MAX_RESPONSE_CHARS);
  if (body) s.drafts[key] = body;
  else delete s.drafts[key];
  s.lastDraftAt = now;
  return bump(s);
}

/** The private scratchpad of the framework thinking stage (kept apart from the framework that is handed in). */
export function saveScratchpad(settled: SessionState, text: string): SessionState {
  if (!['framework_think', 'framework_write'].includes(settled.stage) || settled.pausedAt != null) return settled;
  const s = structuredClone(settled);
  s.scratchpad = text.slice(0, MAX_RESPONSE_CHARS);
  return bump(s);
}

// ---------------------------------------------------------------------------------------------------------------------------
// The exhibit discussion
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The time the next beat is worth: what the discussion has left, shared out by how many of its beats remain (a brainstorm has its own
 * time, and the closing stages are never in it).
 *
 * **What it has left runs to `d.hard`, the discussion's latest end, not to `d.soft`, the end the plan drew** (issue #164). The flexible
 * time is the discussion's own: a case keeps talking past its planned end while the member is getting somewhere, so a beat brought out
 * in that time has real time of its own. Measured against the planned end it had none — the numerator was already spent, every such beat
 * got `MIN_BEAT_MS`, and the one thing a budget decides, the skip in `nudgeLevel`, fired 30 seconds in and took away the rung that says
 * where to look. The budget is only ever what `behindSchedule` measures a beat against: it moves no stage end and no deadline, so the
 * case is exactly as long as it was, and the skip still fires on a beat that has really run past its share.
 */
function beatBudget(s: SessionState, at: number): number {
  const d = deadlines(s, 'exhibits', s.stageStartedAt);
  const from = beatPointer(s);
  const left = Math.max(1, s.plan.beats.filter((b, i) => i >= from && b.kind !== 'brainstorm').length);
  return Math.max(MIN_BEAT_MS, Math.floor((d.hard - at) / left));
}

/** A topic read out as its own sentence, keeping the question mark of a title the book wrote as a question. */
const asSentence = (topic: string): string => (/[.?!]$/.test(topic) ? topic : `${topic}.`);

/**
 * Brings out the next part of the discussion. A brainstorm is not one of them: it is answered in its own two stages.
 *
 * **A part that is talked through says what it is about before it asks for anything** (issue #163). An exhibit names its own subject
 * on the table; a step of the analysis hands over nothing, so without this the member is asked what they would look at next about a
 * part they cannot identify. The topic comes from the engine, out of the book's step title and nothing else (`stepTopic`), because the
 * interview register rightly forbids the model to volunteer a subject the member has not raised. A step whose title is its own answer
 * has no topic, and keeps the opening line that asks the question without naming it.
 */
function revealBeat(s: SessionState, at: number): boolean {
  const index = beatPointer(s);
  const beat = s.plan.beats[index];
  if (!beat || beat.kind === 'brainstorm') return false;
  const first = !s.beats.some((b) => s.plan.beats[b.index]?.kind !== 'brainstorm');
  s.beats.push({ index, revealedAt: at, lastProgressAt: at, lastUserAt: at, lastNudgeAt: 0, budgetMs: beatBudget(s, at), hints: 0, userMessages: 0, asked: 0, partials: 0, outcome: 'open' });
  const topic = beat.kind === 'step' ? (beat.topic ?? '') : '';
  const text =
    beat.kind === 'exhibit'
      ? first
        ? 'Here is the first exhibit. Take a moment, then tell me what you notice.'
        : 'Here is the next exhibit. What do you notice?'
      : topic
        ? first
          ? `Let us dig in. First part: ${asSentence(topic)} What would you analyse first, and how?`
          : `Good. Next part: ${asSentence(topic)} What would you look at, and how?`
        : first
          ? 'Let us dig in. What would you analyse first, and how?'
          : 'Good. What would you look at next, and how?';
  say(s, at, text, 'exhibit', s.beats.length - 1);
  return true;
}

/** Closes the open exhibit (the member got there, or the coach moved on) and brings out the next one, or ends the discussion. */
export function nextBeat(settled: SessionState, now: number, how: 'independent' | 'coach_moved' | 'member_moved'): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b) b.outcome = how === 'coach_moved' ? 'coach_moved' : how === 'member_moved' ? 'member_moved' : b.hints > 0 ? 'hinted' : 'independent';
  if (!revealBeat(s, now)) {
    say(s, now, leavingDiscussion(s, now), 'notice');
    endStage(s, now, 'coach');
  }
  return bump(s);
}

/**
 * The member says they are done with this exhibit: on to the next one, or, after the last, on to the next section (the time saved carries over).
 * Bucket's job is to help them drive and cover the exhibit; this is the way out for a member who is stuck or has had enough.
 *
 * In practice and interview they have to have said something about it first, so a stray click can't skip an exhibit nobody looked at, and
 * because the member is being assessed on what they cover. Learning assesses nothing and has no clock, so the member alone decides when a
 * beat is over: a learner who does not know how to start one may move on without writing, which is the only way out of that beat short of
 * ending the case.
 */
export function moveOn(settled: SessionState, now: number): ActionResult {
  if (settled.pausedAt != null) return refuse(PAUSED);
  const b = settled.stage === 'exhibits' ? openBeat(settled) : undefined;
  if (!b) return refuse('There is nothing to move on from right now.');
  if (b.userMessages < 1 && !isUntimed(settled)) return refuse('Tell me what you make of this one first.');
  return { ok: true, state: nextBeat(settled, now, 'member_moved') };
}

/** What the member's last message showed: progress, partial progress, being stuck, or not enough to tell. */
export type Assessment = 'progress' | 'partial' | 'stuck' | 'unclear';

// ---------------------------------------------------------------------------------------------------------------------------
// Did that message move the case forward? (issue #130)
// ---------------------------------------------------------------------------------------------------------------------------
// The help ladder is entered through `asked`, which counts the messages since the member last made a clear step forward, and the model
// is what judges the step. The real-model pilot found that judgement far too generous: six messages on one beat, four of them openly
// stuck, came back as six steps forward, so the counter never left zero and the ladder never engaged for the member who needed it most.
// The test below is the floor the model's score is held to. It is one-way on purpose: it can take 'progress' away from a message that
// shows nothing concrete, and it can never hand 'progress' to a message the model called stuck.

/** A figure of any kind, including the few that are written as words. */
const A_FIGURE = /\d|\b(?:half|halved|double[ds]?|doubling|twice|triple[ds]?|third|quarter|percent|percentage)\b/i;
/** Two things set against each other, a direction of change, or a driver named as the cause of something. */
const A_COMPARISON =
  /\b(?:than|versus|vs\.?|compares?|compared|comparing|comparison|against|relative to|higher|lower|bigger|smaller|larger|greater|fewer|more|less|faster|slower|rose|rising|risen|fell|fallen|falling|grew|grown|growing|growth|declin\w*|increas\w*|decreas\w*|shrink\w*|shrank|flat|gap|differen\w*|between|per|each|ratio|margin|share|driver|driving|driven by|caused by|because|due to|therefore|which means|that means|means that|implies|suggests|explains)\b/i;
/** The next thing they would do. */
const A_NEXT_MOVE =
  // "I'd ...", "I'll ..." say what they would do; "I'm ..." does not (it is how "I'm not sure" starts), so it is only here with a verb.
  /\b(?:i(?:'|’)?(?:d|ll) \w+|i(?:'|’)?m (?:going to|about to)|i would|i will|i want to|i need to|i am going to|let(?:'|’)?s|next i|next step|then i|we should|i should|i could|can we|could we|calculat\w*|comput\w*|work out|work it out|figure out|check|look at|dig into|break it down|break this down|segment|split|estimate|size the|test|quantify|rule out)\b/i;
/**
 * Saying, in so many words, that they do not know what to do. A hedge in front of a claim ("I am not sure if this is right, but the
 * suburban shops look like the problem") is deliberately not one of these: it is the admission standing on its own that says they are
 * stuck, and a message that goes on to name the next move is a step forward whatever it admits.
 */
const STUCK_ADMISSION =
  /\b(?:no idea|no clue|i(?:'|’)?m stuck|i am stuck|i(?:'|’)?m lost|not (?:really |entirely |quite |totally )?sure (?:what|where|how|why)|(?:do|does)(?:n(?:'|’)?t| not) know (?:what|where|how|why)|nothing comes to mind|drawing a blank|what should i|where should i)\b/i;
/** A whole message that is nothing but giving up. */
const GAVE_UP = /^\W*(?:i (?:really )?(?:do ?n(?:'|’)?t|do not) know|not sure|no idea|nothing|still nothing|hmm+|erm+|\?+)\W*$/i;

/**
 * Whether what the member wrote is a step forward: it names a comparison or a driver, it names or works with a figure, or it says the
 * next thing they would do. A message that does none of those three has not moved the case on, however reasonable it sounds — and nor
 * has one that says plainly that they do not know what to do with what is in front of them, unless it also says what they would do next.
 */
export function madeAStep(text: string): boolean {
  if (GAVE_UP.test(text.trim())) return false;
  const next = A_NEXT_MOVE.test(text);
  if (!next && !A_FIGURE.test(text) && !A_COMPARISON.test(text)) return false;
  return next || !STUCK_ADMISSION.test(text);
}

/**
 * The score the engine acts on: the model's own, unless it called a message a clear step forward and the message names nothing
 * concrete. Then it is 'unclear' rather than 'stuck', because no rule here can tell a lost member from a quiet one; what matters is
 * that a message which did nothing no longer resets the rung counter. A model that never says 'progress' leaves the ladder exactly as
 * it was (the safe way round); a model that says it on everything no longer stops the ladder climbing.
 */
export function assessmentOf(claimed: Assessment, memberText: string): Assessment {
  return claimed === 'progress' && !madeAStep(memberText) ? 'unclear' : claimed;
}

/** The member's last message, which is the one a reply is answering. */
export function lastMemberMessage(s: SessionState): string {
  for (let i = s.messages.length - 1; i >= 0; i--) if (s.messages[i].from === 'user') return s.messages[i].text;
  return '';
}

export function recordAssessment(settled: SessionState, assessment: Assessment, now: number): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b && (assessment === 'progress' || assessment === 'partial')) b.lastProgressAt = now;
  if (b && assessment === 'partial') b.partials = (b.partials ?? 0) + 1; // how long they have been nearly there (issue #184)
  if (b && assessment === 'progress') {
    b.asked = 0; // a clear step forward starts the count again
    b.partials = 0;
  }
  return bump(s);
}

// ---------------------------------------------------------------------------------------------------------------------------
// Nearly there, or going round in circles? (issue #184)
// ---------------------------------------------------------------------------------------------------------------------------
// 'partial' means the member is getting somewhere, so the rungs that help and the rung that moves the case on were all held for a
// member the model called stuck or unclear: moving on someone who is making progress is the thing 'advance' exists not to do. But the
// score is made fresh every turn with no memory of how many times it has already been given, and the real-model pilot of 2026-11-18
// found what that costs: six competent-sounding but wrong messages on one part came back 'partial' six times, so no rung of the ladder
// could fire and the part never ended. The member bought themselves time by being plausibly wrong, while a member who wrote nothing at
// all was moved on in three. The count below is the memory the score does not have.

/**
 * How many messages in a row the model may call 'partial' before the member counts as circling rather than nearly there. Two in a row
 * is a member closing in on it and is left alone; the third is the point at which nothing has been got to for as long as the ladder
 * gives a stuck member before it leads or moves them on, so the same rungs become available. A clear step forward sets it back to zero,
 * so a 'partial' between two real steps costs nothing.
 */
export const CIRCLING_PARTIALS = 3;

/** The run of 'partial' scores on the open part, not counting the message being answered now. */
export const partialRun = (s: SessionState): number => openBeat(s)?.partials ?? 0;

/**
 * Whether the member's latest message leaves them getting nowhere on the part in front of them, which is what every rung of help in
 * `applyTurn` acts on. They are stuck or they said nothing to tell from — or this is the `CIRCLING_PARTIALS`th 'partial' in a row,
 * which is a member circling rather than one closing in. `run` is the count before this message, which is what `partialRun` reads.
 *
 * Nothing here is driven by the clock: it takes a message from the member to reach any of it ("help is never unprompted", DECISIONS.md,
 * the interview rubric, section 1).
 */
export function gettingNowhere(assessment: Assessment, run: number): boolean {
  if (assessment === 'stuck' || assessment === 'unclear') return true;
  return assessment === 'partial' && run + 1 >= CIRCLING_PARTIALS;
}

/**
 * The message being answered asked for data (or for the answer), not for help: it is taken back off the count that climbs the help ladder,
 * so asking costs nothing. Asking well is part of doing the case, in every mode (DECISIONS.md, "The interview rubric", section 2).
 */
export function recordDataRequest(settled: SessionState): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b) {
    b.asked = Math.max(0, (b.asked ?? 0) - 1);
    b.partials = Math.max(0, (b.partials ?? 0) - 1); // and it costs no part of the run that says they are circling (issue #184)
  }
  return bump(s);
}

/** The beat has had longer than it was worth. What it was worth is `beatBudget`: its share of the time the discussion really has. */
const behindSchedule = (b: BeatRecord, at: number): boolean => at > b.revealedAt + b.budgetMs;

/**
 * The help ladder, one row per mode: what the member's first, second, third ... message on an exhibit that is going nowhere is answered
 * with. The last entry of a row repeats for every message after it. This table is the whole of the difference in how much help a mode
 * gives (DECISIONS.md, "The interview rubric", section 1).
 *  - practice teaches as it goes: a process hint from the first stuck message, a sharper one next, then Bucket leads (it stops asking open
 *    questions and says plainly where to look), and then it moves the case on.
 *  - an interview redirects, it never rescues: the first stuck message gets nothing (a real interviewer lets you sit with it), help goes no
 *    further than a nudge, and there is no 'lead' rung at all. Being stuck costs the beat, which is what 'advance' is for.
 *  - learning has no clock and Bucket never moves a learner on: it keeps teaching, and the member says when they are done.
 */
const LADDER: Record<LiveMode, readonly NudgeLevel[]> = {
  practice: ['process_hint', 'directional_hint', 'lead', 'advance'],
  interview: ['none', 'process_hint', 'directional_hint', 'advance'],
  learning: ['process_hint', 'directional_hint', 'lead'],
};

/**
 * What help to give on the exhibit on the table. The member drives: nothing is said unless they write something.
 *  - 'message': they have written to Bucket. If it shows they are stuck, they climb their mode's rung of the ladder above; in a timed mode
 *    the last rung before moving on is skipped once the exhibit has already taken longer than it is worth, and after the top of the ladder
 *    the case moves on to the next exhibit.
 *  - 'timer': they have said nothing. The clock never speaks up on its own: how much they cover in the time is up to them, and when the
 *    exhibit time is used up the case moves on to the next part. This is where "Help is never unprompted" (DECISIONS.md, section 1,
 *    "The interview rubric") is held in code, and since issue #188 it is the whole of it: there is no longer an action a client can
 *    send to ask for help. Nothing in the product passes 'timer'. The callers are `src/data/liveCase.test.ts` and
 *    `npm run dryrun:live`, which asks it on every step of every run to prove the rule rather than to get a rung of help.
 */
export function nudgeLevel(s: SessionState, now: number, via: 'message' | 'timer' = 'message'): NudgeLevel {
  const b = openBeat(s);
  if (!b || s.stage !== 'exhibits' || via === 'timer') return 'none';
  // How far up the ladder this message is: by the hints already given, or by how many messages have gone by without getting anywhere
  // (the one being answered now is not counted yet, so the third message gets the third step).
  const rung = Math.max(b.hints, b.asked ?? 0);
  const ladder = LADDER[s.mode ?? 'practice'] ?? LADDER.practice;
  // The exhibit has already run past the time it is worth: the last rung of help before moving on is skipped. A mode whose ladder never
  // moves the member on (learning, which has no clock at all) has no such thing.
  if (ladder[ladder.length - 1] === 'advance' && rung >= ladder.length - 2 && behindSchedule(b, now)) return 'advance';
  return ladder[Math.min(rung, ladder.length - 1)];
}

/** Records that the coach gave a hint (level 1 or 2) on the open exhibit. */
export function recordHint(settled: SessionState, now: number): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b) {
    b.hints += 1;
    b.lastNudgeAt = now;
  }
  return bump(s);
}

/** The few numbers the feedback needs about the pacing. */
export function timeInStages(s: SessionState): { stage: Stage; seconds: number; endedBy: StageLogEntry['endedBy'] }[] {
  return s.stageLog.map((e) => ({ stage: e.stage, seconds: Math.round(((e.endedAt ?? s.endedAt ?? e.startedAt) - e.startedAt) / SECOND), endedBy: e.endedBy }));
}
