import { useEffect } from 'react';
import { useCommunity } from '../../state/CommunityProvider';

/**
 * Keeps the level other members can see in step with your cases, but only for someone who chose to share it. It never writes
 * while your cases are still loading or are sample data (demo mode), so a level is only ever shown from your real log. A failed
 * write is simply tried again the next time your level or settings change.
 */
export function useShareLevel(level: number, ready: boolean): void {
  const { profile, setSharedLevel } = useCommunity();
  const sharing = profile?.sharing.level ?? false;
  const shown = profile?.level ?? null;
  useEffect(() => {
    if (!ready || !sharing || shown === level) return;
    void setSharedLevel(level).catch(() => {});
  }, [ready, sharing, shown, level, setSharedLevel]);
}
