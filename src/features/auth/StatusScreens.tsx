import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';

export function Splash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-muted" role="status">
      <Loader2 className="size-5 animate-spin text-accent-text" />
      {label}
    </div>
  );
}

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 sm:p-7" role="alert">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-bad-soft text-bad-text">
              <AlertTriangle className="size-4" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-2">{children}</div>
            </div>
          </div>
          {actions && <div className="mt-6 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </main>
  );
}

/** The two public settings are missing or malformed. Shown instead of quietly using other storage. */
export function ConfigProblem({ problem }: { problem: string }) {
  return (
    <Panel title="CaseLab isn't connected to Supabase">
      <p>{problem}</p>
      <p>
        Add these two settings (copy <code className="rounded bg-surface-2 px-1">.env.example</code> to{' '}
        <code className="rounded bg-surface-2 px-1">.env.local</code> locally, or set them in Vercel under Settings →
        Environment Variables), then restart or redeploy:
      </p>
      <ul className="list-disc space-y-1 pl-5 font-mono text-xs text-ink">
        <li>VITE_SUPABASE_URL</li>
        <li>VITE_SUPABASE_PUBLISHABLE_KEY</li>
      </ul>
    </Panel>
  );
}

/** Loading your cases failed. We show this rather than an empty dashboard that looks like data loss. */
export function LoadFailed({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <Panel
      title="Couldn't load your cases"
      actions={
        <>
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
        </>
      }
    >
      <p>{message}</p>
      <p>Your data hasn't been touched. Nothing is shown until it loads, so you can't overwrite it by mistake.</p>
    </Panel>
  );
}
