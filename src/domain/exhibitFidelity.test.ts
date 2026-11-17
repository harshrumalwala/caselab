// What the write-up holds for an exhibit, against what is drawn from it (issue #95). Two things have to hold: it names every kind of
// loss the parser can cause, and it says nothing when nothing was lost, or the screen would cry wolf at the member on every exhibit.
import { describe, expect, it } from 'vitest';
import { LIVE_EXHIBIT_LIMITS, SOLUTION_EXHIBIT_LIMITS, parseSolutionExhibit } from './bookSolution';
import { exhibitLoss } from './exhibitFidelity';

const panel = (heading: string) => ({ kind: 'bar', heading, categories: ['a'], series: [{ name: 's', values: [1] }] });

const raw = (over: Record<string, unknown> = {}) => ({
  title: 'Exhibit 1: Revenue by region',
  caption: 'All figures in $M',
  columns: ['Region', 'Revenue'],
  rows: [
    ['North', '10'],
    ['South', '20'],
  ],
  chart: { kind: 'bar', categories: ['North', 'South'], series: [{ name: 'Revenue', values: [10, 20] }] },
  ...over,
});

/** The loss the Full solution screen would have: read the exhibit the way that screen does, then compare it with the write-up. */
const lossOf = (over: Record<string, unknown> = {}, limits = SOLUTION_EXHIBIT_LIMITS) => {
  const written = raw(over);
  return exhibitLoss(written, parseSolutionExhibit(written, limits));
};

describe('an exhibit that reaches the screen whole', () => {
  it('reports nothing at all', () => {
    expect(lossOf()).toEqual({ cut: [], shortened: [] });
  });

  it('does not count a blank row the parser drops on purpose, nor the tidying of stray spaces', () => {
    expect(lossOf({ rows: [['North', '10'], ['', ''], ['  South ', '20']] })).toEqual({ cut: [], shortened: [] });
  });

  it('does not count a trailing blank label above a bar: the book prints nothing there and nothing is lost', () => {
    expect(lossOf({ chart: { kind: 'bar', categories: ['North', 'South'], series: [{ name: 'R', values: [1, 2] }], totals: ['10', ''] } })).toEqual({ cut: [], shortened: [] });
  });

  it('says nothing about an exhibit with no chart', () => {
    expect(lossOf({ chart: undefined })).toEqual({ cut: [], shortened: [] });
  });
});

