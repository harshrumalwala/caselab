import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CommunityRepository } from '../data/community';
import { describeError, toDataError } from '../data/errors';
import type { Profile, ProfileInput } from '../domain/community';

type Status = 'loading' | 'ready' | 'error';

interface CommunityContextValue {
  community: CommunityRepository;
  status: Status;
  loadError: string | null;
  /** Your profile; null until onboarding is completed. */
  profile: Profile | null;
  reload(): Promise<void>;
  /** Saves, then updates the screen. Rejects with a DataError whose message is fit to show. */
  saveProfile(input: ProfileInput): Promise<Profile>;
}

const CommunityContext = createContext<CommunityContextValue | null>(null);

export function CommunityProvider({ community, children }: { community: CommunityRepository; children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    try {
      setProfile(await community.getMyProfile());
      setStatus('ready');
    } catch (e) {
      setLoadError(describeError(e));
      setStatus('error');
    }
  }, [community]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = useCallback(
    async (input: ProfileInput) => {
      try {
        const saved = await community.saveProfile(input);
        setProfile(saved);
        return saved;
      } catch (e) {
        throw toDataError(e);
      }
    },
    [community],
  );

  const value = useMemo(
    () => ({ community, status, loadError, profile, reload: load, saveProfile }),
    [community, status, loadError, profile, load, saveProfile],
  );
  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity(): CommunityContextValue {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error('useCommunity must be used inside <CommunityProvider>');
  return ctx;
}

/** Your own user id, or undefined where nobody is signed in (visitors read profiles without a CommunityProvider). */
export function useMyUserId(): string | undefined {
  return useContext(CommunityContext)?.profile?.userId;
}

/** Your profile, which exists once onboarding is done (everything past the onboarding gate can rely on it). */
export function useMyProfile(): Profile {
  const { profile } = useCommunity();
  if (!profile) throw new Error('useMyProfile needs a completed profile');
  return profile;
}
