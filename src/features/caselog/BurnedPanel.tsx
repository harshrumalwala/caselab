import { useState } from 'react';
import { describeError } from '../../data/errors';
import type { BurnedCase } from '../../domain/community';
import { BurnedCases } from '../community/BurnedCases';
import { useCommunity, useMyProfile } from '../../state/CommunityProvider';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';

/**
 * Cases you worked through on your own, shown alongside your Case Log. You and other members can see them, but they are
 * not practice cases: they never count in a total, rating, trend or coverage.
 */
export function BurnedPanel() {
  const profile = useMyProfile();
  const { saveProfile } = useCommunity();
  const { cases, mode } = useData();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const save = async (burnedCases: BurnedCase[]) => {
    setSaving(true);
    try {
      const { userId: _userId, ...rest } = profile;
      await saveProfile({ ...rest, burnedCases });
    } catch (e) {
      toast({ kind: 'error', title: 'Not saved', body: describeError(e) });
    } finally {
      setSaving(false);
    }
  };

  const books = [...new Set([...profile.burnedBooks, ...cases.map((c) => c.source.trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <p className="sticker bg-sun-soft px-4 py-3 text-sm text-ink-2" role="note">
        <strong className="font-bold text-ink">Burned cases are for the record, not the scoreboard.</strong> They show here, and other members can
        see them on your profile (so they don't hand you the same ones), but they don't count in your case total, ratings, trends or coverage.
      </p>
      {mode === 'demo' ? (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          You're in demo mode, so burning cases is switched off to keep sample data away from your real profile. Exit demo mode to use it.
        </p>
      ) : (
        <div className="sticker p-4 sm:p-5">
          <BurnedCases cases={profile.burnedCases} suggestions={books} disabled={saving} onChange={(next) => void save(next)} />
        </div>
      )}
    </div>
  );
}