describe('what it compares, field by field', () => {
  it('the column list', () => {
    const columns = Array.from({ length: SOLUTION_EXHIBIT_LIMITS.columns + 3 }, (_, i) => `c${i}`);
    expect(lossOf({ columns }).cut).toContain(`columns: ${columns.length} in the write-up, ${SOLUTION_EXHIBIT_LIMITS.columns} on screen`);
  });

  it('the row count', () => {
    const rows = Array.from({ length: SOLUTION_EXHIBIT_LIMITS.rows + 2 }, (_, i) => [`r${i}`, '1']);
    expect(lossOf({ rows }).cut).toContain(`rows: ${rows.length} in the write-up, ${SOLUTION_EXHIBIT_LIMITS.rows} on screen`);
  });

  it('the order of the rows, by comparing them where they stand', () => {
    const written = raw();
    const drawn = parseSolutionExhibit(written);
    const swapped = { ...drawn, rows: [drawn.rows[1], drawn.rows[0]] };
    expect(exhibitLoss(written, swapped).cut).toContain('cells not as written: 4');
  });

  it('a cell that ran past the last column', () => {
    expect(lossOf({ columns: ['Region'], rows: [['North', '10']] }).cut).toContain('rows with a cell past the last column: 1');
  });

  it('the chart kind', () => {
    const written = raw();
    const drawn = parseSolutionExhibit(written);
    expect(exhibitLoss(written, { ...drawn, chart: { ...drawn.chart!, kind: 'line' } }).cut).toContain('chart kind: bar in the write-up, line on screen');
  });

  it('a chart of a kind we can draw that is never drawn (its series do not line up with its categories)', () => {
    expect(lossOf({ chart: { kind: 'bar', categories: ['a', 'b'], series: [{ name: 's', values: [1] }] } }).cut).toContain('chart: in the write-up, not drawn');
  });

  it('but not a chart kind we never draw: the exhibit is the book\'s own table, and the picture is ROADMAP R15', () => {
    for (const kind of ['waterfall', 'marimekko', 'bubble']) {
      const loss = lossOf({ chart: { kind, categories: ['a'], series: [{ name: 's', values: [1] }] } });
      expect(loss, kind).toEqual({ cut: [], shortened: [] });
    }
  });

  it('the series count', () => {
    const written = raw();
    const drawn = parseSolutionExhibit(written);
    expect(exhibitLoss(written, { ...drawn, chart: { ...drawn.chart!, series: [] } }).cut).toContain('chart series: 1 in the write-up, 0 on screen');
  });

  it('the series names', () => {
    const written = raw();
    const drawn = parseSolutionExhibit(written);
    const renamed = { ...drawn.chart!, series: [{ ...drawn.chart!.series[0], name: 'Costs' }] };
    expect(exhibitLoss(written, { ...drawn, chart: renamed }).cut).toContain('chart series names not as written: 1');
  });

  it('the point count', () => {
    const written = raw();
    const drawn = parseSolutionExhibit(written);
    const fewer = { ...drawn.chart!, categories: ['North'] };
    expect(exhibitLoss(written, { ...drawn, chart: fewer }).cut).toContain('chart points: 2 in the write-up, 1 on screen');
  });

  it('the panel count, and the panels one by one', () => {
    const panels = Array.from({ length: 12 }, (_, i) => panel(`p${i}`));
    const loss = lossOf({ chart: { kind: 'bar', categories: ['a'], series: [{ name: 's', values: [1] }], panels } });
    expect(loss.cut).toContain('chart panels: 12 in the write-up, 8 on screen');
    const written = raw({ chart: { kind: 'bar', categories: ['a'], series: [{ name: 's', values: [1] }], panels: [{ ...panel('p'), categories: ['a', 'b'], series: [{ name: 's', values: [1, 2] }] }] } });
    const drawn = parseSolutionExhibit(written);
    const trimmed = { ...drawn.chart!, panels: [{ ...drawn.chart!.panels[0], categories: ['a'], series: [{ ...drawn.chart!.panels[0].series[0], values: [1] }] }] };
    expect(exhibitLoss(written, { ...drawn, chart: trimmed }).cut).toContain('chart panel 1 points: 2 in the write-up, 1 on screen');
  });

  it('a label above a bar that moved to another bar', () => {
    const written = raw({ chart: { kind: 'bar', categories: ['North', 'South'], series: [{ name: 'R', values: [1, 2] }], totals: ['', 'Growth = 13%'] } });
    const drawn = parseSolutionExhibit(written);
    const shifted = { ...drawn.chart!, totals: ['Growth = 13%'] };
    expect(exhibitLoss(written, { ...drawn, chart: shifted }).cut).toContain('chart totals: 2 in the write-up, 1 on screen');
  });
});

