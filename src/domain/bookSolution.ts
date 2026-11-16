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

/** One series of a chart: what is plotted, and the labels the book prints on the points (a blank label means "print the value"). */
export interface ChartSeries {
  name: string;
  values: number[];
  labels: string[];
  /** In a bar chart a series can be drawn as a line over the bars (the book's combination charts). */
  type: 'bar' | 'line';
  /** The colour the book draws it in, when that matters (the lines of a combination chart). */
  color: string;
}

/**
 * A chart drawn the way the book draws it, from the figures the book plots. `kind` is the book's own chart type; the rest says what the book
 * prints around it: the axis title, the labels on the points, totals above stacks, rows of text under the axis, notes beside the chart, and
 * (when one exhibit shows several charts side by side) the panels.
 */
export interface ExhibitChart {
  kind: 'bar' | 'stacked' | 'line' | 'pie' | 'scatter';
  /** A heading over this chart when the exhibit has several, such as "VARIABLE". */
  heading: string;
  /** What the vertical axis measures, as printed, such as "Total revenue". */
  axisTitle: string;
  /** Shown with the axis numbers, such as "$M" or "%". */
  unit: string;
  categories: string[];
  series: ChartSeries[];
  /** Labels the book prints above each bar or stack, such as "434M". */
  totals: string[];
  /** Rows of text the book prints under the axis, aligned with the categories (for example an EBITDA row). */
  belowRows: { label: string; values: string[] }[];
  /** A column of notes beside the chart, such as "CAGR" figures or the average price, lined up with the segments. */
  sideNotes: { heading: string; items: string[] } | null;
  yMin: number | null;
  yMax: number | null;
  yStep: number | null;
  /** Stacks that each fill the whole height (percent of total). */
  percent: boolean;
  /** Bars drawn sideways. */
  horizontal: boolean;
  /** Write each segment's series name inside the stack, as the book does instead of a legend. */
  segmentNames: boolean;
  /** For a scatter chart: the horizontal position of each point (the categories are then the point labels). */
  xValues: number[];
  /** Print the value on each bar or point. Off when the book prints none (the labels it does print are always shown). */
  valueLabels: boolean;
  /** For a scatter chart: print the name beside each point (the books sometimes label none). */
  pointLabels: boolean;
  /** A note the book prints under or beside the chart, such as a footnote or a callout. */
  footnote: string;
  /** Words the book prints at the two ends of the vertical axis, such as "Extremely important" and "Not at all important". */
  axisEnds: { top: string; bottom: string } | null;
  /** Several charts side by side in one exhibit; each has its own heading. */
  panels: ExhibitChart[];
}

/** A chart with nothing set, to build one from (for tests and for charts that only need a few fields). */
export const blankChart: ExhibitChart = {
  kind: 'bar',
  heading: '',
  axisTitle: '',
  unit: '',
  categories: [],
  series: [],
  totals: [],
  belowRows: [],
  sideNotes: null,
  yMin: null,
  yMax: null,
  yStep: null,
  percent: false,
  horizontal: false,
  segmentNames: false,
  xValues: [],
  valueLabels: true,
  pointLabels: true,
  footnote: '',
  axisEnds: null,
  panels: [],
};

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

const KINDS = ['bar', 'stacked', 'line', 'pie', 'scatter'] as const;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * How much of one exhibit is kept. A whole write-up uses `SOLUTION_EXHIBIT_LIMITS`; a caller that has already cut the exhibit to its own
 * size (the live case, whose Edge Function allows a bigger table) passes those caps instead, so nothing it sent in full is cut twice.
 */
export interface ExhibitLimits {
  columns: number;
  rows: number;
  /** Points on a chart: categories, the totals above them and the rows of text below. */
  points: number;
}

/** What a casebook write-up may hold: big enough for every exhibit in the library (see KNOWN_ISSUES on the caps). */
export const SOLUTION_EXHIBIT_LIMITS: ExhibitLimits = { columns: 16, rows: 70, points: 70 };

/**
 * What a live case may hold: the caps `readExhibits` in `supabase/functions/_shared/liveCaseCoach.ts` has already applied by the time an
 * exhibit reaches the screen. Reading it with these rather than the write-up's own (smaller) caps means a table the Edge Function sent
 * whole is never cut a second time. Kept here, beside the write-up's caps, so the screen and the live-case audit read the same numbers.
 */
export const LIVE_EXHIBIT_LIMITS: ExhibitLimits = { columns: 40, rows: 400, points: 400 };

/**
 * Reads a chart. A chart either names the table columns it plots (the earlier form: `labelColumn` and `seriesColumns`), or carries the figures
 * the book plots (`categories` and `series`). Anything that cannot be drawn is dropped, so the screen shows the table alone rather than a
 * half-drawn chart.
 */
