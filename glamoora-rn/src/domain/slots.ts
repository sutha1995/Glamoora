/**
 * Slot engine — pure business rules for availability (PRD Phase 6).
 *
 * Deliberately free of any storage/DB imports so the exact same rules apply
 * whether data comes from the local mock DB or, later, Supabase/Postgres.
 *
 * Critical rule enforced here: overlapping bookings are never offered, and
 * `conflictsWith` re-checks at write time so a slot taken by another customer
 * in the meantime cannot be double-booked.
 */
import type { BookingStatus } from '../types';
import { minToTime, overlap, timeToMin, todayISO } from '../utils';

/** Bookable grid: slots start every 30 minutes inside the working window. */
export const SLOT_GRID_MIN = 30;
/** A customer cannot book less than this many minutes from now. */
export const LEAD_TIME_MIN = 15;
/** Booking statuses that release their time slot back to the pool. */
export const RELEASED_STATUSES: BookingStatus[] = ['cancelled', 'rejected'];

export interface Window {
  start: string;
  end: string;
}
export interface TimeRange {
  start: string;
  end: string;
}
/** Half-open busy range in minutes-from-midnight. */
export interface BusyRange {
  s: number;
  e: number;
}

export function isReleased(status: BookingStatus): boolean {
  return RELEASED_STATUSES.includes(status);
}

/** True when a status still holds its time slot. */
export function holdsSlot(status: BookingStatus): boolean {
  return !isReleased(status);
}

/**
 * Generate the bookable start times for one date.
 *
 * @param win        working window for that weekday, or undefined when closed
 * @param breaksDay  recurring breaks for that weekday
 * @param blockedDay one-off blocked ranges for that date
 * @param busyDay    already-booked ranges for that date (minutes)
 * @param duration   service length in minutes
 * @param dateStr    YYYY-MM-DD, used to apply the lead-time rule for today
 */
export function slotsForDate(
  win: Window | undefined,
  breaksDay: TimeRange[],
  blockedDay: TimeRange[],
  busyDay: BusyRange[],
  duration: number,
  dateStr: string
): string[] {
  if (!win || duration <= 0) return [];
  const s0 = timeToMin(win.start);
  const e0 = timeToMin(win.end);
  if (e0 - s0 < duration) return [];

  const now = new Date();
  const isToday = dateStr === todayISO();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out: string[] = [];

  for (let t = s0; t + duration <= e0; t += SLOT_GRID_MIN) {
    const s = t;
    const e = t + duration;
    if (isToday && s < nowMin + LEAD_TIME_MIN) continue;
    if (clashes(s, e, breaksDay, blockedDay, busyDay)) continue;
    out.push(minToTime(s));
  }
  return out;
}

/** Does [s,e) overlap any break, blocked range or existing appointment? */
export function clashes(
  s: number,
  e: number,
  breaksDay: TimeRange[],
  blockedDay: TimeRange[],
  busyDay: BusyRange[]
): boolean {
  for (const b of breaksDay) if (overlap(s, e, timeToMin(b.start), timeToMin(b.end))) return true;
  for (const b of blockedDay) if (overlap(s, e, timeToMin(b.start), timeToMin(b.end))) return true;
  for (const b of busyDay) if (overlap(s, e, b.s, b.e)) return true;
  return false;
}

/**
 * Write-time guard: would a new appointment at [start,end) collide with
 * appointments that still hold their slot?
 */
export function conflictsWith(busy: TimeRange[], start: string, end: string): boolean {
  const s = timeToMin(start);
  const e = timeToMin(end);
  return busy.some((b) => overlap(s, e, timeToMin(b.start), timeToMin(b.end)));
}

/** Earliest date (from `from`) whose weekday has a working window. */
export function isOpenOn(win: Window | undefined): boolean {
  return !!win;
}

/** "10:00–13:00" style label, or null when closed. */
export function windowLabel(win: Window | undefined): string | null {
  return win ? `${win.start}–${win.end}` : null;
}
