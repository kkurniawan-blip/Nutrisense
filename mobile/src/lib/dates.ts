/**
 * Calendar dates (YYYY-MM-DD) in the phone's own time zone.
 *
 * `toISOString()` gives the UTC date, which is yesterday in NTT (UTC+8) until 08:00 — so a measurement,
 * a vaccine or a TTD tick recorded in the morning would land on the wrong day. Use these instead.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** The local calendar date of `d` as YYYY-MM-DD. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today's local date, or `offsetDays` from today (negative = in the past), as YYYY-MM-DD. */
export function localDate(offsetDays = 0): string {
  const d = new Date();
  // setDate rolls months and years over correctly, unlike adding 86 400 000 ms across a DST change.
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return ymd(d);
}

/** `date` (YYYY-MM-DD) moved by `days`, still as a local calendar date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
