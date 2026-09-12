/**
 * Glamoora AI assistant (PRD Phase 16, Priority 4).
 *
 * Two halves, both fully on-device and deterministic — no model, no API key,
 * no network, so the demo cannot fail on venue Wi-Fi (PRD §17, §21):
 *
 *   1. `askAssistant()` — a customer-facing helper that explains categories,
 *      compares services and studios, answers booking/payment/verification
 *      questions from the real rules in this codebase, and hands natural
 *      language searches to the Discover filters via `nlsearch`.
 *   2. Provider writing tools — service descriptions, portfolio captions and
 *      tags, bundle ideas, review summaries and reply drafts, generated from
 *      the studio's own data.
 *
 * Everything is grounded in the actual database: prices, durations, ratings and
 * availability are read from the snapshot, never invented. Where the app cannot
 * do something (rescheduling, real payments, medical advice) the assistant says
 * so plainly instead of bluffing.
 */
import type { Category, DB, LocationType, ProviderProfile, Review, Service, User } from '../types';
import {
  EMPTY_FILTERS,
  categoriesOf,
  partLabel,
  readableDate,
  searchProviders,
  type SearchCenter,
  type SearchFilters,
} from '../domain/search';
import { fmtRM, haversine, todayISO } from '../utils';
import { medicalGuard, parseRequest, type NlContext } from './nlsearch';

export interface AssistantContext {
  db: DB;
  user: User | null;
  center: SearchCenter;
  areas: { name: string; lat: number; lng: number }[];
}

export interface AssistantResultRow {
  id: string;
  name: string;
  sub: string;
  dist: number;
  price: number;
  rating: number;
  verified: boolean;
  slots: number;
}

export interface AssistantReply {
  kind: 'answer' | 'search' | 'refusal';
  text: string;
  /** Structured lines the UI can render as a small table. */
  rows?: { label: string; value: string }[];
  results?: AssistantResultRow[];
  /** Hand-off so "show me those" applies real filters in Discover. */
  handoff?: { filters: SearchFilters; center: SearchCenter } | null;
  chips: string[];
  /** Which rule answered, for debugging and for the analytics log. */
  intent: string;
}

const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

/* ------------------------------------------------------------------ */
/* data helpers                                                        */
/* ------------------------------------------------------------------ */

interface CatStats {
  cat: Category;
  services: Service[];
  min: number;
  max: number;
  median: number;
  avgDuration: number;
  studios: number;
  verifiedStudios: number;
  topRated: { name: string; avg: number; reviews: number } | null;
}

function catStats(db: DB, catId: string): CatStats | null {
  const cat = db.categories.find((c) => c.id === catId);
  if (!cat) return null;
  const providers = db.profiles.filter((p) => p.categoryIds.includes(catId) && p.verification !== 'suspended');
  const ids = new Set(providers.map((p) => p.id));
  const services = db.services.filter((s) => ids.has(s.providerId) && s.active);
  const prices = services.map((s) => s.price).sort((a, b) => a - b);
  const durations = services.map((s) => s.duration);
  const rated = providers.filter((p) => p.reviewCount > 0).sort((a, b) => b.avg - a.avg);
  return {
    cat,
    services,
    min: prices[0] || 0,
    max: prices[prices.length - 1] || 0,
    median: prices.length ? prices[Math.floor(prices.length / 2)] : 0,
    avgDuration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    studios: providers.length,
    verifiedStudios: providers.filter((p) => p.verification === 'verified').length,
    topRated: rated[0] ? { name: rated[0].displayName, avg: rated[0].avg, reviews: rated[0].reviewCount } : null,
  };
}

function findCategories(text: string, categories: Category[]): Category[] {
  const lower = ` ${text.toLowerCase()} `;
  const hits: Category[] = [];
  categories.forEach((c) => {
    const words = c.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
    if (words.some((w) => lower.includes(` ${w} `))) hits.push(c);
  });
  return hits;
}

function studioByName(db: DB, text: string) {
  const lower = text.toLowerCase();
  return db.profiles.filter((p) => {
    const words = p.displayName.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
    return words.length > 0 && words.every((w) => lower.includes(w));
  });
}

function priceBand(s: CatStats): string {
  if (!s.services.length) return 'no services listed yet';
  if (s.min === s.max) return fmtRM(s.min);
  return `${fmtRM(s.min)} – ${fmtRM(s.max)} (typically ${fmtRM(s.median)})`;
}

