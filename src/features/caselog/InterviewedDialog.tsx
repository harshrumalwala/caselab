import { useMemo, useState, type FormEvent } from 'react';
import { CASE_TYPES, INDUSTRIES } from '../../domain/constants';
import { describeError } from '../../data/errors';
import { cleanInterviewed, INTERVIEWED_LIMITS, type InterviewedCase, type InterviewedInput } from '../../domain/interviewed';
import { libraryPrefillWithoutLink, type LibraryCase } from '../../domain/library';
import { toISODate } from '../../domain/dates';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { CaseTitleInput } from '../logcase/CaseTitleInput';
import { useMemberSuggestions } from '../community/useMemberSuggestions';
import { useData } from '../../state/DataProvider';
import { useInterviewed } from '../../state/InterviewedProvider';
import { useToast } from '../../state/ToastProvider';

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Log a case you ran as the interviewer, or change one you logged. Only a title is needed. */
export function InterviewedDialog({ editing, onClose }: { editing: InterviewedCase | null; onClose: () => void }) {
  const { add, update, items } = useInterviewed();
  const { mode } = useData();
  const toast = useToast();
  const [form, setForm] = useState<InterviewedInput>(() =>
    editing
      ? { date: editing.date, title: editing.title, source: editing.source, caseType: editing.caseType, industry: editing.industry, partner: editing.partner, feedback: editing.feedback, learned: editing.learned }
      : { date: toISODate(new Date()), title: '', source: '', caseType: 'Other', industry: '', partner: '', feedback: '', learned: '' },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof InterviewedInput>(key: K, value: InterviewedInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  // The casebook case picked from the search, for this visit to the form only: an interviewed case is stored without a link to one.
  const [linked, setLinked] = useState<LibraryCase | null>(null);
  const pickLibrary = (c: LibraryCase) => {
    setLinked(c);
    setForm((f) => ({ ...f, ...libraryPrefillWithoutLink(c) }));
  };
  const members = useMemberSuggestions(form.partner);
  // People you interviewed before, then community members who match what you are typing. Anyone else can still be typed in.
  const people = useMemo(() => {
    const before = [...new Set(items.map((c) => c.partner).filter(Boolean))];
    return [...before.map((name) => ({ name, detail: '' })), ...members.filter((m) => !before.includes(m.name))];
  }, [items, members]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const clean = cleanInterviewed(form);
    if (!clean.title) {
      setError('Give the case a title so you can find it again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) await update(editing.id, clean);
      else await add(clean);
      toast({ title: editing ? 'Changes saved' : 'Interviewed case logged', body: clean.title });
      onClose();
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Edit interviewed case' : 'Log a case you interviewed'}
      description="Not counted with the cases you solved, and private to you"
      width="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="interviewed-form" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save interviewed case'}
          </Button>
        </div>
      }
    >
      <form id="interviewed-form" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
          <Field label="Case title" htmlFor="int-title">
            <CaseTitleInput
              id="int-title"
              value={form.title}
              onChange={(text) => set('title', text)}
              onPick={pickLibrary}
              linked={linked}
              onClear={() => setLinked(null)}
              suggest={!editing && mode === 'real'}
              invalid={Boolean(error) && form.title.trim() === ''}
              autoFocus
            />
          </Field>
          <Field label="Date" htmlFor="int-date">
            <input id="int-date" type="date" className="field" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Case type" htmlFor="int-type">
            <select id="int-type" className="field" value={form.caseType} onChange={(e) => set('caseType', e.target.value as InterviewedInput['caseType'])}>
              {CASE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Industry" htmlFor="int-industry">
            <select id="int-industry" className="field" value={form.industry} onChange={(e) => set('industry', e.target.value)}>
              <option value="">Not specified</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Case source" htmlFor="int-source">
            <input id="int-source" className="field" value={form.source} maxLength={INTERVIEWED_LIMITS.source} onChange={(e) => set('source', e.target.value)} placeholder="e.g. Darden 2019" />
          </Field>
          <Field label="Who you interviewed" htmlFor="int-partner">
            <input
              id="int-partner"
              className="field"
              list="int-partner-options"
              autoComplete="off"
              value={form.partner}
              maxLength={INTERVIEWED_LIMITS.partner}
              onChange={(e) => set('partner', e.target.value)}
            />
            <datalist id="int-partner-options">
              {people.map((p) => (
                <option key={p.name} value={p.name} label={p.detail || undefined} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="What you told them" htmlFor="int-feedback">
          <textarea id="int-feedback" className="field min-h-20" rows={3} value={form.feedback} maxLength={INTERVIEWED_LIMITS.text} onChange={(e) => set('feedback', e.target.value)} />
        </Field>
        <Field label="What running it taught you" htmlFor="int-learned" hint="Pacing, what a clear structure sounds like, the hint you gave too early. This is the part that pays back when you are the one being interviewed.">
          <textarea id="int-learned" className="field min-h-20" rows={3} value={form.learned} maxLength={INTERVIEWED_LIMITS.text} onChange={(e) => set('learned', e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad-text">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
