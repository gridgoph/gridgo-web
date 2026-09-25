/**
 * The desk window for a printed invoice: Monday–Friday, 08:00 inclusive
 * through 17:00 exclusive, Asia/Manila (UTC+8, no daylight saving).
 *
 * The client's operating-hours note is not a clock. This is GRIDGO's window.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export const DESK_WINDOW_LABEL = "Monday–Friday, 8:00 am–5:00 pm Philippine time.";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** True when `iso` is a weekday instant inside the GRIDGO desk window. */
export function isGridgoDeskInstant(iso: string): boolean {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return false;
  const wall = new Date(parsed + MANILA_OFFSET_MS);
  const day = wall.getUTCDay();
  if (day === 0 || day === 6) return false;
  const seconds =
    wall.getUTCHours() * 3600 +
    wall.getUTCMinutes() * 60 +
    wall.getUTCSeconds() +
    wall.getUTCMilliseconds() / 1000;
  return seconds >= 8 * 3600 && seconds < 17 * 3600;
}

/** Manila calendar date for an instant, as `YYYY-MM-DD`. */
export function manilaDate(instant: Date): string {
  const wall = new Date(instant.getTime() + MANILA_OFFSET_MS);
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function weekdayIndex(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Upcoming Monday–Friday dates in Philippine time. Weekends are not offered. */
export function upcomingDeskDates(now: Date = new Date(), count = 40): { value: string; label: string }[] {
  const dates: { value: string; label: string }[] = [];
  let cursor = manilaDate(now);
  for (let step = 0; dates.length < count && step < 120; step += 1) {
    const day = weekdayIndex(cursor);
    if (day !== 0 && day !== 6) {
      const [year, month, date] = cursor.split("-").map(Number);
      dates.push({
        value: cursor,
        label: `${WEEKDAYS[day]}, ${MONTHS[month - 1]} ${date}, ${year}`,
      });
    }
    cursor = addCalendarDays(cursor, 1);
  }
  return dates;
}

function clockLabel(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${pad(minute)} ${suffix}`;
}

/** Quarter hours from 8:00 am through 4:45 pm. 5:00 pm is not offered. */
export function deskTimes(): { value: string; label: string }[] {
  const times: { value: string; label: string }[] = [];
  for (let minutes = 8 * 60; minutes < 17 * 60; minutes += 15) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    times.push({ value: `${pad(hour)}:${pad(minute)}`, label: clockLabel(hour, minute) });
  }
  return times;
}

/** A Manila wall date and time, stored as a UTC instant. */
export function deskInstant(manilaYmd: string, manilaHm: string): string {
  return new Date(`${manilaYmd}T${manilaHm}:00+08:00`).toISOString();
}
