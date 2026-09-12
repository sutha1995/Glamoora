import { seed } from '../data/seed';
import { Booking, BookingStatus, DB, ProviderProfile, Review, Service, User } from '../types';
import { addMin, minToTime, newRef, overlap, parseISO, timeToMin, todayISO, uid } from '../utils';
import { clearRaw, loadRaw, saveRaw } from './storage';

/* ================= DB singleton ================= */
let db: DB = seed();
let ready = false;

export function isReady() {
  return ready;
}
export function getDB(): DB {
  return db;
}
export async function initDB(): Promise<void> {
  const raw = await loadRaw();
  if (raw) {
    try {
      const d = JSON.parse(raw) as DB;
      if (d && d.v === 2) {
        db = d;
        ready = true;
        return;
      }
    } catch {
      /* reseed */
    }
  }
  db = seed();
  await saveRaw(JSON.stringify(db));
  ready = true;
}
export async function saveDB(): Promise<void> {
  await saveRaw(JSON.stringify(db));
}
export async function resetDB(): Promise<void> {
  await clearRaw();
  db = seed();
  await saveRaw(JSON.stringify(db));
}

/* ================= lookups ================= */
export const me = (): User | null => db.users.find((u) => u.id === db.session) || null;
export const userById = (id: string) => db.users.find((u) => u.id === id);
export const profileOf = (id: string) => db.profiles.find((p) => p.id === id);
export const myProfile = (): ProviderProfile | undefined => db.profiles.find((p) => p.userId === db.session);
export const servicesOf = (pid: string) => db.services.filter((s) => s.providerId === pid);
export const activeServicesOf = (pid: string) => servicesOf(pid).filter((s) => s.active);
export const serviceOf = (id: string | null | undefined) => (id ? db.services.find((s) => s.id === id) : undefined);
export const catOf = (id: string) => db.categories.find((c) => c.id === id);
export const reviewsOf = (pid: string) => db.reviews.filter((r) => r.providerId === pid).sort((a, b) => b.createdAt - a.createdAt);
export const isFav = (cid: string, pid: string) => db.favourites.some((f) => f.customerId === cid && f.providerId === pid);
export const unreadCount = (userId: string) => db.notifs.filter((n) => n.userId === userId && !n.read).length;
export const customerName = (id: string) => {
  const u = userById(id);
  return u ? u.name.split(' ')[0] : 'Guest';
};
export const minPrice = (pid: string) => {
  const s = activeServicesOf(pid);
  return s.length ? Math.min(...s.map((x) => x.price)) : 0;
};

/* ================= availability ================= */
function availWindow(pid: string, day: number): { start: string; end: string } | undefined {
  const list = db.availability.filter((a) => a.providerId === pid && a.active && a.day === day);
  if (!list.length) return undefined;
  list.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  return { start: list[0].start, end: list[0].end };
}
export function availMap(pid: string): Record<number, { start: string; end: string }> {
  const m: Record<number, { start: string; end: string }> = {};
  for (let d = 0; d < 7; d++) {
    const w = availWindow(pid, d);
    if (w) m[d] = w;
  }
  return m;
}
const breaksOf = (pid: string, day: number) => db.breaks.filter((b) => b.providerId === pid && b.day === day);

/* ================= SLOT ENGINE (pure) ================= */
export function slotsForDate(
  win: { start: string; end: string } | undefined,
  breaksDay: { start: string; end: string }[],
  blockedDay: { start: string; end: string }[],
  busyDay: { s: number; e: number }[],
  duration: number,
  dateStr: string
): string[] {
  if (!win) return [];
  const s0 = timeToMin(win.start);
  const e0 = timeToMin(win.end);
  const now = new Date();
  const t0 = todayISO();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out: string[] = [];
  for (let t = s0; t + duration <= e0; t += 30) {
    const s = t;
    const e = t + duration;
    if (dateStr === t0 && s < nowMin + 15) continue;
    let bad = false;
    for (const b of breaksDay) if (overlap(s, e, timeToMin(b.start), timeToMin(b.end))) { bad = true; break; }
    if (!bad) for (const b of blockedDay) if (overlap(s, e, timeToMin(b.start), timeToMin(b.end))) { bad = true; break; }
    if (!bad) for (const b of busyDay) if (overlap(s, e, b.s, b.e)) { bad = true; break; }
    if (!bad) out.push(minToTime(s));
  }
  return out;
}

export function providerSlots(pid: string, serviceId: string, dateStr: string): string[] {
  const svc = serviceOf(serviceId);
  if (!svc) return [];
  const am = availMap(pid);
  const w = am[parseISO(dateStr).getDay()];
  if (!w) return [];
  const dow = parseISO(dateStr).getDay();
  const br = breaksOf(pid, dow);
  const blocked = db.blocked
    .filter((b) => b.providerId === pid && b.start.slice(0, 10) === dateStr)
    .map((b) => ({ start: b.start.slice(11, 16), end: b.end.slice(11, 16) }));
  const busy = db.bookings
    .filter((b) => b.providerId === pid && b.date === dateStr && !['cancelled', 'rejected'].includes(b.status) && b.start)
    .map((b) => ({ s: timeToMin(b.start!), e: timeToMin(b.end!) }));
  return slotsForDate(w, br, blocked, busy, svc.duration, dateStr);
}

