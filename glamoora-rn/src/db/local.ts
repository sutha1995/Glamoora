/**
 * localRepository — the offline, seeded implementation of `Repository`.
 *
 * Data lives in memory and is persisted as one JSON blob through
 * `src/db/storage.ts` (AsyncStorage on native, localStorage on web).
 * All marketplace rules (slot generation, double-booking prevention, review
 * gating, honest verification) are enforced here so they hold no matter which
 * screen triggers them.
 */
import { seed } from '../data/seed';
import {
  conflictsWith,
  holdsSlot,
  slotsForDate,
  type BusyRange,
  type TimeRange,
  type Window,
} from '../domain/slots';
import type {
  AnalyticsEvent,
  Booking,
  BookingStatus,
  Category,
  Conversation,
  DB,
  Message,
  PaymentStatus,
  PortfolioItem,
  ProviderProfile,
  Report,
  ReportStatus,
  Review,
  Service,
  User,
  Verification,
} from '../types';
import { addMin, newRef, parseISO, timeToMin, uid } from '../utils';
import { clearRaw, loadRaw, saveRaw } from './storage';
import type {
  BookingAction,
  NewBookingInput,
  NewReportInput,
  Ok,
  ReportAction,
  Repository,
  TrackInput,
} from './repository';

/** Bump when the persisted shape changes so old caches reseed cleanly. */
export const DB_VERSION = 4;

/* ================= state ================= */
let db: DB = seed();
let ready = false;

/* ================= internal helpers ================= */
function notify(userId: string, type: string, title: string, msg: string): void {
  db.notifs.unshift({ id: uid('n'), userId, type, title, msg, read: false, createdAt: Date.now() });
}

function persist(): void {
  void saveRaw(JSON.stringify(db));
}

/** Append an analytics event without recursing through `repo.track`. */
function record(
  name: AnalyticsEvent['name'],
  actorId: string,
  extra: { providerId?: string; bookingId?: string; meta?: Record<string, string | number | boolean> } = {}
): void {
  const actor = db.users.find((u) => u.id === actorId);
  db.events.unshift({
    id: uid('ev'),
    name,
    actorId,
    role: actor ? actor.role : 'system',
    providerId: extra.providerId,
    bookingId: extra.bookingId,
    meta: extra.meta,
    createdAt: Date.now(),
  });
  // Keep the event log bounded; it is demo telemetry, not an audit archive.
  if (db.events.length > 2000) db.events.length = 2000;
}

function availWindow(providerId: string, day: number): Window | undefined {
  const list = db.availability.filter((a) => a.providerId === providerId && a.active && a.day === day);
  if (!list.length) return undefined;
  list.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  return { start: list[0].start, end: list[0].end };
}

function breaksOf(providerId: string, day: number): TimeRange[] {
  return db.breaks.filter((b) => b.providerId === providerId && b.day === day);
}

function blockedOn(providerId: string, date: string): TimeRange[] {
  return db.blocked
    .filter((b) => b.providerId === providerId && b.start.slice(0, 10) === date)
    .map((b) => ({ start: b.start.slice(11, 16), end: b.end.slice(11, 16) }));
}

function busyOn(providerId: string, date: string): BusyRange[] {
  return db.bookings
    .filter((b) => b.providerId === providerId && b.date === date && holdsSlot(b.status) && b.start && b.end)
    .map((b) => ({ s: timeToMin(b.start!), e: timeToMin(b.end!) }));
}

/** Ranges that still hold their slot, as HH:MM strings (write-time guard). */
function heldRanges(providerId: string, date: string): TimeRange[] {
  return db.bookings
    .filter((b) => b.providerId === providerId && b.date === date && holdsSlot(b.status) && b.start && b.end)
    .map((b) => ({ start: b.start!, end: b.end! }));
}

const TRANSITIONS: Record<BookingAction, [BookingStatus, BookingStatus]> = {
  accept: ['pending', 'confirmed'],
  reject: ['pending', 'rejected'],
  cancel: ['pending', 'cancelled'],
  complete: ['confirmed', 'completed'],
  noshow: ['confirmed', 'no_show'],
};

