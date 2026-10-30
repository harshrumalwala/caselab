import type { ReactNode } from 'react';
import { SKILLS, skillGroupLabel, type SkillKey } from '../../domain/constants';
import type { SharedCase } from '../../domain/community';
import { formatDate } from '../../domain/dates';
import { Badge, RatingBadge } from '../../components/ui/Badge';
import { scoreTone } from '../../components/ui/tones';

const skillLabel = (key: string) => SKILLS.find((s) => s.key === key)?.label ?? key;

function Note({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{text}</p>
    </div>
  );
}

/**
 * One case as another member sees it. Fields the owner didn't share are simply absent, so this
 * component never has to decide what to hide.
 */
export function SharedCaseRow({ shared, extra }: { shared: SharedCase; extra?: ReactNode }) {
  const skills = shared.skillScores ? (Object.entries(shared.skillScores) as [SkillKey, number][]) : [];
  const feedbackSkills = shared.feedback?.skills ? Object.entries(shared.feedback.skills) : [];
  const n = shared.notes;
  const hasDetail = Boolean(shared.feedback || n || shared.otherNotes);

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{shared.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {[formatDate(shared.date), shared.caseType, shared.industry, shared.source, shared.partner && `Cased by ${shared.partner}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {shared.overall !== null && <RatingBadge value={shared.overall} />}
      </div>

      {(skills.length > 0 || shared.improvementArea) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skills.map(([key, rating]) => (
            <Badge key={key} tone={scoreTone(rating)}>
              {skillLabel(key)} <span className="num font-semibold">{rating}</span>
            </Badge>
          ))}
          {shared.improvementArea && <Badge tone="accent">Working on: {skillGroupLabel(shared.improvementArea)}</Badge>}
        </div>
      )}

      {hasDetail && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-accent-text hover:underline">
            See more details
          </summary>
          <div className="mt-3 space-y-3">
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
        </details>
      )}

      {extra && <div className="mt-3">{extra}</div>}
    </li>
  );
}
