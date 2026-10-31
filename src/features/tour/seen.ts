/** Where this browser remembers that a member has finished (or skipped) the first-login tour. */
export const tourKey = (userId: string) => `caselab:v1:tour:${userId}`;

export function hasSeenTour(userId: string): boolean {
  try {
    return window.localStorage.getItem(tourKey(userId)) === '1';
  } catch {
    return true; // can't remember either way, so don't nag
  }
}
