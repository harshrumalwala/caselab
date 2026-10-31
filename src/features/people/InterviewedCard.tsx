import { Mic } from 'lucide-react';
import { formatDate } from '../../domain/dates';
import type { SharedInterviewed } from '../../domain/interviewed';
import { Card, CardHeader } from '../../components/ui/Card';
import { chipClass } from '../../components/ui/chips';

/**
 * The cases a member has interviewed, shown to other members when they chose to. It is the case itself (title, book, type,
 * industry and date), never who they interviewed or what they said, so you can see who has run cases and which ones they know.
 */
export function InterviewedCard({ name, items }: { name: string; items: SharedInterviewed[] }) {
  if (items.length === 0) return null;
  return (
    <Card strip="teal" aria-labelledby="interviewed-title">
      <CardHeader
        titleId="interviewed-title"
        title="Interviewed cases"
        subtitle={`${name} has run ${items.length} case${items.length === 1 ? '' : 's'} as the interviewer, so they know these ones from the other side.`}
        icon={<Mic className="size-4" />}
      />
      <ul className="divide-y divide-line rounded-2xl border border-line" aria-label="Interviewed cases">
        {items.map((c, i) => (
          <li key={`${c.date}-${c.title}-${i}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{c.title}</p>
              <p className="mt-0.5 text-xs text-muted">{[c.industry, c.source].filter(Boolean).join(' · ') || 'No book or industry given'}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${chipClass(c.caseType)}`}>{c.caseType}</span>
              <span className="num text-xs text-muted">{formatDate(c.date)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
