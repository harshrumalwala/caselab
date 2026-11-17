import type { ExhibitChart, SolutionExhibit } from './bookSolution.ts';

/**
 * What a write-up's exhibit holds, against the exhibit drawn from it. The parser tidies, shortens and caps as it reads, and every one of
 * those cuts used to be silent: a member could be shown four panels of a six-panel book exhibit with nothing saying so. This is the one
 * place that says what was lost, and both the screen and `npm run audit:live` read it, so a note to the member and a line in the report can
 * never disagree.
 *
 * It compares the write-up to the render, not the book to the render: the casebook pages are not in the repo, so nothing here can say
 * whether the write-up itself is faithful to what the book printed.
 *
 * Two kinds of loss, kept apart because they are worth different things:
 * - `cut`: something is **gone** — a column, a row, a cell, a chart point, a series, a panel. The member is looking at less of the book's
 *   exhibit than the write-up holds, so the screen says so and the audit fails on it.
 * - `shortened`: a piece of text is **cut to length** — a panel heading, an axis title, a footnote, a row label under the axis, a
 *   reference line's label. The exhibit is whole; one label does not fit the drawing. Reported to us, not to the member.
 *
 * Every entry is a count, a position or a chart kind. Never a heading, a label, a cell or any other word of the content, so the report it
 * feeds stays safe to paste into an issue.
 */
export interface ExhibitLoss {
  cut: string[];
  shortened: string[];
}

/**
 * The chart kinds the renderer can draw. `parseChart` in `bookSolution.ts` reads this list rather than one of its own, so what the parser
 * keeps and what this comparison expects to see drawn can never disagree.
 *
 * A write-up whose chart is a kind not in here (marimekko, waterfall, bubble size, dual axis, a map) keeps its table and is drawn as that
 * table alone. That is a settled decision, not a loss: the table is the book's own exhibit, and the missing picture is ROADMAP R15. So it
 * is not counted as cut here — `npm run audit:live` counts those separately, under "a chart is in the write-up but cannot be drawn".
 */
export const DRAWN_KINDS = ['bar', 'stacked', 'line', 'pie', 'scatter'] as const;
export type DrawnKind = (typeof DRAWN_KINDS)[number];

