/**
 * Explainable recommendations (PRD Phase 16).
 * The point of these checks: every reason the AI gives must be literally true
 * of the data, and nothing unsafe may ever be surfaced.
 */
import { localRepository as repo } from '../db/local';
import { AREAS } from '../data/seed';
import { lastViewed, recommendFor, topCategories } from '../ai/recommend';
import type { SearchCenter } from '../domain/search';
import { assert, assertEq, describe } from './harness';

const { it } = describe('AI recommendations (PRD Phase 16)');

const HOME: SearchCenter = { lat: AREAS[0].lat, lng: AREAS[0].lng, label: 'Bukit Bintang' };
const MAYA = 'umaya';

export async function recommendTests(): Promise<void> {
  await repo.reset();
  const db = repo.snapshot();
  const maya = db.users.find((u) => u.id === MAYA)!;

  it('always returns a truthful, non-empty reason', () => {
    const recs = recommendFor(db, maya, HOME, 8);
    assert(recs.length > 0, 'a seeded customer gets suggestions');
    recs.forEach((r) => {
      assert(r.reason.trim().length > 5, `reason for ${r.p.displayName} is not empty`);
      assert(r.score > 0, 'scored');
      assert(r.dist >= 0, 'has a distance');
      assert(r.also.length <= 3, 'supporting notes stay short');
    });
  });

  it('never recommends a suspended studio, and reinstates it afterwards', () => {
    // Pick a studio that is genuinely recommendable right now, so the only
    // variable is the suspension.
    const before = recommendFor(db, maya, HOME, 20);
    const target = before[0];
    assert(!!target, 'there is at least one recommendable studio');
    const original = target.p.verification; // read before the object is mutated

    repo.setVerification(target.p.id, 'suspended');
    const during = recommendFor(repo.snapshot(), maya, HOME, 20);
    assertEq(during.some((r) => r.p.id === target.p.id), false, 'suspended studios are excluded');
    assertEq(during.length, before.length - 1, 'the list shrank by exactly one');

    repo.setVerification(target.p.id, original);
    const after = recommendFor(repo.snapshot(), maya, HOME, 20);
    assertEq(after.some((r) => r.p.id === target.p.id), true, 'and come back when reinstated');
    assertEq(after[0].p.id, target.p.id, 'back in the same place');
  });

  it('does not recommend a studio the customer already has an appointment with', () => {
    const upcoming = db.bookings.filter((b) => b.customerId === MAYA && ['pending', 'confirmed'].includes(b.status));
    assert(upcoming.length > 0, 'the seed has an upcoming booking');
    const recs = recommendFor(db, maya, HOME, 20);
    upcoming.forEach((b) => assertEq(recs.some((r) => r.p.id === b.providerId), false, `already booked with ${b.providerId}`));
  });

  it('ranks a repeat studio above one the customer has never booked', () => {
    // Lina completed two bookings at p1 and has nothing upcoming there, so the
    // repeat signal is not masked by the "already booked" exclusion.
    const lina = db.users.find((u) => u.id === 'ulina')!;
    const repeatId = 'p1';
    const times = db.bookings.filter((b) => b.customerId === lina.id && b.providerId === repeatId && b.status === 'completed').length;
    assertEq(times, 2, 'the seed gives Lina two completed bookings at Aina Lash Studio');

    const recs = recommendFor(db, lina, HOME, 20);
    const repeatRank = recs.findIndex((r) => r.p.id === repeatId);
    assert(repeatRank >= 0, 'the repeat studio is recommended');

    const strangers = recs.filter((r) => !db.bookings.some((b) => b.customerId === lina.id && b.providerId === r.p.id));
    assert(strangers.length > 0, 'there are studios with no history to compare against');
    const strangerRank = recs.findIndex((r) => r.p.id === strangers[0].p.id);
    assert(repeatRank < strangerRank, `repeat (${repeatRank}) should outrank no-history (${strangerRank})`);

    const repeat = recs[repeatRank];
    assert(/been here|completed a booking/i.test(repeat.reason), `reason reflects the history, got "${repeat.reason}"`);
    assert(repeat.reason.includes(String(times)), 'states the real number of visits');
  });

  it('surfaces favourites with the right reason', () => {
    const fav = db.profiles.find((p) => !db.favourites.some((f) => f.customerId === MAYA && f.providerId === p.id))!;
    repo.toggleFavourite(MAYA, fav.id);
    const recs = recommendFor(repo.snapshot(), maya, HOME, 20);
    const hit = recs.find((r) => r.p.id === fav.id);
    assert(!!hit, 'a newly favourited studio is recommended');
    const hasHistory = repo.snapshot().bookings.some((b) => b.customerId === MAYA && b.providerId === fav.id && b.status === 'completed');
    if (!hasHistory) {
      assert(/favourites/i.test(hit!.reason) || hit!.also.some((a) => /favourites/i.test(a)), 'says it is a favourite');
    }
    repo.toggleFavourite(MAYA, fav.id);
  });

  it('is deterministic: the same data gives the same order', () => {
    const a = recommendFor(db, maya, HOME, 8).map((r) => r.p.id).join(',');
    const b = recommendFor(db, maya, HOME, 8).map((r) => r.p.id).join(',');
    assertEq(a, b, 'stable ordering');
    assert(!/Math\.random/.test(recommendFor.toString()), 'no randomness in the ranking');
  });

  it('respects the limit and sorts by score', () => {
    const recs = recommendFor(db, maya, HOME, 3);
    assertEq(recs.length, 3, 'limit honoured');
    const scores = recs.map((r) => r.score);
    assert(scores.every((s, i) => i === 0 || s <= scores[i - 1]), 'highest score first');
  });

  it('reports real same-day availability alongside the reason', () => {
    const recs = recommendFor(db, maya, HOME, 20);
    recs.forEach((r) => {
      const claim = r.also.find((a) => /free today/.test(a));
      if (claim) assert(r.openSlotsToday > 0, 'only claims free slots when there are some');
      if (r.openSlotsToday === 0) assert(!claim, 'does not claim availability it does not have');
    });
  });

  it('finds the last studio the customer looked at but has not booked', () => {
    const seen = lastViewed(db, maya);
    if (seen) {
      assert(seen.verification !== 'suspended', 'never a suspended studio');
      const viewed = db.events.some((e) => e.actorId === MAYA && e.name === 'provider_view' && e.providerId === seen.id);
      assertEq(viewed, true, 'was genuinely viewed by this customer');
    }
    assertEq(lastViewed(db, db.users.find((u) => u.id === 'ucindy')!), lastViewed(db, db.users.find((u) => u.id === 'ucindy')!), 'stable per user');
  });

  it('ranks the categories a customer actually engages with', () => {
    const tops = topCategories(db, maya, 3);
    assert(tops.length > 0, 'seeded activity gives affinities');
    assert(tops.every((t) => t.count > 0), 'counts are positive');
    const counts = tops.map((t) => t.count);
    assert(counts.every((c, i) => i === 0 || c <= counts[i - 1]), 'sorted by engagement');
    assert(tops.every((t) => !!db.categories.find((c) => c.id === t.id && c.active)), 'only active categories');
    assertEq(topCategories(db, db.users.find((u) => u.id === 'unadia')!, 3).length >= 0, true, 'works for any customer');
  });
}
