/** The book's own solution to a casebook case, written up in our own words, and rebuilt exhibits as tables of figures. */
export interface SolutionStep {
  title: string;
  body: string;
  /** Worked lines, such as "Revenue = 10M x $5 = $50M". */
  calc: string[];
}

export interface SolutionExhibit {
  /** The book's own label, such as "Exhibit 1: Sales by region". */
  title: string;
  caption: string;
  columns: string[];
  rows: string[][];
  /** True when the figures were read off a chart rather than given as numbers. */
  approx: boolean;
}

export interface BookSolution {
  prompt: string;
  facts: string[];
  structure: { heading: string; points: string[] }[];
  steps: SolutionStep[];
  exhibits: SolutionExhibit[];
  recommendation: string;
  risks: string[];
  nextSteps: string[];
  /** Where the book's own numbers or text contradict themselves, with the correct value. */
  bookErrors: string[];
  /** `partial` when some exhibit or part of the solution could not be read. */
  confidence: 'high' | 'partial';
}

const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strs = (v: unknown, max = 600, cap = 20): string[] => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, cap) : []);

/**
 * Accepts only a write-up of the right shape, tidied and cut to length, and refuses anything else, so the screen never has to cope with a
 * half-formed one. It needs a prompt, a recommendation and at least one step; exhibits with no rows or columns are dropped.
 */
export function parseBookSolution(raw: unknown): BookSolution | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  const steps: SolutionStep[] = (Array.isArray(v.steps) ? v.steps : [])
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { title: str(o.title, 160), body: str(o.body, 3000), calc: strs(o.calc, 300, 15) };
    })
    .filter((s) => s.title && (s.body || s.calc.length > 0))
    .slice(0, 14);

  const structure = (Array.isArray(v.structure) ? v.structure : [])
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { heading: str(o.heading, 160), points: strs(o.points, 400, 12) };
    })
    .filter((s) => s.heading)
    .slice(0, 8);

  const exhibits: SolutionExhibit[] = (Array.isArray(v.exhibits) ? v.exhibits : [])
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const columns = strs(o.columns, 80, 12);
      const rows = (Array.isArray(o.rows) ? o.rows : [])
        .map((r) => (Array.isArray(r) ? r.map((c) => str(c, 120)).slice(0, columns.length || 12) : []))
        .filter((r) => r.some((c) => c !== ''))
        .slice(0, 30);
      return { title: str(o.title, 200), caption: str(o.caption, 300), columns, rows, approx: o.approx === true };
    })
    .filter((e) => e.title && e.columns.length > 0 && e.rows.length > 0)
    .slice(0, 8);

  const prompt = str(v.prompt, 1200);
  const recommendation = str(v.recommendation, 1500);
  if (!prompt || !recommendation || steps.length === 0) return null;
  return {
    prompt,
    facts: strs(v.facts, 500, 20),
    structure,
    steps,
    exhibits,
    recommendation,
    risks: strs(v.risks, 400, 10),
    nextSteps: strs(v.nextSteps, 400, 10),
    bookErrors: strs(v.bookErrors, 400, 8),
    confidence: v.confidence === 'partial' ? 'partial' : 'high',
  };
}
