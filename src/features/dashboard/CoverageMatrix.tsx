import { ChevronDown, Grid3x3 } from 'lucide-react';
import { useState } from 'react';
import { CASE_TYPE_SHORT } from '../../domain/constants';
import type { CoverageMatrix as Matrix } from '../../domain/stats';
import { Card } from '../../components/ui/Card';

export function CoverageMatrix({ matrix, total }: { matrix: Matrix; total: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Card strip="teal" flush aria-labelledby="matrix-title">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="matrix-body"
        className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left transition hover:bg-surface-2/60 sm:px-6"
      >
        <span className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
            <Grid3x3 className="size-4" />
          </span>
          <span>
            <span id="matrix-title" className="block text-base font-semibold tracking-tight text-ink">
              Industry × case type
            </span>
            <span className="block text-sm text-muted">
              {total === 0
                ? 'Which combinations you have practiced'
                : `${matrix.combinationsSeen} ${matrix.combinationsSeen === 1 ? 'combination' : 'combinations'} practiced · no need to fill every cell`}
            </span>
          </span>
        </span>
        <ChevronDown className={`size-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div id="matrix-body" className="border-t border-line px-5 pb-5 pt-4 sm:px-6">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface" />
                  {matrix.columns.map((type) => (
                    <th key={type} scope="col" className="h-24 min-w-9 align-bottom font-medium text-muted" title={type}>
                      <span className="mx-auto block text-xs [writing-mode:vertical-rl] rotate-180">
                        {CASE_TYPE_SHORT[type]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.industry}>
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 max-w-44 truncate bg-surface pr-3 text-left text-xs font-medium ${row.total ? 'text-ink' : 'text-muted'}`}
                      title={row.industry}
                    >
                      {row.industry}
                    </th>
                    {row.cells.map((n, i) => (
                      <td
                        key={i}
                        className="num h-9 min-w-9 rounded-lg text-center text-xs font-semibold text-ink"
                        style={{
                          backgroundColor:
                            n > 0
                              ? `color-mix(in srgb, var(--accent) ${Math.round(14 + (n / matrix.max) * 56)}%, transparent)`
                              : 'var(--surface-2)',
                        }}
                        title={`${row.industry} · ${matrix.columns[i]}: ${n} ${n === 1 ? 'case' : 'cases'}`}
                      >
                        {n > 0 ? n : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            Darker cells mean more cases. Use it to spot repeated combinations, not to chase empty ones.
          </p>
        </div>
      )}
    </Card>
  );
}
