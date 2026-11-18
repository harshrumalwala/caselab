import { createContext, useContext } from 'react';
import type { SchedulingRepository } from '../data/scheduling';
import { DataContext } from './DataProvider';

/** Scheduling a practice time with another member. Null while nobody is signed in. */
export const SchedulingContext = createContext<SchedulingRepository | null>(null);

/**
 * Scheduling for the signed-in member, or null when there is none to do. Demo mode is sample data held in memory
 * with nobody on the other end, so it is not offered there and nothing is stored.
 */
export function useScheduling(): SchedulingRepository | null {
  const repository = useContext(SchedulingContext);
  const data = useContext(DataContext);
  return data?.mode === 'demo' ? null : repository;
}
