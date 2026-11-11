/** The book's own solution to a casebook case, written up in our own words, with each exhibit rebuilt as a table of figures. */
export interface SolutionStep {
  title: string;
  body: string;
  /** Worked lines, such as "Revenue = 10M x $5 = $50M". */
  calc: string[];
  /** What a strong candidate catches or does at this step. */
  whatToNotice: string;
  /** What candidates typically miss or get wrong here, for this case. */
  commonMiss: string[];
  /** Short questions to compare your own attempt with ("Did you ...?"). */
  checkYourself: string[];
}

/** A chart drawn from an exhibit's own table: which column labels the points and which columns hold the values. */
export interface ExhibitChart {
  kind: 'bar' | 'line';
  labelColumn: number;
  seriesColumns: number[];
  /** Shown beside the axis, such as "$M". */
  unit: string;
}

export interface SolutionExhibit {
  /** The book's own label, such as "Exhibit 1: Sales by region". */
  title: string;
  caption: string;
  columns: string[];
  rows: string[][];
  /** True when the figures were read off a chart rather than given as numbers. */
  approx: boolean;
  /** How to go through this exhibit quickly: what to look at first and what comparison to make. */
  howToRead: string;
  /** The conclusions the exhibit supports, with the figures. */
  takeaways: string[];
  chart: ExhibitChart | null;
}

export interface ClarifyingQuestion {
  question: string;
  /** What the interviewer reveals when asked. */
  answer: string;
  /** What the answer unlocks or rules out. */
  why: string;
}

export interface FrameworkBucket {
  heading: string;
  /** The one question this bucket answers. */
  keyQuestion: string;
  /** Why the bucket belongs in the framework for this case. */
  why: string;
  /** What should be inside the bucket. */
  points: string[];
}

export interface RecommendationDetail {
  /** The supporting reasons, each with the numbers that carry it. */
  because: string[];
  /** A model delivery, spoken: the answer first, the reasons, the risks, the next steps. */
  delivery: string;
  /** What weaker recommendations leave out or get wrong on this case. */
  commonMisses: string[];
}

/** One of the few things we picked up from the case, in our own words (never the book's). */
export interface OurTakeaway {
  title: string;
  detail: string;
  /** Where in the case it comes from: the prompt, an exhibit, the brainstorm, the framework or the recommendation. */
  from: string;
}

export interface BookSolution {
  prompt: string;
  facts: string[];
  clarifyingQuestions: ClarifyingQuestion[];
  hypothesis: { statement: string; basis: string } | null;
  structure: FrameworkBucket[];
  steps: SolutionStep[];
  exhibits: SolutionExhibit[];
  recommendation: string;
  recommendationDetail: RecommendationDetail | null;
  risks: string[];
  nextSteps: string[];
  /** Our own top takeaways in our own words (from the prompt, the exhibits, the brainstorm): shown apart from the book's solution. */
  ourTakeaways: OurTakeaway[];
  /** `partial` when some exhibit or part of the solution could not be read. */
  confidence: 'high' | 'partial';
}

const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strs = (v: unknown, max = 600, cap = 20): string[] => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, cap) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** A number read from a cell of an exhibit such as "$1.2M", "95%", "(300)" or "1,200"; null when it is not a plain figure. */
export function parseFigure(cell: string): number | null {
  let t = String(cell).trim().replace(/^[~≈]/, '').replace(/[\s,$£€%]/g, '');
  if (/^\(.*\)$/.test(t)) t = `-${t.slice(1, -1)}`;
  const m = /^(-?\d+(?:\.\d+)?)([kmbt])?x?$/i.exec(t);
  if (!m) return null;
  const scale = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b' | 't'] ?? 1;
  return Number(m[1]) * scale;
}

function parseChart(v: unknown, columns: string[], rows: string[][]): ExhibitChart | null {
  const o = obj(v);
  if (o.kind !== 'bar' && o.kind !== 'line') return null;
  const labelColumn = Number(o.labelColumn);
  if (!Number.isInteger(labelColumn) || labelColumn < 0 || labelColumn >= columns.length) return null;
  const series = (Array.isArray(o.seriesColumns) ? o.seriesColumns : [])
    .map(Number)
    .filter((c) => Number.isInteger(c) && c >= 0 && c < columns.length && c !== labelColumn)
    // a series is only drawable when every row has a figure in it
    .filter((c) => rows.length > 0 && rows.every((r) => parseFigure(r[c] ?? '') !== null))
    .slice(0, 4);
  if (series.length === 0) return null;
  return { kind: o.kind, labelColumn, seriesColumns: [...new Set(series)], unit: str(o.unit, 12) };
}

