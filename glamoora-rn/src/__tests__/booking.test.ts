/**
 * Booking, review and payment rules (PRD Phases 7, 9, 10, 14 and §14 security).
 */
import { localRepository as repo } from '../db/local';
import { addDays, dISO, minToTime, timeToMin } from '../utils';
import type { Booking } from '../types';
import { assert, assertEq, describe } from './harness';

const { it } = describe('Booking lifecycle (PRD Phase 7)');

const CUSTOMER = 'umaya'; // Maya Wong
const OTHER_CUSTOMER = 'ulina'; // Lina Ahmad
const STRANGER = 'ucindy'; // Cindy Teo
const STUDIO = 'p1'; // Aina Lash Studio — verified, works Mon–Sat 10:00–19:00
const OWNER = 'uaina';

/** Each reservation uses a different day so tests never collide with each other. */
let dayCursor = 1;

function serviceOf(providerId = STUDIO) {
  const s = repo.activeServicesOf(providerId)[0];
  if (!s) throw new Error(`no active service for ${providerId}`);
  return s;
}

function freeDay(providerId: string, serviceId: string): { date: string; start: string } {
  for (let i = 0; i < 60; i++) {
    const date = dISO(addDays(new Date(), dayCursor + i));
    const slots = repo.providerSlots(providerId, serviceId, date);
    if (slots.length) return { date, start: slots[0] };
  }
  throw new Error('no free day in the next 60 days');
}

function reserve(
  customerId = CUSTOMER,
  providerId = STUDIO,
  serviceId = serviceOf(providerId).id,
  at?: { date: string; start: string }
): { b: Booking; date: string; start: string } {
  const slot = at || freeDay(providerId, serviceId);
  const res = repo.createBooking({
    customerId,
    serviceId,
    date: slot.date,
    start: slot.start,
    location: 'Provider studio',
    notes: 'automated check',
  });
  assert(!res.err, `booking should succeed: ${res.err}`);
  dayCursor += 1;
  return { b: res.value!, date: slot.date, start: slot.start };
}

function closedDate(providerId: string): string {
  const am = repo.availMap(providerId);
  for (let i = 1; i < 40; i++) {
    const d = addDays(new Date(), i);
    if (!am[d.getDay()]) return dISO(d);
  }
  throw new Error('studio never closes');
}

