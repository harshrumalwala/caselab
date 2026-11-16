/**
 * Said on the exhibit when a cap cut something out of it on the way to the screen (see `cut` on `SolutionExhibit`). It should never
 * appear: `npm run audit:live` fails on any exhibit that cannot be shown whole, so one that is cut is meant to be fixed before it is
 * loaded. This is here because that report reads the write-ups on one machine while the app draws whatever the database holds, and a
 * member working an exhibit that is quietly missing a column or a chart is worse off than one who knows it is missing.
 *
 * Text that was only cut to length (`shortened`) is not said here: the exhibit still holds every figure, so it is a note for us, not for
 * the member.
 */
export function ExhibitNotWhole({ cut }: { cut: string[] }) {
  if (cut.length === 0) return null;
  return (
    <p role="status" className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs font-medium text-ink-2">
      Not the whole exhibit: part of it could not be shown here.
    </p>
  );
}