function durationLabel(min: number): string {
  if (!min) return 'varies';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m} min`;
}

/* ------------------------------------------------------------------ */
/* intent detection                                                    */
/* ------------------------------------------------------------------ */

const GREETING = /^(hi|hey|hello|hai|assalamualaikum|good (morning|afternoon|evening)|thanks|thank you|terima kasih|bye)\b/i;
const COMPARE = /\b(compare|comparison|difference|differ|versus|vs\.?|better|which is|or)\b/i;
const HOW_BOOK = /\b(how (do i|to|can i) (book|reserve|schedule|make (a )?booking)|book(ing)? (a|an|the)? ?(appointment|session)|steps? to book|reserve)\b/i;
const CANCEL = /\b(cancel|cancellation|batal)\b/i;
const RESCHEDULE = /\b(reschedule|change (the )?(date|time)|move (my|the) (booking|appointment)|postpone)\b/i;
const PAYMENT = /\b(pay|payment|paid|deposit|refund|refunded|charge|charged|cash|ewallet|e-wallet|duitnow|card|bayar)\b/i;
const NOSHOW = /\b(no[- ]?show|didn'?t (show|turn) up|late|turn up)\b/i;
const TRUST = /\b(verified|verification|badge|trust|trusted|legit|safe|scam|genuine)\b/i;
const REPORT = /\b(report|flag|complain|complaint|abuse|inappropriate|adu)\b/i;
const REVIEW_Q = /\b(review|reviews|rating|ratings|star|stars)\b/i;
const PROVIDER_HOWTO = /\b(how (do i|to|can i) (get|add|create|upload|set|increase|grow|edit|change|write|draft)|get (more )?(bookings|clients|customers)|grow|marketing|attract|write|draft|caption|bundle|bundles|summar|summarise|summarize|description)\b/i;
const AVAILABILITY = /\b(available|availability|free|slot|open|bookable)\b/i;
const HOWMUCH = /\b(how much|cost|costs|price|prices|pricing|berapa|harga)\b/i;
const WHATIS = /\b(what (is|are)|explain|tell me about|means|meaning|describe|apa itu)\b/i;

function has(text: string, re: RegExp): boolean {
  return re.test(text);
}

/* ------------------------------------------------------------------ */
/* the assistant                                                       */
/* ------------------------------------------------------------------ */

export function askAssistant(text: string, ctx: AssistantContext): AssistantReply {
  const raw = text.trim();
  const { db, user } = ctx;
  const isProvider = user?.role === 'provider';

  /* 0. Medical guard — always first (PRD Phase 16 guardrail). */
  const medical = medicalGuard(raw);
  if (medical) {
    return { kind: 'refusal', text: medical, chips: customerChips(isProvider), intent: 'medical_refusal' };
  }

  /* 1. Greeting. */
  if (GREETING.test(raw) && raw.length < 40) {
    const name = user ? user.name.split(' ')[0] : 'there';
    return {
      kind: 'answer',
      intent: 'greeting',
      text: isProvider
        ? `Hi ${name}. I can help with your studio: write a service description, draft a portfolio caption, suggest a bundle, or summarise your reviews. Ask me anything about verification and bookings too.`
        : `Hi ${name}. Tell me what you need in your own words — for example “nail service under RM100 near me this Saturday”. I can also explain any category, compare studios, and walk you through booking, cancellation, payment and the verified badge.`,
      chips: isProvider ? providerChips() : customerChips(false),
    };
  }

  const cats = findCategories(raw, db.categories);
  const studios = studioByName(db, raw);

  /* 2. A named studio beats a category match: every word of the studio name has
        to appear, so "massage near me" never resolves to a specific studio. */
  if (studios.length >= 2 && has(raw, COMPARE)) return compareStudios(db, studios.slice(0, 2), ctx);
  if (studios.length === 1) return studioAnswer(db, studios[0], ctx);

  /* 3. Comparisons between two categories. */
  if (has(raw, COMPARE) && cats.length >= 2) return compareCategories(db, cats.slice(0, 2), ctx);

  /* 4. Explain a category, or answer a price question about it. */
  if (has(raw, WHATIS) && cats.length) return explainCategory(db, cats[0], ctx);
  if (has(raw, HOWMUCH) && cats.length) return priceQuestion(db, cats[0], ctx);

  /* 5. Booking mechanics — answered from the real rules in this app. */
  if (has(raw, RESCHEDULE)) return rescheduleAnswer();
  if (has(raw, CANCEL)) return cancelAnswer(db, user);
  if (has(raw, NOSHOW)) return noShowAnswer();
  if (has(raw, PAYMENT) && !cats.length) return paymentAnswer();
  if (has(raw, HOW_BOOK) && !isProvider) return howToBookAnswer(ctx);
  // A provider asking "how do I get verified?" wants their own status, not the
  // customer-facing explainer.
  const aboutSelf = isProvider && /\b(i|my|me|get|become|apply|request)\b/i.test(raw);
  if (has(raw, TRUST) && !studios.length && !aboutSelf) return trustAnswer(db);
  if (has(raw, REPORT)) return reportAnswer();
  if (has(raw, REVIEW_Q) && has(raw, WHATIS)) return reviewAnswer();

  /* 6. Provider-side how-to (verification, services, growing bookings). */
  if (isProvider && has(raw, PROVIDER_HOWTO)) return providerHowTo(raw, db, user);
  if (!isProvider && has(raw, PROVIDER_HOWTO) && /\b(my studio|my profile|as a provider|i'?m a provider|sell|offer services)\b/i.test(raw)) {
    return providerHowTo(raw, db, user);
  }

  /* 7. Everything else: try to read it as a marketplace search. */
  const parsed = parseRequest(raw, nl(ctx));
  const pf = parsed.filters;
  const structured = !!(
    pf.cat || pf.maxPrice || pf.minRating || pf.maxDist || pf.date || pf.timeFrom || pf.timeTo ||
    pf.verified || pf.type || pf.comesToYou || pf.openToday
  );
  if (parsed.intent === 'search' && (parsed.matchCount > 0 || structured)) {
    return searchReply(parsed, ctx);
  }

  /* 8. Availability question about a category or studio. */
  if (has(raw, AVAILABILITY) && (studios.length === 1 || cats.length === 1)) {
    return availabilityAnswer(db, studios[0], cats[0], parsed, ctx);
  }

  return fallback(parsed, ctx);
}

function nl(ctx: AssistantContext): NlContext {
  return { db: ctx.db, center: ctx.center, areas: ctx.areas, categories: ctx.db.categories };
}

/* ------------------------------------------------------------------ */
/* answers                                                             */
/* ------------------------------------------------------------------ */

function explainCategory(db: DB, cat: Category, ctx: AssistantContext): AssistantReply {
  const s = catStats(db, cat.id);
  if (!s) return { kind: 'answer', intent: 'explain_category', text: `I could not find ${cat.name} in the catalogue.`, chips: customerChips(false) };

  const rows = [
    { label: 'Typical price', value: priceBand(s) },
    { label: 'Typical duration', value: durationLabel(s.avgDuration) },
    { label: 'Studios on Glamoora', value: `${s.studios} (${s.verifiedStudios} verified)` },
  ];
  if (s.topRated) rows.push({ label: 'Highest rated', value: `${s.topRated.name} · ★ ${s.topRated.avg} (${s.topRated.reviews})` });

  const examples = [...new Set(s.services.map((x) => x.name))].slice(0, 5);
  const mobile = s.services.filter((x) => x.locationType !== 'provider').length;

  let text = `${cat.name}: ${cat.desc}\n\n`;
  if (examples.length) text += `On Glamoora you will see services like ${examples.slice(0, 4).join(', ')}${examples.length > 4 ? '…' : ''}.\n`;
  if (mobile) text += `${mobile} of the ${s.services.length} listed ${s.services.length === 1 ? 'service' : 'services'} can be done at your place.\n`;
  text += `\nPrices are set by each studio — the range below is from live listings, not an estimate.`;

  const hits = searchProviders(db, { ...EMPTY_FILTERS, cat: cat.id, sort: 'recommended' }, ctx.center);
  return {
    kind: 'answer',
    intent: 'explain_category',
    text,
    rows,
    results: toRows(hits),
    handoff: { filters: { ...EMPTY_FILTERS, cat: cat.id }, center: ctx.center },
    chips: [`Cheapest ${cat.name.toLowerCase()} near me`, `Verified ${cat.name.toLowerCase()} studios`, `Compare ${cat.name.toLowerCase()} prices`],
  };
}

function priceQuestion(db: DB, cat: Category, ctx: AssistantContext): AssistantReply {
  const s = catStats(db, cat.id);
  if (!s || !s.services.length) {
    return { kind: 'answer', intent: 'price', text: `No ${cat.name} services are listed yet, so I have no real prices to quote.`, chips: customerChips(false) };
  }
  const sorted = [...s.services].sort((a, b) => a.price - b.price);
  const cheapest = sorted.slice(0, 3);
  const dearest = sorted.slice(-1)[0];
  const rows = [
    { label: 'Lowest', value: `${fmtRM(s.min)} (${cheapest[0].name})` },
    { label: 'Typical', value: fmtRM(s.median) },
    { label: 'Highest', value: `${fmtRM(s.max)} (${dearest.name})` },
  ];
  const cheapList = cheapest
    .map((x) => {
      const p = db.profiles.find((q) => q.id === x.providerId);
      return `${x.name} — ${fmtRM(x.price)} at ${p?.displayName || 'a studio'}${p?.verification === 'verified' ? ' ✓' : ''}`;
    })
    .join('\n');
  return {
    kind: 'answer',
    intent: 'price',
    text: `Here is what ${cat.name.toLowerCase()} actually costs on Glamoora right now:\n\n${cheapList}\n\nEvery studio sets its own price, and mobile (at-your-place) sessions usually cost a little more than studio visits.`,
    rows,
    handoff: { filters: { ...EMPTY_FILTERS, cat: cat.id, sort: 'price_asc' }, center: ctx.center },
    chips: [`${cat.name} under RM${Math.max(50, Math.round(s.min / 10) * 10)}`, `Top rated ${cat.name.toLowerCase()}`, `Show all ${cat.name.toLowerCase()} studios`],
  };
}

function compareCategories(db: DB, cats: Category[], ctx: AssistantContext): AssistantReply {
  const a = catStats(db, cats[0].id);
  const b = catStats(db, cats[1].id);
  if (!a || !b) return { kind: 'answer', intent: 'compare_categories', text: 'I need two categories I know about to compare them.', chips: customerChips(false) };
  const rows = [
    { label: 'Price range', value: `${a.cat.name}: ${priceBand(a)}  ·  ${b.cat.name}: ${priceBand(b)}` },
    { label: 'Duration', value: `${a.cat.name}: ${durationLabel(a.avgDuration)}  ·  ${b.cat.name}: ${durationLabel(b.avgDuration)}` },
    { label: 'Studios', value: `${a.cat.name}: ${a.studios}  ·  ${b.cat.name}: ${b.studios}` },
    { label: 'Verified', value: `${a.cat.name}: ${a.verifiedStudios}  ·  ${b.cat.name}: ${b.verifiedStudios}` },
  ];
  const cheaper = a.median && b.median ? (a.median <= b.median ? a : b) : a;
  return {
    kind: 'answer',
    intent: 'compare_categories',
    text: `${a.cat.name} versus ${b.cat.name}, from live listings:\n\n${a.cat.name} — ${a.cat.desc}\n${b.cat.name} — ${b.cat.desc}\n\nOn price, ${cheaper.cat.name.toLowerCase()} is usually the cheaper of the two here (${fmtRM(cheaper.median)} typical). Neither is "better" — they solve different things, and many people book both in one visit when a studio offers them.`,
    rows,
    chips: [`Explain ${a.cat.name.toLowerCase()}`, `Explain ${b.cat.name.toLowerCase()}`, `Studios offering both`],
    handoff: null,
  };
}

function compareStudios(db: DB, list: ProviderProfile[], ctx: AssistantContext): AssistantReply {
  const rows = list.map((p) => {
    const svcs = db.services.filter((s) => s.providerId === p.id && s.active);
    const prices = svcs.map((s) => s.price);
    const cats = categoriesOf(db, p).map((c) => c.name).join(', ');
    return {
      label: p.displayName,
      value: `★ ${p.avg} (${p.reviewCount}) · ${prices.length ? `${fmtRM(Math.min(...prices))}–${fmtRM(Math.max(...prices))}` : 'no services'} · ${cats || 'no category'} · ${p.addr}${p.verification === 'verified' ? ' · verified ✓' : ''}`,
    };
  });
  const best = [...list].sort((x, y) => y.avg * (y.reviewCount ? 1 : 0.5) - x.avg * (x.reviewCount ? 1 : 0.5))[0];
  const cheapest = [...list].sort((x, y) => {
    const lo = (id: string) => Math.min(...db.services.filter((s) => s.providerId === id && s.active).map((s) => s.price), Infinity);
    return lo(x.id) - lo(y.id);
  })[0];
  return {
    kind: 'answer',
    intent: 'compare_studios',
    text: `Comparing ${list.map((p) => p.displayName).join(' and ')} on the numbers Glamoora actually holds:\n\nHigher rating with more reviews usually wins on reliability; the cheaper one wins on budget. ${best.displayName} leads on reputation${cheapest && cheapest.id !== best.id ? `, ${cheapest.displayName} on price` : ''}. Open each profile to read the reviews and check the portfolio before deciding.`,
    rows,
    chips: list.map((p) => `Open ${p.displayName}`),
    handoff: null,
  };
}

function howToBookAnswer(ctx: AssistantContext): AssistantReply {
  return {
    kind: 'answer',
    intent: 'how_to_book',
    text: `Booking on Glamoora takes six steps, and nothing is charged:\n\n1. Search or browse a category, and filter by price, distance, rating or "comes to you".\n2. Open a studio and read its reviews and portfolio.\n3. Pick a service — the price, duration and where it happens (studio or your place) are on the card.\n4. Choose a date. Only slots that are genuinely free are shown: closed days, breaks, blocked time and existing appointments are already removed.\n5. Confirm. The request goes to the studio as "pending".\n6. The studio accepts (the booking becomes \"confirmed\") or declines it. You get a notification either way, and the booking appears in your Bookings tab.\n\nAfter the appointment the studio marks it \"completed\" — only a completed booking can be reviewed, which is what keeps ratings honest.`,
    rows: [
      { label: 'Distance from', value: ctx.center.label },
      { label: 'Payment', value: 'Mock only — no real charge in this build' },
      { label: 'Double booking', value: 'Impossible: the slot is re-checked at the moment you confirm' },
    ],
    chips: ['How do I cancel?', 'What does verified mean?', 'Lash extensions near me'],
  };
}