describe('text cut to length is told apart from content that is gone', () => {
  it('a chart heading too long for its panel is shortened, not cut', () => {
    const heading = 'A heading that runs on well past the sixty characters a panel can hold';
    const loss = lossOf({ chart: { kind: 'bar', heading, categories: ['a'], series: [{ name: 's', values: [1] }] } });
    expect(loss.shortened).toEqual(['chart heading shortened: 1']);
    expect(loss.cut).toEqual([]);
  });

  it('a label under the axis too long for its row is shortened, not cut (issue #143)', () => {
    const label = 'Operating margin after the new distribution centre opens';
    const loss = lossOf({ chart: { kind: 'bar', categories: ['a'], series: [{ name: 's', values: [1] }], belowRows: [{ label, values: ['4%'] }] } });
    expect(loss.shortened).toEqual(['chart row 1 under the axis label shortened: 1']);
    expect(loss.cut).toEqual([]);
  });

  it('a label under the axis that fits is not reported', () => {
    const loss = lossOf({ chart: { kind: 'bar', categories: ['a'], series: [{ name: 's', values: [1] }], belowRows: [{ label: 'Operating margin', values: ['4%'] }] } });
    expect(loss).toEqual({ cut: [], shortened: [] });
  });

  it('names the row, so a report says which of the rows under the axis was cut', () => {
    const long = 'A row label that runs on well past the forty characters a row under the axis can hold';
    const loss = lossOf({
      chart: {
        kind: 'bar',
        categories: ['a'],
        series: [{ name: 's', values: [1] }],
        belowRows: [
          { label: 'Revenue', values: ['10'] },
          { label: long, values: ['20'] },
        ],
      },
    });
    expect(loss.shortened).toEqual(['chart row 2 under the axis label shortened: 1']);
  });

  it('measures each label against the row it is drawn as, not against the row it was written as', () => {
    // The parser drops a row with no values, so the second row written is the first row drawn: comparing by written position would
    // hold a short label against a long one and call it lost.
    const loss = lossOf({
      chart: {
        kind: 'bar',
        categories: ['a'],
        series: [{ name: 's', values: [1] }],
        belowRows: [
          { label: 'Nothing under this one', values: [] },
          { label: 'Operating margin', values: ['4%'] },
        ],
      },
    });
    expect(loss).toEqual({ cut: [], shortened: [] });
  });

  it('a label under the axis replaced by another is content gone, not text cut to length', () => {
    const written = raw({ chart: { kind: 'bar', categories: ['a'], series: [{ name: 's', values: [1] }], belowRows: [{ label: 'Operating margin', values: ['4%'] }] } });
    const drawn = parseSolutionExhibit(written);
    const swapped = { ...drawn.chart!, belowRows: [{ label: 'Something else', values: ['4%'] }] };
    expect(exhibitLoss(written, { ...drawn, chart: swapped }).cut).toContain('chart row 1 under the axis label not as written: 1');
  });

  it('counts the cells of the whole table in one line, not one line per cell', () => {
    const long = 'x'.repeat(900);
    const loss = lossOf({ rows: [['North', long], ['South', long]] });
    expect(loss.shortened).toEqual(['cells shortened: 2']);
    expect(loss.cut).toEqual([]);
  });
});

describe('what the live case loses, all the way from the write-up', () => {
  it('counts nothing when the live case may carry more than the write-up screen would', () => {
    const rows = Array.from({ length: SOLUTION_EXHIBIT_LIMITS.rows + 10 }, (_, i) => [`r${i}`, '1']);
    // The live case may send up to 400 rows, so nothing is lost there; the Full solution screen stops at 70.
    expect(lossOf({ rows }, LIVE_EXHIBIT_LIMITS)).toEqual({ cut: [], shortened: [] });
    expect(lossOf({ rows }).cut).toHaveLength(1);
  });
});

describe('what it may say', () => {
  it('holds counts, positions and chart kinds only: never a heading, a label or a cell', () => {
    const loss = lossOf({
      title: `ZZTITLE ${'t'.repeat(500)}`,
      caption: `ZZCAPTION ${'c'.repeat(4000)}`,
      columns: Array.from({ length: 30 }, (_, i) => `ZZCOLUMN${i}`),
      rows: [['ZZCELL', `ZZLONGCELL${'x'.repeat(900)}`]],
      chart: {
        kind: 'bar',
        heading: `ZZHEADING${'h'.repeat(200)}`,
        categories: ['ZZCATEGORY'],
        series: [{ name: 'ZZSERIES', values: [1] }],
        belowRows: [{ label: `ZZBELOWLABEL${'b'.repeat(100)}`, values: ['1'] }],
        panels: Array.from({ length: 12 }, () => panel('ZZPANEL')),
      },
    });
    const text = [...loss.cut, ...loss.shortened].join(' ');
    expect(text).not.toMatch(/ZZ(TITLE|CAPTION|COLUMN|CELL|LONGCELL|HEADING|CATEGORY|SERIES|PANEL|BELOWLABEL)/);
    expect(loss.cut.length + loss.shortened.length).toBeGreaterThan(0);
  });
});
