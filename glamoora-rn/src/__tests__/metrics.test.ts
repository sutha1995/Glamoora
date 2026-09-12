/**
 * Marketplace analytics (PRD §16): funnel, conversion and headline rates.
 */
import { localRepository as repo } from '../db/local';
import {
  CUSTOMER_FUNNEL,
  conversion,
  funnel,
  marketplaceMetrics,
  metricsInputFromDb,
  providerEvents,
  providerReach,
} from '../domain/metrics';
import type { AnalyticsEvent, AnalyticsEventName } from '../types';
import { assert, assertEq, assertInRange, describe } from './harness';

const { it } = describe('Analytics & metrics (PRD §16)');

let stamp = 1_700_000_000_000;
function ev(name: AnalyticsEventName, actorId: string, extra: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  stamp += 60_000;
  return { id: `e${stamp}`, name, actorId, role: 'customer', createdAt: stamp, ...extra };
}

export async function metricsTests(): Promise<void> {
  await repo.reset();
  const db = repo.snapshot();

  it('derives the metrics input straight from the database', () => {
    const input = metricsInputFromDb(db);
    assertEq(input.bookings.length, db.bookings.length, 'bookings');
    assertEq(input.providers, db.profiles.length, 'providers');
    assertEq(input.customers, db.users.filter((u) => u.role === 'customer').length, 'customers');
    assertEq(input.verifiedProviders, db.profiles.filter((p) => p.verification === 'verified').length, 'verified');
    assertEq(input.reviews, db.reviews.length, 'reviews');
    assertEq(input.openReports, db.reports.filter((r) => r.status === 'open').length, 'open reports');
    assert(input.avgRating >= 1 && input.avgRating <= 5, 'average rating is a real rating');
  });

  it('computes headline rates that match the bookings by hand', () => {
    const m = marketplaceMetrics(metricsInputFromDb(db));
    const b = db.bookings;
    const decided = b.filter((x) => x.status !== 'pending');
    const completed = b.filter((x) => x.status === 'completed');

    assertEq(m.bookings, b.length, 'total bookings');
    assertEq(m.pending, b.filter((x) => x.status === 'pending').length, 'pending');
    assertEq(m.completed, completed.length, 'completed');
    assertEq(m.completionRate, Math.round((completed.length / decided.length) * 100), 'completion rate');
    assertEq(m.cancellationRate, Math.round((b.filter((x) => x.status === 'cancelled').length / b.length) * 100), 'cancellation rate');
    assertEq(m.gmv, completed.reduce((a, x) => a + x.price, 0), 'GMV is the value of completed work');
    assertEq(m.avgBookingValue, Math.round(completed.reduce((a, x) => a + x.price, 0) / completed.length), 'average booking value');
    assertInRange(m.acceptanceRate, 0, 100, 'acceptance rate');
    assertInRange(m.repeatBookingRate, 0, 100, 'repeat booking rate');
  });

  it('counts repeat customers only from completed bookings', () => {
    const m = marketplaceMetrics(metricsInputFromDb(db));
    const byCustomer = new Map<string, number>();
    db.bookings.filter((b) => b.status === 'completed').forEach((b) => byCustomer.set(b.customerId, (byCustomer.get(b.customerId) || 0) + 1));
    const repeaters = [...byCustomer.values()].filter((n) => n > 1).length;
    assertEq(m.repeatBookingRate, Math.round((repeaters / byCustomer.size) * 100), 'repeat rate');
  });

  it('measures conversion as actors who did the next step, not raw event counts', () => {
    const events: AnalyticsEvent[] = [
      ev('search', 'a'), ev('search', 'a'), ev('search', 'b'), ev('search', 'c'), ev('search', 'd'),
      ev('provider_view', 'a'), ev('provider_view', 'b'),
      ev('booking_created', 'a'),
    ];
    const c = conversion(events, 'search', 'provider_view');
    assertEq(c.from, 4, 'four unique searchers');
    assertEq(c.to, 2, 'two of them viewed a provider');
    assertEq(c.rate, 50, '50% conversion');

    const deep = conversion(events, 'search', 'booking_created');
    assertEq(deep.to, 1, 'one searcher booked');
    assertEq(deep.rate, 25, '25% conversion');
  });

  it('never divides by zero', () => {
    const c = conversion([], 'search', 'provider_view');
    assertEq(c.from, 0, 'no actors');
    assertEq(c.rate, 0, 'rate is 0, not NaN');
    assertEq(Number.isNaN(c.rate), false, 'not NaN');
  });

  it('ignores a conversion that happened before the first touch', () => {
    const events: AnalyticsEvent[] = [
      { id: 'x1', name: 'booking_created', actorId: 'a', role: 'customer', createdAt: 1000 },
      { id: 'x2', name: 'search', actorId: 'a', role: 'customer', createdAt: 2000 },
    ];
    assertEq(conversion(events, 'search', 'booking_created').to, 0, 'the booking predates the search');
  });

  it('renders the full customer funnel from PRD §16', () => {
    const steps = funnel(db.events);
    assertEq(steps.length, CUSTOMER_FUNNEL.length, 'one row per funnel step');
    assertEq(steps.map((s) => s.label).join('>'), 'Search>Category view>Provider view>Service view>Booking started>Booking created>Booking completed>Review submitted', 'the PRD funnel order');
    assertEq(steps[0].rateFromPrev, 100, 'the entry step is 100% of itself');
    steps.forEach((s) => {
      assertInRange(s.rateFromPrev, 0, 999, 'rate from previous step is a percentage');
      assertInRange(s.rateFromTop, 0, 999, 'rate from top is a percentage');
      assert(s.actors >= 0, 'actor counts are non-negative');
    });
  });

  it('measures how far a single studio was seen', () => {
    const events: AnalyticsEvent[] = [
      ev('provider_view', 'a', { providerId: 'p1' }),
      ev('provider_view', 'a', { providerId: 'p1' }),
      ev('provider_view', 'b', { providerId: 'p1' }),
      ev('provider_view', 'c', { providerId: 'p2' }),
    ];
    const reach = providerReach(events, 'p1');
    assertEq(reach.views, 3, 'three profile views');
    assertEq(reach.uniqueViewers, 2, 'two distinct people');
    assertEq(providerEvents(events, 'p1').length, 3, 'events filtered to one studio');
    assertEq(providerReach(events, 'p-none').views, 0, 'unknown studio has no reach');
  });

  it('records events through the repository with the right actor and role', () => {
    repo.setSession('umaya');
    const e1 = repo.track({ name: 'search', meta: { q: 'lash' } });
    assertEq(e1.actorId, 'umaya', 'actor is the signed-in user');
    assertEq(e1.role, 'customer', 'role is resolved from the account');

    repo.setSession('uaina');
    const e2 = repo.track({ name: 'booking_received', providerId: 'p1' });
    assertEq(e2.role, 'provider', 'provider role');
    assertEq(e2.providerId, 'p1', 'provider id stored');

    repo.setSession(null);
    const e3 = repo.track({ name: 'ai_search' });
    assertEq(e3.actorId, 'system', 'anonymous events are attributed to the system');

    assert(repo.events().some((e) => e.id === e1.id), 'event persisted in the log');
    assertEq(repo.events()[0].id, e3.id, 'newest first');
  });

  it('keeps the analytics log ordered and timestamped', () => {
    const events = repo.events();
    assert(events.every((e) => typeof e.createdAt === 'number' && e.createdAt > 0), 'every event has a timestamp');
    const stamps = events.map((e) => e.createdAt);
    assert(stamps.every((s, i) => i === 0 || s <= stamps[i - 1]), 'log is newest first');
  });

  it('tracks AI usage separately so the demo can show it working', () => {
    repo.setSession('umaya');
    repo.track({ name: 'ai_search', meta: { q: 'nail under RM100', matches: 3 } });
    repo.track({ name: 'ai_assistant', meta: { intent: 'compare' } });
    const names = repo.events().map((e) => e.name);
    assert(names.includes('ai_search'), 'ai_search recorded');
    assert(names.includes('ai_assistant'), 'ai_assistant recorded');
    repo.setSession(null);
  });
}
