import type { CaseType, Rating, SkillKey } from '../domain/constants';
import { addDays, toISODate } from '../domain/dates';
import { emptyAppData, emptySkills } from '../domain/factory';
import type { AppData, CaseRecord } from '../domain/types';

type R = Rating | null;

interface Sample {
  daysAgo: number;
  title: string;
  caseType: CaseType;
  industry: string;
  overall: R;
  // behavioral1, behavioral2, prompt, framework, quant, exhibits, brainstorm, recommendation
  skills: [R, R, R, R, R, R, R, R];
  struggled?: string;
  wentWell?: string;
  concepts?: string;
  nextFocus?: string;
}

const KEYS: SkillKey[] = [
  'behavioral1',
  'behavioral2',
  'prompt',
  'framework',
  'quant',
  'exhibits',
  'brainstorm',
  'recommendation',
];

const N = null;

// Oldest first. Framework improves over time; quant stays the weak spot.
const SAMPLES: Sample[] = [
  { daysAgo: 41, title: 'Regional airline profitability', caseType: 'Profitability', industry: 'Transportation / Logistics', overall: 2, skills: [3, N, 2, 2, 2, N, N, 2], struggled: 'My structure was a list, not a tree.', concepts: 'Load factor\nCost per available seat mile', nextFocus: 'Build hypothesis-led structures.' },
  { daysAgo: 38, title: 'SaaS pricing review', caseType: 'Revenue', industry: 'Technology / SaaS', overall: 3, skills: [N, N, 3, 2, N, 3, 3, 3], concepts: 'Churn\nAnnual recurring revenue' },
  { daysAgo: 35, title: 'Hospital network market entry', caseType: 'Market Entry', industry: 'Healthcare / Pharmaceuticals', overall: 3, skills: [3, 3, 3, 3, 2, N, 3, 3], wentWell: 'Good clarifying questions.', concepts: 'Payer mix' },
  { daysAgo: 33, title: 'Coffee chain growth strategy', caseType: 'Growth Strategy', industry: 'Consumer Products / Retail', overall: 3, skills: [N, N, 3, 3, 3, 3, 4, 3] },
  { daysAgo: 30, title: 'Piano tuners in Chicago', caseType: 'Market Sizing', industry: 'Other', overall: 3, skills: [N, N, 4, 3, 2, N, N, 3], struggled: 'Rounded too early and lost accuracy.' },
  { daysAgo: 27, title: 'Plant cost reduction', caseType: 'Cost Reduction', industry: 'Manufacturing / Industrials', overall: 3, skills: [3, N, 3, 3, 3, 3, N, 3], concepts: 'Fixed vs. variable costs\nCapacity utilization' },
  { daysAgo: 24, title: 'Retail bank profitability', caseType: 'Profitability', industry: 'Financial Services', overall: 3, skills: [N, N, 3, 4, 3, 3, N, 3] },
  { daysAgo: 21, title: 'Telecom acquisition', caseType: 'Mergers and Acquisitions', industry: 'Telecom / Media', overall: 4, skills: [4, 3, 4, 4, 3, N, 4, 4], wentWell: 'Clear synthesis at the end.', concepts: 'Synergies\nRevenue vs. cost synergies' },
  { daysAgo: 18, title: 'Pharma product launch', caseType: 'Market Entry', industry: 'Healthcare / Pharmaceuticals', overall: 4, skills: [N, N, 4, 4, 3, 4, 4, 4], concepts: 'Patent cliff' },
  { daysAgo: 15, title: 'Grocery retailer profitability', caseType: 'Profitability', industry: 'Consumer Products / Retail', overall: 4, skills: [4, N, 4, 4, 2, 4, N, 4], struggled: 'Mental math under time pressure.', nextFocus: 'Daily mental-math drills.' },
  { daysAgo: 12, title: 'Insurer revenue growth', caseType: 'Revenue', industry: 'Insurance', overall: 3, skills: [N, N, 3, 4, 2, 3, 4, 3], concepts: 'Combined ratio' },
  { daysAgo: 9, title: 'Utility capital investment', caseType: 'Investment Decision', industry: 'Energy / Utilities', overall: 4, skills: [N, N, 4, 4, 3, 4, N, 4], concepts: 'Net present value\nPayback period' },
  { daysAgo: 7, title: 'Hotel operating model', caseType: 'Operating Model', industry: 'Travel / Hospitality', overall: 4, skills: [4, 4, 4, 5, N, N, 4, 4], wentWell: 'Structure felt natural this time.', concepts: 'RevPAR' },
  { daysAgo: 5, title: 'SaaS profitability', caseType: 'Profitability', industry: 'Technology / SaaS', overall: 4, skills: [N, N, 4, 5, 3, 4, N, 4], concepts: 'Customer acquisition cost\nGross margin', nextFocus: 'Slow down on the quant setup.' },
  { daysAgo: 3, title: 'Airline growth strategy', caseType: 'Growth Strategy', industry: 'Transportation / Logistics', overall: 4, skills: [N, N, 4, 4, 3, 4, 5, 4], concepts: 'Yield management' },
  { daysAgo: 1, title: 'Logistics cost reduction', caseType: 'Cost Reduction', industry: 'Transportation / Logistics', overall: 5, skills: [5, 4, 5, 5, 4, N, N, 5], wentWell: 'Confident recommendation with next steps.' },
];

/**
 * Clearly labelled sample data for trying the app. It lives under its own storage key and
 * is never merged with real cases.
 */
export function buildDemoData(now: Date = new Date()): AppData {
  const data = emptyAppData();
  data.cases = SAMPLES.map((s, i): CaseRecord => {
    const date = toISODate(addDays(now, -s.daysAgo));
    const stamp = new Date(addDays(now, -s.daysAgo).setHours(12, i, 0, 0)).toISOString();
    const skills = emptySkills();
    KEYS.forEach((k, j) => {
      skills[k] = { rating: s.skills[j], feedback: '' };
    });
    return {
      id: `demo-${i + 1}`,
      date,
      title: `Sample: ${s.title}`,
      source: 'Sample casebook',
      caseType: s.caseType,
      industry: s.industry,
      partner: 'Sample partner',
      overall: s.overall,
      overallFeedback: '',
      skills,
      wentWell: s.wentWell ?? '',
      struggled: s.struggled ?? '',
      concepts: s.concepts ?? '',
      nextFocus: s.nextFocus ?? '',
      improvementArea: s.struggled?.toLowerCase().includes('math') ? 'quant' : null,
      otherNotes: '',
      shareMode: 'private', // sample data is never shared
      createdAt: stamp,
      updatedAt: stamp,
    };
  });
  return data;
}