function cancelAnswer(db: DB, user: User | null): AssistantReply {
  const mine = user ? db.bookings.filter((b) => b.customerId === user.id) : [];
  const cancellable = mine.filter((b) => b.status === 'pending');
  const confirmed = mine.filter((b) => b.status === 'confirmed');
  const rows = [
    { label: 'Your bookings', value: String(mine.length) },
    { label: 'Pending (you can cancel)', value: String(cancellable.length) },
    { label: 'Confirmed (message the studio)', value: String(confirmed.length) },
  ];
  return {
    kind: 'answer',
    intent: 'cancel',
    text: user
      ? `Open Bookings → tap the booking → Cancel request.\n\nBeing straight with you about how this build behaves: a customer can cancel a booking while it is still pending. Once a studio has confirmed it, the cancel button is theirs — so message the studio from the booking and they will release the slot for you. Cancelling frees the slot immediately for other customers.\n\nYou currently have ${cancellable.length} pending and ${confirmed.length} confirmed booking(s).`
      : `Sign in and open Bookings → tap the booking → Cancel request. Pending requests can be cancelled by you; confirmed ones are released by the studio, so message them from the booking and they will free the slot.`,
    rows: user ? rows : undefined,
    chips: ['How do I message a studio?', 'Can I reschedule instead?', 'What is a no-show?'],
  };
}

