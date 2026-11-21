/** The Dashboard greets by the time of day (Dashboard C, 2026-11-20). Core is English only. */
export type DayPart = 'morning' | 'afternoon' | 'evening';

/** Morning before 12:00, afternoon before 18:00, then evening (local time). */
export const dayPart = (now: Date): DayPart => {
  const h = now.getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
};

/** "Good afternoon, Alex", or "Good afternoon" with no name. */
export const greeting = (now: Date, firstName?: string | null): string => {
  const name = (firstName ?? '').trim();
  const base = `Good ${dayPart(now)}`;
  return name ? `${base}, ${name}` : base;
};