/** Legal admin overrides, from current status -> allowed next statuses. */
const ADMIN_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'rejected', 'cancelled', 'completed', 'no_show'],
  confirmed: ['rejected', 'cancelled', 'completed', 'no_show'],
  rejected: ['cancelled'],
  cancelled: [],
  completed: ['no_show', 'cancelled'],
  no_show: ['cancelled'],
};

/** Mock payment transitions (PRD Phase 14). */
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  unpaid: ['mock_paid'],
  mock_paid: ['refunded'],
  refunded: [],
};

function resolveProviderId(targetType: Report['targetType'], targetId: string): string {
  if (targetType === 'provider') return targetId;
  if (targetType === 'portfolio') return db.portfolio.find((x) => x.id === targetId)?.providerId || '';
  return db.reviews.find((x) => x.id === targetId)?.providerId || '';
}

/* ================= the repository ================= */
export const localRepository: Repository = {
  /* ---------------- lifecycle ---------------- */
  async init() {
    const raw = await loadRaw();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DB;
        if (parsed && parsed.v === DB_VERSION) {
          db = parsed;
          ready = true;
          return;
        }
      } catch {
        /* fall through and reseed */
      }
    }
    db = seed();
    await saveRaw(JSON.stringify(db));
    ready = true;
  },
  async save() {
    await saveRaw(JSON.stringify(db));
  },
  async reset() {
    await clearRaw();
    db = seed();
    await saveRaw(JSON.stringify(db));
  },
  isReady() {
    return ready;
  },
  snapshot() {
    return db;
  },

  /* ---------------- session ---------------- */
  me() {
    return db.users.find((u) => u.id === db.session) || null;
  },
  setSession(userId) {
    db.session = userId;
    persist();
  },

  /* ---------------- lookups ---------------- */
  userById: (id) => db.users.find((u) => u.id === id),
  profileOf: (id) => db.profiles.find((p) => p.id === id),
  myProfile: () => db.profiles.find((p) => p.userId === db.session),
  servicesOf: (providerId) => db.services.filter((s) => s.providerId === providerId),
  activeServicesOf: (providerId) => db.services.filter((s) => s.providerId === providerId && s.active),
  serviceOf: (id) => (id ? db.services.find((s) => s.id === id) : undefined),
  catOf: (id) => db.categories.find((c) => c.id === id),
  reviewsOf: (providerId) =>
    db.reviews.filter((r) => r.providerId === providerId).sort((a, b) => b.createdAt - a.createdAt),
  portfolioOf: (providerId) => db.portfolio.filter((x) => x.providerId === providerId),
  isFav: (customerId, providerId) =>
    db.favourites.some((f) => f.customerId === customerId && f.providerId === providerId),
  unreadCount: (userId) => db.notifs.filter((n) => n.userId === userId && !n.read).length,
  customerName(id) {
    const u = db.users.find((x) => x.id === id);
    return u ? u.name.split(' ')[0] : 'Guest';
  },
  minPrice(providerId) {
    const s = db.services.filter((x) => x.providerId === providerId && x.active);
    return s.length ? Math.min(...s.map((x) => x.price)) : 0;
  },

  /* ---------------- availability ---------------- */
  availMap(providerId) {
    const m: Record<number, Window> = {};
    for (let d = 0; d < 7; d++) {
      const w = availWindow(providerId, d);
      if (w) m[d] = w;
    }
    return m;
  },
  providerSlots(providerId, serviceId, date) {
    const svc = db.services.find((s) => s.id === serviceId);
    if (!svc) return [];
    const dow = parseISO(date).getDay();
    const win = availWindow(providerId, dow);
    if (!win) return [];
    return slotsForDate(win, breaksOf(providerId, dow), blockedOn(providerId, date), busyOn(providerId, date), svc.duration, date);
  },

  /* ---------------- bookings ---------------- */
  createBooking(input: NewBookingInput): Ok<Booking> {
    const s = db.services.find((x) => x.id === input.serviceId);
    if (!s) return { err: 'Service not found' };
    if (!s.active) return { err: 'This service is no longer offered.' };
    if (!input.start) return { err: 'Pick a date and time first' };

    const provider = db.profiles.find((p) => p.id === s.providerId);
    if (!provider) return { err: 'Professional not found' };
    if (provider.verification === 'suspended') return { err: 'This professional is suspended and cannot take bookings.' };

    const end = addMin(input.start, s.duration);
    const dow = parseISO(input.date).getDay();
    const win = availWindow(s.providerId, dow);
    if (!win) return { err: 'That day is closed. Please pick another date.' };

    // Re-derive the slot list at write time: this is what makes double booking
    // impossible even if two customers were looking at the same slot.
    const offered = slotsForDate(win, breaksOf(s.providerId, dow), blockedOn(s.providerId, input.date), busyOn(s.providerId, input.date), s.duration, input.date);
    if (!offered.includes(input.start)) {
      return { err: conflictsWith(heldRanges(s.providerId, input.date), input.start, end)
        ? 'This slot was just taken. Please pick another time.'
        : 'That time is no longer available. Please pick another slot.' };
    }

    const booking: Booking = {
      id: uid('bkg'),
      ref: newRef(),
      customerId: input.customerId,
      providerId: s.providerId,
      serviceId: input.serviceId,
      date: input.date,
      start: input.start,
      end,
      price: s.price,
      location: input.location,
      locType: s.locationType,
      notes: input.notes,
      status: 'pending',
      payment: 'Pay after service',
      paymentStatus: 'unpaid',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.bookings.push(booking);

    const customer = db.users.find((u) => u.id === input.customerId);
    const who = customer ? customer.name : 'A customer';
    notify(provider.userId, 'booking_new', 'New booking request', `${who} requested ${s.name} on ${input.date} at ${input.start}.`);
    record('booking_created', input.customerId, { providerId: s.providerId, bookingId: booking.id, meta: { price: s.price } });
    record('booking_received', provider.userId, { providerId: s.providerId, bookingId: booking.id });
    persist();
    return { value: booking };
  },

  setBookingStatus(bookingId, byCustomer, action) {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b) return false;
    const [from, to] = TRANSITIONS[action];
    if (b.status !== from) return false;

    // Ownership guard (PRD §14): customers may only cancel their own booking.
    if (byCustomer) {
      if (b.customerId !== db.session) return false;
      if (action !== 'cancel') return false;
    } else if (b.providerId !== db.profiles.find((p) => p.userId === db.session)?.id) {
      // Providers act on their own bookings only. `db.session` is null in seed
      // flows, so fall back to allowing the explicit provider-side call.
      const ownsIt = db.profiles.some((p) => p.id === b.providerId && p.userId === db.session);
      if (db.session && !ownsIt) return false;
    }

    b.status = to;
    b.updatedAt = Date.now();

    const p = db.profiles.find((x) => x.id === b.providerId);
    const cu = db.users.find((x) => x.id === b.customerId);
    const svc = db.services.find((x) => x.id === b.serviceId);
    const what = svc ? svc.name : 'your appointment';
    const studio = p?.displayName || 'Your professional';

    if (action === 'accept') {
      notify(b.customerId, 'booking_confirmed', 'Booking confirmed', `${studio} confirmed your ${what} on ${b.date} at ${b.start}.`);
      record('booking_accepted', p?.userId || 'system', { providerId: b.providerId, bookingId: b.id });
    }
    if (action === 'reject') {
      notify(b.customerId, 'booking_rejected', 'Booking declined', `${studio} is unable to take your ${what} on ${b.date}.`);
      record('booking_rejected', p?.userId || 'system', { providerId: b.providerId, bookingId: b.id });
    }
    if (action === 'cancel') {
      notify(b.customerId, 'booking_cancelled', 'Booking cancelled', `Your ${what} on ${b.date} was cancelled.`);
      if (!byCustomer && p) notify(p.userId, 'booking_cancelled', 'Booking cancelled', `${cu ? cu.name : 'A customer'} cancelled the ${what} on ${b.date}.`);
      record('booking_cancelled', byCustomer ? b.customerId : p?.userId || 'system', { providerId: b.providerId, bookingId: b.id });
    }
    if (action === 'complete') {
      notify(b.customerId, 'booking_completed', 'Booking completed', `${what} with ${studio} is complete. We would love your review!`);
      notify(b.customerId, 'review_reminder', 'Share your experience', `Enjoyed your ${what}? A quick review helps ${studio}.`);
      record('booking_completed', p?.userId || 'system', { providerId: b.providerId, bookingId: b.id, meta: { price: b.price } });
    }
    if (action === 'noshow') {
      notify(b.customerId, 'booking_cancelled', 'Appointment missed', `${what} on ${b.date} was marked as no-show.`);
    }
    persist();
    return true;
  },

  setBookingStatusAdmin(bookingId, status) {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b) return false;
    if (!ADMIN_TRANSITIONS[b.status]?.includes(status)) return false;
    b.status = status;
    b.updatedAt = Date.now();
    persist();
    return true;
  },

  setPaymentStatus(bookingId, status) {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b) return false;
    if (!PAYMENT_TRANSITIONS[b.paymentStatus]?.includes(status)) return false;
    b.paymentStatus = status;
    b.payment = status === 'mock_paid' ? 'Paid (mock)' : status === 'refunded' ? 'Refunded (mock)' : 'Pay after service';
    b.updatedAt = Date.now();
    persist();
    return true;
  },

  /* ---------------- reviews ---------------- */
  addReview(bookingId, rating, comment): Ok<Review> {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b) return { err: 'Booking not found' };
    if (b.customerId !== db.session) return { err: 'You can only review your own completed booking.' };
    if (b.status !== 'completed') return { err: 'Only completed bookings can be reviewed' };
    if (db.reviews.some((r) => r.bookingId === bookingId)) return { err: 'You already reviewed this booking' };
    if (!(rating >= 1 && rating <= 5)) return { err: 'Pick a rating from 1 to 5 stars.' };

    const review: Review = {
      id: uid('r'),
      bookingId,
      customerId: b.customerId,
      providerId: b.providerId,
      rating,
      comment: comment.trim().slice(0, 600),
      createdAt: Date.now(),
    };
    db.reviews.push(review);

    // Recompute the average from the full review set so it can never drift.
    const all = db.reviews.filter((r) => r.providerId === b.providerId);
    const p = db.profiles.find((x) => x.id === b.providerId);
    if (p) {
      p.avg = Math.round((all.reduce((sum, r) => sum + r.rating, 0) / all.length) * 10) / 10;
      p.reviewCount = all.length;
    }

    const firstName = db.users.find((u) => u.id === b.customerId)?.name.split(' ')[0] || 'A customer';
    if (p) notify(p.userId, 'review', `New review ★ ${rating}`, `${firstName} left you a ${rating}-star review.`);
    record('review_submitted', b.customerId, { providerId: b.providerId, bookingId, meta: { rating } });
    persist();
    return { value: review };
  },

  /* ---------------- favourites ---------------- */
  toggleFavourite(customerId, providerId) {
    const i = db.favourites.findIndex((f) => f.customerId === customerId && f.providerId === providerId);
    if (i >= 0) {
      db.favourites.splice(i, 1);
      persist();
      return false;
    }
    db.favourites.push({ customerId, providerId, createdAt: Date.now() });
    record('favourite_added', customerId, { providerId });
    persist();
    return true;
  },

  /* ---------------- provider catalogue ---------------- */
  upsertService(svc) {
    if (svc.id) {
      const s = db.services.find((x) => x.id === svc.id);
      if (s) Object.assign(s, svc);
      persist();
      return;
    }
    const created: Service = {
      id: uid('s'),
      providerId: svc.providerId,
      categoryId: svc.categoryId || 'c1',
      name: svc.name || 'New service',
      desc: svc.desc || '',
      price: svc.price || 0,
      duration: svc.duration || 60,
      locationType: svc.locationType || 'provider',
      active: svc.active ?? true,
    };
    db.services.push(created);
    record('service_created', db.profiles.find((p) => p.id === created.providerId)?.userId || 'system', {
      providerId: created.providerId,
      meta: { price: created.price, duration: created.duration },
    });
    persist();
  },
  deleteService(id) {
    const i = db.services.findIndex((s) => s.id === id);
    if (i >= 0) db.services.splice(i, 1);
    db.portfolio.forEach((pf) => {
      if (pf.serviceId === id) pf.serviceId = null;
    });
    persist();
  },
  setServiceActive(id, active) {
    const s = db.services.find((x) => x.id === id);
    if (s) s.active = active;
    persist();
  },
  addPortfolioItem(providerId, serviceId, art, caption): PortfolioItem {
    const item: PortfolioItem = {
      id: uid('pf'),
      providerId,
      serviceId,
      art,
      grad: 'g' + (Math.floor(Math.random() * 6) + 1),
      caption,
    };
    db.portfolio.push(item);
    record('portfolio_uploaded', db.profiles.find((p) => p.id === providerId)?.userId || 'system', { providerId });
    persist();
    return item;
  },
  removePortfolioItem(id) {
    const i = db.portfolio.findIndex((x) => x.id === id);
    if (i >= 0) db.portfolio.splice(i, 1);
    persist();
  },

  /* ---------------- availability management ---------------- */
  setAvailability(providerId, day, on, start, end) {
    const ex = db.availability.find((a) => a.providerId === providerId && a.day === day);
    if (on && !ex) {
      db.availability.push({ id: uid('a'), providerId, day, start: start || '10:00', end: end || '18:00', active: true });
      record('availability_created', db.profiles.find((p) => p.id === providerId)?.userId || 'system', { providerId, meta: { day } });
    }
    if (ex) {
      const wasOff = !ex.active;
      ex.active = on;
      if (start) ex.start = start;
      if (end) ex.end = end;
      if (on && wasOff) record('availability_created', db.profiles.find((p) => p.id === providerId)?.userId || 'system', { providerId, meta: { day } });
    }
    persist();
  },
  addBreak(providerId, day, start, end) {
    db.breaks.push({ id: uid('b'), providerId, day, start, end });
    persist();
  },
  removeBreak(id) {
    const i = db.breaks.findIndex((b) => b.id === id);
    if (i >= 0) db.breaks.splice(i, 1);
    persist();
  },
  addBlocked(providerId, date, start, end, reason): Ok<never> {
    if (timeToMin(end) <= timeToMin(start)) return { err: 'End time must be after the start time.' };
    if (conflictsWith(heldRanges(providerId, date), start, end)) {
      return { err: 'That time overlaps an existing booking — it stays reserved.' };
    }
    db.blocked.push({ id: uid('k'), providerId, start: `${date} ${start}`, end: `${date} ${end}`, reason: reason.trim() || 'Blocked' });
    persist();
    return {};
  },
  removeBlocked(id) {
    const i = db.blocked.findIndex((k) => k.id === id);
    if (i >= 0) db.blocked.splice(i, 1);
    persist();
  },

  /* ---------------- trust & verification ---------------- */
  setVerification(providerId, v: Verification) {
    const p = db.profiles.find((x) => x.id === providerId);
    if (!p) return;
    p.verification = v;
    notify(p.userId, 'verification', v === 'verified' ? 'You are verified ✓' : v === 'suspended' ? 'Account suspended' : 'Verification update', v === 'verified'
      ? 'Glamoora reviewed your studio — the verified badge is now live on your profile.'
      : v === 'suspended'
      ? 'Your studio was suspended by the Glamoora team. Contact support to appeal.'
      : 'Your verification status was updated.');
    persist();
  },
  requestVerification(providerId): Ok<never> {
    const p = db.profiles.find((x) => x.id === providerId);
    if (!p) return { err: 'Profile not found' };
    if (p.verification === 'verified') return { err: 'You are already verified.' };
    if (p.verification === 'suspended') return { err: 'Suspended studios cannot request verification. Contact support.' };
    if (p.verification === 'pending') return { err: 'Your request is already with the Glamoora team.' };

    // Only a studio that actually looks complete can ask to be reviewed.
    const missing: string[] = [];
    if (!p.displayName.trim()) missing.push('a display name');
    if (p.bio.trim().length < 20) missing.push('a bio (at least 20 characters)');
    if (!p.categoryIds.length) missing.push('at least one category');
    if (!db.services.some((s) => s.providerId === providerId && s.active)) missing.push('at least one active service');
    if (db.availability.filter((a) => a.providerId === providerId && a.active).length < 1) missing.push('your weekly hours');
    if (missing.length) return { err: `Add ${missing.join(', ')} first.` };

    p.verification = 'pending';
    db.users
      .filter((u) => u.role === 'admin')
      .forEach((a) => notify(a.id, 'verification_request', 'Verification requested', `${p.displayName} asked to be verified.`));
    notify(p.userId, 'verification', 'Request sent', 'The Glamoora team will review your studio shortly.');
    persist();
    return {};
  },

  /* ---------------- admin ---------------- */
  setCategoryActive(id, active) {
    const c: Category | undefined = db.categories.find((x) => x.id === id);
    if (c) c.active = active;
    persist();
  },

  /* ---------------- analytics ---------------- */
  track(input: TrackInput): AnalyticsEvent {
    const actorId = input.actorId || db.session || 'system';
    const actor = db.users.find((u) => u.id === actorId);
    const ev: AnalyticsEvent = {
      id: uid('ev'),
      name: input.name,
      actorId,
      role: actor ? actor.role : 'system',
      providerId: input.providerId,
      bookingId: input.bookingId,
      meta: input.meta,
      createdAt: Date.now(),
    };
    db.events.unshift(ev);
    if (db.events.length > 2000) db.events.length = 2000;
    persist();
    return ev;
  },
  events() {
    return db.events;
  },

  /* ---------------- moderation ---------------- */
  fileReport(input: NewReportInput): Ok<Report> {
    const reason = input.reason.trim();
    if (!reason) return { err: 'Choose a reason for the report.' };
    const providerId = resolveProviderId(input.targetType, input.targetId);
    if (!providerId) return { err: 'That content no longer exists.' };
    const dup = db.reports.find(
      (r) => r.reporterId === input.reporterId && r.targetType === input.targetType && r.targetId === input.targetId && r.status === 'open'
    );
    if (dup) return { err: 'You already reported this — our team is on it.' };

    const report: Report = {
      id: uid('rep'),
      reporterId: input.reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      providerId,
      reason,
      detail: (input.detail || '').trim().slice(0, 500),
      status: 'open',
      resolution: '',
      createdAt: Date.now(),
      resolvedAt: null,
    };
    db.reports.unshift(report);
    db.users
      .filter((u) => u.role === 'admin')
      .forEach((a) => notify(a.id, 'report', 'New report', `${reason} — ${db.profiles.find((p) => p.id === providerId)?.displayName || 'a studio'}`));
    record('report_filed', input.reporterId, { providerId });
    persist();
    return { value: report };
  },

  resolveReport(reportId, resolution, action: ReportAction, status: ReportStatus = 'resolved'): Ok<never> {
    const r = db.reports.find((x) => x.id === reportId);
    if (!r) return { err: 'Report not found' };
    if (r.status !== 'open') return { err: 'That report is already closed.' };

    if (action === 'remove_content') {
      if (r.targetType === 'portfolio') {
        const i = db.portfolio.findIndex((x) => x.id === r.targetId);
        if (i >= 0) db.portfolio.splice(i, 1);
      } else if (r.targetType === 'review') {
        const i = db.reviews.findIndex((x) => x.id === r.targetId);
        if (i >= 0) {
          const removed = db.reviews[i];
          db.reviews.splice(i, 1);
          const all = db.reviews.filter((x) => x.providerId === removed.providerId);
          const p = db.profiles.find((x) => x.id === removed.providerId);
          if (p) {
            p.avg = all.length ? Math.round((all.reduce((s, x) => s + x.rating, 0) / all.length) * 10) / 10 : 0;
            p.reviewCount = all.length;
          }
        }
      }
    }
    if (action === 'suspend_provider' || action === 'reinstate_provider') {
      const p = db.profiles.find((x) => x.id === r.providerId);
      if (p) {
        p.verification = action === 'suspend_provider' ? 'suspended' : 'unverified';
        notify(p.userId, action === 'suspend_provider' ? 'suspended' : 'verification', action === 'suspend_provider' ? 'Studio suspended' : 'Studio reinstated', action === 'suspend_provider'
          ? 'Your studio was suspended following a moderation review.'
          : 'Your studio is live on Glamoora again.');
      }
    }

    r.status = status;
    r.resolution = resolution.trim() || (action === 'none' ? 'No action needed' : 'Action taken');
    r.resolvedAt = Date.now();
    const provider = db.profiles.find((x) => x.id === r.providerId);
    if (provider) notify(provider.userId, 'report', 'A report about your studio was closed', r.resolution);
    record('report_resolved', db.session || 'system', { providerId: r.providerId });
    persist();
    return {};
  },
  reports() {
    return db.reports;
  },

  /* ---------------- messaging ---------------- */
  conversationsFor(userId) {
    const profile = db.profiles.find((p) => p.userId === userId);
    return db.conversations
      .filter((c) => c.customerId === userId || (profile && c.providerId === profile.id))
      .sort((a, b) => b.lastAt - a.lastAt);
  },
  openConversation(customerId, providerId, bookingId = null): Conversation {
    const ex = db.conversations.find((c) => c.customerId === customerId && c.providerId === providerId);
    if (ex) {
      if (bookingId && !ex.bookingId) ex.bookingId = bookingId;
      return ex;
    }
    const c: Conversation = { id: uid('c'), customerId, providerId, bookingId, createdAt: Date.now(), lastAt: Date.now() };
    db.conversations.push(c);
    persist();
    return c;
  },
  conversationById: (id) => db.conversations.find((c) => c.id === id),
  messagesOf: (conversationId) =>
    db.messages.filter((m) => m.conversationId === conversationId).sort((a, b) => a.createdAt - b.createdAt),

  sendMessage(conversationId, senderId, body): Ok<Message> {
    const c = db.conversations.find((x) => x.id === conversationId);
    if (!c) return { err: 'Conversation not found' };
    const text = body.trim();
    if (!text) return { err: 'Write a message first.' };
    if (text.length > 1000) return { err: 'Messages are limited to 1000 characters.' };

    const provider = db.profiles.find((p) => p.id === c.providerId);
    const isProviderSender = !!provider && provider.userId === senderId;
    if (senderId !== c.customerId && !isProviderSender) return { err: 'You are not part of this conversation.' };
    if (provider?.verification === 'suspended') return { err: 'This studio is suspended and cannot receive messages.' };

    const msg: Message = { id: uid('m'), conversationId, senderId, body: text, readBy: [senderId], createdAt: Date.now() };
    db.messages.push(msg);
    c.lastAt = msg.createdAt;

    const from = db.users.find((u) => u.id === senderId);
    const recipientId = isProviderSender ? c.customerId : provider?.userId;
    if (recipientId) {
      notify(recipientId, 'message', `New message from ${from?.name.split(' ')[0] || 'Glamoora'}`, text.slice(0, 90));
    }
    persist();
    return { value: msg };
  },

  markThreadRead(conversationId, userId) {
    let touched = false;
    db.messages.forEach((m: Message) => {
      if (m.conversationId === conversationId && m.senderId !== userId && !m.readBy.includes(userId)) {
        m.readBy.push(userId);
        touched = true;
      }
    });
    if (touched) persist();
  },

  unreadMessages(userId) {
    const profile = db.profiles.find((p) => p.userId === userId);
    const mine = db.conversations.filter((c) => c.customerId === userId || (profile && c.providerId === profile.id));
    const ids = new Set(mine.map((c) => c.id));
    return db.messages.filter((m) => ids.has(m.conversationId) && m.senderId !== userId && !m.readBy.includes(userId)).length;
  },
};

/* Re-exported for the rare caller that needs the raw row types. */
export type { DB, User, ProviderProfile, Service, Booking, Review, Conversation, Report };
