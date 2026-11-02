import { describe, expect, it } from 'vitest';
import { MEDAL_AT, skillMedals } from './medals';
import { casesWithRatings } from '../test/builders';

const framework = (ratings: (1 | 2 | 3 | 4 | 5)[]) => skillMedals(casesWithRatings('framework', ratings)).find((m) => m.key === 'framework')!;

describe('skill medals', () => {
  it('has one for each of the seven skills and none to start with', () => {
    const medals = skillMedals([]);
    expect(medals).toHaveLength(7);
    expect(medals.every((m) => m.tier === null && m.best === null && m.ratings === 0)).toBe(true);
    expect(medals[0].next).toEqual({ tier: 'bronze', at: MEDAL_AT.bronze });
  });

  it('needs five ratings before it awards anything', () => {
    expect(framework([5, 5, 5, 5])).toMatchObject({ ratings: 4, best: null, tier: null });
    expect(framework([5, 5, 5, 5, 5]).tier).toBe('gold');
  });

  it('awards bronze at 3, silver at 4 and gold at 4.6 over five in a row', () => {
    expect(framework([3, 3, 3, 3, 3]).tier).toBe('bronze');
    expect(framework([2, 2, 2, 2, 2]).tier).toBeNull();
    expect(framework([4, 4, 4, 4, 4]).tier).toBe('silver');
    expect(framework([4, 4, 4, 4, 5]).tier).toBe('silver'); // 4.2
    expect(framework([5, 5, 5, 4, 4]).tier).toBe('gold'); // 4.6, on the edge
    expect(framework([5, 5, 4, 4, 4]).tier).toBe('silver'); // 4.4
  });

  it('goes by your best five in a row, so a bad run later takes nothing back', () => {
    const m = framework([5, 5, 5, 5, 5, 1, 1, 1, 1, 1]);
    expect(m.tier).toBe('gold');
    expect(m.best).toBe(5);
  });

  it('says what the next medal needs, and nothing once it is gold', () => {
    expect(framework([3, 3, 3, 3, 3]).next).toEqual({ tier: 'silver', at: 4 });
    expect(framework([4, 4, 4, 4, 4]).next).toEqual({ tier: 'gold', at: 4.6 });
    expect(framework([5, 5, 5, 5, 5]).next).toBeNull();
  });
});
