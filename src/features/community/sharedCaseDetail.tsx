import { SKILLS, skillGroupLabel, type SkillKey } from '../../domain/constants';
import type { SharedCase } from '../../domain/community';
import { Badge } from '../../components/ui/Badge';
import { scoreTone } from '../../components/ui/tones';

/**
 * The two parts of a shared case that sit below its headline: the per-skill scores with the member's own
 * "Working on" tag, and whatever they wrote. Shared by the card (`SharedCaseRow`) and by the table on a
 * profile link, which puts both behind the row's own control instead of printing them in the row.
 */

const skillLabel = (key: string) => SKILLS.find((s) => s.key === key)?.label ?? key;

/** Whether the member wrote anything on this case that they also chose to share. */
export const hasWrittenDetail = (shared: SharedCase): boolean => Boolean(shared.feedback || shared.notes || shared.otherNotes);

/** Whether there are skill scores or a "Working on" tag to show. */
export const hasSkillDetail = (shared: SharedCase): boolean =>
  Boolean(shared.improvementArea) || Object.keys(shared.skillScores ?? {}).length > 0;

export function CaseSkillBadges({ shared, className = '' }: { shared: SharedCase; className?: string }) {
  const skills = shared.skillScores ? (Object.entries(shared.skillScores) as [SkillKey, number][]) : [];
  if (!hasSkillDetail(shared)) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {skills.map(([key, rating]) => (
        <Badge key={key} tone={scoreTone(rating)}>
          {skillLabel(key)} <span className="num font-semibold">{rating}</span>
        </Badge>
      ))}
      {shared.improvementArea && <Badge tone="accent">Working on: {skillGroupLabel(shared.improvementArea)}</Badge>}
    </div>
  );
}

function Note({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{text}</p>
    </div>
  );
}

export function CaseWrittenDetail({ shared }: { shared: SharedCase }) {
  const feedbackSkills = shared.feedback?.skills ? Object.entries(shared.feedback.skills) : [];
  const n = shared.notes;
  return (
    <div className="space-y-3">
      <Note label="Overall feedback" text={shared.feedback?.overall} />
      {feedbackSkills.map(([key, text]) => (
        <Note key={key} label={`${skillLabel(key)} feedback`} text={text} />
      ))}
      <Note label="What went well" text={n?.wentWell} />
      <Note label="What they struggled with" text={n?.struggled} />
      <Note label="Concepts learned" text={n?.concepts} />
      <Note label="Practicing next" text={n?.nextFocus} />
      <Note label="Other notes" text={shared.otherNotes} />
    </div>
  );
}
