import { describe, expect, it } from 'vitest';
import { describeSlot, durationLabel, earliestWall, formatDate, formatDateTime, formatTime, isoToWall, readTime, sameClock, wallToIso } from './meetingTime';

const CHICAGO = 'America/Chicago';
const LONDON = 'Europe/London';
const KOLKATA = 'Asia/Kolkata';
const NOW = new Date('2026-11-18T12:00:00Z');

describe('reading an instant in a zone', () => {
  it('writes the date and the clock the way a member reads them', () => {
    const iso = '2026-11-19T01:00:00Z'; // 7:00 pm Wed in Chicago
    expect(formatDate(iso, CHICAGO, NOW)).toBe('Wed 18 Nov');
    expect(formatTime(iso, CHICAGO)).toBe('7:00 pm');
    expect(formatDateTime(iso, CHICAGO, NOW)).toBe('Wed 18 Nov, 7:00 pm');
  });

  it('puts the year on a time in another year, and nothing on one in this year', () => {
    expect(formatDate('2027-01-05T18:00:00Z', CHICAGO, NOW)).toBe('Tue 5 Jan 2027');
    expect(formatDate('2026-12-05T18:00:00Z', CHICAGO, NOW)).toBe('Sat 5 Dec');
  });

  it('reads midnight as the start of its own day', () => {
    const p = readTime('2026-11-19T06:00:00Z', CHICAGO)!; // midnight Chicago
    expect([p.hour, p.day]).toEqual([0, 19]);
    expect(formatTime('2026-11-19T06:00:00Z', CHICAGO)).toBe('12:00 am');
  });

  it('is empty for something that is not an instant', () => {
    expect(formatDateTime('not a time', CHICAGO, NOW)).toBe('');
    expect(readTime('not a time', CHICAGO)).toBeNull();
  });
});

describe('both zones in one sentence', () => {
  it('shows your time and theirs', () => {
    expect(describeSlot('2026-11-19T01:00:00Z', CHICAGO, 'America/New_York', 'Sam', NOW)).toBe('Wed 18 Nov, 7:00 pm for you (8:00 pm for Sam)');
  });

  it('names their weekday when the time lands on another day for them', () => {
    expect(describeSlot('2026-11-19T01:00:00Z', CHICAGO, LONDON, 'Priya', NOW)).toBe('Wed 18 Nov, 7:00 pm for you (Thu 1:00 am for Priya)');
  });

  it('says it once when they saved no zone, or when both clocks read the same', () => {
    expect(describeSlot('2026-11-19T01:00:00Z', CHICAGO, '', 'Sam', NOW)).toBe('Wed 18 Nov, 7:00 pm');
    expect(describeSlot('2026-11-19T01:00:00Z', CHICAGO, 'America/Winnipeg', 'Sam', NOW)).toBe('Wed 18 Nov, 7:00 pm');
    expect(sameClock('2026-11-19T01:00:00Z', CHICAGO, 'America/Winnipeg')).toBe(true);
  });

  it('counts a half-hour zone as a different clock', () => {
    expect(describeSlot('2026-11-19T01:00:00Z', CHICAGO, KOLKATA, 'Arun', NOW)).toBe('Wed 18 Nov, 7:00 pm for you (Thu 6:30 am for Arun)');
  });
});

describe('across a daylight-saving boundary', () => {
  // The United States puts its clocks forward on Sunday 14 March 2027; the United Kingdom on Sunday 28 March 2027.
  // Between those two Sundays the usual six hours between Chicago and London is five.
  const before = wallToIso('2027-03-10T19:00', CHICAGO)!;
  const after = wallToIso('2027-03-17T19:00', CHICAGO)!;

  it('reads the same wall clock as two different instants on either side of the change', () => {
    expect(before).toBe('2027-03-11T01:00:00.000Z');
    expect(after).toBe('2027-03-18T00:00:00.000Z');
  });

  it('shows the member the same evening both weeks', () => {
    expect(formatDateTime(before, CHICAGO, NOW)).toBe('Wed 10 Mar 2027, 7:00 pm');
    expect(formatDateTime(after, CHICAGO, NOW)).toBe('Wed 17 Mar 2027, 7:00 pm');
  });

  it("shows the other member the hour moving, because their clocks have not changed yet", () => {
    expect(describeSlot(before, CHICAGO, LONDON, 'Priya', NOW)).toBe('Wed 10 Mar 2027, 7:00 pm for you (Thu 1:00 am for Priya)');
    expect(describeSlot(after, CHICAGO, LONDON, 'Priya', NOW)).toBe('Wed 17 Mar 2027, 7:00 pm for you (Thu 12:00 am for Priya)');
  });

  it('reads the hour either side of the change itself, and the hour that does not exist', () => {
    // 1:30 am CST, then 3:30 am CDT: an hour apart on the clock, an hour apart in fact.
    expect(wallToIso('2027-03-14T01:30', CHICAGO)).toBe('2027-03-14T07:30:00.000Z');
    expect(wallToIso('2027-03-14T03:30', CHICAGO)).toBe('2027-03-14T08:30:00.000Z');
    // 2:30 am never happens in Chicago that night. It settles on a real instant rather than failing, and the
    // preview the member reads before sending says which one.
    const skipped = wallToIso('2027-03-14T02:30', CHICAGO)!;
    expect(skipped).toBe('2027-03-14T07:30:00.000Z');
    expect(formatTime(skipped, CHICAGO)).toBe('1:30 am');
  });

  it('goes back to the box the way it came out, on both sides', () => {
    expect(isoToWall(before, CHICAGO)).toBe('2027-03-10T19:00');
    expect(isoToWall(after, CHICAGO)).toBe('2027-03-17T19:00');
    expect(isoToWall(after, LONDON)).toBe('2027-03-18T00:00');
  });
});

describe('what a picker hands back', () => {
  it('reads the wall clock in the member’s own zone, not the browser’s', () => {
    expect(wallToIso('2026-11-18T19:00', CHICAGO)).toBe('2026-11-19T01:00:00.000Z');
    expect(wallToIso('2026-11-18T19:00', KOLKATA)).toBe('2026-11-18T13:30:00.000Z');
  });

  it('is null for an empty or half-filled box', () => {
    expect(wallToIso('', CHICAGO)).toBeNull();
    expect(wallToIso('2026-11-18', CHICAGO)).toBeNull();
    expect(wallToIso('nonsense', CHICAGO)).toBeNull();
  });

  it('will not let you pick a time the rules would refuse, by ten minutes', () => {
    expect(earliestWall(CHICAGO, new Date('2026-11-18T18:02:00Z'))).toBe('2026-11-18T12:15');
    expect(earliestWall(KOLKATA, new Date('2026-11-18T18:02:00Z'))).toBe('2026-11-18T23:45');
  });
});

describe('how long a case runs', () => {
  it('reads as a human says it', () => {
    expect([30, 45, 60, 90].map(durationLabel)).toEqual(['30 minutes', '45 minutes', '1 hour', '1 hour 30']);
  });
});
