import { SHARE_MODES, SKILLS, skillGroupLabel } from '../domain/constants';
import { sortAsc } from '../domain/stats';
import type { CaseRecord } from '../domain/types';

/** Columns follow the MCG log (Date ... Recommendation, Other) plus CaseLab's additions. */
export const CSV_HEADERS: string[] = [
  'ID',
  'Date',
  'Case Title',
  'Case Source',
  'Case Type',
  'Industry',
  'Interviewer / Partner',
  'Overall',
  'Overall Feedback',
  ...SKILLS.flatMap((s) => [s.label, `${s.label} Feedback`]),
  'What Went Well',
  'What I Struggled With',
  'Concepts Learned',
  'Next Focus',
  'Main Improvement Area',
  'Other Notes',
  'Sharing',
  'Created',
  'Last Updated',
];

function cell(value: string | number | null): string {
  if (value === null) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function caseToRow(c: CaseRecord): (string | number | null)[] {
  return [
    c.id,
    c.date,
    c.title,
    c.source,
    c.caseType,
    c.industry,
    c.partner,
    c.overall,
    c.overallFeedback,
    ...SKILLS.flatMap((s) => [c.skills[s.key].rating, c.skills[s.key].feedback]),
    c.wentWell,
    c.struggled,
    c.concepts,
    c.nextFocus,
    c.improvementArea ? skillGroupLabel(c.improvementArea) : '',
    c.otherNotes,
    SHARE_MODES.find((m) => m.value === c.shareMode)?.label ?? '',
    c.createdAt,
    c.updatedAt,
  ];
}

/**
 * RFC 4180 CSV, oldest case first. A UTF-8 byte-order mark is prepended so Excel opens
 * accented characters correctly. (JSON is the lossless backup; CSV is for spreadsheets.)
 */
export function casesToCSV(cases: CaseRecord[]): string {
  const lines = [CSV_HEADERS, ...sortAsc(cases).map(caseToRow)].map((row) => row.map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
