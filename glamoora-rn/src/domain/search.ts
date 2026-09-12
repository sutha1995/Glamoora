/**
 * Provider search & filtering (PRD Phase 5) — one implementation shared by the
 * Discover screen and the AI natural-language search, so "under RM100 near me
 * this Saturday" filters exactly the way the manual chips do.
 *
 * Pure: takes a DB snapshot + filters, returns ranked results. No storage or
 * navigation imports, so it is trivially unit-testable and backend-agnostic.
 */
import type { Category, DB, ProviderProfile } from '../types';
import { holdsSlot, type Window } from './slots';
import { addMin, haversine, parseISO, timeToMin, todayISO } from '../utils';

export type ServiceTypeFilter = '' | 'provider' | 'customer';
export type SortKey = 'recommended' | 'distance' | 'rating' | 'price_asc' | 'price_desc';

export interface SearchFilters {
  /** Free-text: provider name, bio, service name or category name. */
  q: string;
  cat: string;
  /** 0 means "any". */
  maxPrice: number;
  minRating: number;
  maxDist: number;
  type: ServiceTypeFilter;
  /** Require an open slot today. */
  openToday: boolean;
  /** Require an open slot on this date (YYYY-MM-DD). */
  date: string;
  /** Time-of-day window in minutes from midnight; 0 means unset. */
  timeFrom: number;
  timeTo: number;
  /** Only studios with the verified badge. */
  verified: boolean;
  /** Only studios offering a service that can be done at the customer's place. */
  comesToYou: boolean;
  sort: SortKey;
}

export const EMPTY_FILTERS: SearchFilters = {
  q: '', cat: '', maxPrice: 0, minRating: 0, maxDist: 0, type: '',
  openToday: false, date: '', timeFrom: 0, timeTo: 0, verified: false, comesToYou: false,
  sort: 'recommended',
};

export interface SearchCenter {
  lat: number;
  lng: number;
  label: string;
}

export interface SearchHit {
  p: ProviderProfile;
  dist: number;
  minPrice: number;
  maxPrice: number;
  /** Number of bookable slots on `filters.date` (or today) inside the time window. */
  openSlots: number;
  /** Cheapest service that can be done at the customer's location, if any. */
  mobilePrice: number | null;
  matchedServiceNames: string[];
}

interface AvailabilityRow {
  providerId: string;
  day: number;
  start: string;
  end: string;
  active: boolean;
}

/** Working window for a provider on a weekday (earliest start wins). */
function windowFor(avail: AvailabilityRow[], providerId: string, day: number): Window | undefined {
  const rows = avail.filter((a) => a.providerId === providerId && a.active && a.day === day);
  if (!rows.length) return undefined;
  rows.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  return { start: rows[0].start, end: rows[0].end };
}

/**
 * Count bookable slots for one provider/service on one date, honouring breaks,
 * blocked slots, existing appointments and an optional time-of-day window.
 */
export function countOpenSlots(
  db: DB,
  providerId: string,
  duration: number,
  dateISO: string,
  timeFrom = 0,
  timeTo = 0
): number {
  const day = parseISO(dateISO).getDay();
  const win = windowFor(db.availability, providerId, day);
  if (!win) return 0;

  const breaks = db.breaks.filter((b) => b.providerId === providerId && b.day === day);
  const blocked = db.blocked
    .filter((b) => b.providerId === providerId && b.start.slice(0, 10) === dateISO)
    .map((b) => ({ s: timeToMin(b.start.slice(11, 16)), e: timeToMin(b.end.slice(11, 16)) }));
  const busy = db.bookings
    .filter((b) => b.providerId === providerId && b.date === dateISO && holdsSlot(b.status) && b.start && b.end)
    .map((b) => ({ s: timeToMin(b.start!), e: timeToMin(b.end!) }));

  const s0 = timeToMin(win.start);
  const e0 = timeToMin(win.end);
  const from = timeFrom ? Math.max(s0, timeFrom) : s0;
  const to = timeTo ? Math.min(e0, timeTo) : e0;

  const now = new Date();
  const isToday = dateISO === todayISO();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let n = 0;
  for (let t = from; t + duration <= to; t += 30) {
    const s = t;
    const e = t + duration;
    if (isToday && s < nowMin + 15) continue;
    let bad = false;
    for (const b of breaks) if (s < timeToMin(b.end) && timeToMin(b.start) < e) { bad = true; break; }
    if (!bad) for (const b of blocked) if (s < b.e && b.s < e) { bad = true; break; }
    if (!bad) for (const b of busy) if (s < b.e && b.s < e) { bad = true; break; }
    if (!bad) n += 1;
  }
  return n;
}

/** Best (cheapest) slot availability across a studio's active services. */
export function bestAvailability(
  db: DB,
  providerId: string,
  dateISO: string,
  timeFrom = 0,
  timeTo = 0
): { slots: number; serviceName: string | null } {
  const svcs = db.services.filter((s) => s.providerId === providerId && s.active);
  let best = 0;
  let name: string | null = null;
  svcs.forEach((s) => {
    const n = countOpenSlots(db, providerId, s.duration, dateISO, timeFrom, timeTo);
    if (n > best) {
      best = n;
      name = s.name;
    }
  });
  return { slots: best, serviceName: name };
}

