import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronDown, Flame, Lock, MessageSquarePlus } from 'lucide-react';
import {
  CASE_TYPES,
  INDUSTRIES,
  SHARE_MODES,
  SKILLS,
  SKILL_GROUPS,
  type Rating,
  type SkillGroupKey,
  type SkillKey,
} from '../../domain/constants';
import {
  blankCaseInput,
  cleanInput,
  normalizeCase,
  toInput,
  validateCaseInput,
  type CaseErrors,
} from '../../domain/factory';
import { newMilestones } from '../../domain/milestones';
import { nextPracticeFocus, type Suggestion } from '../../domain/suggestions';
import { canonicalIndustry, caseTypeCounts, overview } from '../../domain/stats';
import type { CaseInput, CaseRecord } from '../../domain/types';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Switch } from '../../components/ui/Switch';
import { RatingInput } from '../../components/ui/RatingInput';
import { describeError } from '../../data/errors';
import { sameBook } from '../../domain/pairing';
import { normalizeBurnedBooks } from '../../domain/community';
import { useCommunity, useMyProfile } from '../../state/CommunityProvider';
import { DRAFT_KEY, useData } from '../../state/DataProvider';
import { useToast } from '../../state/ToastProvider';
import { useUI } from '../../state/ui';
import { SavedPanel, type SavedInfo } from './SavedPanel';

const CUSTOM = '__custom__';

const hasFinePointer = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;

function isDirty(input: CaseInput): boolean {
  const blank = blankCaseInput();
  const { date: _d, skills, ...rest } = input;
  const { date: _b, skills: blankSkills, ...blankRest } = blank;
  void _d;
  void _b;
  if (JSON.stringify(rest) !== JSON.stringify(blankRest)) return true;
  return SKILLS.some((s) => skills[s.key].rating !== blankSkills[s.key].rating || skills[s.key].feedback !== '');
}

function loadDraft(): CaseInput | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const record = normalizeCase({ ...JSON.parse(raw), id: 'draft' });
    if (!record) return null;
    const input = toInput(record);
    // normalizeCase maps unknown case types to "Other"; a draft may legitimately have none yet.
    const rawType = (JSON.parse(raw) as { caseType?: string }).caseType ?? '';
    if (!(CASE_TYPES as readonly string[]).includes(rawType)) input.caseType = '' as CaseInput['caseType'];
    return input;
  } catch {
    return null;
  }
}

/** Distinct non-empty values of a field, most frequently used first (feeds the autocomplete lists). */
function mostUsed(cases: CaseRecord[], pick: (c: CaseRecord) => string): string[] {
  const counts = new Map<string, number>();
  for (const c of cases) {
    const v = pick(c).trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

function saveDraft(input: CaseInput | null) {
  try {
    if (input) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(input));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* drafts are best-effort */
  }
}

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
  className = '',
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-bad">*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface Props {
  editId: string | null;
  prefill: Partial<CaseInput> | null;
  onClose: () => void;
}

