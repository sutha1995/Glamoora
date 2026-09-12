/**
 * AI assistant (PRD Phase 16): grounded answers, honest refusals, and the
 * provider writing tools. All deterministic — the same input always produces
 * the same output, which is what makes it safe to demo.
 */
import { localRepository as repo } from '../db/local';
import { AREAS } from '../data/seed';
import {
  askAssistant,
  customerChips,
  draftCaption,
  draftReplyToReview,
  draftServiceDescription,
  portfolioTags,
  providerChips,
  scoreProfile,
  studioTagline,
  suggestBundles,
  summariseReviews,
  type AssistantContext,
} from '../ai/assistant';
import type { Review } from '../types';
import { assert, assertEq, assertInRange, describe } from './harness';

const { it } = describe('AI assistant (PRD Phase 16)');

function ctxFor(userId: string | null): AssistantContext {
  const db = repo.snapshot();
  const user = userId ? db.users.find((u) => u.id === userId) || null : null;
  return {
    db,
    user,
    center: { lat: AREAS[0].lat, lng: AREAS[0].lng, label: 'Bukit Bintang' },
    areas: AREAS,
  };
}

function review(rating: number, comment: string, i: number): Review {
  return { id: `r${i}`, bookingId: `b${i}`, customerId: 'umaya', providerId: 'p1', rating, comment, createdAt: Date.now() - i * 1000 };
}

