import { createContext, useContext } from 'react';
import type { MeetingRepository } from '../data/meetingPrefs';

/**
 * The signed-in member's own meeting details (how they like to meet). Null while nobody is signed in, and in demo
 * mode, where nothing is stored at all.
 */
export const MeetingContext = createContext<MeetingRepository | null>(null);

export function useMeetingPrefs(): MeetingRepository | null {
  return useContext(MeetingContext);
}