function rescheduleAnswer(): AssistantReply {
  return {
    kind: 'answer',
    intent: 'reschedule',
    text: `There is no reschedule button in this build — and I would rather tell you that than pretend.\n\nDo this instead: cancel the pending request (or ask the studio to release a confirmed one), then book the new time. The slot grid only shows times that are genuinely free, so you will not double-book yourself.\n\nIf you message the studio first, most will hold the new time while you rebook.`,
    chips: ['How do I cancel?', 'How do I message a studio?', 'Show me open slots today'],
  };
}

function noShowAnswer(): AssistantReply {
  return {
    kind: 'answer',
    intent: 'no_show',
    text: `If a customer does not turn up, the studio marks the booking as "no-show". That keeps the time as used, so the studio's acceptance and completion statistics stay truthful, and the customer can still be contacted through the thread.\n\nIf the studio does not turn up, cancel from your Bookings tab if it is still pending, otherwise message them, and report the studio from its profile if it happens again — reports go to the Glamoora admin queue and can lead to suspension.`,
    chips: ['How do I report a studio?', 'How do I cancel?', 'What does verified mean?'],
  };
}

function paymentAnswer(): AssistantReply {
  return {
    kind: 'answer',
    intent: 'payment',
    text: `Payments in this build are mocked — no card, no e-wallet, no money moves. That is deliberate: the PRD keeps payments behind an abstraction so a real provider (Stripe, or a Malaysian gateway such as Stripe MY / iPay88 / DuitNow) can be dropped in later without touching the booking flow.\n\nWhat you will see: a booking starts as "Pay after service" (unpaid), moves to "Paid (mock)" when the studio marks it paid, and can then be "Refunded (mock)".

The legal transitions are exactly: unpaid → mock_paid → refunded. A refund cannot happen before a payment, a booking cannot be paid twice, and a refund is final.`,
    rows: [
      { label: 'Gateway', value: 'None — mock state machine' },
      { label: 'Transitions', value: 'unpaid → mock_paid → refunded' },
      { label: 'Real money', value: 'Never charged in this build' },
    ],
    chips: ['How does booking work?', 'How do I cancel?', 'What does verified mean?'],
  };
}

function trustAnswer(db: DB): AssistantReply {
  const verified = db.profiles.filter((p) => p.verification === 'verified').length;
  const pending = db.profiles.filter((p) => p.verification === 'pending').length;
  const total = db.profiles.length;
  return {
    kind: 'answer',
    intent: 'verification',
    text: `The verified badge is granted by a human at Glamoora — never automatically, and a studio cannot buy or self-award it.\n\nTo be queued, a studio needs a real display name, a bio, at least one category, at least one active service and weekly hours. An admin reviews the request and either grants the badge or leaves the studio unverified. Suspended studios are removed from search entirely and cannot take bookings or messages.\n\nRight now ${verified} of ${total} studios are verified and ${pending} request(s) are waiting in the admin queue. An unverified studio is not a bad studio — it simply has not been reviewed yet, so weigh the reviews and portfolio more heavily.`,
    rows: [
      { label: 'Verified studios', value: `${verified} / ${total}` },
      { label: 'In the admin queue', value: String(pending) },
      { label: 'Who grants it', value: 'Glamoora admin only' },
    ],
    chips: ['Show verified studios near me', 'How do I report a studio?', 'How do reviews work?'],
  };
}

function reportAnswer(): AssistantReply {
  return {
    kind: 'answer',
    intent: 'report',
    text: `You can report three things: a studio, a portfolio image, or a review.\n\nFrom a studio profile, tap the flag icon (top right) → choose a reason → add detail → submit. On a portfolio image, open it and use Report. On a review, use the flag on that review.\n\nReports land in the admin moderation queue. An admin can take no action, remove the content, or suspend the studio. If a review is removed, the studio's average rating is recalculated from the remaining reviews, so ratings never hide a removal. You can only have one open report per item — filing the same thing twice will not move it up the queue.`,
    chips: ['What does verified mean?', 'How do reviews work?', 'How do I cancel a booking?'],
  };
}

function reviewAnswer(): AssistantReply {
  return {
    kind: 'answer',
    intent: 'reviews',
    text: `Reviews are the backbone of trust here, so the rules are strict:\n\n• Only a completed booking can be reviewed — you cannot review a studio you never visited.\n• Only the customer on that booking can write the review.\n• One review per booking, 1–5 stars plus a comment.\n• The studio's average is recomputed from every review it has, so it can never drift.\n• Admins can remove a review that breaks the rules; the average is recalculated when they do.\n\nFor studios, reviews drive the "recommended" ranking along with the verified badge, distance and how many free slots they keep open.`,
    chips: ['What does verified mean?', 'How do I report a review?', 'Top rated studios near me'],
  };
}

function studioAnswer(db: DB, p: ProviderProfile, ctx: AssistantContext): AssistantReply {
  const svcs = db.services.filter((s) => s.providerId === p.id && s.active);
  const cats = p.categoryIds.map((id) => db.categories.find((c) => c.id === id)?.name).filter(Boolean) as string[];
  const reviews = db.reviews.filter((r) => r.providerId === p.id);
  const dist = distanceKm(ctx.center, db, p.id);
  const summary = summariseReviews(reviews, p.displayName);

  const rows = [
    { label: 'Rating', value: p.reviewCount ? `★ ${p.avg} from ${p.reviewCount} reviews` : 'No reviews yet' },
    { label: 'Categories', value: cats.join(', ') || '—' },
    { label: 'Services', value: svcs.length ? svcs.map((s) => `${s.name} ${fmtRM(s.price)}`).join(' · ') : 'none listed' },
    { label: 'Distance', value: dist === null ? '—' : `${fmtKm(dist)} from ${ctx.center.label}` },
    { label: 'Travels to you', value: String(svcs.some((s) => s.locationType !== 'provider') ? 'Yes' : 'Studio only') },
    { label: 'Status', value: p.verification === 'verified' ? 'Verified ✓ (granted by Glamoora admin)' : p.verification === 'pending' ? 'Verification requested, not yet granted' : p.verification === 'suspended' ? 'Suspended' : 'Not verified yet' },
  ];

  return {
    kind: 'answer',
    intent: 'studio',
    text: `${p.displayName} — ${p.bio}\n\n${summary.headline}${summary.strengths.length ? `\nWhat reviewers mention most: ${summary.strengths.join(', ')}.` : ''}\n\nAsk me about availability, or open the profile to see the portfolio and book a slot.`,
    rows,
    handoff: { filters: { ...EMPTY_FILTERS, q: p.displayName.split(' ')[0] }, center: ctx.center },
    chips: [`Is ${p.displayName.split(' ')[0]} available this week?`, `Book ${p.displayName.split(' ')[0]}`, `Compare with another studio`],
  };
}

