/**
 * Helpers for the schedule "simple builder": convert between a days-of-week +
 * time-of-day selection and a standard 5-field cron string, and produce a
 * best-effort human summary of a cron expression. Cron is evaluated in UTC by
 * the backend.
 */

/** Weekday options in Monday-first display order; `value` is the cron DOW number (0 = Sunday). */
export const WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
];

/** Build a `min hour * * dow` cron from a day selection and a HH:MM time. */
export function buildCron(days: number[], hour: number, minute: number): string {
  const dow =
    days.length === 0 || days.length === 7
      ? "*"
      : [...days].sort((a, b) => a - b).join(",");
  return `${minute} ${hour} * * ${dow}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Best-effort human summary of a cron expression. Handles the common
 * "at HH:MM on <days>" shape the builder produces; otherwise returns the raw
 * expression so nothing is lost.
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts;
  // Only summarize the simple time-of-day + weekday shape.
  if (dom !== "*" || mon !== "*") return cron;
  const h = Number(hour);
  const m = Number(min);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return cron;
  const time = `${pad(h)}:${pad(m)} UTC`;
  if (dow === "*") return `Every day at ${time}`;
  const nums = dow.split(",").map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) return cron;
  // Weekdays / weekend shorthands.
  const set = new Set(nums);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) {
    return `Weekdays at ${time}`;
  }
  if (set.size === 2 && set.has(0) && set.has(6)) {
    return `Weekends at ${time}`;
  }
  const labels = [...set]
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((n) => WEEKDAYS.find((w) => w.value === n)?.short ?? n);
  return `${labels.join(", ")} at ${time}`;
}