export async function assistantTests(): Promise<void> {
  await repo.reset();

  /* --------------------------- guardrails --------------------------- */

  it('refuses medical questions before anything else', () => {
    const r = askAssistant('I am pregnant — is waxing safe? Could I get an infection?', ctxFor('umaya'));
    assertEq(r.kind, 'refusal', 'refused');
    assertEq(r.intent, 'medical_refusal', 'intent');
    assert(r.text.includes('medical'), 'says it does not give medical advice');
    assert(/doctor|healthcare professional/i.test(r.text), 'points to a professional');
    assert(r.chips.length > 0, 'still offers useful next steps');
  });

  it('never invents facts: answers only quote data that exists', () => {
    const r = askAssistant('what is brow embroidery', ctxFor('umaya'));
    const db = repo.snapshot();
    const cat = db.categories.find((c) => c.id === 'c2')!;
    assert(r.text.includes(cat.name), 'names the real category');
    assert(r.text.includes(cat.desc), 'uses the stored description, not invented copy');
    assert(r.rows!.some((row) => /RM/.test(row.value)), 'quotes real prices from listings');
  });

  it('says plainly when it does not understand', () => {
    const r = askAssistant('quantum aura alignment for my chakras', ctxFor('umaya'));
    assertEq(r.intent, 'fallback', 'fallback intent');
    assert(/did not recognise|only answer from what Glamoora actually holds/i.test(r.text), 'admits the limit');
    assert(r.chips.length >= 3, 'offers concrete examples instead');
  });

  /* --------------------------- customer intents --------------------------- */

  it('greets by name and adapts to the signed-in role', () => {
    const customer = askAssistant('hi', ctxFor('umaya'));
    assertEq(customer.intent, 'greeting', 'greeting intent');
    assert(customer.text.includes('Maya'), 'uses the first name');
    const provider = askAssistant('hi', ctxFor('uaina'));
    assert(/studio|service description/i.test(provider.text), 'provider greeting is about the studio');
    const anon = askAssistant('hello', ctxFor(null));
    assert(anon.text.includes('there'), 'no name invented for a signed-out user');
  });

  it('explains a category with live price and duration ranges', () => {
    const r = askAssistant('what is lash extension and what does it involve?', ctxFor('umaya'));
    assertEq(r.intent, 'explain_category', 'intent');
    const rows = Object.fromEntries(r.rows!.map((x) => [x.label, x.value]));
    assert(/RM/.test(rows['Typical price']), 'price row');
    assert(/min|h/.test(rows['Typical duration']), 'duration row');
    assert(/verified/.test(rows['Studios on Glamoora']), 'honest verification counts');
    assert(!!r.handoff, 'offers a Discover hand-off');
    assertEq(r.handoff!.filters.cat, 'c1', 'hand-off carries the category filter');
  });

  it('answers price questions from live listings, cheapest first', () => {
    const r = askAssistant('how much does a nail service cost?', ctxFor('umaya'));
    assertEq(r.intent, 'price', 'intent');
    const rows = Object.fromEntries(r.rows!.map((x) => [x.label, x.value]));
    assert(/RM/.test(rows['Lowest']) && /RM/.test(rows['Highest']), 'quotes a real range');
    assertEq(r.handoff!.filters.sort, 'price_asc', 'hands off sorted by price');
  });

  it('compares two categories side by side', () => {
    const r = askAssistant('compare lash extensions and brow embroidery', ctxFor('umaya'));
    assertEq(r.intent, 'compare_categories', 'intent');
    assert(r.text.includes('Lash Extensions') && r.text.includes('Brow Embroidery'), 'names both');
    assertEq(r.rows!.length, 4, 'price, duration, studios, verified');
    assert(/neither is "better"/i.test(r.text), 'does not pretend one is objectively better');
  });

  it('compares two named studios on the numbers the app holds', () => {
    const r = askAssistant('compare Aina Lash Studio and Tan Nails & Spa', ctxFor('umaya'));
    assertEq(r.intent, 'compare_studios', 'intent');
    assertEq(r.rows!.length, 2, 'one row per studio');
    assert(r.rows!.every((row) => /★/.test(row.value)), 'shows real ratings');
  });

  it('describes a studio from its own profile, reviews and services', () => {
    const r = askAssistant('tell me about Serenity Touch Massage', ctxFor('umaya'));
    assertEq(r.intent, 'studio', 'intent');
    const rows = Object.fromEntries(r.rows!.map((x) => [x.label, x.value]));
    assert(/★|No reviews/.test(rows['Rating']), 'rating row');
    assert(/km from/.test(rows['Distance']), 'distance from the customer');
    assert(rows['Status'].length > 0, 'states verification status honestly');
  });

  it('explains the booking flow exactly as the app implements it', () => {
    const r = askAssistant('how do I book an appointment?', ctxFor('umaya'));
    assertEq(r.intent, 'how_to_book', 'intent');
    assert(/pending/.test(r.text), 'mentions the pending state');
    assert(/accepts/.test(r.text) && /declines/.test(r.text), 'mentions the provider decision');
    assert(/completed/.test(r.text), 'mentions completion before review');
    assert(/mock|no real charge|nothing is charged/i.test(r.text), 'is honest about payments');
  });

  it('is honest that there is no reschedule button', () => {
    const r = askAssistant('can I reschedule my appointment?', ctxFor('umaya'));
    assertEq(r.intent, 'reschedule', 'intent');
    assert(/no reschedule button/i.test(r.text), 'admits the limitation');
    assert(/cancel/i.test(r.text), 'gives the real workaround');
  });

  it('personalises the cancellation answer with the customer own bookings', () => {
    const r = askAssistant('how do I cancel a booking?', ctxFor('umaya'));
    assertEq(r.intent, 'cancel', 'intent');
    const rows = Object.fromEntries(r.rows!.map((x) => [x.label, x.value]));
    const db = repo.snapshot();
    assertEq(rows['Your bookings'], String(db.bookings.filter((b) => b.customerId === 'umaya').length), 'real count');
    assert(/pending/.test(r.text), 'explains the pending-only rule');
  });

  it('explains the mock payment state machine honestly', () => {
    const r = askAssistant('do I pay now? is there a deposit?', ctxFor('umaya'));
    assertEq(r.intent, 'payment', 'intent');
    assert(/mock/i.test(r.text), 'says payments are mocked');
    assert(/unpaid → mock_paid → refunded/.test(r.text), 'states the legal transitions');
    assert(!/your card will be charged/i.test(r.text), 'never implies a real charge');
  });

  it('explains the verified badge as admin-granted only', () => {
    const r = askAssistant('what does the verified badge mean?', ctxFor('umaya'));
    assertEq(r.intent, 'verification', 'intent');
    assert(/never automatically|granted by a human/i.test(r.text), 'badge is human-granted');
    const db = repo.snapshot();
    const rows = Object.fromEntries(r.rows!.map((x) => [x.label, x.value]));
    assertEq(rows['Verified studios'], `${db.profiles.filter((p) => p.verification === 'verified').length} / ${db.profiles.length}`, 'real counts');
  });

  it('explains reporting and moderation outcomes', () => {
    const r = askAssistant('how do I report a studio that was rude?', ctxFor('umaya'));
    assertEq(r.intent, 'report', 'intent');
    assert(/remove the content|suspend/i.test(r.text), 'lists the real admin actions');
    assert(/recalculated/i.test(r.text), 'mentions the rating recompute');
  });

  it('explains the review rules', () => {
    const r = askAssistant('what are the rules for reviews?', ctxFor('umaya'));
    assertEq(r.intent, 'reviews', 'intent');
    assert(/completed booking/i.test(r.text), 'only completed bookings');
    assert(/one review per booking/i.test(r.text), 'one per booking');
  });

  it('answers availability from the real slot engine', () => {
    const r = askAssistant('is anyone available for a massage tomorrow morning?', ctxFor('umaya'));
    assert(['availability', 'nl_search'].includes(r.intent), `intent was ${r.intent}`);
    if (r.results?.length) {
      assert(r.results.every((x) => x.slots > 0), 'every suggestion really has a free slot');
    } else {
      assert(/fully booked|no free slot|nothing is free/i.test(r.text), 'explains an empty result honestly');
    }
  });

  it('turns a natural-language request into a Discover hand-off', () => {
    const r = askAssistant('I need a nail service under RM100 near me this Saturday', ctxFor('umaya'));
    assertEq(r.kind, 'search', 'search reply');
    assertEq(r.intent, 'nl_search', 'intent');
    assert(!!r.handoff, 'carries a hand-off');
    assertEq(r.handoff!.filters.cat, 'c4', 'category');
    assertEq(r.handoff!.filters.maxPrice, 100, 'budget');
    assert(r.results!.length > 0, 'shows matching studios');
    assert(r.chips.includes('Show in Discover'), 'offers the follow-up');
  });

  it('suggests widening when nothing matches, instead of lying', () => {
    const r = askAssistant('saree draping under RM20 within 1km tonight', ctxFor('umaya'));
    if (!r.results?.length) {
      assert(/widen|no studios match|nothing is free/i.test(r.text), 'admits there are no matches');
    } else {
      assert(r.results.every((x) => x.price <= 20), 'never shows a studio above the stated budget');
    }
    assert(r.chips.length > 0, 'always offers a next step');
  });

  it('offers different starter chips per role', () => {
    assert(customerChips(false).some((c) => /under RM/.test(c)), 'customer chips are searches');
    assert(providerChips().some((c) => /description|bundle|reviews/i.test(c)), 'provider chips are tools');
    assertEq(customerChips(true).length, providerChips().length, 'providers get the tool set');
  });

  /* --------------------------- provider intents --------------------------- */

  it('answers provider questions with their own numbers', () => {
    const r = askAssistant('how do I get more bookings?', ctxFor('uaina'));
    assertEq(r.intent, 'provider_growth', 'intent');
    const rows = Object.fromEntries((r.rows || []).map((x) => [x.label, x.value]));
    const db = repo.snapshot();
    assertEq(rows['Pending requests'], String(db.bookings.filter((b) => b.providerId === 'p1' && b.status === 'pending').length), 'real pending count');
    assert(/verified badge/.test(r.text), 'explains the real ranking inputs');
  });

  it('tells a provider their real verification status, not a generic script', () => {
    const already = askAssistant('how do I get verified?', ctxFor('uaina'));
    assertEq(already.intent, 'provider_verification', 'intent');
    assert(/already verified/i.test(already.text), 'an already-verified studio is told so');
    assert(!/Request verification/.test(already.text), 'and is not told to request it again');

    const ready = askAssistant('how do I get verified?', ctxFor('umei'));
    assertEq(ready.intent, 'provider_verification', 'intent for an unverified studio');
    assert(/Request verification/.test(ready.text), 'tells them the exact step');
    assert(/never automatic/i.test(ready.text), 'and that the badge is granted by hand');

    repo.setVerification('p6', 'pending');
    const queued = askAssistant('how do I get verified?', ctxFor('umei'));
    assert(/already in the admin queue/i.test(queued.text), 'a queued studio is told it is waiting');
    repo.setVerification('p6', 'suspended');
    const suspended = askAssistant('how do I get verified?', ctxFor('umei'));
    assert(/suspended/i.test(suspended.text) && /appeal|support/i.test(suspended.text), 'a suspended studio is pointed to support');
    repo.setVerification('p6', 'unverified');
  });

  it('points providers at the writing tools when they ask for copy', () => {
    const r = askAssistant('can you write a service description for me?', ctxFor('uaina'));
    assertEq(r.intent, 'provider_tools', 'intent');
    assert(/on your device|on-device/i.test(r.text), 'says it runs locally');
    assert(r.chips.some((c) => /bundle/i.test(c)), 'offers the bundle tool');
  });

  it('explains hours and slot generation from the real engine', () => {
    const r = askAssistant('how do I set my hours and breaks?', ctxFor('uaina'));
    assertEq(r.intent, 'provider_hours', 'intent');
    assert(/30-minute|30 minute/i.test(r.text), 'mentions the grid');
    assert(/duration/i.test(r.text), 'mentions service duration');
  });

  /* --------------------------- writing tools --------------------------- */

  it('drafts a service description from real price, duration and location', () => {
    const text = draftServiceDescription({
      serviceName: 'Classic Lash Set',
      categoryName: 'Lash Extensions',
      price: 180,
      duration: 90,
      locationType: 'provider',
      studioName: 'Aina Lash Studio',
    });
    assert(text.includes('RM180') || text.includes('180'), 'includes the price');
    assert(/1h 30m/.test(text), 'includes the duration');
    assert(/at the studio/.test(text), 'includes the location setting');
    assert(text.includes('Aina Lash Studio'), 'includes the studio name');
    assert(text.length > 150, 'is a real description, not a stub');
    assert(!/guarantee|cure|medical|treat(s|ment of)? (a )?(condition|disease)/i.test(text), 'makes no medical or absolute claims');

    const mobile = draftServiceDescription({ serviceName: 'Gel Manicure', categoryName: 'Nail Services', price: 90, duration: 45, locationType: 'customer' });
    assert(/at your place/.test(mobile), 'mobile wording');
    assert(/travel/i.test(mobile), 'mentions travel for home service');
    const both = draftServiceDescription({ serviceName: 'Waxing', categoryName: 'Waxing', price: 70, duration: 30, locationType: 'both' });
    assert(/studio or at your place/.test(both), 'both wording');
  });

  it('varies portfolio captions so a gallery does not read identically', () => {
    const a = draftCaption({ serviceName: 'Volume Lash Set', categoryName: 'Lash Extensions', index: 0 });
    const b = draftCaption({ serviceName: 'Volume Lash Set', categoryName: 'Lash Extensions', index: 1 });
    assert(a.caption !== b.caption, 'different captions per index');
    assert(a.tags.length >= 3 && a.tags.length <= 6, 'a usable number of tags');
    assertEq(new Set(a.tags).size, a.tags.length, 'no duplicate tags');
    assert(a.caption.includes('Volume Lash Set') || a.caption.toLowerCase().includes('volume lash set'), 'names the service');
    const again = draftCaption({ serviceName: 'Volume Lash Set', categoryName: 'Lash Extensions', index: 0 });
    assertEq(again.caption, a.caption, 'deterministic for the same input');
  });

  it('suggests bundles only from real services, with honest maths', () => {
    const db = repo.snapshot();
    const bundles = suggestBundles(db, 'p1', (id) => db.categories.find((c) => c.id === id)?.name || '');
    assert(bundles.length > 0, 'a two-service studio gets suggestions');
    assert(bundles.length <= 3, 'at most three ideas');
    bundles.forEach((b) => {
      assertEq(b.serviceIds.length, 2, 'pairs two services');
      const normal = b.serviceIds.reduce((sum, id) => sum + (db.services.find((s) => s.id === id)?.price || 0), 0);
      assertEq(b.normalPrice, normal, 'normal price is the sum of the real prices');
      assertEq(b.saving, normal - b.bundlePrice, 'saving is honest arithmetic');
      assertInRange(b.bundlePrice, 1, normal - 1, 'bundle is cheaper but not free');
      assertEq(b.bundlePrice % 5, 0, 'rounded to the nearest RM5');
      assert(b.duration <= 300, 'never suggests an absurdly long combo');
      assert(b.rationale.length > 10, 'explains why the pairing makes sense');
    });
    assertEq(suggestBundles(db, 'p-one-service-only', () => '').length, 0, 'no bundles without two services');
  });

  it('summarises reviews by counting what people actually wrote', () => {
    const empty = summariseReviews([], 'New Studio');
    assert(/no reviews yet/i.test(empty.headline), 'handles zero reviews');
    assertEq(empty.strengths.length, 0, 'invents nothing');

    const reviews = [
      review(5, 'Super clean and hygienic, very gentle and painless. Results lasted weeks!', 1),
      review(5, 'Friendly and patient, arrived on time. Flawless detail, worth the price.', 2),
      review(4, 'Lovely work but I waited 20 minutes past my slot.', 3),
      review(2, 'Two lashes fell out after three days, lifting at the corners.', 4),
    ];
    const s = summariseReviews(reviews, 'Aina Lash Studio');
    assert(s.headline.includes('4.3') || s.headline.includes('4'), 'headline carries the real average');
    assertEq(s.headline.includes('4 reviews'), true, 'headline carries the count');
    assert(s.strengths.some((x) => /hygiene/.test(x)), 'detects hygiene praise');
    assert(s.strengths.some((x) => /gentle/.test(x)), 'detects gentle praise');
    assert(s.watch.some((x) => /waiting|lateness/.test(x)), 'flags the waiting complaint');
    assert(s.watch.some((x) => /retention/.test(x)), 'flags the retention complaint');
    assertEq(s.distribution.reduce((a, d) => a + d.count, 0), reviews.length, 'distribution accounts for every review');
    assertEq(s.distribution[0].count, 2, 'two 5-star reviews');
    assert(!!s.bestQuote && s.bestQuote.includes('5★'), 'surfaces a positive quote');
    assert(!!s.worstQuote && s.worstQuote.includes('2★'), 'surfaces the critical quote too');
  });

  it('drafts review replies with the right tone per rating', () => {
    const happy = draftReplyToReview(review(5, 'Loved it', 1), 'Aina Lash Studio', 'Maya');
    assert(/thank you, Maya/i.test(happy), 'thanks the customer by name');
    const mid = draftReplyToReview(review(3, 'It was okay', 2), 'Aina Lash Studio', 'Lina');
    assert(/message me/i.test(mid), 'invites a conversation');
    const bad = draftReplyToReview(review(1, 'Terrible', 3), 'Aina Lash Studio', 'Cindy');
    assert(/sorry/i.test(bad), 'apologises');
    assert(!/you are wrong|never happened/i.test(bad), 'never argues with the customer');
  });

  it('scores a profile with the same checks the verification queue uses', () => {
    const db = repo.snapshot();
    const good = scoreProfile(db, 'p1');
    assertInRange(good.score, 0, 100, 'score is a percentage');
    const thin = scoreProfile(db, 'p-missing');
    assertEq(thin.score, 0, 'unknown studio scores nothing');
    assert(thin.tips.length > 0, 'and explains why');
    const scored = db.profiles.map((p) => ({ id: p.id, s: scoreProfile(db, p.id) }));
    assert(scored.every((x) => x.s.score <= 100), 'never exceeds 100');
    assert(good.score >= 50, 'a fully seeded studio scores well');
  });

  it('derives tags and a tagline from the studio real data', () => {
    const db = repo.snapshot();
    const tags = portfolioTags(db, 'p1');
    assert(tags.length > 0 && tags.length <= 8, 'a usable tag list');
    assert(tags.some((t) => /lash/i.test(t)), 'includes its category');
    const line = studioTagline(db, 'p1');
    assert(line.includes('RM'), 'tagline shows a real starting price');
    assert(/★/.test(line), 'tagline shows the rating');
    assertEq(studioTagline(db, 'p-none'), '', 'unknown studio has no tagline');
  });
}
