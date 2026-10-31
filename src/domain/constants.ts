// The 13 case types, exactly as listed on the MCG template's "Data Validation" tab.
export const CASE_TYPES = [
  'Growth Strategy',
  'Market Entry',
  'Market Sizing',
  'Profitability',
  'Mergers and Acquisitions',
  'Revenue',
  'Cost Reduction',
  'Investment Decision',
  'Organizational Change',
  'Operating Model',
  'Non-traditional',
  'Sourcing / Outsourcing',
  'Other',
] as const;

export type CaseType = (typeof CASE_TYPES)[number];

/** "Every main case type" = all of them except the catch-all "Other". */
export const MAIN_CASE_TYPES: CaseType[] = CASE_TYPES.filter((t) => t !== 'Other');

/** Compact labels for the industry x case type matrix header. */
export const CASE_TYPE_SHORT: Record<CaseType, string> = {
  'Growth Strategy': 'Growth',
  'Market Entry': 'Entry',
  'Market Sizing': 'Sizing',
  Profitability: 'Profit',
  'Mergers and Acquisitions': 'M&A',
  Revenue: 'Revenue',
  'Cost Reduction': 'Cost',
  'Investment Decision': 'Invest',
  'Organizational Change': 'Org',
  'Operating Model': 'Op model',
  'Non-traditional': 'Non-trad',
  'Sourcing / Outsourcing': 'Sourcing',
  Other: 'Other',
};

/**
 * Order in which uncovered case types are suggested: the types that come up most
 * often in consulting interviews first.
 */
export const CASE_TYPE_PRIORITY: CaseType[] = [
  'Profitability',
  'Market Entry',
  'Growth Strategy',
  'Market Sizing',
  'Mergers and Acquisitions',
  'Revenue',
  'Cost Reduction',
  'Investment Decision',
  'Operating Model',
  'Organizational Change',
  'Sourcing / Outsourcing',
  'Non-traditional',
];

// Common consulting-interview industries (an addition to the MCG template, which has none).
export const INDUSTRIES = [
  'Consumer Products / Retail',
  'Technology / SaaS',
  'Healthcare / Pharmaceuticals',
  'Financial Services',
  'Insurance',
  'Manufacturing / Industrials',
  'Energy / Utilities',
  'Transportation / Logistics',
  'Travel / Hospitality',
  'Telecom / Media',
  'Real Estate / Construction',
  'Public Sector / Education',
  'Other',
] as const;

/** Order in which uncovered industries are suggested. */
export const INDUSTRY_PRIORITY: string[] = [
  'Healthcare / Pharmaceuticals',
  'Technology / SaaS',
  'Consumer Products / Retail',
  'Financial Services',
  'Energy / Utilities',
  'Manufacturing / Industrials',
  'Transportation / Logistics',
  'Telecom / Media',
  'Travel / Hospitality',
  'Insurance',
  'Real Estate / Construction',
  'Public Sector / Education',
];

export type Rating = 1 | 2 | 3 | 4 | 5;
export const RATINGS: Rating[] = [1, 2, 3, 4, 5];

export const RATING_LABELS: Record<Rating, string> = {
  1: 'Significant improvement needed',
  2: 'Below expectations',
  3: 'Developing / acceptable',
  4: 'Strong',
  5: 'Excellent',
};

/** The eight skill fields of the MCG log (Behavioral is split in two, as in the template). */
export type SkillKey =
  | 'behavioral1'
  | 'behavioral2'
  | 'prompt'
  | 'framework'
  | 'quant'
  | 'exhibits'
  | 'brainstorm'
  | 'recommendation';

export const SKILLS: { key: SkillKey; label: string }[] = [
  { key: 'behavioral1', label: 'Behavioral 1' },
  { key: 'behavioral2', label: 'Behavioral 2' },
  { key: 'prompt', label: 'Prompt / Pre-framework' },
  { key: 'framework', label: 'Framework' },
  { key: 'quant', label: 'Quant / Math' },
  { key: 'exhibits', label: 'Exhibits & Charts' },
  { key: 'brainstorm', label: 'Brainstorm(s)' },
  { key: 'recommendation', label: 'Recommendation' },
];