export function LogCaseDialog({ editId, prefill, onClose }: Props) {
  const { cases, data, mode, addCase, updateCase } = useData();
  const { navigate } = useUI();
  const toast = useToast();
  const profile = useMyProfile();
  const { saveProfile } = useCommunity();

  const editing = useMemo(() => (editId ? (cases.find((c) => c.id === editId) ?? null) : null), [editId, cases]);

  const [{ initial, restored }] = useState(() => {
    if (editing) return { initial: toInput(editing), restored: false };
    const draft = mode === 'real' ? loadDraft() : null;
    const base = draft && isDirty(draft) ? draft : blankCaseInput();
    return { initial: { ...base, ...prefill }, restored: Boolean(draft && isDirty(draft)) };
  });

  const [input, setInput] = useState<CaseInput>(initial);
  // Burning a book is a setting on your profile, not on the case; null means "leave it as it is".
  const [burnChoice, setBurnChoice] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<CaseErrors>({});
  const [showSkills, setShowSkills] = useState(() =>
    editing ? SKILLS.some((s) => initial.skills[s.key].rating !== null || initial.skills[s.key].feedback !== '') : false,
  );
  const [openNotes, setOpenNotes] = useState<Set<string>>(
    () =>
      new Set([
        ...SKILLS.filter((s) => initial.skills[s.key].feedback).map((s) => s.key as string),
        ...(initial.overallFeedback ? ['overall'] : []),
      ]),
  );
  const [customIndustry, setCustomIndustry] = useState(false);
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const [showRestored, setShowRestored] = useState(restored);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSharing, setShowSharing] = useState(() => initial.shareMode !== 'profile');

  // Best-effort draft so an accidental close never loses a half-written case.
  useEffect(() => {
    if (editing || mode !== 'real' || saved) return;
    saveDraft(isDirty(input) ? input : null);
  }, [input, editing, mode, saved]);

  const set = <K extends keyof CaseInput>(key: K, value: CaseInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setSkill = (key: SkillKey, patch: Partial<CaseInput['skills'][SkillKey]>) =>
    setInput((prev) => ({ ...prev, skills: { ...prev.skills, [key]: { ...prev.skills[key], ...patch } } }));
  const toggleNote = (key: string) =>
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ---- option lists ----------------------------------------------------------------------
  const customIndustries = useMemo(() => {
    const known = new Set<string>([...INDUSTRIES, ...data.customIndustries]);
    const extra = input.industry && !customIndustry && !known.has(input.industry) ? [input.industry] : [];
    return [...data.customIndustries, ...extra];
  }, [data.customIndustries, input.industry, customIndustry]);

  const sources = useMemo(() => mostUsed(cases, (c) => c.source), [cases]);
  const partners = useMemo(() => mostUsed(cases, (c) => c.partner), [cases]);

  // ---- submit ------------------------------------------------------------------------------
  const focusFirstError = (errs: CaseErrors) => {
    const order: [keyof CaseErrors, string][] = [
      ['title', 'case-title'],
      ['caseType', 'case-type'],
      ['industry', customIndustry ? 'case-industry-custom' : 'case-industry'],
      ['date', 'case-date'],
    ];
    const hit = order.find(([k]) => errs[k]);
    if (hit) {
      const el = document.getElementById(hit[1]);
      el?.scrollIntoView?.({ block: 'center' });
      el?.focus();
    }
  };

  const isBurned = input.source.trim() !== '' && profile.burnedBooks.some((b) => sameBook(b, input.source));
  const wantsBurn = burnChoice ?? isBurned;

  /** Adds or removes this case's book from your burned list when you changed it here. Never blocks saving the case. */
  const applyBurn = async () => {
    const source = input.source.trim();
    if (mode !== 'real' || !source || wantsBurn === isBurned) return;
    const { userId: _userId, ...rest } = profile;
    const next = wantsBurn ? [...profile.burnedBooks, source] : profile.burnedBooks.filter((b) => !sameBook(b, source));
    try {
      await saveProfile({ ...rest, burnedBooks: normalizeBurnedBooks(next) });
      toast({ title: wantsBurn ? `${source} marked as burned` : `${source} is no longer marked as burned` });
    } catch (err) {
      toast({ kind: 'error', title: "The case was saved, but your burned books weren't updated", body: describeError(err) });
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const errs = validateCaseInput(cleanInput(input));
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirstError(errs);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await updateCase(editing.id, input);
        await applyBurn();
        toast({ title: 'Changes saved', body: input.title.trim() });
        onClose();
        return;
      }

      // Nothing is shown as saved until the database has confirmed it.
      const before = cases;
      const record = await addCase(input);
      const after = [...before, record];
      saveDraft(null);
      await applyBurn();

      const industry = canonicalIndustry(record.industry, data.customIndustries);
      const sameIndustry = (c: CaseRecord) => canonicalIndustry(c.industry, data.customIndustries) === industry;
      const stats = overview(after);
      setSaved({
        record,
        total: stats.total,
        thisWeek: stats.thisWeek,
        typeCount: caseTypeCounts(after).find((c) => c.caseType === record.caseType)?.count ?? 1,
        industryCount: after.filter(sameIndustry).length,
        firstInIndustry: !before.some(sameIndustry),
        milestones: newMilestones(before, after),
        next: nextPracticeFocus(after)[0] ?? null,
      });
    } catch (err) {
      // Keep the form exactly as it is so nothing typed is lost; the user can retry.
      setSaveError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const resetForm = (prefillNext?: Partial<CaseInput>) => {
    setSaved(null);
    setInput({ ...blankCaseInput(), ...prefillNext });
    setErrors({});
    setShowSkills(false);
    setOpenNotes(new Set());
    setCustomIndustry(false);
    setShowRestored(false);
  };

  const useSuggestion = (s: Suggestion) =>
    resetForm({ caseType: s.action?.caseType ?? ('' as CaseInput['caseType']), industry: s.action?.industry ?? '' });

  const onFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      submit();
    } else if ((e.target as HTMLElement).tagName === 'INPUT') {
      // Enter inside a text field should not save a half-finished case.
      e.preventDefault();
    }
  };

  const ratedCount = SKILLS.filter((s) => input.skills[s.key].rating !== null).length;
  const industryValue = customIndustry ? CUSTOM : input.industry;

  // ---- render ------------------------------------------------------------------------------
  if (saved) {
    return (
      <Dialog
        open
        onClose={onClose}
        title="Log a case"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                navigate('log');
                onClose();
              }}
            >
              View case log
            </Button>
            <Button
              onClick={() => {
                navigate('dashboard');
                onClose();
              }}
            >
              Go to dashboard
            </Button>
            <Button variant="primary" onClick={() => resetForm()} data-autofocus>
              Log another case
            </Button>
          </div>
        }
      >
        <SavedPanel info={saved} onUseSuggestion={useSuggestion} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Edit case' : 'Log a case'}
      description={
        editing ? undefined : 'Takes about a minute. Only the title, case type and industry are required.'
      }
      width="lg"
      footer={
        <div className="space-y-3">
          {saveError && (
            <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad">
              Not saved. {saveError} Your entries are still here, so you can try again.
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="hidden text-xs text-muted sm:block">
              <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-sans text-[11px]">Ctrl</kbd>{' '}
              + <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-sans text-[11px]">Enter</kbd>{' '}
              to save
            </p>
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="case-form" className="min-w-32" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Save case'}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <form id="case-form" onSubmit={submit} onKeyDown={onFormKeyDown} noValidate className="space-y-7">
        {showRestored && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-2.5 text-sm text-accent-text">
            <span>Restored your unsaved draft.</span>
            <button
              type="button"
              className="font-semibold underline-offset-2 hover:underline"
              onClick={() => resetForm()}
            >
              Start fresh
            </button>
          </div>
        )}

        {/* ---- Essentials ---------------------------------------------------------------- */}
        <section className="space-y-4" aria-label="Essentials">
          <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
            <Field label="Case title" htmlFor="case-title" required error={errors.title}>
              <input
                id="case-title"
                maxLength={200}
                className="field"
                value={input.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Regional airline profitability"
                aria-invalid={Boolean(errors.title)}
                data-autofocus={!editing && hasFinePointer() ? '' : undefined}
                autoComplete="off"
              />
            </Field>
            <Field label="Date" htmlFor="case-date" error={errors.date}>
              <input
                id="case-date"
                type="date"
                className="field"
                value={input.date}
                onChange={(e) => set('date', e.target.value)}
                aria-invalid={Boolean(errors.date)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Case type" htmlFor="case-type" required error={errors.caseType}>
              <select
                id="case-type"
                className="field"
                value={input.caseType}
                onChange={(e) => set('caseType', e.target.value as CaseInput['caseType'])}
                aria-invalid={Boolean(errors.caseType)}
              >
                <option value="">Select a case type…</option>
                {CASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Industry" htmlFor={customIndustry ? 'case-industry-custom' : 'case-industry'} required error={errors.industry}>
              {customIndustry ? (
                <div className="flex gap-2">
                  <input
                    id="case-industry-custom"
                    maxLength={100}
                    className="field"
                    value={input.industry}
                    onChange={(e) => set('industry', e.target.value)}
                    placeholder="e.g. Aerospace & Defense"
                    aria-invalid={Boolean(errors.industry)}
                    data-autofocus
                    autoComplete="off"
                  />
                  <Button
                    onClick={() => {
                      setCustomIndustry(false);
                      set('industry', '');
                    }}
                  >
                    List
                  </Button>
                </div>
              ) : (
                <select
                  id="case-industry"
                  className="field"
                  value={industryValue}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM) {
                      setCustomIndustry(true);
                      set('industry', '');
                    } else {
                      set('industry', e.target.value);
                    }
                  }}
                  aria-invalid={Boolean(errors.industry)}
                >
                  <option value="">Select an industry…</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                  {customIndustries.length > 0 && (
                    <optgroup label="Your industries">
                      {customIndustries.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value={CUSTOM}>+ Add a custom industry…</option>
                </select>
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Case source" htmlFor="case-source">
              <input
                id="case-source"
                maxLength={200}
                className="field"
                list="source-options"
                value={input.source}
                onChange={(e) => set('source', e.target.value)}
                placeholder="e.g. Booth casebook, Case in Point"
                autoComplete="off"
              />
              <datalist id="source-options">
                {sources.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Interviewer / practice partner" htmlFor="case-partner">
              <input
                id="case-partner"
                className="field"
                list="partner-options"
                value={input.partner}
                onChange={(e) => set('partner', e.target.value)}
                placeholder="Optional"
                autoComplete="off"
                maxLength={100}
              />
              <datalist id="partner-options">
                {partners.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
          </div>

          {mode === 'real' && input.source.trim() !== '' && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3.5 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--accent)]"
                checked={wantsBurn}
                onChange={(e) => setBurnChoice(e.target.checked)}
              />
              <span>
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <Flame className="size-4 text-accent-text" aria-hidden /> I've finished this whole book
                </span>
                <span className="block text-xs text-muted">
                  Members picking a case for you will skip all of {input.source.trim()}. Only tick this if you've done the whole book. For single solo cases, use "Cases I've burned" in Profile &amp; privacy; they don't count as practice.
                </span>
              </span>
            </label>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label !mb-0" id="overall-label">
                Overall performance
              </span>
              <button
                type="button"
                onClick={() => toggleNote('overall')}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
              >
                <MessageSquarePlus className="size-3.5" /> {openNotes.has('overall') ? 'Hide note' : 'Add a note'}
              </button>
            </div>
            <RatingInput
              label="Overall performance"
              size="lg"
              showMeaning
              value={input.overall}
              onChange={(v: Rating | null) => set('overall', v)}
            />
            {openNotes.has('overall') && (
              <input
                className="field mt-3"
                aria-label="Overall feedback"
                value={input.overallFeedback}
                onChange={(e) => set('overallFeedback', e.target.value)}
                placeholder="Overall feedback from your interviewer"
              />
            )}
          </div>
        </section>

        {/* ---- Takeaways ----------------------------------------------------------------- */}
        <section aria-label="Takeaways">
          <h3 className="eyebrow mb-3">Takeaways while it's fresh</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What went well?" htmlFor="went-well">
              <textarea
                id="went-well"
                className="field"
                rows={2}
                value={input.wentWell}
                onChange={(e) => set('wentWell', e.target.value)}
                placeholder="e.g. Clear structure, strong synthesis"
              />
            </Field>
            <Field label="What did I struggle with?" htmlFor="struggled">
              <textarea
                id="struggled"
                className="field"
                rows={2}
                value={input.struggled}
                onChange={(e) => set('struggled', e.target.value)}
                placeholder="e.g. Quant setup took too long"
              />
            </Field>
            <Field label="Concepts I learned" htmlFor="concepts">
              <textarea
                id="concepts"
                className="field"
                rows={2}
                value={input.concepts}
                onChange={(e) => set('concepts', e.target.value)}
                placeholder="One per line, e.g. Load factor"
              />
            </Field>
            <Field label="What should I practice next?" htmlFor="next-focus">
              <textarea
                id="next-focus"
                className="field"
                rows={2}
                value={input.nextFocus}
                onChange={(e) => set('nextFocus', e.target.value)}
                placeholder="e.g. Slow down on the math setup"
              />
            </Field>
          </div>

          <div className="mt-4">
            <p className="label" id="improve-label">
              Main thing to improve <span className="font-normal text-muted">(optional, feeds your Improvement Areas)</span>
            </p>
            <div role="group" aria-labelledby="improve-label" className="flex flex-wrap gap-2">
              {SKILL_GROUPS.map((g) => {
                const on = input.improvementArea === g.key;
                return (
                  <button
                    key={g.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('improvementArea', on ? null : (g.key as SkillGroupKey))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-line-strong bg-surface text-ink-2 hover:border-muted hover:bg-surface-2'
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---- Skill ratings (collapsed by default) -------------------------------------- */}
        <section aria-label="Skill ratings" className="rounded-2xl border border-line">
          <button
            type="button"
            onClick={() => setShowSkills((s) => !s)}
            aria-expanded={showSkills}
            className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition hover:bg-surface-2/60"
          >
            <span>
              <span className="block text-sm font-semibold text-ink">Skill ratings</span>
              <span className="block text-xs text-muted">
                Optional. Rate only what was tested; unrated skills never count as zero.
              </span>
            </span>
            <span className="flex items-center gap-3">
              {ratedCount > 0 && (
                <span className="num rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-text">
                  {ratedCount} rated
                </span>
              )}
              <ChevronDown className={`size-5 text-muted transition-transform ${showSkills ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {showSkills && (
            <div className="space-y-4 border-t border-line px-4 py-4">
              {SKILLS.map((s) => {
                const entry = input.skills[s.key];
                const noteOpen = openNotes.has(s.key);
                return (
                  <div key={s.key}>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <span className="text-sm font-medium text-ink">{s.label}</span>
                      <div className="flex items-center gap-2">
                        <RatingInput
                          label={s.label}
                          value={entry.rating}
                          onChange={(v) => setSkill(s.key, { rating: v })}
                        />
                        <button
                          type="button"
                          onClick={() => toggleNote(s.key)}
                          aria-label={`${noteOpen ? 'Hide' : 'Add'} feedback for ${s.label}`}
                          aria-pressed={noteOpen}
                          title="Feedback"
                          className={`flex size-9 items-center justify-center rounded-xl border transition ${
                            noteOpen || entry.feedback
                              ? 'border-accent/40 bg-accent-soft text-accent-text'
                              : 'border-line-strong text-muted hover:bg-surface-2 hover:text-ink'
                          }`}
                        >
                          <MessageSquarePlus className="size-4" />
                        </button>
                      </div>
                    </div>
                    {noteOpen && (
                      <input
                        className="field mt-2"
                        aria-label={`${s.label} feedback`}
                        value={entry.feedback}
                        onChange={(e) => setSkill(s.key, { feedback: e.target.value })}
                        placeholder={`Feedback on ${s.label.toLowerCase()}`}
                      />
                    )}
                  </div>
                );
              })}
              <Field label="Other notes" htmlFor="other-notes" className="border-t border-line pt-4">
                <textarea
                  id="other-notes"
                  className="field"
                  rows={2}
                  value={input.otherNotes}
                  onChange={(e) => set('otherNotes', e.target.value)}
                  placeholder="Anything else worth remembering"
                />
              </Field>
            </div>
          )}
        </section>

        {/* ---- One-click private ---------------------------------------------------------- */}
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Lock className="size-4 text-accent-text" aria-hidden /> Keep this case private
            </p>
            <p className="text-xs text-muted">Hidden from every other member, whatever your profile shares.</p>
          </div>
          <Switch
            label="Keep this case private"
            checked={input.shareMode === 'private'}
            onChange={(on) => set('shareMode', on ? 'private' : 'profile')}
          />
        </div>

        {/* ---- Sharing for this case (collapsed; defaults to your profile settings) -------- */}
        <section aria-label="Sharing" className="rounded-2xl border border-line">
          <button
            type="button"
            onClick={() => setShowSharing((s) => !s)}
            aria-expanded={showSharing}
            className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition hover:bg-surface-2/60"
          >
            <span>
              <span className="block text-sm font-semibold text-ink">Sharing for this case</span>
              <span className="block text-xs text-muted">
                {SHARE_MODES.find((m) => m.value === input.shareMode)?.label}
              </span>
            </span>
            <ChevronDown className={`size-5 text-muted transition-transform ${showSharing ? 'rotate-180' : ''}`} />
          </button>
          {showSharing && (
            <div className="border-t border-line px-4 py-4">
              <div role="radiogroup" aria-label="Sharing for this case" className="space-y-2">
                {SHARE_MODES.map((m) => (
                  <label
                    key={m.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                      input.shareMode === m.value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'
                    }`}
                  >
                    <input
                      type="radio"
                      name="share-mode"
                      className="mt-0.5 accent-[var(--accent)]"
                      checked={input.shareMode === m.value}
                      onChange={() => set('shareMode', m.value)}
                    />
                    <span>
                      <span className="block font-medium text-ink">{m.label}</span>
                      <span className="block text-xs text-muted">{m.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>
      </form>
    </Dialog>
  );
}
