/** Two cases with the same date and title (ignoring case and surrounding spaces) are treated as the same case. */
export const caseKey = (c: { date: string; title: string }): string => `${c.date}|${c.title.trim().toLowerCase()}`;