function distanceKm(center: SearchCenter, db: DB, providerId: string): number | null {
  const p = db.profiles.find((x) => x.id === providerId);
  return p ? haversine(center.lat, center.lng, p.lat, p.lng) : null;
}

function availabilityAnswer(
  db: DB,
  studio: { id: string; displayName: string } | undefined,
  cat: Category | undefined,
  parsed: ReturnType<typeof parseRequest>,
  ctx: AssistantContext
): AssistantReply {
  const date = parsed.filters.date || todayISO();
  const filters: SearchFilters = {
    ...EMPTY_FILTERS,
    cat: cat?.id || '',
    date,
    timeFrom: parsed.filters.timeFrom,
    timeTo: parsed.filters.timeTo,
    maxDist: parsed.filters.maxDist || 0,
  };
  const hits = searchProviders(db, filters, parsed.center || ctx.center);
  const scoped = studio ? hits.filter((h) => h.p.id === studio.id) : hits;
  const when = `${readableDate(date)}${filters.timeFrom || filters.timeTo ? `, ${partLabel(filters.timeFrom, filters.timeTo)}` : ''}`;

  if (!scoped.length) {
    return {
      kind: 'answer',
      intent: 'availability',
      text: studio
        ? `${studio.displayName} has no free slot ${when} that fits those filters. Try another day, or widen the time window — studios publish their own weekly hours, breaks and blocked time, and only genuinely free slots are offered.`
        : `Nothing is free ${when} with those filters. Try another day or widen the time window — closed days, breaks and existing appointments are already excluded, so an empty result really means "fully booked".`,
      handoff: { filters, center: parsed.center || ctx.center },
      chips: ['Any time tomorrow', 'Show me everything open today', 'Widen to 20 km'],
    };
  }

  const lines = scoped.slice(0, 5).map((h) => `${h.p.displayName}${h.p.verification === 'verified' ? ' ✓' : ''} — ${h.openSlots} free slot${h.openSlots === 1 ? '' : 's'}${h.dist ? ` · ${fmtKm(h.dist)}` : ''}`);
  return {
    kind: 'search',
    intent: 'availability',
    text: `${scoped.length} ${scoped.length === 1 ? 'studio is' : 'studios are'} free ${when}:\n\n${lines.join('\n')}\n\nSlots are checked against each studio's hours, breaks, blocked time and existing bookings, and re-checked again the moment you confirm — so two people cannot take the same slot.`,
    results: toRows(scoped),
    handoff: { filters, center: parsed.center || ctx.center },
    chips: ['Show these on the map', 'Cheapest first', 'Verified only'],
  };
}

function searchReply(parsed: ReturnType<typeof parseRequest>, ctx: AssistantContext): AssistantReply {
  const hits = searchProviders(ctx.db, parsed.filters, parsed.center);
  const lines = hits.slice(0, 5).map((h) => {
    const bits = [h.p.displayName];
    if (h.p.reviewCount) bits.push(`★ ${h.p.avg} (${h.p.reviewCount})`);
    bits.push(h.minPrice ? `from ${fmtRM(h.minPrice)}` : 'no price listed');
    bits.push(fmtKm(h.dist));
    if (h.p.verification === 'verified') bits.push('verified ✓');
    if (h.openSlots) bits.push(`${h.openSlots} slot${h.openSlots === 1 ? '' : 's'} free`);
    return `• ${bits.join(' · ')}`;
  });

  return {
    kind: 'search',
    intent: 'nl_search',
    text: `${parsed.reply}${lines.length ? `\n\n${lines.join('\n')}` : ''}\n\nTap "Show in Discover" to keep these filters and edit them like any other search.`,
    results: toRows(hits),
    handoff: { filters: parsed.filters, center: parsed.center },
    chips: parsed.matchCount
      ? ['Show in Discover', 'Only verified studios', 'Cheapest first']
      : ['Widen the budget', 'Any day this week', 'Show all categories'],
  };
}

