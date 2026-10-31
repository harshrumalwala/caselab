import { describeError } from '../../data/errors';
import type { CaseRecord } from '../../domain/types';
import { useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';

/**
 * One click to hide a case from every other member, or to let it follow your profile settings again.
 * Saves to the database and says so; if saving fails, the case stays as it was and you see why.
 */
export function useTogglePrivate() {
  const { updateCase } = useData();
  const toast = useToast();

  return async (c: CaseRecord) => {
    const { id, createdAt: _created, updatedAt: _updated, ...input } = c;
    const makePrivate = c.shareMode !== 'private';
    try {
      await updateCase(id, { ...input, shareMode: makePrivate ? 'private' : 'profile' });
      toast({
        title: makePrivate ? 'Case is now private' : 'Case follows your profile settings',
        body: makePrivate ? `${c.title || 'This case'} is hidden from everyone else.` : c.title || undefined,
      });
    } catch (e) {
      toast({ kind: 'error', title: 'Not saved', body: describeError(e) });
    }
  };
}