export function categoriesOf(db: DB, p: ProviderProfile): Category[] {
  return p.categoryIds.map((id) => db.categories.find((c) => c.id === id)).filter((c): c is Category => !!c);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Rank providers against the filters. Suspended studios are always excluded —
 * they cannot be booked, so showing them would be misleading.
 */
export function searchProviders(db: DB, filters: SearchFilters, center: SearchCenter): SearchHit[] {
  const q = norm(filters.q);
  const date = filters.date || todayISO();

  const hits: SearchHit[] = [];

  db.profiles.forEach((p) => {
    if (p.verification === 'suspended') return;

    const svcs = db.services.filter((s) => s.providerId === p.id);
    const active = svcs.filter((s) => s.active);
    const cats = categoriesOf(db, p);

    /* ---- text ---- */
    if (q) {
      const hay = [p.displayName, p.bio, ...cats.map((c) => `${c.name} ${c.desc}`), ...svcs.map((s) => `${s.name} ${s.desc}`)]
        .map(norm)
        .join(' ');
      // Any-word match: forgiving for typos and multi-service studios.
      const words = q.split(' ').filter(Boolean);
      if (!words.some((w) => hay.includes(w))) return;
    }

    /* ---- category ---- */
    if (filters.cat && !p.categoryIds.includes(filters.cat)) return;

    /* ---- price ---- */
    const prices = active.map((s) => s.price);
    const lo = prices.length ? Math.min(...prices) : 0;
    const hi = prices.length ? Math.max(...prices) : 0;
    if (filters.maxPrice && (!prices.length || lo > filters.maxPrice)) return;

    /* ---- rating ---- */
    if (filters.minRating && !(p.avg >= filters.minRating && p.reviewCount > 0)) return;

    /* ---- verified ---- */
    if (filters.verified && p.verification !== 'verified') return;

    /* ---- distance ---- */
    const dist = haversine(center.lat, center.lng, p.lat, p.lng);
    if (filters.maxDist && dist > filters.maxDist) return;

    /* ---- service type ---- */
    if (filters.type === 'provider' && !active.some((s) => s.locationType !== 'customer')) return;
    if (filters.type === 'customer' && !active.some((s) => s.locationType !== 'provider')) return;
    const mobile = active.filter((s) => s.locationType !== 'provider');
    if (filters.comesToYou && !mobile.length) return;

    /* ---- availability ---- */
    const window = { from: filters.timeFrom, to: filters.timeTo };
    let openSlots = 0;
    let serviceName: string | null = null;
    if (filters.openToday || filters.date || filters.timeFrom || filters.timeTo) {
      const avail = bestAvailability(db, p.id, filters.openToday && !filters.date ? todayISO() : date, window.from, window.to);
      openSlots = avail.slots;
      serviceName = avail.serviceName;
      if (!openSlots) return;
    }

    const matchedServiceNames = active
      .filter((s) => !q || norm(`${s.name} ${s.desc}`).split(' ').some((w) => q.includes(w) || w.includes(q)))
      .map((s) => s.name)
      .slice(0, 3);

    hits.push({
      p,
      dist,
      minPrice: lo,
      maxPrice: hi,
      openSlots,
      mobilePrice: mobile.length ? Math.min(...mobile.map((s) => s.price)) : null,
      matchedServiceNames: matchedServiceNames.length ? matchedServiceNames : (serviceName ? [serviceName] : []),
    });
  });

  switch (filters.sort) {
    case 'distance':
      hits.sort((a, b) => a.dist - b.dist);
      break;
    case 'rating':
      hits.sort((a, b) => b.p.avg - a.p.avg || b.p.reviewCount - a.p.reviewCount);
      break;
    case 'price_asc':
      hits.sort((a, b) => (a.minPrice || 1e9) - (b.minPrice || 1e9));
      break;
    case 'price_desc':
      hits.sort((a, b) => (b.maxPrice || 0) - (a.maxPrice || 0));
      break;
    default:
      hits.sort((a, b) => recommend(b) - recommend(a));
  }
  return hits;

  /** Recommended = trust + reputation + proximity + availability. */
  function recommend(h: SearchHit): number {
    const trust = h.p.verification === 'verified' ? 2 : h.p.verification === 'pending' ? 0.5 : 0;
    const reputation = h.p.reviewCount ? h.p.avg * 2 : h.p.avg;
    const proximity = -h.dist / 8;
    const urgency = Math.min(h.openSlots, 6) * 0.15;
    return trust + reputation + proximity + urgency;
  }
}

/** Human-readable summary of the active filters, used for chips and replies. */
export function describeFilters(db: DB, f: SearchFilters, center: SearchCenter | null): string[] {
  const out: string[] = [];
  if (f.cat) {
    const c = db.categories.find((x) => x.id === f.cat);
    if (c) out.push(c.name);
  }
  if (f.maxPrice) out.push(`≤ RM${f.maxPrice}`);
  if (f.minRating) out.push(`${f.minRating}+ stars`);
  if (f.maxDist) out.push(`within ${f.maxDist} km`);
  if (center && f.maxDist) out.push(`of ${center.label}`);
  if (f.type === 'provider') out.push('at the studio');
  if (f.type === 'customer' || f.comesToYou) out.push('comes to you');
  if (f.verified) out.push('verified only');
  if (f.date) out.push(`on ${readableDate(f.date)}`);
  else if (f.openToday) out.push('open today');
  if (f.timeFrom || f.timeTo) out.push(partLabel(f.timeFrom, f.timeTo));
  return out;
}

export function readableDate(iso: string): string {
  const t = todayISO();
  if (iso === t) return 'today';
  const d = parseISO(t);
  d.setDate(d.getDate() + 1);
  const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (iso === tomorrow) return 'tomorrow';
  return parseISO(iso).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function partLabel(from: number, to: number): string {
  if (from && !to) return `after ${minutesToLabel(from)}`;
  if (!from && to) return `before ${minutesToLabel(to)}`;
  if (from && to) return `${minutesToLabel(from)}–${minutesToLabel(to)}`;
  return 'any time';
}

export function minutesToLabel(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

/** Latest bookable end time for a service starting at `start`. */
export function endsAt(start: string, duration: number): string {
  return addMin(start, duration);
}