export async function bookingTests(): Promise<void> {
  await repo.init();
  const svc = serviceOf();

  it('creates a pending booking with the right end time, price and reference', () => {
    const { b, start } = reserve();
    assertEq(b.status, 'pending', 'starts pending');
    assertEq(b.paymentStatus, 'unpaid', 'starts unpaid');
    assert(b.ref.startsWith('GLM-'), 'reference format');
    assertEq(b.end, minToTime(timeToMin(start) + svc.duration), 'end = start + duration');
    assertEq(b.price, svc.price, 'price copied from the service');
    assertEq(b.serviceId, svc.id, 'service linked');
  });

  it('prevents a second booking of the same slot (no double booking)', () => {
    const { date, start } = reserve();
    const again = repo.createBooking({ customerId: OTHER_CUSTOMER, serviceId: svc.id, date, start, location: 'Provider studio', notes: '' });
    assert(!!again.err, 'the same slot must not be bookable twice');
    assert(/taken|available/i.test(again.err!), `explains why: ${again.err}`);
    assert(!repo.providerSlots(STUDIO, svc.id, date).includes(start), 'the slot disappears from the grid');
  });

  it('still allows a different slot on the same day', () => {
    const { date } = reserve();
    const slots = repo.providerSlots(STUDIO, svc.id, date);
    assert(slots.length > 0, 'other slots remain that day');
    const res = repo.createBooking({ customerId: OTHER_CUSTOMER, serviceId: svc.id, date, start: slots[0], location: 'Provider studio', notes: '' });
    assert(!res.err, `a different slot should work: ${res.err}`);
  });

  it('rejects a time the studio never offered', () => {
    const { date } = reserve();
    const res = repo.createBooking({ customerId: CUSTOMER, serviceId: svc.id, date, start: '03:00', location: 'Provider studio', notes: '' });
    assert(!!res.err, 'a 3am slot must be rejected');
  });

  it('rejects booking on a closed day', () => {
    const res = repo.createBooking({ customerId: CUSTOMER, serviceId: svc.id, date: closedDate(STUDIO), start: '11:00', location: 'Provider studio', notes: '' });
    assert(!!res.err, 'closed days must be rejected');
    assert(/closed/i.test(res.err!), 'says the day is closed');
  });

  it('rejects an inactive service', () => {
    repo.setServiceActive(svc.id, false);
    const { date, start } = freeDay(STUDIO, svc.id);
    const res = repo.createBooking({ customerId: CUSTOMER, serviceId: svc.id, date, start, location: 'Provider studio', notes: '' });
    assert(!!res.err, 'inactive services cannot be booked');
    repo.setServiceActive(svc.id, true);
  });

  it('rejects booking a suspended studio', () => {
    repo.setVerification(STUDIO, 'suspended');
    const { date, start } = freeDay(STUDIO, svc.id);
    const res = repo.createBooking({ customerId: CUSTOMER, serviceId: svc.id, date, start, location: 'Provider studio', notes: '' });
    assert(!!res.err, 'suspended studios must not be bookable');
    assert(/suspended/i.test(res.err!), 'explains the suspension');
    repo.setVerification(STUDIO, 'verified');
  });

  it('moves pending -> confirmed -> completed and refuses illegal jumps', () => {
    const { b } = reserve();
    repo.setSession(OWNER);
    assertEq(repo.setBookingStatus(b.id, false, 'complete'), false, 'cannot complete a pending booking');
    assertEq(repo.setBookingStatus(b.id, false, 'noshow'), false, 'cannot mark a pending booking as no-show');
    assertEq(repo.setBookingStatus(b.id, false, 'accept'), true, 'provider accepts');
    assertEq(repo.setBookingStatus(b.id, false, 'accept'), false, 'cannot accept twice');
    assertEq(repo.setBookingStatus(b.id, false, 'complete'), true, 'provider completes');
    assertEq(repo.snapshot().bookings.find((x) => x.id === b.id)!.status, 'completed', 'status persisted');
  });

  it('enforces ownership: customers cancel their own bookings only', () => {
    const { b } = reserve();
    repo.setSession(STRANGER);
    assertEq(repo.setBookingStatus(b.id, true, 'cancel'), false, 'another customer cannot cancel it');

    repo.setSession(CUSTOMER);
    assertEq(repo.setBookingStatus(b.id, true, 'accept'), false, 'customers may not accept');
    assertEq(repo.setBookingStatus(b.id, true, 'complete'), false, 'customers may not complete');
    assertEq(repo.setBookingStatus(b.id, true, 'cancel'), true, 'the owner can cancel');
  });

  it('enforces ownership: a different studio cannot touch this booking', () => {
    const { b } = reserve();
    repo.setSession('umelissa'); // owns p2, not p1
    assertEq(repo.setBookingStatus(b.id, false, 'accept'), false, 'another provider is refused');
    repo.setSession(OWNER);
    assertEq(repo.setBookingStatus(b.id, false, 'accept'), true, 'the real provider can accept');
  });

  it('releases the slot when a booking is cancelled', () => {
    const { b, date, start } = reserve();
    assert(!repo.providerSlots(STUDIO, svc.id, date).includes(start), 'booked slot is gone');
    repo.setSession(CUSTOMER);
    repo.setBookingStatus(b.id, true, 'cancel');
    assert(repo.providerSlots(STUDIO, svc.id, date).includes(start), 'cancelled slot comes back');
    const rebook = repo.createBooking({ customerId: OTHER_CUSTOMER, serviceId: svc.id, date, start, location: 'Provider studio', notes: '' });
    assert(!rebook.err, `someone else can now take it: ${rebook.err}`);
  });

  it('reviews need a completed booking, one per booking, by the right customer', () => {
    const { b } = reserve();
    repo.setSession(OWNER);
    repo.setBookingStatus(b.id, false, 'accept');

    repo.setSession(CUSTOMER);
    assert(!!repo.addReview(b.id, 5, 'too early').err, 'confirmed bookings cannot be reviewed yet');

    repo.setSession(OWNER);
    repo.setBookingStatus(b.id, false, 'complete');

    repo.setSession(STRANGER);
    assert(!!repo.addReview(b.id, 5, 'not mine').err, 'another customer cannot review it');

    repo.setSession(CUSTOMER);
    assert(!!repo.addReview(b.id, 9, 'out of range').err, 'rating must be 1-5');
    assert(!!repo.addReview(b.id, 0, 'out of range').err, 'rating must be 1-5');
    const first = repo.addReview(b.id, 5, 'Flawless set, arrived early, spotless hygiene.');
    assert(!first.err, `review should succeed: ${first.err}`);
    assert(!!repo.addReview(b.id, 4, 'again').err, 'only one review per booking');

    const mine = repo.reviewsOf(STUDIO);
    const p = repo.profileOf(STUDIO)!;
    assertEq(p.reviewCount, mine.length, 'review count matches the stored reviews');
    assertEq(p.avg, Math.round((mine.reduce((a, r) => a + r.rating, 0) / mine.length) * 10) / 10, 'average recomputed');
  });

  it('mock payments only move unpaid -> mock_paid -> refunded', () => {
    const { b } = reserve();
    assertEq(repo.setPaymentStatus(b.id, 'refunded'), false, 'cannot refund an unpaid booking');
    assertEq(repo.setPaymentStatus(b.id, 'mock_paid'), true, 'mark paid');
    assertEq(repo.snapshot().bookings.find((x) => x.id === b.id)!.payment, 'Paid (mock)', 'mock label, never a real charge');
    assertEq(repo.setPaymentStatus(b.id, 'mock_paid'), false, 'cannot pay twice');
    assertEq(repo.setPaymentStatus(b.id, 'refunded'), true, 'refund a paid booking');
    assertEq(repo.setPaymentStatus(b.id, 'unpaid'), false, 'refunds are final');
  });

  it('admin overrides respect the legal transition table', () => {
    const { b } = reserve();
    assertEq(repo.setBookingStatusAdmin(b.id, 'cancelled'), true, 'admin may cancel a pending booking');
    assertEq(repo.setBookingStatusAdmin(b.id, 'confirmed'), false, 'cancelled bookings cannot be revived');
    assertEq(repo.setBookingStatusAdmin(b.id, 'no_show' as never), false, 'cancelled -> no_show is illegal too');
    assertEq(repo.setBookingStatusAdmin('missing', 'cancelled'), false, 'unknown booking');
  });

  it('notifies the customer through the lifecycle', () => {
    const { b } = reserve();
    const count = () => repo.snapshot().notifs.filter((n) => n.userId === CUSTOMER).length;
    const before = count();
    repo.setSession(OWNER);
    repo.setBookingStatus(b.id, false, 'accept');
    assert(count() > before, 'confirmation notification created');
    const newest = repo.snapshot().notifs.find((n) => n.userId === CUSTOMER)!;
    assertEq(newest.type, 'booking_confirmed', 'notification type');
    assertEq(newest.read, false, 'starts unread');
    assertEq(repo.unreadCount(CUSTOMER) > 0, true, 'badge count reflects it');

    repo.setBookingStatus(b.id, false, 'complete');
    const types = repo.snapshot().notifs.filter((n) => n.userId === CUSTOMER).map((n) => n.type);
    assert(types.includes('booking_completed'), 'completion notification');
    assert(types.includes('review_reminder'), 'review prompt after completion');
  });

  it('tracks analytics events for the marketplace funnel', () => {
    const before = repo.events().length;
    const { b } = reserve();
    repo.setSession(OWNER);
    repo.setBookingStatus(b.id, false, 'accept');
    const names = repo.events().slice(0, repo.events().length - before).map((e) => e.name);
    assert(names.includes('booking_accepted'), 'acceptance recorded');
    assertEq(repo.events().length > before, true, 'event log grew');
  });

  repo.setSession(null);
}