function providerHowTo(raw: string, db: DB, user: User | null): AssistantReply {
  const profile = user ? db.profiles.find((p) => p.userId === user.id) : undefined;
  const lower = raw.toLowerCase();

  if (/\bverif|badge\b/.test(lower)) {
    if (profile?.verification === 'verified') {
      return {
        kind: 'answer',
        intent: 'provider_verification',
        text: `You are already verified ✓ — the badge is live on your profile and counted in your ranking.\n\nIt stays honest only while the profile stays honest: keep your hours, prices and portfolio accurate. If a report is substantiated, an admin can suspend the studio, which removes the badge and hides you from search until it is resolved.`,
        rows: [
          { label: 'Studio', value: profile.displayName },
          { label: 'Status', value: 'verified ✓' },
          { label: 'Rating', value: profile.reviewCount ? `★ ${profile.avg} (${profile.reviewCount})` : 'no reviews yet' },
        ],
        chips: ['How do I get more bookings?', 'Summarise my reviews', 'What does the verified badge mean to customers?'],
      };
    }
    if (profile?.verification === 'pending') {
      return {
        kind: 'answer',
        intent: 'provider_verification',
        text: `Your request is already in the admin queue — your studio shows as "verification requested", never as verified.\n\nAn admin reviews it by hand and either grants the badge or leaves you unverified. There is nothing to pay and nothing else to submit; the honest thing you can do meanwhile is keep your portfolio, hours and prices accurate.`,
        rows: profile ? [{ label: 'Studio', value: profile.displayName }, { label: 'Status', value: 'pending review' }] : undefined,
        chips: ['How do I get more bookings?', 'Summarise my reviews'],
      };
    }
    if (profile?.verification === 'suspended') {
      return {
        kind: 'answer',
        intent: 'provider_verification',
        text: `Your studio is suspended, so it is hidden from search and cannot take bookings or messages. Verification requests are blocked while suspended.\n\nCheck your notifications for the reason, fix what caused it, and contact Glamoora support to appeal — an admin can reinstate the studio, which returns it as unverified rather than verified.`,
        chips: ['How do reports work?', 'How do I get more bookings?'],
      };
    }
    const missing: string[] = [];
    if (profile) {
      if (!profile.displayName.trim()) missing.push('a display name');
      if (profile.bio.trim().length < 20) missing.push('a bio of at least 20 characters');
      if (!profile.categoryIds.length) missing.push('at least one category');
      if (!db.services.some((s) => s.providerId === profile.id && s.active)) missing.push('at least one active service');
      if (!db.availability.some((a) => a.providerId === profile.id && a.active)) missing.push('your weekly hours');
    }
    return {
      kind: 'answer',
      intent: 'provider_verification',
      text: missing.length
        ? `You are not ready to request verification yet. Missing: ${missing.join(', ')}.\n\nOnce those are in, open Studio → Request verification. An admin reviews it and grants the badge by hand — it is never automatic, and it is never for sale. While it is being reviewed your studio shows as "verification requested".`
        : `Your profile looks complete. Open Studio → Request verification and it goes into the admin queue with the status "verification requested". An admin reviews it and grants the badge by hand — it is never automatic.\n\nWhat actually helps an admin say yes: real photos of your own work, accurate weekly hours, services with honest prices and durations, and a bio that says what you specialise in.`,
      rows: profile
        ? [
            { label: 'Studio', value: profile.displayName },
            { label: 'Status', value: profile.verification },
            { label: 'Active services', value: String(db.services.filter((s) => s.providerId === profile.id && s.active).length) },
            { label: 'Rating', value: profile.reviewCount ? `★ ${profile.avg} (${profile.reviewCount})` : 'no reviews yet' },
          ]
        : undefined,
      chips: ['How do I get more bookings?', 'Write a service description for me', 'Summarise my reviews'],
    };
  }

  if (/\bmore bookings|grow|attract|get clients|increase\b/.test(lower)) {
    const p = profile;
    const openDays = p ? db.availability.filter((a) => a.providerId === p.id && a.active).length : 0;
    const services = p ? db.services.filter((s) => s.providerId === p.id && s.active).length : 0;
    const portfolio = p ? db.portfolio.filter((x) => x.providerId === p.id).length : 0;
    const pending = p ? db.bookings.filter((b) => b.providerId === p.id && b.status === 'pending').length : 0;
    return {
      kind: 'answer',
      intent: 'provider_growth',
      text: `Ranking in Discover is honest, not paid: the verified badge, your average rating, how many reviews you have, distance from the customer, and how many free slots you actually keep open.\n\nSo the levers are:\n1. Answer requests fast — ${pending} pending request(s) right now. Acceptance rate is shown to admins and drives your reputation.\n2. Publish real hours. ${openDays} day(s) open. More open days means more slots in every search result.\n3. Keep the portfolio fresh — ${portfolio} image(s). Customers decide with their eyes.\n4. ${services} active service(s). Clear names, honest durations and prices convert better than vague ones.\n5. Ask happy customers to review after the appointment (only completed bookings can be reviewed, so mark them complete).\n6. Avoid no-shows and cancellations; they drag the cancellation rate the admin dashboard watches.`,
      rows: p
        ? [
            { label: 'Pending requests', value: String(pending) },
            { label: 'Open days', value: `${openDays}/7` },
            { label: 'Portfolio', value: String(portfolio) },
            { label: 'Rating', value: p.reviewCount ? `★ ${p.avg} (${p.reviewCount})` : 'no reviews yet' },
          ]
        : undefined,
      chips: ['Write a service description for me', 'Suggest a bundle', 'How do I get verified?'],
    };
  }

  if (/\b(write|draft|caption|bundle|summar|description)\b/.test(lower)) {
    return {
      kind: 'answer',
      intent: 'provider_tools',
      text: `I can write that for you right here — everything is generated on your device from your own prices, durations, hours and review text, so nothing is invented and nothing is uploaded.\n\nUse the studio tools below (or the ✨ buttons in Services and Studio):\n• Write a service description — built from that service's real price, duration and location setting, and applied only when you tap "Apply".\n• Portfolio caption with tags — factual, varied per image so a gallery does not read identically.\n• Bundle ideas — pairs from your own catalogue at a 10% saving rounded to the nearest RM5, capped at five hours.\n• Review summary — a keyword count over your real reviews: what people praise, what they flag, and your star distribution.\n• Profile strength — the same checks the verification queue uses.`,
      chips: ['Write a service description for me', 'Suggest a bundle from my services', 'Summarise my reviews', 'How complete is my studio profile?'],
    };
  }

  if (/\badd|create|new\b/.test(lower) && /\bservice\b/.test(lower)) {
    return {
      kind: 'answer',
      intent: 'provider_service',
      text: `Services → New service. Fill in the name, category, price, duration, where it happens (your studio, the customer's place, or both) and a description.\n\nTwo things that matter: the duration drives the slot grid (a 90-minute service can never be offered in the last hour of your day), and the location type decides whether you appear in "comes to you" searches. I can draft the description for you — ask me to "write a service description".`,
      chips: ['Write a service description for me', 'Suggest a bundle', 'How do I set my hours?'],
    };
  }

  if (/\bhours|availability|schedule|break|block\b/.test(lower)) {
    return {
      kind: 'answer',
      intent: 'provider_hours',
      text: `Hours → toggle each day and set start/end. Add breaks (for example 13:00–14:00) and blocked dates (a wedding, a class, a holiday).\n\nSlots are generated from those three inputs plus each service's duration, in 30-minute steps, and any existing appointment is excluded. If you turn a day off, that day simply stops offering slots — bookings you already accepted are untouched.`,
      chips: ['How do I get more bookings?', 'Write a service description for me', 'Suggest a bundle'],
    };
  }

  return {
    kind: 'answer',
    intent: 'provider_generic',
    text: `I can help with the provider side of Glamoora:\n\n• Write a service description or a portfolio caption\n• Suggest a bundle from your existing services\n• Summarise your reviews and draft a reply\n• Explain verification, hours, slot generation, bookings and payments\n\nAsk me one of those, or use the ✨ buttons in Services and Studio.`,
    chips: ['How do I get verified?', 'How do I get more bookings?', 'Write a service description for me'],
  };
}

function fallback(parsed: ReturnType<typeof parseRequest>, ctx: AssistantContext): AssistantReply {
  const name = ctx.user ? ctx.user.name.split(' ')[0] : '';
  return {
    kind: 'answer',
    intent: 'fallback',
    text: `I did not recognise that as a marketplace request${name ? `, ${name}` : ''}. I only answer from what Glamoora actually holds — prices, durations, ratings, reviews, availability and the booking rules — and I will not guess.\n\nThings I do well:\n• "nail service under RM100 near me this Saturday"\n• "what is brow embroidery?"\n• "compare lash extensions and brow embroidery"\n• "how do I cancel a booking?"\n• "what does the verified badge mean?"\n${parsed.understood.length ? `\nI did pick up: ${parsed.understood.join(' · ')}.` : ''}`,
    chips: ctx.user?.role === 'provider' ? providerChips() : customerChips(false),
    handoff: parsed.understood.length ? { filters: parsed.filters, center: parsed.center } : null,
  };
}

