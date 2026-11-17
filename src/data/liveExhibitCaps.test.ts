// @vitest-environment node
//
// The seam between the Edge Function and the screen (issue #95). An exhibit on its way to a member in a live case is read twice: once by
// `readExhibits` in supabase/functions/_shared/liveCaseCoach.ts, which decides how much of it leaves the server, and once by
// `parseSolutionExhibit` in src/domain/bookSolution.ts, which decides how much of it is drawn. If the second set of caps is smaller than
// the first, the exhibit is cut a second time on its way to the screen and nobody is told.
//
// KNOWN_ISSUES used to say the two sets were "kept in step by hand: change one and the other has to be changed with it". This is that
// note turned into a test: it sends an exhibit far bigger than either cap through the real server reader and then through the real screen
// reader, and asks `exhibitLoss` whether the screen lost anything the server had let through. Changing one cap without the other fails
// here rather than in production.
import { describe, expect, it } from 'vitest';
import { readSolution } from '../../supabase/functions/_shared/liveCaseCoach';
import { LIVE_EXHIBIT_LIMITS, SOLUTION_EXHIBIT_LIMITS, parseSolutionExhibit } from '../domain/bookSolution';
import { exhibitLoss } from '../domain/exhibitFidelity';

/** Far past every cap on either side, so each one shows itself. */
const huge = {
  title: `Exhibit 1: ${'t'.repeat(600)}`,
  caption: 'c'.repeat(4000),
  columns: Array.from({ length: 60 }, (_, i) => `Column ${i} ${'h'.repeat(900)}`),
  rows: Array.from({ length: 500 }, (_, r) => Array.from({ length: 60 }, (_, c) => `${r}-${c} ${'x'.repeat(900)}`)),
  approx: false,
  chart: null,
};

/** What the Edge Function sends the browser for that exhibit: the one copy the screen then draws. */
const sent = () => readSolution({ prompt: 'A case.', exhibits: [huge] })!.exhibits[0];

describe('what the live case sends is never cut again by the screen', () => {
  it('loses nothing at all between the Edge Function and the drawn exhibit', () => {
    const fromServer = sent();
    const drawn = parseSolutionExhibit(fromServer, LIVE_EXHIBIT_LIMITS);
    // The whole point: whatever the server let through reaches the member, so there is nothing to tell them about.
    expect(exhibitLoss(fromServer, drawn)).toEqual({ cut: [], shortened: [] });
    expect(drawn.cut).toEqual([]);
    expect(drawn.shortened).toEqual([]);
  });

  it('reads the same caps as readExhibits, column for column, row for row and character for character', () => {
    const fromServer = sent();
    expect(fromServer.columns).toHaveLength(LIVE_EXHIBIT_LIMITS.columns);
    expect(fromServer.rows).toHaveLength(LIVE_EXHIBIT_LIMITS.rows);
    expect(fromServer.rows[0]).toHaveLength(LIVE_EXHIBIT_LIMITS.columns);
    const drawn = parseSolutionExhibit(fromServer, LIVE_EXHIBIT_LIMITS);
    expect(drawn.columns).toEqual(fromServer.columns);
    expect(drawn.rows).toEqual(fromServer.rows);
    expect(drawn.title).toBe(fromServer.title);
    expect(drawn.caption).toBe(fromServer.caption);
    // The character caps the two sides share: a cell and a column heading, the title, the caption.
    expect(fromServer.rows[0][0]).toHaveLength(800);
    expect(fromServer.columns[0]).toHaveLength(800);
    expect(fromServer.title).toHaveLength(400);
    expect(fromServer.caption).toHaveLength(3000);
  });

  it('cuts the same exhibit on the Full solution screen, which has smaller caps of its own, and says so', () => {
    // The write-up's own caps are deliberately smaller (a whole solution is drawn at once), so the same exhibit loses rows and columns
    // there. That is the one place a cut is still possible, and it is reported rather than silent.
    const loss = exhibitLoss(huge, parseSolutionExhibit(huge, SOLUTION_EXHIBIT_LIMITS));
    expect(loss.cut).toContain(`columns: 60 in the write-up, ${SOLUTION_EXHIBIT_LIMITS.columns} on screen`);
    expect(loss.cut).toContain(`rows: 500 in the write-up, ${SOLUTION_EXHIBIT_LIMITS.rows} on screen`);
  });

  it('carries the chart itself untouched, so the screen\'s point cap is the only one it meets', () => {
    const chart = { kind: 'line', categories: Array.from({ length: 120 }, (_, i) => `M${i + 1}`), series: [{ name: 'Units', values: Array.from({ length: 120 }, (_, i) => i) }] };
    const fromServer = readSolution({ prompt: 'A case.', exhibits: [{ ...huge, chart }] })!.exhibits[0];
    expect(fromServer.chart).toEqual(chart);
    const drawn = parseSolutionExhibit(fromServer, LIVE_EXHIBIT_LIMITS);
    expect(drawn.chart?.categories).toHaveLength(120);
    expect(LIVE_EXHIBIT_LIMITS.points).toBeGreaterThanOrEqual(120);
    expect(exhibitLoss(fromServer, drawn)).toEqual({ cut: [], shortened: [] });
  });
});
