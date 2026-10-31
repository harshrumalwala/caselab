import { createContext, useContext } from 'react';
import type { WarmupRepository } from '../data/warmupBest';

export interface WarmupSync {
  repository: WarmupRepository;
  userId: string;
}

/** Where the signed-in member's Warm-up record is kept. Null (the default) means "this device only", as in demo mode. */
export const WarmupSyncContext = createContext<WarmupSync | null>(null);

export const useWarmupSync = () => useContext(WarmupSyncContext);