function toRows(hits: ReturnType<typeof searchProviders>): AssistantResultRow[] {
  return hits.slice(0, 6).map((h) => ({
    id: h.p.id,
    name: h.p.displayName,
    sub: [h.p.addr, h.minPrice ? `from ${fmtRM(h.minPrice)}` : 'no price listed', h.openSlots ? `${h.openSlots} slots free` : '']
      .filter(Boolean)
      .join(' · '),
    dist: h.dist,
    price: h.minPrice,
    rating: h.p.avg,
    verified: h.p.verification === 'verified',
    slots: h.openSlots,
  }));
}

export function customerChips(isProvider: boolean): string[] {
  if (isProvider) return providerChips();
  return [
    'Nail service under RM100 near me this Saturday',
    'What is brow embroidery?',
    'Lash extensions vs brow embroidery',
    'How do I cancel a booking?',
    'What does verified mean?',
    'Massage at home tomorrow evening',
  ];
}

export function providerChips(): string[] {
  return [
    'Write a service description for me',
    'Suggest a bundle from my services',
    'Summarise my reviews',
    'How do I get verified?',
    'How do I get more bookings?',
    'How do slot times work?',
  ];
}

/* ------------------------------------------------------------------ */
/* provider writing tools (PRD Phase 16)                               */
/* ------------------------------------------------------------------ */

const LOCATION_WORD: Record<LocationType, string> = {
  provider: 'at the studio',
  customer: 'at your place',
  both: 'at the studio or at your place',
};

/** Deterministic service copy built from the studio's own inputs. */
export function draftServiceDescription(input: {
  serviceName: string;
  categoryName: string;
  price: number;
  duration: number;
  locationType: LocationType;
  studioName?: string;
}): string {
  const { serviceName, categoryName, price, duration, locationType, studioName } = input;
  const name = serviceName.trim() || categoryName;
  const cat = categoryName.toLowerCase();
  return [
    `${name} — ${durationLabel(duration)}, ${LOCATION_WORD[locationType]}.`,
    `A focused ${cat} session${studioName ? ` at ${studioName}` : ''}: consultation first, then the service itself, with clean tools and single-use consumables opened in front of you.`,
    `Includes: a short consultation to agree the look, the full ${durationLabel(duration)} service, and aftercare advice so it holds up in KL humidity.`,
    `Price ${fmtRM(price)}${locationType === 'customer' ? ' (travel within the studio service radius included; outside it, we will agree a fair travel fee before confirming)' : ''}. Bookings are confirmed by the studio, so you will always know before you travel.`,
  ].join('\n\n');
}

/** Caption + tag ideas for a portfolio image, varied by index so a gallery does not read identically. */
export function draftCaption(input: { serviceName: string; categoryName: string; index: number; studioName?: string }): { caption: string; tags: string[] } {
  const { serviceName, categoryName, index, studioName } = input;
  const cat = categoryName.toLowerCase();
  const angles = [
    `Fresh ${serviceName.toLowerCase()} — finished today${studioName ? ` at ${studioName}` : ''}.`,
    `${serviceName}: close-up of the finish, no filter and no editing.`,
    `Natural light, real result. ${serviceName} for a client who wanted something wearable every day.`,
    `Detail shot: ${serviceName.toLowerCase()} after the final step, before aftercare.`,
    `${serviceName} — this is what ${durationLabel(60)} of careful work looks like.`,
  ];
  const tagBase = [cat.split(' ')[0], serviceName.toLowerCase().split(' ')[0], 'kl', 'glamoora'];
  const extras = ['handmade', 'nolashloss', 'hygienefirst', 'bookable', 'beforeafter', 'malaysiabeauty'];
  const tags = [...new Set([...tagBase, extras[index % extras.length], `day${(index % 7) + 1}`])].filter(Boolean).slice(0, 6);
  return { caption: angles[index % angles.length], tags };
}

export interface BundleSuggestion {
  title: string;
  serviceIds: string[];
  services: string[];
  normalPrice: number;
  bundlePrice: number;
  saving: number;
  duration: number;
  rationale: string;
}

/** Pairs complementary services from the studio's own catalogue with an honest discount. */
export function suggestBundles(db: DB, providerId: string, catName: (id: string) => string): BundleSuggestion[] {
  const svcs = db.services.filter((s) => s.providerId === providerId && s.active);
  if (svcs.length < 2) return [];
  const out: BundleSuggestion[] = [];

  for (let i = 0; i < svcs.length; i++) {
    for (let j = i + 1; j < svcs.length; j++) {
      const a = svcs[i];
      const b = svcs[j];
      const sameCat = a.categoryId === b.categoryId;
      const total = a.duration + b.duration;
      if (total > 300) continue; // nobody books a five-hour combo
      const normal = a.price + b.price;
      const bundlePrice = Math.round((normal * 0.9) / 5) * 5;
      if (bundlePrice >= normal) continue;
      out.push({
        title: sameCat ? `${a.name} + ${b.name}` : `${a.name} & ${b.name} combo`,
        serviceIds: [a.id, b.id],
        services: [a.name, b.name],
        normalPrice: normal,
        bundlePrice,
        saving: normal - bundlePrice,
        duration: total,
        rationale: sameCat
          ? `Same category, one appointment — clients who book ${catName(a.categoryId).toLowerCase()} often add both.`
          : `Complementary categories (${catName(a.categoryId)} + ${catName(b.categoryId)}) in a single ${durationLabel(total)} visit.`,
      });
    }
  }

  out.sort((x, y) => y.saving - x.saving || x.duration - y.duration);
  return out.slice(0, 3);
}

export interface ReviewSummary {
  headline: string;
  strengths: string[];
  watch: string[];
  bestQuote: string | null;
  worstQuote: string | null;
  distribution: { star: number; count: number }[];
}

const THEME_WORDS: { label: string; words: string[] }[] = [
  { label: 'hygiene', words: ['clean', 'hygiene', 'hygienic', 'steril', 'sanit', 'fresh', 'tidy'] },
  { label: 'gentle / painless', words: ['gentle', 'painless', 'no pain', 'comfort', 'careful', 'soft'] },
  { label: 'lasting results', words: ['last', 'lasting', 'weeks', 'held', 'still', 'retention', 'durable'] },
  { label: 'punctual', words: ['time', 'punctual', 'early', 'on time', 'quick', 'fast', 'efficient'] },
  { label: 'value for money', words: ['worth', 'value', 'price', 'cheap', 'affordable', 'money'] },
  { label: 'friendly', words: ['friendly', 'warm', 'kind', 'patient', 'welcoming', 'chatty', 'lovely'] },
  { label: 'skill / detail', words: ['detail', 'precise', 'neat', 'symmetr', 'perfect', 'flawless', 'skil', 'talent'] },
];

