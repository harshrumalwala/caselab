import type { ReactNode } from 'react';
import type { SharedCase } from '../../domain/community';
import { formatDate } from '../../domain/dates';
import { RatingBadge } from '../../components/ui/Badge';
import { CaseSkillBadges, CaseWrittenDetail, hasWrittenDetail } from './sharedCaseDetail';

/**
 * One case as another member sees it. Fields the owner didn't share are simply absent, so this
 * component never has to decide what to hide.
 */
export function SharedCaseRow({ shared, extra }: { shared: SharedCase; extra?: ReactNode }) {
  return (
    <li className="sticker p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-ink">{shared.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {[formatDate(shared.date), shared.caseType, shared.industry, shared.source, shared.partner && `Cased by ${shared.partner}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {shared.overall !== null && <RatingBadge value={shared.overall} />}
      </div>

      <CaseSkillBadges shared={shared} className="mt-3" />

      {hasWrittenDetail(shared) && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-accent-text hover:underline">
            See more details
          </summary>
          <div className="mt-3">
            <CaseWrittenDetail shared={shared} />
          </div>
        </details>
      )}

      {extra && <div className="mt-3">{extra}</div>}
    </li>
  );
}
