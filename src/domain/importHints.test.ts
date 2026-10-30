import { describe, expect, it } from 'vitest';
import { canonicalIndustryName, guessIndustry, matchCaseType, normalizeText } from './importHints';

describe('normalizeText', () => {
  it('ignores case, punctuation and "&" versus "and"', () => {
    expect(normalizeText(' Exhibits & Charts ')).toBe('exhibits and charts');
    expect(normalizeText('Prompt / Pre-framework')).toBe('prompt pre framework');
    expect(normalizeText('Brainstorm(s)')).toBe('brainstorm s');
  });
});

describe('matchCaseType', () => {
  it('matches the exact names however they are typed', () => {
    expect(matchCaseType('profitability')).toBe('Profitability');
    expect(matchCaseType('Non traditional')).toBe('Non-traditional');
    expect(matchCaseType('SOURCING/OUTSOURCING')).toBe('Sourcing / Outsourcing');
    expect(matchCaseType('Other')).toBe('Other');
  });

  it('understands common short forms', () => {
    expect(matchCaseType('M&A')).toBe('Mergers and Acquisitions');
    expect(matchCaseType('Mergers & Acquisitions')).toBe('Mergers and Acquisitions');
    expect(matchCaseType('org change')).toBe('Organizational Change');
    expect(matchCaseType('Sizing')).toBe('Market Sizing');
    expect(matchCaseType('profit')).toBe('Profitability');
    expect(matchCaseType('cost cutting')).toBe('Cost Reduction');
  });

  it('finds the type inside a longer description, preferring the more specific phrase', () => {
    expect(matchCaseType('Market entry (pharma)')).toBe('Market Entry');
    expect(matchCaseType('Market sizing: EV chargers')).toBe('Market Sizing');
    expect(matchCaseType('M&A deals')).toBe('Mergers and Acquisitions');
  });

  it('returns null for blank or unrecognised text rather than guessing', () => {
    expect(matchCaseType('')).toBeNull();
    expect(matchCaseType('   ')).toBeNull();
    expect(matchCaseType('Zoo strategy')).toBeNull();
    expect(matchCaseType('Pricing')).toBeNull();
  });
});

describe('guessIndustry', () => {
  it('suggests an industry from clear words in the title or source', () => {
    expect(guessIndustry('Regional airline profit squeeze')).toBe('Transportation / Logistics');
    expect(guessIndustry('Hospital network expansion')).toBe('Healthcare / Pharmaceuticals');
    expect(guessIndustry('Community bank fees')).toBe('Financial Services');
    expect(guessIndustry('Grocery chain pricing')).toBe('Consumer Products / Retail');
    expect(guessIndustry('SaaS churn', 'Booth casebook')).toBe('Technology / SaaS');
  });

  it('goes with the industry that has the most matching words', () => {
    expect(guessIndustry('Hospital insurance claims for a health insurer')).toBe('Healthcare / Pharmaceuticals');
  });

  it('says nothing when the words do not point anywhere', () => {
    expect(guessIndustry('Private equity bakery buy', 'Consulting club')).toBe('');
    expect(guessIndustry('')).toBe('');
    expect(guessIndustry('Zoo turnaround')).toBe('');
  });

  it('does not match inside other words', () => {
    expect(guessIndustry('Candidate screening')).toBe(''); // "date" is not a keyword, "can" is not "car"
    expect(guessIndustry('Gasket maker')).toBe('');
  });
});

describe('canonicalIndustryName', () => {
  it('uses the preset name when the text matches one, and keeps anything else as typed', () => {
    expect(canonicalIndustryName('technology / saas')).toBe('Technology / SaaS');
    expect(canonicalIndustryName('  Aerospace ')).toBe('Aerospace');
    expect(canonicalIndustryName('')).toBe('');
  });
});
