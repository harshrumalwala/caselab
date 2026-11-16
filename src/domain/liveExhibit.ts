import type { ExhibitChart, SolutionExhibit } from './bookSolution';
import { parseFigure } from './bookSolution';

/**
 * Whether the table under a drawn chart only repeats what the chart already shows.
 *
 * Our solutions carry a table for every exhibit, and for the ones the book prints as a chart that table is our own transcription of the
 * chart's figures, written when the solution was made. In a live case the candidate should see what the book prints and nothing more, so
 * the exact figures of a transcription are left out when a chart is drawn. A table the book prints beside its chart (DigiBooks' population
 * row) must stay, and the data does not say which is which (no exhibit is flagged), so this reads the table itself:
 *
 *   the table is a repeat only when EVERY body cell is made of numbers and words the chart prints.
 *
 * A number counts when it is a plotted value, or a figure in anything the chart prints (a label on a point, a total, a category, a
 * heading, a footnote...), compared with its scale ("20M" does not match 20). A word counts when it appears in the chart's own text.
 * The rows of text the book prints under a chart's axis (`belowRows`) do not count as the chart showing something: the chart draws them,
 * but they are exactly what a book table beside a chart looks like, so a table that matches only those is kept. One cell the chart does
 * not account for keeps the whole table. Column headings are not read: they name the columns and say nothing the book prints in the body.
 *
 * Without a chart there is nothing to repeat, so the table is always kept.
 */
export function tableRepeatsChart(exhibit: Pick<SolutionExhibit, 'columns' | 'rows' | 'chart' | 'approx'>): boolean {
  const chart = exhibit.chart;
  if (!chart) return false;
  if (exhibit.columns.length === 0 || exhibit.rows.length === 0) return false;

  return cellsTheChartDoesNotShow(exhibit).length === 0;
}

/** The body cells of the table that carry a number or a word the chart does not print (empty when the table is a pure repeat). */
export function cellsTheChartDoesNotShow(exhibit: Pick<SolutionExhibit, 'rows' | 'chart' | 'approx'>): string[] {
  if (!exhibit.chart) return exhibit.rows.flat().filter((c) => c !== '');
  const printed = collect(exhibit.chart, exhibit.approx);
  return exhibit.rows.flat().filter((cell) => !cellIsAccountedFor(cell, printed));
}

/** What a chart puts in front of the reader, as the numbers and the words in it. */
interface Printed {
  numbers: number[];
  words: Set<string>;
}

/**
 * Words that carry no figure of their own: a cell is not kept for saying "of" or "and", for the hedge in "about 5%" (our reading of a chart
 * that printed no figure), or for the label of a sum ("Total") whose figures the chart prints anyway.
 */
const FILLER = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'per', 'by', 'vs', 'is', 'are', 'with', 'at', 'as', 'about', 'approximately', 'approx', 'around', 'roughly', 'total']);

/** A figure such as "$1.2M", "(300)", "45%", "~45" or "1,200", found anywhere in a piece of text. */
const FIGURE = /\(?-?[$£€]?\d[\d,]*(?:\.\d+)?(?:%|[kmbt]\b|x\b)?\)?/gi;
const WORD = /\p{L}[\p{L}'’]*/gu;

/** The same word whether it is written singular or plural, so "customers" in a table matches a chart that says "Customer". */
const stem = (w: string): string => {
  const t = w.toLowerCase().replace(/’/g, "'");
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t;
};

function numbersIn(text: string): number[] {
  return (text.match(FIGURE) ?? []).map((t) => parseFigure(t)).filter((n): n is number => n !== null);
}

function wordsIn(text: string): string[] {
  return (text.match(WORD) ?? []).map(stem).filter((w) => !FILLER.has(w));
}

/**
 * The plotted values the chart puts in figures in front of the reader. A value counts only when the chart prints it (on the bar or point,
 * or as a pie slice's share), the way `ExhibitChart` does. A plotted value that is not printed is a figure the reader can only judge by
 * eye, so a table of exact figures beside it is something the book printed. The exception is an exhibit marked `approx`: its figures were
 * read off a chart that printed none, so the table is our reading of the drawing and every plotted value counts.
 */
function printedValues(chart: ExhibitChart, approx: boolean): number[] {
  if (approx) return chart.series.flatMap((s) => s.values);
  const shares = chart.kind === 'pie' && chart.series[0] ? chart.series[0].values.map((v) => Math.round((v / (chart.series[0].values.reduce((a, b) => a + b, 0) || 1)) * 100)) : [];
  // a label of its own is read as text; an empty label means "print the value", and a blank one means "print nothing"
  return [...shares, ...chart.series.flatMap((s) => (chart.valueLabels ? s.values.filter((_, i) => !s.labels[i]) : []))];
}

/** Everything the chart prints, apart from the text rows under its axis. */
function collect(chart: ExhibitChart, approx: boolean, into: Printed = { numbers: [], words: new Set() }): Printed {
  const texts: string[] = [
    chart.heading,
    chart.axisTitle,
    chart.unit,
    chart.footnote,
    chart.axisEnds?.top ?? '',
    chart.axisEnds?.bottom ?? '',
    ...chart.categories,
    ...chart.totals,
    ...chart.series.flatMap((s) => [s.name, ...s.labels]),
    ...(chart.sideNotes ? [chart.sideNotes.heading, ...chart.sideNotes.items] : []),
    ...chart.referenceLines.map((r) => r.label),
  ];
  into.numbers.push(...printedValues(chart, approx), ...chart.xValues, ...chart.referenceLines.map((r) => r.value));
  for (const t of texts) {
    into.numbers.push(...numbersIn(t));
    for (const w of wordsIn(t)) into.words.add(w);
  }
  for (const p of chart.panels) collect(p, approx, into);
  return into;
}

const same = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function cellIsAccountedFor(cell: string, printed: Printed): boolean {
  for (const n of numbersIn(cell)) if (!printed.numbers.some((m) => same(m, n))) return false;
  // the words of the cell with its figures taken out ("75% of current revenue" is "current revenue" and 75)
  for (const w of wordsIn(cell.replace(FIGURE, ' '))) if (!printed.words.has(w)) return false;
  return true;
}