function parseChart(v: unknown, columns: string[], rows: string[][], limits: ExhibitLimits, depth = 0): ExhibitChart | null {
  const o = obj(v);
  const kind = KINDS.find((k) => k === o.kind);
  if (!kind) return null;

  let categories = strs(o.categories, 80, limits.points);
  let series: ChartSeries[] = (Array.isArray(o.series) ? o.series : [])
    .map((x) => {
      const so = obj(x);
      const values = (Array.isArray(so.values) ? so.values : []).map((n) => num(n) ?? NaN);
      return {
        name: str(so.name, 80),
        values,
        // a label of just a space is deliberate: the book prints nothing on that point (an empty label means "print the value")
        labels: (Array.isArray(so.labels) ? so.labels : []).map((l) => (typeof l === 'string' && l.length > 0 && l.trim() === '' ? ' ' : str(l, 40))),
        type: so.type === 'line' ? ('line' as const) : ('bar' as const),
        color: str(so.color, 20),
      };
    })
    .filter((x) => x.values.length > 0 && x.values.every((n) => Number.isFinite(n)))
    .slice(0, 6);

  // The earlier form: plot columns of the exhibit's own table.
  if (series.length === 0 && Array.isArray(o.seriesColumns)) {
    const labelColumn = Number(o.labelColumn);
    if (!Number.isInteger(labelColumn) || labelColumn < 0 || labelColumn >= columns.length) return null;
    const cols = [...new Set((o.seriesColumns as unknown[]).map(Number))]
      .filter((c) => Number.isInteger(c) && c >= 0 && c < columns.length && c !== labelColumn)
      .filter((c) => rows.length > 0 && rows.every((r) => parseFigure(r[c] ?? '') !== null))
      .slice(0, 4);
    categories = rows.map((r) => r[labelColumn] ?? '');
    series = cols.map((c) => ({ name: columns[c] ?? '', values: rows.map((r) => parseFigure(r[c] ?? '') ?? 0), labels: [], type: 'bar' as const, color: '' }));
  }

  const panels = depth === 0 ? (Array.isArray(o.panels) ? o.panels : []).map((p) => parseChart(p, columns, rows, limits, 1)).filter((p): p is ExhibitChart => p !== null).slice(0, 4) : [];
  if (series.length === 0 && panels.length === 0) return null;
  // every series must line up with the categories, or it cannot be drawn
  if (series.some((x) => x.values.length !== categories.length)) return null;

  const sn = obj(o.sideNotes);
  const sideItems = strs(sn.items, 60, 12);
  return {
    kind,
    heading: str(o.heading, 60),
    axisTitle: str(o.axisTitle, 80),
    unit: str(o.unit, 12),
    categories,
    series,
    totals: strs(o.totals, 30, limits.points),
    belowRows: (Array.isArray(o.belowRows) ? o.belowRows : [])
      .map((r) => ({ label: str(obj(r).label, 40), values: strs(obj(r).values, 30, limits.points) }))
      .filter((r) => r.values.length > 0)
      .slice(0, 4),
    sideNotes: sideItems.length > 0 ? { heading: str(sn.heading, 60), items: sideItems } : null,
    yMin: num(o.yMin),
    yMax: num(o.yMax),
    yStep: num(o.yStep) !== null && (num(o.yStep) as number) > 0 ? num(o.yStep) : null,
    percent: o.percent === true,
    horizontal: o.horizontal === true,
    segmentNames: o.segmentNames === true,
    xValues: (Array.isArray(o.xValues) ? o.xValues : []).map((n) => num(n) ?? NaN).filter((n) => Number.isFinite(n)),
    valueLabels: o.valueLabels !== false,
    pointLabels: o.pointLabels !== false,
    footnote: str(o.footnote, 240),
    axisEnds: str(obj(o.axisEnds).top, 40) || str(obj(o.axisEnds).bottom, 40) ? { top: str(obj(o.axisEnds).top, 40), bottom: str(obj(o.axisEnds).bottom, 40) } : null,
    panels,
  };
}

/**
 * Reads one exhibit: its table, tidied and cut to length, and the chart the book drew over it (null when there is none, or when it is a
 * kind or a shape we cannot draw). Shared by the full solution and by a live case, so an exhibit looks the same in both. It always returns
 * an exhibit: whether one with no title or no table is worth showing is the caller's decision.
 */
export function parseSolutionExhibit(raw: unknown, limits: ExhibitLimits = SOLUTION_EXHIBIT_LIMITS): SolutionExhibit {
  const o = obj(raw);
  // A heading can be blank in the book itself: keep it, so the columns still line up with the rows.
  const columns = (Array.isArray(o.columns) ? o.columns : []).map((c) => str(c, 80)).slice(0, limits.columns);
  const rows = (Array.isArray(o.rows) ? o.rows : [])
    .map((r) => (Array.isArray(r) ? r.map((c) => str(c, 120)).slice(0, columns.length || limits.columns) : []))
    .filter((r) => r.some((c) => c !== ''))
    .slice(0, limits.rows);
  return {
    title: str(o.title, 200),
    caption: str(o.caption, 300),
    columns,
    rows,
    approx: o.approx === true,
    howToRead: str(o.howToRead, 700),
    takeaways: strs(o.takeaways, 400, 5),
    chart: parseChart(o.chart, columns, rows, limits),
  };
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
    .map((e) => parseSolutionExhibit(e))
    .filter((e) => e.title && e.columns.length > 0 && e.rows.length > 0)
    .slice(0, 12);

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
