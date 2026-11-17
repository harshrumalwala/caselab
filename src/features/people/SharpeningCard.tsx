import { useMemo, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { SharedCase } from '../../domain/community';
import { MIN_CASES_FOR_SKILL_INSIGHTS } from '../../domain/improvement';
import { publicSharpening } from '../../domain/sharpening';
import { Card, CardHeader } from '../../components/ui/Card';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Skills({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <ul className="flex flex-wrap gap-1.5" aria-label={label}>
        {names.map((n) => (
          <li key={n} className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-sm text-ink">
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "What *name* is sharpening": the short skill summary on a member's profile link, worked out in the browser from
 * the skill scores that link already hands out. The caller decides whether to render it — the member's own
 * **What I'm sharpening** switch is what puts it on their link, and their preview shows the same card before they
 * choose — so this component only decides whether the shared scores can support it.
 *
 * It names skills and nothing else: no average, no ranking, no eighth place. Below the product's own minimum it
 * renders nothing at all, because "not enough data yet" would itself be a sentence about the person.
 */
export function SharpeningCard({ name, shared, note }: { name: string; shared: SharedCase[]; note?: ReactNode }) {
  const view = useMemo(() => publicSharpening(shared), [shared]);
  if (view.sharpen.length === 0 && view.strengths.length === 0) return null;

  return (
    <Card strip="teal" aria-labelledby="sharpening-title">
      <CardHeader
        titleId="sharpening-title"
        title={`What ${name} is sharpening`}
        subtitle={`${name} chose to show this, worked out from the skill scores on the ${plural(view.rated, 'case')} they share.`}
        icon={<Sparkles className="size-4" />}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Skills label="Sharpening now" names={view.sharpen.map((s) => s.label)} />
        <Skills label="Strong already" names={view.strengths.map((s) => s.label)} />
      </div>

      <p className="mt-4 text-xs text-muted">
        Where {name}'s practice is pointed, in their own skill list. A useful case to give them asks for what they're
        sharpening and leans on what's already strong.
      </p>
      {note}
    </Card>
  );
}

/**
 * The same card, in the member's own "What others see" preview, with a line saying where it stands. A member can
 * read exactly what a link holder would read before they decide to show it, which is the point of giving the
 * summary its own switch.
 */
export function SharpeningPreview({ name, shared, on }: { name: string; shared: SharedCase[]; on: boolean }) {
  const view = useMemo(() => publicSharpening(shared), [shared]);

  if (view.sharpen.length === 0 && view.strengths.length === 0) {
    // Only you see this: your link stays silent either way, because "not enough yet" is itself a statement about you.
    return on ? (
      <p className="rounded-xl bg-surface px-4 py-3 text-sm text-ink-2">
        {view.rated === 0
          ? `What I'm sharpening is on. The summary joins your link once you share skill scores on ${MIN_CASES_FOR_SKILL_INSIGHTS} cases.`
          : "What I'm sharpening is on. Your shared scores sit in the middle so far, so there is nothing to name yet; the summary joins your link as soon as a skill stands out."}
      </p>
    ) : null;
  }

  return (
    <SharpeningCard
      name={name}
      shared={shared}
      note={
        <p className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-xs text-ink-2">
          {on
            ? 'This is on your link now, word for word.'
            : "This joins your link when you turn on What I'm sharpening. Until then the card is yours alone."}
        </p>
      }
    />
  );
}