/** Dashboard categories: the template's skills with both behavioral fields combined. */
export type SkillGroupKey =
  | 'behavioral'
  | 'prompt'
  | 'framework'
  | 'quant'
  | 'exhibits'
  | 'brainstorm'
  | 'recommendation';

export type DashboardSkillKey = 'overall' | SkillGroupKey;

export interface SkillGroup {
  key: SkillGroupKey;
  label: string;
  /** Source skill fields combined into this category. */
  fields: SkillKey[];
  /** One-line, skill-specific nudge used in practice suggestions. */
  tip: string;
}

export const SKILL_GROUPS: SkillGroup[] = [
  {
    key: 'behavioral',
    label: 'Behavioral',
    fields: ['behavioral1', 'behavioral2'],
    tip: 'Try tightening your stories to a clear situation, action and result. (Yes, even the one about the group project.)',
  },
  {
    key: 'prompt',
    label: 'Prompt / Pre-framework',
    fields: ['prompt'],
    tip: 'Slow down: clarify the objective and restate the prompt before structuring. The clock is not actually your enemy.',
  },
  {
    key: 'framework',
    label: 'Framework',
    fields: ['framework'],
    tip: 'Focus on structuring: build MECE, hypothesis-led frameworks. Bonus points for not reciting the same one every time.',
  },
  {
    key: 'quant',
    label: 'Quant / Math',
    fields: ['quant'],
    tip: 'Try short daily mental-math drills, and talk through your setup before you calculate. Calculators are for later.',
  },
  {
    key: 'exhibits',
    label: 'Exhibits & Charts',
    fields: ['exhibits'],
    tip: 'Practice chart reading: state the headline, then the "so what". (And check the axis.)',
  },
  {
    key: 'brainstorm',
    label: 'Brainstorm(s)',
    fields: ['brainstorm'],
    tip: 'Group ideas into buckets before you list them. Chaos is not a category.',
  },
  {
    key: 'recommendation',
    label: 'Recommendation',
    fields: ['recommendation'],
    tip: 'Practice an answer-first recommendation with risks and next steps. Yes, you are allowed to commit.',
  },
];

export const DASHBOARD_SKILLS: { key: DashboardSkillKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  ...SKILL_GROUPS.map((g) => ({ key: g.key, label: g.label })),
];

export function skillGroupLabel(key: SkillGroupKey): string {
  return SKILL_GROUPS.find((g) => g.key === key)?.label ?? key;
}

/** Per-case sharing override. `profile` = follow the Profile & privacy switches. */
export type ShareMode = 'profile' | 'private' | 'history' | 'full';

export const SHARE_MODES: { value: ShareMode; label: string; description: string }[] = [
  {
    value: 'profile',
    label: 'Use my profile settings',
    description: 'Shares only what your Profile & privacy switches allow.',
  },
  {
    value: 'private',
    label: 'Keep this case private',
    description: "Other members can't see this case at all.",
  },
  {
    value: 'history',
    label: 'Share the case name only',
    description:
      'Others see the name, source, industry and type, but no scores, feedback or notes. If your profile is visible to anyone, this case is too.',
  },
  {
    value: 'full',
    label: 'Share this case in full',
    description:
      'Members see its scores, written feedback, improvement focus and learning notes, even if your profile shares none of those. If your profile is visible to anyone, visitors see its name, scores and improvement focus (never feedback or notes). "Other notes" stay private.',
  },
];

/** Rating bands used for colour coding. */
export const STRONG_AT = 4;
export const DEVELOPING_AT = 3;

/** Minimum number of ratings before we show "recent" averages / trends. */
export const RECENT_WINDOW = 5;
export const MIN_FOR_TREND = 8; // 5 recent + at least 3 earlier ratings
export const MIN_FOR_FIRST_VS_LATEST = 10; // two non-overlapping windows of five
export const TREND_THRESHOLD = 0.3;

export const COUNT_MILESTONES = [5, 10, 25, 50, 100];
