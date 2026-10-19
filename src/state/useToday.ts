import { useEffect, useState } from 'react';
import { todayISO } from '../domain/dates';

/**
 * A `Date` that refreshes when the calendar day changes, so "cases this week" stays right
 * if the tab is left open overnight. Re-renders only when the day actually rolls over.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = new Date();
      setNow((prev) => (todayISO(prev) === todayISO(next) ? prev : next));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