/**
 * Accepts only a write-up of the right shape, tidied and cut to length, and refuses anything else, so the screen never has to cope with a
 * half-formed one. It needs a prompt, a recommendation and at least one step; exhibits with no rows or columns are dropped, and a chart
 * is kept only when its columns hold figures in every row. Write-ups from before the coaching layers parse too (those fields are empty).
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
      const o = obj(s);
      return {
        title: str(o.title, 160),
        body: str(o.body, 3000),
        calc: strs(o.calc, 300, 15),
        whatToNotice: str(o.whatToNotice, 700),
        commonMiss: strs(o.commonMiss, 500, 6),
        checkYourself: strs(o.checkYourself, 300, 5),
      };
    })
    .filter((s) => s.title && (s.body || s.calc.length > 0))
    .slice(0, 14);

  const structure: FrameworkBucket[] = (Array.isArray(v.structure) ? v.structure : [])
    .map((s) => {
      const o = obj(s);
      return { heading: str(o.heading, 160), keyQuestion: str(o.keyQuestion, 300), why: str(o.why, 500), points: strs(o.points, 400, 12) };
    })
    .filter((s) => s.heading)
    .slice(0, 8);

  const exhibits: SolutionExhibit[] = (Array.isArray(v.exhibits) ? v.exhibits : [])
    .map((e) => {
      const o = obj(e);
      const columns = strs(o.columns, 80, 12);
      const rows = (Array.isArray(o.rows) ? o.rows : [])
        .map((r) => (Array.isArray(r) ? r.map((c) => str(c, 120)).slice(0, columns.length || 12) : []))
        .filter((r) => r.some((c) => c !== ''))
        .slice(0, 30);
      return {
        title: str(o.title, 200),
        caption: str(o.caption, 300),
        columns,
        rows,
        approx: o.approx === true,
        howToRead: str(o.howToRead, 700),
        takeaways: strs(o.takeaways, 400, 5),
        chart: parseChart(o.chart, columns, rows),
      };
    })
    .filter((e) => e.title && e.columns.length > 0 && e.rows.length > 0)
    .slice(0, 8);

  const clarifyingQuestions: ClarifyingQuestion[] = (Array.isArray(v.clarifyingQuestions) ? v.clarifyingQuestions : [])
    .map((q) => {
      const o = obj(q);
      return { question: str(o.question, 400), answer: str(o.answer, 600), why: str(o.why, 400) };
    })
    .filter((q) => q.question && q.answer)
    .slice(0, 5); // a real interview allows four or five questions: only the most important ones

  const h = obj(v.hypothesis);
  const hypothesis = str(h.statement, 600) ? { statement: str(h.statement, 600), basis: str(h.basis, 600) } : null;

  const rd = obj(v.recommendationDetail);
  const detail: RecommendationDetail = { because: strs(rd.because, 500, 6), delivery: str(rd.delivery, 2500), commonMisses: strs(rd.commonMisses, 500, 6) };
  const recommendationDetail = detail.because.length > 0 || detail.delivery ? detail : null;

  const ourTakeaways: OurTakeaway[] = (Array.isArray(v.ourTakeaways) ? v.ourTakeaways : [])
    .map((t) => {
      const o = obj(t);
      return { title: str(o.title, 160), detail: str(o.detail, 700), from: str(o.from, 40) };
    })
    .filter((t) => t.title && t.detail)
    .slice(0, 3); // the top three only

  const prompt = str(v.prompt, 1200);
  const recommendation = str(v.recommendation, 1500);
  if (!prompt || !recommendation || steps.length === 0) return null;
  return {
    prompt,
    facts: strs(v.facts, 500, 20),
    clarifyingQuestions,
    hypothesis,
    structure,
    steps,
    exhibits,
    recommendation,
    recommendationDetail,
    risks: strs(v.risks, 500, 10),
    nextSteps: strs(v.nextSteps, 500, 10),
    ourTakeaways,
    confidence: v.confidence === 'partial' ? 'partial' : 'high',
  };
}