function wouldConflict(pid: string, dateStr: string, start: string, end: string): boolean {
  return db.bookings.some(
    (b) =>
      b.providerId === pid &&
      b.date === dateStr &&
      !['cancelled', 'rejected'].includes(b.status) &&
      b.start &&
      overlap(timeToMin(start), timeToMin(end), timeToMin(b.start), timeToMin(b.end!))
  );
}

/* ================= actions ================= */
function notify(userId: string, type: string, title: string, msg: string) {
  db.notifs.unshift({ id: uid('n'), userId, type, title, msg, read: false, createdAt: Date.now() });
}

const STATUS_T: Record<string, [BookingStatus, BookingStatus]> = {
  accept: ['pending', 'confirmed'],
  reject: ['pending', 'rejected'],
  cancel: ['pending', 'cancelled'],
  complete: ['confirmed', 'completed'],
  noshow: ['confirmed', 'no_show'],
};

export function setBookingStatus(bid: string, byCustomer: boolean, action: keyof typeof STATUS_T): boolean {
  const b = db.bookings.find((x) => x.id === bid);
  if (!b) return false;
  const T = STATUS_T[action];
  if (!T || b.status !== T[0]) return false;
  b.status = T[1];
  b.updatedAt = Date.now();
  const p = profileOf(b.providerId);
  const cu = userById(b.customerId);
  const svc = serviceOf(b.serviceId);
  const loc = svc ? svc.name : '';
  const fdate = b.date;
  if (action === 'accept')
    notify(b.customerId, 'booking_confirmed', 'Booking confirmed', (p?.displayName || 'Your professional') + ' confirmed your ' + loc + ' on ' + fdate + ' at ' + b.start + '.');
  if (action === 'reject')
    notify(b.customerId, 'booking_rejected', 'Booking declined', (p?.displayName || 'Your professional') + ' is unable to take your ' + loc + ' on ' + fdate + '.');
  if (action === 'cancel') {
    notify(b.customerId, 'booking_cancelled', 'Booking cancelled', 'Your ' + loc + ' on ' + fdate + ' was cancelled.');
    if (!byCustomer)
      notify(b.providerId, 'booking_cancelled', 'Booking cancelled', (cu ? cu.name : 'A customer') + ' cancelled the ' + loc + ' on ' + fdate + '.');
  }
  if (action === 'complete')
    notify(b.customerId, 'booking_completed', 'Booking completed', loc + ' with ' + (p?.displayName || 'your professional') + ' is complete. We would love your review!');
  if (action === 'noshow')
    notify(b.customerId, 'booking_cancelled', 'Appointment missed', loc + ' on ' + fdate + ' was marked as no-show.');
  void saveDB();
  return true;
}

