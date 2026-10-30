import { CASE_TYPES, INDUSTRIES, type CaseType } from './constants';

/** Lower-case, "&" as "and", everything else that isn't a letter or digit as a single space. */
export function normalizeText(v: string): string {
  return v
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Spellings people actually type for each case type, beyond the exact name. Longest phrases are tried first. */
const CASE_TYPE_ALIASES: [CaseType, string[]][] = [
  ['Mergers and Acquisitions', ['m and a', 'ma', 'merger', 'mergers', 'acquisition', 'acquisitions', 'mergers acquisitions', 'merger acquisition', 'post merger integration']],
  ['Market Sizing', ['sizing', 'market size', 'estimation', 'guesstimate', 'market estimation']],
  ['Market Entry', ['entry', 'new market', 'market entry strategy', 'new market entry']],
  ['Growth Strategy', ['growth']],
  ['Profitability', ['profit', 'profits', 'profit improvement', 'declining profit', 'declining profits']],
  ['Revenue', ['revenue growth', 'revenue decline', 'declining revenue', 'revenues']],
  ['Cost Reduction', ['cost', 'costs', 'cost cutting', 'cost optimization', 'cost optimisation']],
  ['Investment Decision', ['investment', 'invest', 'private equity', 'pe', 'pe deal', 'pe deals', 'pe investment', 'investment strategy']],
  ['Organizational Change', ['org change', 'organisational change', 'organization change', 'organisation change', 'change management', 'org']],
  ['Operating Model', ['operations', 'operation', 'ops model', 'ops', 'operations strategy', 'operating']],
  ['Non-traditional', ['non traditional', 'nontraditional', 'non trad', 'nonprofit', 'non profit', 'social impact']],
  ['Sourcing / Outsourcing', ['sourcing', 'outsourcing', 'sourcing outsourcing', 'procurement', 'make or buy', 'make vs buy']],
];

const EXACT_CASE_TYPES = new Map<string, CaseType>(CASE_TYPES.map((t) => [normalizeText(t), t]));

/**
 * Map whatever was typed in a "Case Type" cell to one of the 13 case types, or null when nothing matches.
 * Exact names win, then common spellings ("M&A", "org change"), then a phrase that contains one of those
 * ("Market entry (pharma)"). Blank text matches nothing.
 */
export function matchCaseType(raw: string): CaseType | null {
  const text = normalizeText(raw);
  if (!text) return null;
  const exact = EXACT_CASE_TYPES.get(text);
  if (exact) return exact;

  for (const [type, aliases] of CASE_TYPE_ALIASES) if (aliases.includes(text)) return type;

  // Contains one of the names or spellings, preferring the longest phrase so "market entry" beats "entry".
  const phrases = [
    ...CASE_TYPES.filter((t) => t !== 'Other').map((t): [string, CaseType] => [normalizeText(t), t]),
    ...CASE_TYPE_ALIASES.flatMap(([type, aliases]) => aliases.filter((a) => a.length > 3).map((a): [string, CaseType] => [a, type])),
  ].sort((a, b) => b[0].length - a[0].length);
  const padded = ` ${text} `;
  for (const [phrase, type] of phrases) if (padded.includes(` ${phrase} `)) return type;
  return null;
}

/** Keywords in a case title or source that point to an industry. Deliberately small and conservative. */
const INDUSTRY_KEYWORDS: [(typeof INDUSTRIES)[number], string[]][] = [
  ['Healthcare / Pharmaceuticals', ['pharma', 'pharmaceutical', 'drug', 'biotech', 'hospital', 'health', 'healthcare', 'medical', 'clinic', 'surgery', 'cancer', 'patient', 'diagnostic']],
  ['Insurance', ['insurance', 'insurer', 'reinsurance', 'underwriting']],
  ['Financial Services', ['bank', 'banking', 'fintech', 'payments', 'credit card', 'lender', 'lending', 'asset management', 'wealth', 'brokerage', 'hedge fund']],
  ['Technology / SaaS', ['software', 'saas', 'tech', 'cloud', 'startup', 'cybersecurity', 'semiconductor', 'data center']],
  ['Transportation / Logistics', ['airline', 'airlines', 'airport', 'shipping', 'logistics', 'freight', 'trucking', 'railroad', 'cargo', 'fleet', 'supply chain']],
  ['Travel / Hospitality', ['hotel', 'hotels', 'resort', 'cruise', 'casino', 'restaurant', 'hospitality', 'theme park', 'tourism', 'travel', 'airbnb']],
  ['Energy / Utilities', ['oil', 'gas', 'energy', 'utility', 'utilities', 'solar', 'electric', 'renewable', 'mining', 'battery']],
  ['Telecom / Media', ['telecom', 'wireless', 'broadband', 'cable', 'media', 'streaming', 'newspaper', 'publisher', 'publishing', 'television', 'film', 'music', 'video game', 'gaming']],
  ['Real Estate / Construction', ['real estate', 'construction', 'housing', 'homebuilder', 'property', 'reit', 'office space']],
  ['Public Sector / Education', ['government', 'public sector', 'university', 'school', 'education', 'nonprofit', 'non profit', 'municipal', 'museum', 'charity']],
  ['Manufacturing / Industrials', ['manufacturing', 'manufacturer', 'factory', 'steel', 'chemical', 'chemicals', 'aerospace', 'machinery', 'industrial', 'automotive', 'packaging', 'tire']],
  ['Consumer Products / Retail', ['retail', 'retailer', 'grocery', 'supermarket', 'apparel', 'fashion', 'cpg', 'consumer', 'beverage', 'snack', 'cosmetics', 'toy', 'footwear', 'ecommerce', 'e commerce', 'department store', 'furniture']],
];

/**
 * A best guess at the industry from a case's title and source, or '' when nothing in the words points to one.
 * It is only ever a suggestion the person can change: the MCG template has no industry column.
 */
export function guessIndustry(...texts: string[]): string {
  const padded = ` ${normalizeText(texts.join(' '))} `;
  if (padded.trim() === '') return '';
  let best: { industry: string; score: number } | null = null;
  for (const [industry, words] of INDUSTRY_KEYWORDS) {
    const score = words.filter((w) => padded.includes(` ${w} `)).length;
    // Strictly greater: on a tie the earlier (more specific) industry in the list wins.
    if (score > 0 && (!best || score > best.score)) best = { industry, score };
  }
  return best?.industry ?? '';
}

/** One of the preset industries when the text matches one (ignoring case and punctuation), else the text itself. */
export function canonicalIndustryName(raw: string): string {
  const text = normalizeText(raw);
  if (!text) return '';
  const preset = INDUSTRIES.find((i) => normalizeText(i) === text);
  return preset ?? raw.trim();
}
