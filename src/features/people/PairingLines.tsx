import type { Pairing } from '../../domain/giveNext';

/**
 * Where this member's shared scores and the reader's own log pull apart, both ways round: what the reader
 * stands to get out of casing with them, and what the reader brings to it.
 *
 * Signed-in only. A visitor has no log of their own, so `pairing` is null and this draws nothing; the card a
 * link holder reads is unchanged. The reader's own averages are worked out in their browser from cases that
 * never leave it: nothing about them is sent anywhere, kept on this member, or shown to them.
 */
export function PairingLines({ pairing, name }: { pairing: Pairing | null; name: string }) {
  const rows = [
    { key: 'them', title: `${name} can help you with`, skills: pairing?.theyLead ?? [] },
    { key: 'you', title: `You can help ${name} with`, skills: pairing?.youLead ?? [] },
  ].filter((r) => r.skills.length > 0);
  if (rows.length === 0) return null;

  return (
    <div className="mt-5 space-y-2 border-t border-line pt-4" role="group" aria-label="Casing together">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{r.title}</h3>
          <ul className="flex flex-wrap gap-1.5" aria-label={r.title}>
            {r.skills.map((s) => (
              <li key={s.key} className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-sm text-ink">
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
