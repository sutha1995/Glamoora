/**
 * Search & filtering (PRD Phase 5) and the offline AI parser (PRD Phase 16).
 */
import { localRepository as repo } from '../db/local';
import { AREAS } from '../data/seed';
import { EMPTY_FILTERS, searchProviders, type SearchCenter, type SearchFilters } from '../domain/search';
import { decodeFilters, encodeFilters, medicalGuard, parseRequest, type NlContext } from '../ai/nlsearch';
import { parseISO, todayISO } from '../utils';
import { assert, assertEq, describe } from './harness';

const { it } = describe('Search & filters (PRD Phase 5)');
const ai = describe('AI natural-language search (PRD Phase 16)');

const HOME: SearchCenter = { lat: AREAS[0].lat, lng: AREAS[0].lng, label: 'Bukit Bintang' };

function ctx(): NlContext {
  const db = repo.snapshot();
  return { db, center: HOME, areas: AREAS, categories: db.categories };
}
function run(f: Partial<SearchFilters>, center: SearchCenter = HOME) {
  return searchProviders(repo.snapshot(), { ...EMPTY_FILTERS, ...f }, center);
}

export async function searchTests(): Promise<void> {
  await repo.init();
  const db = repo.snapshot();

  it('returns every bookable studio with no filters and hides suspended ones', () => {
    const all = run({});
    assertEq(all.length, db.profiles.filter((p) => p.verification !== 'suspended').length, 'all non-suspended studios');
  });

  it('filters by category', () => {
    const lashes = run({ cat: 'c1' });
    assert(lashes.length > 0, 'there are lash studios');
    assert(lashes.every((h) => h.p.categoryIds.includes('c1')), 'only lash studios returned');
  });

  it('filters by maximum price using the cheapest active service', () => {
    const cheap = run({ maxPrice: 150 });
    assert(cheap.every((h) => h.minPrice <= 150), `all within RM150, got ${cheap.map((h) => h.minPrice).join('/')}`);
    const any = run({});
    assert(cheap.length <= any.length, 'the price filter narrows results');
  });

  it('filters by minimum rating and never counts studios with no reviews', () => {
    const good = run({ minRating: 4.5 });
    assert(good.every((h) => h.p.avg >= 4.5 && h.p.reviewCount > 0), '4.5+ with real reviews');
  });

  it('filters by distance from the search centre', () => {
    const near = run({ maxDist: 3 }, HOME);
    assert(near.every((h) => h.dist <= 3), 'within 3km');
    const fromSubang = run({ maxDist: 3 }, { lat: AREAS[7].lat, lng: AREAS[7].lng, label: 'Subang Jaya' });
    assert(near.length !== fromSubang.length || near[0]?.p.id !== fromSubang[0]?.p.id, 'centre changes the result set');
  });

  it('filters by service location type', () => {
    const mobile = run({ type: 'customer' });
    assert(mobile.length > 0, 'some studios travel');
    assert(
      mobile.every((h) => db.services.some((s) => s.providerId === h.p.id && s.active && s.locationType !== 'provider')),
      'each has a service that is not studio-only'
    );
  });

  it('filters by verified badge only', () => {
    const verified = run({ verified: true });
    assert(verified.every((h) => h.p.verification === 'verified'), 'verified only');
    assert(verified.length < run({}).length, 'narrower than everything');
  });

  it('requires a real open slot when a date or time window is given', () => {
    const withDate = run({ date: todayISO() });
    assert(withDate.every((h) => h.openSlots > 0), 'every hit has a free slot today');
    const evening = run({ date: todayISO(), timeFrom: 17 * 60, timeTo: 23 * 60 });
    assert(evening.length <= withDate.length, 'evening is a subset of the day');
  });

  it('sorts by distance, rating and price as requested', () => {
    const byDist = run({ sort: 'distance' }).map((h) => Math.round(h.dist * 100));
    assert(byDist.every((d, i) => i === 0 || d >= byDist[i - 1]), 'distance ascending');
    const byRating = run({ sort: 'rating' }).map((h) => h.p.avg);
    assert(byRating.every((r, i) => i === 0 || r <= byRating[i - 1]), 'rating descending');
    const byPrice = run({ sort: 'price_asc' }).map((h) => h.minPrice);
    assert(byPrice.every((p, i) => i === 0 || p >= byPrice[i - 1]), 'price ascending');
  });

  it('matches free text against studio, service and category names', () => {
    const byName = run({ q: 'saree' });
    assert(byName.length > 0, 'saree matches at least one studio');
    assert(run({ q: 'zzzqqq' }).length === 0, 'gibberish matches nothing');
  });

  /* ------------------------------ AI parser ------------------------------ */

  ai.it('parses the PRD demo sentence into real filters', () => {
    const r = parseRequest('I need a nail service under RM100 near me this Saturday', ctx());
    assertEq(r.filters.cat, 'c4', 'Nail Services');
    assertEq(r.filters.maxPrice, 100, 'budget RM100');
    assertEq(r.filters.maxDist, 5, '"near me" becomes 5km');
    assertEq(parseISO(r.filters.date).getDay(), 6, 'a Saturday');
    assert(r.filters.date >= todayISO(), 'not in the past');
    assertEq(r.intent, 'search', 'treated as a search');
    assert(r.understood.length >= 3, 'explains what it understood');
    assertEq(r.missed.length, 0, 'nothing important ignored');
  });

  ai.it('parses time of day and "tomorrow evening"', () => {
    const r = parseRequest('lash extensions under RM200 tomorrow evening', ctx());
    assertEq(r.filters.cat, 'c1', 'Lash Extensions');
    assertEq(r.filters.maxPrice, 200, 'RM200');
    assertEq(r.filters.timeFrom, 17 * 60, 'evening starts at 17:00');
    assertEq(r.filters.timeTo, 23 * 60 + 59, 'evening ends late');
  });

  ai.it('turns "top rated" into a 4.5-star floor', () => {
    const r = parseRequest('brow embroidery with a top rated artist', ctx());
    assertEq(r.filters.cat, 'c2', 'Brow Embroidery');
    assertEq(r.filters.minRating, 4.5, '4.5+');
  });

  ai.it('moves the search centre to a named area', () => {
    const r = parseRequest('massage in Bangsar this weekend', ctx());
    assertEq(r.center.label, 'Bangsar', 'centred on Bangsar');
    assertEq(r.filters.cat, 'c3', 'Massage');
    assertEq(parseISO(r.filters.date).getDay(), 6, 'weekend resolves to Saturday');
  });

  ai.it('understands home-service and verified-only requests', () => {
    const r = parseRequest('mobile manicure at my place from a verified studio', ctx());
    assertEq(r.filters.comesToYou, true, 'comes to you');
    assertEq(r.filters.type, 'customer', 'customer location');
    assertEq(r.filters.verified, true, 'verified only');
    assertEq(r.filters.cat, 'c4', 'Nail Services');
  });

  ai.it('understands Malay and Manglish phrasing', () => {
    const r = parseRequest('nak manicure murah esok pagi dekat Bangsar', ctx());
    assertEq(r.filters.cat, 'c4', 'manicure');
    assertEq(r.filters.maxPrice, 120, '"murah" implies a budget');
    assertEq(r.filters.timeFrom, 5 * 60, '"pagi" is the morning');
    assertEq(r.center.label, 'Bangsar', '"dekat Bangsar"');
  });

  ai.it('parses an explicit clock time', () => {
    const r = parseRequest('hair styling after 3pm on friday', ctx());
    assertEq(r.filters.cat, 'c7', 'Hair Styling');
    assertEq(r.filters.timeFrom, 15 * 60, '3pm = 15:00');
    assertEq(parseISO(r.filters.date).getDay(), 5, 'a Friday');
  });

  ai.it('reports what it could not understand instead of guessing', () => {
    const r = parseRequest('something quantum for my aura', ctx());
    assertEq(r.filters.cat, '', 'no category invented');
    assert(r.understood.length === 0 || r.filters.q.length > 0, 'either nothing understood or kept as text');
    assert(r.reply.includes('could not') || r.filters.q.length > 0, 'honest reply');
  });

  ai.it('routes questions to the assistant rather than to filters', () => {
    const r = parseRequest('what is brow embroidery and how long does it last?', ctx());
    assertEq(r.intent, 'question', 'detected as a question');
  });

  ai.it('returns matching studios alongside the parsed filters', () => {
    const r = parseRequest('lash extensions near me', ctx());
    assert(r.hits.length > 0, 'found studios');
    assertEq(r.hits.length, Math.min(r.matchCount, 6), 'up to six suggestions');
  });

  ai.it('refuses medical questions (PRD Phase 16 guardrail)', () => {
    const guard = medicalGuard('I am pregnant, is waxing safe? Could it cause an infection?');
    assert(!!guard, 'medical request is refused');
    assert(guard!.includes('medical'), 'explains the boundary');
    assertEq(medicalGuard('nail service under RM100 near me'), null, 'ordinary searches pass through');
  });

  ai.it('round-trips filters through the Discover hand-off', () => {
    const f: SearchFilters = { ...EMPTY_FILTERS, cat: 'c4', maxPrice: 100, date: todayISO(), sort: 'price_asc' };
    const decoded = decodeFilters(encodeFilters(f, HOME));
    assert(!!decoded, 'decodes');
    assertEq(decoded!.filters.cat, 'c4', 'category survives');
    assertEq(decoded!.filters.maxPrice, 100, 'budget survives');
    assertEq(decoded!.center?.label, 'Bukit Bintang', 'centre survives');
    assertEq(decodeFilters('not-json'), null, 'bad input is ignored');
  });
}