const WATCH_WORDS: { label: string; words: string[] }[] = [
  { label: 'waiting / lateness', words: ['late', 'wait', 'waiting', 'delay', 'delayed'] },
  { label: 'pricing surprises', words: ['expensive', 'overpriced', 'extra charge', 'hidden'] },
  { label: 'communication', words: ['reply', 'response', 'respond', 'ignored', 'no answer', 'unreachable'] },
  { label: 'retention issues', words: ['fell', 'falling', 'shed', 'lifted', 'lifting', 'chipped', 'came off'] },
];

/** Keyword-frequency summary of real reviews — no invented sentiment. */
export function summariseReviews(reviews: Review[], studioName: string): ReviewSummary {
  const rated = reviews.filter((r) => r.rating > 0);
  if (!rated.length) {
    return { headline: `${studioName} has no reviews yet.`, strengths: [], watch: [], bestQuote: null, worstQuote: null, distribution: [] };
  }
  const avg = Math.round((rated.reduce((a, r) => a + r.rating, 0) / rated.length) * 10) / 10;
  const corpus = rated.map((r) => r.comment.toLowerCase());
  const count = (words: string[]) => corpus.filter((c) => words.some((w) => c.includes(w))).length;

  const strengths = THEME_WORDS.map((t) => ({ ...t, n: count(t.words) }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((t) => `${t.label} (${t.n})`);

  const watch = WATCH_WORDS.map((t) => ({ ...t, n: count(t.words) }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((t) => `${t.label} (${t.n})`);

  const sorted = [...rated].sort((a, b) => b.rating - a.rating || b.comment.length - a.comment.length);
  const best = sorted.find((r) => r.rating >= 4 && r.comment.length > 15);
  const worst = [...rated].sort((a, b) => a.rating - b.rating).find((r) => r.rating <= 3 && r.comment.length > 10);

  const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: rated.filter((r) => r.rating === star).length }));

  const fiveStar = distribution[0].count;
  const headline = `${studioName}: ★ ${avg} from ${rated.length} review${rated.length === 1 ? '' : 's'} — ${Math.round((fiveStar / rated.length) * 100)}% are 5-star.`;

  return {
    headline,
    strengths,
    watch,
    bestQuote: best ? `“${best.comment}” — ${best.rating}★` : null,
    worstQuote: worst ? `“${worst.comment}” — ${worst.rating}★` : null,
    distribution,
  };
}

/** A polite, specific reply a studio can post to a review. */
export function draftReplyToReview(review: Review, studioName: string, customerFirstName: string): string {
  if (review.rating >= 4) {
    return `Thank you, ${customerFirstName} — it meant a lot to have you at ${studioName}. Really glad the result landed the way you wanted. See you next time!`;
  }
  if (review.rating === 3) {
    return `Thank you for the honest feedback, ${customerFirstName}. I would like to make the next visit better — message me here and I will adjust the timing and finish to suit you.`;
  }
  return `I am sorry this did not meet your expectations, ${customerFirstName}. That is on me. Please message me directly so I can understand what went wrong and make it right.`;
}

export interface BioScore {
  score: number;
  tips: string[];
}

/** Honest profile-completeness coaching, using the same checks as verification. */
export function scoreProfile(db: DB, providerId: string): BioScore {
  const p = db.profiles.find((x) => x.id === providerId);
  if (!p) return { score: 0, tips: ['Profile not found.'] };
  const tips: string[] = [];
  let score = 0;

  const bioWords = p.bio.trim().split(/\s+/).filter(Boolean).length;
  if (bioWords >= 25) score += 25;
  else tips.push(`Your bio is ${bioWords} word(s). Aim for 25+: what you specialise in, your experience, and what a first visit feels like.`);

  if (p.categoryIds.length) score += 15;
  else tips.push('Pick at least one category — it is how customers find you in search.');

  const services = db.services.filter((s) => s.providerId === p.id && s.active);
  if (services.length >= 3) score += 20;
  else if (services.length) score += 10;
  if (services.length < 3) tips.push(`You have ${services.length} active service(s). Three or more converts better and fills more of the slot grid.`);

  const described = services.filter((s) => s.desc.trim().length > 40).length;
  if (services.length && described === services.length) score += 10;
  else if (services.length) tips.push(`${services.length - described} service(s) have a thin description. Say what is included and how long it lasts.`);

  const portfolio = db.portfolio.filter((x) => x.providerId === p.id);
  if (portfolio.length >= 6) score += 15;
  else if (portfolio.length) score += 8;
  if (portfolio.length < 6) tips.push(`${portfolio.length} portfolio image(s). Six or more real, unedited photos is what customers scan before booking.`);

  const captions = portfolio.filter((x) => x.caption.trim().length > 10).length;
  if (portfolio.length && captions === portfolio.length) score += 5;
  else if (portfolio.length) tips.push(`${portfolio.length - captions} portfolio image(s) have no useful caption.`);

  const openDays = db.availability.filter((a) => a.providerId === p.id && a.active).length;
  if (openDays >= 5) score += 10;
  else if (openDays) score += 5;
  if (openDays < 5) tips.push(`You are open ${openDays} day(s) a week. More open days means more slots in every search.`);

  if (p.verification === 'verified') score += 10;
  else if (p.verification === 'pending') score += 5;

  if (p.radiusKm >= 5) score += 5;
  else tips.push(`Your service radius is ${p.radiusKm} km. If you travel, widen it so "comes to you" searches find you.`);

  return { score: Math.min(100, score), tips };
}

/** Suggested portfolio tags derived from the studio's own categories. */
export function portfolioTags(db: DB, providerId: string): string[] {
  const p = db.profiles.find((x) => x.id === providerId);
  if (!p) return [];
  const cats = p.categoryIds.map((id) => db.categories.find((c) => c.id === id)).filter(Boolean) as Category[];
  const area = p.addr.split(',')[0].toLowerCase().replace(/\s+/g, '');
  return [...new Set([...cats.map((c) => c.name.toLowerCase()), ...cats.flatMap((c) => c.name.toLowerCase().split(' ')), area, 'klbeauty', 'glamoora', 'handmade'])].slice(0, 8);
}

/** A short studio blurb for cards, built from real data. */
export function studioTagline(db: DB, providerId: string): string {
  const p = db.profiles.find((x) => x.id === providerId);
  if (!p) return '';
  const cats = p.categoryIds.map((id) => db.categories.find((c) => c.id === id)?.name).filter(Boolean) as string[];
  const services = db.services.filter((s) => s.providerId === p.id && s.active);
  const lo = services.length ? Math.min(...services.map((s) => s.price)) : 0;
  const bits = [cats.slice(0, 2).join(' & ')];
  if (lo) bits.push(`from ${fmtRM(lo)}`);
  if (p.reviewCount) bits.push(`★ ${p.avg}`);
  if (services.some((s) => s.locationType !== 'provider')) bits.push('comes to you');
  if (p.verification === 'verified') bits.push('verified');
  return bits.filter(Boolean).join(' · ');
}
