// The real MCG case-log workbook (a copy of "MCG Case Log Template.xlsx"). The export fills it in; it is fetched only when you export.
import templateUrl from './mcg-case-log-template.xlsx?url';

/** The template's bytes. Rejects with a plain message if it can't be fetched (offline, blocked). */
export async function loadMcgTemplate(): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(templateUrl);
  } catch {
    throw new Error("Couldn't load the MCG template. Check your internet connection and try again.");
  }
  if (!response.ok) throw new Error("Couldn't load the MCG template. Try again in a moment.");
  return new Uint8Array(await response.arrayBuffer());
}
