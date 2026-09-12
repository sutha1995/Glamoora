/**
 * Explainable recommendations (PRD Phase 16: "AI-powered recommendations").
 *
 * Deliberately transparent: every suggestion carries the real signal that
 * produced it ("you completed 2 bookings here", "in your favourites",
 * "you viewed Lash Extensions 4 times"). Nothing is a black box, nothing is
 * paid placement, and a suspended studio can never appear.
 *
 * Deterministic and on-device — the same data always gives the same order,
 * which makes it safe to demo and easy to test.
 */
import type { DB, ProviderProfile, User } from '../types';
import { categoriesOf, countOpenSlots, type SearchCenter } from '../domain/search';
import { haversine, todayISO } from '../utils';

export interface Recommendation {
  p: ProviderProfile;
  /** The strongest true reason, written for the customer. */
  reason: string;
  /** Secondary signals, for a "why?" line. */
  also: string[];
  score: number;
  dist: number;
  openSlotsToday: number;
}

interface Signal {
  repeat: number;
  favourite: boolean;
  affinity: number;
}

/** Category affinity from this customer's own activity, not from guesswork. */
function affinityFor(db: DB, user: User): { byCat: Map<string, number>; label: (id: string) => string } {
  const byCat = new Map<string, number>();
  const add = (id: string | undefined, n: number) => {
    if (!id) return;
    byCat.set(id, (byCat.get(id) || 0) + n);
  };

  db.events
    .filter((e) => e.actorId === user.id)
    .forEach((e) => {
      if (e.name === 'category_view') add(String(e.meta?.cat || '') || providerCatOf(db, e.providerId), 1);
      if (e.name === 'provider_view' || e.name === 'service_view') add(providerCatOf(db, e.providerId), 0.5);
      if (e.name === 'favourite_added') add(providerCatOf(db, e.providerId), 1.5);
      if (e.name === 'booking_created' || e.name === 'booking_completed') {
        const b = db.bookings.find((x) => x.id === e.bookingId);
        add(db.services.find((s) => s.id === b?.serviceId)?.categoryId, e.name === 'booking_completed' ? 3 : 2);
      }
    });

  db.favourites.filter((f) => f.customerId === user.id).forEach((f) => {
    const prof = db.profiles.find((p) => p.id === f.providerId);
    prof?.categoryIds.forEach((c) => add(c, 2));
  });

  return { byCat, label: (id: string) => db.categories.find((c) => c.id === id)?.name || '' };
}

function providerCatOf(db: DB, providerId?: string): string | undefined {
  if (!providerId) return undefined;
  return db.profiles.find((p) => p.id === providerId)?.categoryIds[0];
}

function signalsFor(db: DB, user: User, providerId: string, byCat: Map<string, number>): Signal {
  const mine = db.bookings.filter((b) => b.customerId === user.id && b.providerId === providerId);
  const repeat = mine.filter((b) => b.status === 'completed').length;
  const favourite = db.favourites.some((f) => f.customerId === user.id && f.providerId === providerId);
  const cats = db.profiles.find((p) => p.id === providerId)?.categoryIds || [];
  let affinity = 0;
  cats.forEach((c) => (affinity += byCat.get(c) || 0));
  return { repeat, favourite, affinity };
}

/** The first true reason becomes the headline; the rest are supporting notes. */
function note(reasons: { text: string; weight: number }[], also: string[], text: string, weight: number): void {
  if (reasons.length) also.push(text);
  else reasons.push({ text, weight });
}

/**
 * Ranked, explained suggestions for one customer.
 * `limit` keeps the home screen short; pass a larger number for a full list.
 */