/** What the write-up holds in one cell or label, as text. The parser reads a number as nothing, so a number counts as a cut. */
const held = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A list the chart reads by position (see `slots` in bookSolution.ts): a blank at the end says nothing, so losing it is not a loss. */
const slots = (v: unknown): string[] => {
  const out = list(v).map(held);
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

class Loss implements ExhibitLoss {
  cut: string[] = [];
  shortened: string[] = [];

  /** How many of a thing the write-up holds, against how many are drawn. */
  count(what: string, inWriteUp: number, onScreen: number): void {
    if (inWriteUp !== onScreen) this.cut.push(`${what}: ${inWriteUp} in the write-up, ${onScreen} on screen`);
  }

  /**
   * The write-up's words against the words drawn, as far as the drawn list goes: one that is the start of what was written was cut to
   * length; one that is something else entirely has lost more than its tail.
   */
  text(what: string, inWriteUp: readonly string[], onScreen: readonly string[]): void {
    let short = 0;
    let other = 0;
    onScreen.forEach((shown, i) => {
      const whole = inWriteUp[i];
      if (whole === undefined || whole === shown) return;
      if (shown.length > 0 && whole.startsWith(shown)) short += 1;
      else other += 1;
    });
    if (short > 0) this.shortened.push(`${what} shortened: ${short}`);
    if (other > 0) this.cut.push(`${what} not as written: ${other}`);
  }

  /** One string the member reads. */
  one(what: string, inWriteUp: unknown, onScreen: string): void {
    this.text(what, [held(inWriteUp)], [onScreen]);
  }
}

/**
 * A chart against the chart drawn from it: its kind, its panels, its series, and every row of figures and text the book prints around it.
 * A write-up that names the columns it plots instead of carrying the figures (the earlier `seriesColumns` form) is compared on its kind,
 * its text and its panels only, because its categories and series are built from the table rather than written down.
 */
function chartLoss(raw: unknown, onScreen: ExhibitChart | null, where: string, loss: Loss): void {
  const o = obj(raw);
  const described = typeof o.kind === 'string' || list(o.series).length > 0 || list(o.panels).length > 0;
  if (!onScreen) {
    // A kind we never draw is the settled trade above, not a loss. Anything else is one: the write-up asked for a chart we can draw and
    // the exhibit reached the member without it (a series that does not line up with its categories does exactly that).
    const weDraw = typeof o.kind !== 'string' || (DRAWN_KINDS as readonly string[]).includes(o.kind);
    if (described && weDraw) loss.cut.push(`${where}: in the write-up, not drawn`);
    return;
  }
  if (!described) return;

  if (typeof o.kind === 'string' && o.kind !== onScreen.kind) loss.cut.push(`${where} kind: ${o.kind} in the write-up, ${onScreen.kind} on screen`);
  loss.one(`${where} heading`, o.heading, onScreen.heading);
  loss.one(`${where} axis title`, o.axisTitle, onScreen.axisTitle);
  loss.one(`${where} footnote`, o.footnote, onScreen.footnote);

  const fromColumns = list(o.series).length === 0 && Array.isArray(o.seriesColumns);
  if (!fromColumns) {
    loss.count(`${where} series`, list(o.series).length, onScreen.series.length);
    loss.text(`${where} series names`, list(o.series).map((s) => held(obj(s).name)), onScreen.series.map((s) => s.name));
    loss.count(`${where} points`, list(o.categories).length, onScreen.categories.length);
    loss.text(`${where} point labels`, list(o.categories).map(held), onScreen.categories);
    list(o.series).forEach((s, i) => {
      const drawn = onScreen.series[i];
      if (drawn) loss.count(`${where} series ${i + 1} values`, list(obj(s).values).length, drawn.values.length);
    });
  }

  loss.count(`${where} totals`, slots(o.totals).length, onScreen.totals.length);
  loss.text(`${where} totals`, slots(o.totals), onScreen.totals);
  // A row the write-up gives no value is never drawn (`parseChart` drops it), so the drawn rows line up with the rows that have one and
  // not with every row written down. Comparing in the written order would hold one row's label against another's.
  const belowRows = list(o.belowRows).filter((r) => slots(obj(r).values).length > 0);
  loss.count(`${where} rows under the axis`, belowRows.length, onScreen.belowRows.length);
  belowRows.forEach((r, i) => {
    const drawn = onScreen.belowRows[i];
    if (!drawn) return;
    loss.count(`${where} row ${i + 1} under the axis`, slots(obj(r).values).length, drawn.values.length);
    // Its label is a line of the book's exhibit like the panel heading and the axis title, and is cut to length the same way (40
    // characters). Comparing only the values left a cut label invisible to the member and to the report (issue #143).
    loss.one(`${where} row ${i + 1} under the axis label`, obj(r).label, drawn.label);
  });
  const sideItems = slots(obj(o.sideNotes).items);
  if (sideItems.length > 0) {
    loss.count(`${where} side notes`, sideItems.length, onScreen.sideNotes?.items.length ?? 0);
    loss.text(`${where} side notes`, sideItems, onScreen.sideNotes?.items ?? []);
  }
  loss.count(`${where} reference lines`, list(o.referenceLines).length, onScreen.referenceLines.length);
  // A line the write-up gives no number is never drawn (`parseChart` drops it, and the count above says so), so the drawn lines line up
  // with the lines that have a number and not with every line written down — the same trap the rows under the axis have.
  const referenceLines = list(o.referenceLines).filter((r) => typeof obj(r).value === 'number' && Number.isFinite(obj(r).value as number));
  referenceLines.forEach((r, i) => {
    const drawn = onScreen.referenceLines[i];
    if (!drawn) return;
    // Its label is a line drawn on the chart like the panel heading and the axis title, and is cut to length the same way (30
    // characters). Comparing only how many lines there are left a cut label invisible to the member and to the report (issue #151).
    loss.one(`${where} reference line ${i + 1} label`, obj(r).label, drawn.label);
  });

  const panels = list(o.panels);
  loss.count(`${where} panels`, panels.length, onScreen.panels.length);
  panels.forEach((p, i) => {
    const drawn = onScreen.panels[i];
    if (drawn) chartLoss(p, drawn, `${where} panel ${i + 1}`, loss);
  });
}

/**
 * Everything the write-up's exhibit holds that the drawn exhibit does not. Two empty lists mean the member is seeing the whole of what the
 * write-up holds.
 *
 * Rows the write-up leaves entirely blank are not a loss: the parser drops them on purpose, so they are left out of the comparison. The
 * exhibit's own notes (how to read it, its takeaways) are not part of the drawn exhibit and are not compared here.
 */
export function exhibitLoss(raw: unknown, onScreen: SolutionExhibit): ExhibitLoss {
  const o = obj(raw);
  const loss = new Loss();
  loss.one('title', o.title, onScreen.title);
  loss.one('caption', o.caption, onScreen.caption);

  const columns = list(o.columns).map(held);
  loss.count('columns', columns.length, onScreen.columns.length);
  loss.text('column headings', columns, onScreen.columns);

  const rows = list(o.rows)
    .map((r) => list(r).map(held))
    .filter((r) => r.some((c) => c !== ''));
  loss.count('rows', rows.length, onScreen.rows.length);
  // The cells of every row at once, so a table that loses the tail of forty cells says so in one line rather than forty.
  const width = onScreen.columns.length;
  const shownCells: string[] = [];
  const wholeCells: string[] = [];
  let past = 0;
  onScreen.rows.forEach((shown, i) => {
    const whole = rows[i];
    if (!whole) return;
    shown.forEach((cell, c) => {
      shownCells.push(cell);
      wholeCells.push(whole[c] ?? cell);
    });
    if (whole.slice(width).some((c) => c !== '')) past += 1;
  });
  loss.text('cells', wholeCells, shownCells);
  if (past > 0) loss.cut.push(`rows with a cell past the last column: ${past}`);

  chartLoss(o.chart, onScreen.chart, 'chart', loss);
  return { cut: loss.cut, shortened: loss.shortened };
}