export function createBooking(
  cuId: string,
  svcId: string,
  dateStr: string,
  start: string | null,
  location: string,
  notes: string
): { err?: string; booking?: Booking } {
  const s = serviceOf(svcId);
  if (!s) return { err: 'Service not found' };
  if (start) {
    const end = addMin(start, s.duration);
    if (wouldConflict(s.providerId, dateStr, start, end))
      return { err: 'This slot was just taken. Please pick another time.' };
    const b: Booking = {
      id: uid('bkg'), ref: newRef(),
      customerId: cuId, providerId: s.providerId, serviceId: svcId,
      date: dateStr, start, end,
      price: s.price, location, locType: s.locationType, notes,
      status: 'pending', payment: 'Pay after service',
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    db.bookings.push(b);
    const u = userById(cuId);
    notify(s.providerId, 'booking_new', 'New booking request', (u ? u.name : 'A customer') + ' requested ' + s.name + ' on ' + dateStr + ' at ' + start + '.');
    void saveDB();
    return { booking: b };
  }
  return { err: 'Pick a date and time first' };
}

export function addReview(bid: string, rating: number, comment: string): { err?: string; review?: Review } {
  const b = db.bookings.find((x) => x.id === bid);
  if (!b) return { err: 'Booking not found' };
  if (b.status !== 'completed') return { err: 'Only completed bookings can be reviewed' };
  if (db.reviews.some((r) => r.bookingId === bid)) return { err: 'You already reviewed this booking' };
  const r: Review = {
    id: uid('r'), bookingId: bid, customerId: b.customerId, providerId: b.providerId,
    rating, comment, createdAt: Date.now(),
  };
  db.reviews.push(r);
  const p = profileOf(b.providerId);
  if (p) {
    const base = p.avg * (p.reviewCount || 0);
    p.avg = Math.round(((base + r.rating) / (p.reviewCount + 1)) * 10) / 10;
    p.reviewCount += 1;
  }
  notify(b.providerId, 'review', 'New review ★ ' + r.rating, customerName(b.customerId) + ' left you a ' + r.rating + '-star review.');
  void saveDB();
  return { review: r };
}

export function toggleFavourite(cid: string, pid: string): boolean {
  const i = db.favourites.findIndex((f) => f.customerId === cid && f.providerId === pid);
  if (i >= 0) db.favourites.splice(i, 1);
  else db.favourites.push({ customerId: cid, providerId: pid, createdAt: Date.now() });
  void saveDB();
  return i < 0;
}

export function setSession(userId: string | null) {
  db.session = userId;
  void saveDB();
}

/* service/availability/portfolio CRUD */
export function upsertService(svc: Partial<Service> & { providerId: string }): void {
  if (svc.id) {
    const s = serviceOf(svc.id);
    if (s) Object.assign(s, svc);
  } else {
    db.services.push({
      id: uid('s'),
      providerId: svc.providerId,
      categoryId: svc.categoryId || 'c1',
      name: svc.name || 'New service',
      desc: svc.desc || '',
      price: svc.price || 0,
      duration: svc.duration || 60,
      locationType: svc.locationType || 'provider',
      active: true,
    });
  }
  void saveDB();
}
export function deleteService(id: string) {
  const i = db.services.findIndex((s) => s.id === id);
  if (i >= 0) db.services.splice(i, 1);
  db.portfolio.forEach((pf) => {
    if (pf.serviceId === id) pf.serviceId = null;
  });
  void saveDB();
}
export function setServiceActive(id: string, active: boolean) {
  const s = serviceOf(id);
  if (s) s.active = active;
  void saveDB();
}
export function setAvailability(pid: string, day: number, on: boolean, start?: string, end?: string) {
  const ex = db.availability.find((a) => a.providerId === pid && a.day === day);
  if (on && !ex) db.availability.push({ id: uid('a'), providerId: pid, day, start: start || '10:00', end: end || '18:00', active: true });
  if (ex) {
    ex.active = on;
    if (start) ex.start = start;
    if (end) ex.end = end;
  }
  void saveDB();
}
export function addBreak(pid: string, day: number, start: string, end: string) {
  db.breaks.push({ id: uid('b'), providerId: pid, day, start, end });
  void saveDB();
}
export function removeBreak(id: string) {
  const i = db.breaks.findIndex((b) => b.id === id);
  if (i >= 0) db.breaks.splice(i, 1);
  void saveDB();
}
export function addBlocked(pid: string, date: string, start: string, end: string, reason: string): { err?: string } {
  const conflict = db.bookings.some(
    (b) =>
      b.providerId === pid &&
      b.date === date &&
      !['cancelled', 'rejected'].includes(b.status) &&
      b.start &&
      overlap(timeToMin(start), timeToMin(end), timeToMin(b.start), timeToMin(b.end!))
  );
  if (conflict) return { err: 'That time overlaps an existing booking — it stays reserved.' };
  db.blocked.push({ id: uid('k'), providerId: pid, start: date + ' ' + start, end: date + ' ' + end, reason: reason || 'Blocked' });
  void saveDB();
  return {};
}
export function removeBlocked(id: string) {
  const i = db.blocked.findIndex((k) => k.id === id);
  if (i >= 0) db.blocked.splice(i, 1);
  void saveDB();
}
export function addPortfolioItem(pid: string, serviceId: string, art: string, caption: string) {
  db.portfolio.push({
    id: uid('pf'), providerId: pid, serviceId, art,
    grad: 'g' + (Math.floor(Math.random() * 6) + 1), caption,
  });
  void saveDB();
}
export function removePortfolioItem(id: string) {
  const i = db.portfolio.findIndex((x) => x.id === id);
  if (i >= 0) db.portfolio.splice(i, 1);
  void saveDB();
}
export function setVerification(pid: string, v: 'unverified' | 'pending' | 'verified' | 'suspended') {
  const p = profileOf(pid);
  if (p) p.verification = v;
  void saveDB();
}
export function setCategoryActive(id: string, active: boolean) {
  const c = catOf(id);
  if (c) c.active = active;
  void saveDB();
}
export function setBookingStatusAdmin(bid: string, status: BookingStatus): boolean {
  const b = db.bookings.find((x) => x.id === bid);
  if (!b) return false;
  const okMap: Record<string, BookingStatus[]> = {
    pending: ['confirmed', 'rejected', 'cancelled', 'completed', 'no_show'],
    confirmed: ['rejected', 'cancelled', 'completed', 'no_show'],
    rejected: ['cancelled'],
    cancelled: [],
    completed: ['no_show', 'cancelled'],
    no_show: ['cancelled'],
  };
  if (!okMap[b.status]?.includes(status)) return false;
  b.status = status;
  b.updatedAt = Date.now();
  void saveDB();
  return true;
}