export function recommendFor(db: DB, user: User, center: SearchCenter, limit = 6): Recommendation[] {
  const { byCat, label } = affinityFor(db, user);
  const today = todayISO();
  const upcoming = new Set(
    db.bookings
      .filter((b) => b.customerId === user.id && ['pending', 'confirmed'].includes(b.status) && b.date >= today)
      .map((b) => b.providerId)
  );

  const out: Recommendation[] = [];

  db.profiles.forEach((p) => {
    if (p.verification === 'suspended') return; // never recommend a suspended studio
    if (upcoming.has(p.id)) return; // they already have an appointment here

    const s = signalsFor(db, user, p.id, byCat);
    const dist = haversine(center.lat, center.lng, p.lat, p.lng);
    const services = db.services.filter((x) => x.providerId === p.id && x.active);
    const openSlotsToday = services.reduce(
      (best, svc) => Math.max(best, countOpenSlots(db, p.id, svc.duration, today)),
      0
    );

    const reasons: { text: string; weight: number }[] = [];
    const also: string[] = [];

    if (s.repeat === 1) reasons.push({ text: 'You completed a booking here', weight: 4 });
    if (s.repeat > 1) reasons.push({ text: `You have been here ${s.repeat} times`, weight: 5 });
    if (s.favourite) reasons.push({ text: 'On your favourites list', weight: 3.5 });

    const topCat = categoriesOf(db, p)
      .map((c) => ({ name: c.name, n: byCat.get(c.id) || 0 }))
      .sort((a, b) => b.n - a.n)[0];
    if (topCat && topCat.n >= 2) note(reasons, also, `You often look at ${topCat.name}`, 2 + Math.min(topCat.n, 6) * 0.3);
    if (p.verification === 'verified') note(reasons, also, 'Verified by Glamoora', 1.5);
    if (p.reviewCount >= 20 && p.avg >= 4.7) note(reasons, also, `★ ${p.avg} from ${p.reviewCount} reviews`, 1.5);
    if (dist <= 5) note(reasons, also, `${dist.toFixed(1)} km from ${center.label}`, 1.2);
    if (services.some((x) => x.locationType !== 'provider')) {
      const text = 'Comes to your place';
      also.push(text);
    }
    if (openSlotsToday > 0) also.push(`${openSlotsToday} slot${openSlotsToday === 1 ? '' : 's'} free today`);

    const score =
      s.repeat * 4 +
      (s.favourite ? 3.5 : 0) +
      Math.min(s.affinity, 8) * 0.5 +
      (p.verification === 'verified' ? 1.5 : 0) +
      (p.reviewCount ? (p.avg / 5) * 2 : 0.4) +
      Math.max(0, 2 - dist / 6) +
      Math.min(openSlotsToday, 6) * 0.25 +
      Math.min(services.length, 5) * 0.2;

    // Without any signal at all, fall back to the honest, generic reason.
    const reason = reasons.sort((a, b) => b.weight - a.weight)[0]?.text
      || (p.reviewCount
        ? `★ ${p.avg} from ${p.reviewCount} reviews near ${center.label}`
        : `New on Glamoora · ${label(p.categoryIds[0] || '') || 'beauty'} near ${center.label}`);

    out.push({
      p,
      reason,
      also: [...new Set(also)].slice(0, 3),
      score: Math.round(score * 100) / 100,
      dist: Math.round(dist * 10) / 10,
      openSlotsToday,
    });
  });

  out.sort((a, b) => b.score - a.score || a.dist - b.dist || a.p.displayName.localeCompare(b.p.displayName));
  return out.slice(0, limit);
}

/**
 * "Continue where you left off": the last studio the customer looked at but did
 * not book, so the home screen can offer one tap back into the funnel.
 */
export function lastViewed(db: DB, user: User): ProviderProfile | null {
  const upcoming = new Set(
    db.bookings.filter((b) => b.customerId === user.id && ['pending', 'confirmed'].includes(b.status)).map((b) => b.providerId)
  );
  const views = db.events
    .filter((e) => e.actorId === user.id && e.name === 'provider_view' && e.providerId && !upcoming.has(e.providerId))
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const v of views) {
    const p = db.profiles.find((x) => x.id === v.providerId);
    if (p && p.verification !== 'suspended') return p;
  }
  return null;
}

/** Categories this customer engages with most, for a personalised shortcut row. */
export function topCategories(db: DB, user: User, limit = 3): { id: string; name: string; icon: string; count: number }[] {
  const { byCat } = affinityFor(db, user);
  return [...byCat.entries()]
    .map(([id, count]) => {
      const c = db.categories.find((x) => x.id === id);
      return c && c.active ? { id: c.id, name: c.name, icon: c.icon, count: Math.round(count * 10) / 10 } : null;
    })
    .filter((x): x is { id: string; name: string; icon: string; count: number } => !!x)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
