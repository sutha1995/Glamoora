/**
 * AI natural-language search (PRD Phase 16, Priority 4).
 *
 * "I need a nail service under RM100 near me this Saturday" becomes real,
 * editable marketplace filters: category, budget, distance, date, time window.
 *
 * Runs entirely on-device and deterministically — no API key, no network, no
 * latency, and the demo cannot fail on venue Wi-Fi (PRD §17/§21). It also
 * understands Malay/Manglish phrasing, which matters for a KL marketplace.
 *
 * Everything the parser did NOT understand is reported back so the UI can be
 * honest about it instead of silently guessing.
 */
import type { Category, DB } from '../types';
import {
  EMPTY_FILTERS,
  partLabel,
  readableDate,
  searchProviders,
  type SearchCenter,
  type SearchFilters,
} from '../domain/search';
import { addDays, dISO, parseISO, todayISO } from '../utils';

export interface NlContext {
  db: DB;
  /** Where distances are measured from (the customer's location by default). */
  center: SearchCenter;
  areas: { name: string; lat: number; lng: number }[];
  categories: Category[];
}

export interface NlParse {
  filters: SearchFilters;
  /** Chips describing what was understood, in reading order. */
  understood: string[];
  /** Notable words that could not be mapped to a filter. */
  missed: string[];
  reply: string;
  intent: 'search' | 'question';
  matchCount: number;
  /** Provider ids that matched, best first. */
  hits: { id: string; name: string; dist: number; price: number; slots: number }[];
  /** Set when an area name moved the search centre. */
  center: SearchCenter;
}

/* ----------------------------- vocabulary ----------------------------- */

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  c1: ['lash', 'lashes', 'eyelash', 'eyelashes', 'lash extension', 'lash extensions', 'volume lash', 'classic lash', 'bulu mata', 'eyelash extension'],
  c2: ['brow', 'brows', 'eyebrow', 'eyebrows', 'brow embroidery', 'microblading', 'microblade', 'micro blade', 'powder brow', 'ombre brow', 'brow lamination', 'kening'],
  c3: ['massage', 'massages', 'spa', 'deep tissue', 'aromatherapy', 'reflexology', 'foot massage', 'body massage', 'urut', 'pijat', 'relaxing massage'],
  c4: ['nail', 'nails', 'manicure', 'pedicure', 'mani', 'pedi', 'gel', 'gel manicure', 'acrylic', 'nail art', 'manicure and pedicure', 'kuku'],
  c5: ['saree', 'sari', 'saree draping', 'drape', 'draping', 'pudavai', 'wedding drape'],
  c6: ['wax', 'waxing', 'hair removal', 'hair-removal', 'brazilian wax', 'leg wax', 'facial wax', 'hard wax', 'smooth skin'],
  c7: ['hair', 'haircut', 'hair cut', 'blowdry', 'blow dry', 'blowout', 'colour', 'color', 'balayage', 'highlight', 'highlights', 'keratin', 'hair styling', 'hairstyle', 'event hair', 'bridal hair', 'rambut', 'hair spa'],
};

const STOPWORDS = new Set([
  'i', 'im', "i'm", 'me', 'my', 'mine', 'we', 'you', 'your', 'a', 'an', 'the', 'and', 'or', 'but',
  'need', 'want', 'wants', 'looking', 'look', 'for', 'to', 'do', 'does', 'did', 'can', 'could',
  'would', 'should', 'please', 'pls', 'kindly', 'am', 'is', 'are', 'be', 'been', 'there', 'here',
  'any', 'some', 'someone', 'somebody', 'anyone', 'anything', 'something', 'find', 'get', 'book',
  'booking', 'appointment', 'session', 'service', 'services', 'treatment', 'around', 'about',
  'also', 'just', 'really', 'very', 'quite', 'maybe', 'preferably', 'prefer', 'ideally', 'with',
  'without', 'who', 'where', 'when', 'how', 'what', 'which', 'why', 'near', 'nearly', 'of', 'in',
  'at', 'on', 'by', 'from', 'up', 'this', 'that', 'these', 'those', 'it', 'its', 'as', 'so',
  'make', 'made', 'have', 'has', 'had', 'go', 'going', 'wanting', 'search', 'searching', 'show',
  'list', 'recommend', 'suggestion', 'suggestions', 'good', 'best', 'nice', 'new', 'glamoora',
]);

const QUESTION_STARTERS = /^(what|whats|what's|how|why|when|where|who|which|can you|could you|is it|are|do|does|should|explain|tell me|compare|difference|versus|vs)\b/i;

/** Words that mean "medical" — the assistant must not give medical advice. */
const MEDICAL = [
  'allergy', 'allergic', 'infection', 'infected', 'pregnant', 'pregnancy', 'diabetes', 'eczema',
  'psoriasis', 'rash', 'wound', 'bleeding', 'blood', 'pain', 'painful', 'hurts', 'swollen',
  'swelling', 'medicine', 'medication', 'doctor', 'diagnosis', 'diagnose', 'cure', 'treat a condition',
  'symptom', 'symptoms', 'safe for my skin', 'skin condition', 'disease', 'therapy for', 'heal',
  'keloid', 'fungus', 'fungal', 'virus', 'bacteria', 'cancer',
];

/* ----------------------------- helpers ----------------------------- */

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_MS = ['ahad', 'isnin', 'selasa', 'rabu', 'khamis', 'jumaat', 'sabtu'];
const WEEKDAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function nextWeekday(from: Date, target: number, forceNextWeek: boolean): Date {
  let delta = (target - from.getDay() + 7) % 7;
  if (delta === 0) delta = forceNextWeek ? 7 : 0; // "this Saturday" can mean today
  else if (forceNextWeek) delta += 7;
  return addDays(from, delta);
}

/* ----------------------------- the parser ----------------------------- */

export function parseRequest(text: string, ctx: NlContext): NlParse {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const toks = tokens(raw);
  const consumed = new Set<number>();
  const understood: string[] = [];
  const filters: SearchFilters = { ...EMPTY_FILTERS };
  let center: SearchCenter = ctx.center;
  let sortDesc = false;
  let budgetHint = false;

  const mark = (words: string[], chip: string) => {
    words.forEach((w) => {
      const needle = w.toLowerCase();
      toks.forEach((t, i) => {
        if (t === needle) consumed.add(i);
      });
    });
    if (chip && !understood.includes(chip)) understood.push(chip);
  };

  /* --- 1. category (longest synonym first) --- */
  const catEntries: { id: string; syn: string }[] = [];
  ctx.categories.forEach((c) => {
    const syns = CATEGORY_SYNONYMS[c.id] || [];
    // also allow the category's own words
    [...syns, ...c.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)].forEach((s) => {
      if (s) catEntries.push({ id: c.id, syn: s });
    });
  });
  catEntries.sort((a, b) => b.syn.split(' ').length - a.syn.split(' ').length || b.syn.length - a.syn.length);
  for (const e of catEntries) {
    const words = e.syn.split(' ');
    const hay = ' ' + toks.join(' ') + ' ';
    if (hay.includes(' ' + e.syn + ' ') || (words.length === 1 && toks.includes(e.syn))) {
      filters.cat = e.id;
      const c = ctx.categories.find((x) => x.id === e.id);
      mark(words, c?.name || e.syn);
      break;
    }
  }

  /* --- 2. budget --- */
  const priceRe = /(?:under|below|less than|no more than|not more than|max(?:imum)?|up to|budget(?: of)?|around|about|bawah|kurang dari|dalam)\s*(?:rm|myr)?\s*(\d{2,4})/i;
  const priceRe2 = /(?:rm|myr)\s*(\d{2,4})\s*(?:or less|and below|ke bawah|max(?:imum)?)/i;
  const priceRe3 = /(\d{2,4})\s*(?:ringgit|rm|bucks)/i;
  const m = raw.match(priceRe) || raw.match(priceRe2) || raw.match(priceRe3);
  if (m) {
    const v = parseInt(m[1], 10);
    if (v >= 10 && v <= 100000) {
      filters.maxPrice = v;
      mark(m[0].split(/\s+/), `≤ RM${v}`);
    }
  } else if (/\b(cheap|cheapest|affordable|budget|low cost|murah|jimat)\b/i.test(lower)) {
    filters.maxPrice = 120;
    filters.sort = 'price_asc';
    mark([RegExp.$1 || 'cheap'], 'affordable (≤ RM120)');
    budgetHint = true;
  } else if (/\b(premium|luxury|expensive|high end|mahal)\b/i.test(lower)) {
    filters.sort = 'price_desc';
    sortDesc = true;
    mark([RegExp.$1 || 'premium'], 'premium');
  }

  /* --- 3. rating --- */
  const ratingRe = /(\d(?:\.\d)?)\s*(?:\+\s*)?(?:star|stars|rating)/i;
  const rm2 = raw.match(ratingRe);
  if (rm2) {
    const v = parseFloat(rm2[1]);
    if (v >= 1 && v <= 5) {
      filters.minRating = v;
      mark(rm2[0].split(/\s+/), `${v}+ stars`);
    }
  } else if (/\b(top rated|best rated|highest rated|highly rated|well rated|good reviews|great reviews|trusted|reliable)\b/i.test(lower)) {
    filters.minRating = 4.5;
    mark([RegExp.$1 ? RegExp.$1.split(/\s+/)[0] : 'top'], '4.5+ stars');
  }

  /* --- 4. verified --- */
  if (/\b(verified|verified only|badged|certified|legit|official)\b/i.test(lower)) {
    filters.verified = true;
    mark([RegExp.$1 || 'verified'], 'verified only');
  }

  /* --- 5. distance + area --- */
  const kmRe = /(?:within|under|below|less than|no more than|max)?\s*(\d{1,3})\s*(?:km|kilomet|kilometer|min)\b/i;
  const km = raw.match(kmRe);
  if (km) {
    const v = parseInt(km[1], 10);
    if (v > 0 && v <= 200) {
      filters.maxDist = v;
      mark(km[0].split(/\s+/), `within ${v} km`);
    }
  }
  const nearMe = /\b(near me|nearby|close by|close to me|around me|walking distance|berdekatan|dekat sini|dekat dengan saya|hampir)\b/i.test(lower);
  if (nearMe && !filters.maxDist) {
    filters.maxDist = 5;
    mark(['near', 'me'], `within 5 km of ${ctx.center.label}`);
  }

  // Named area moves the search centre (and implies a radius).
  const areaHit = findArea(raw, toks, ctx.areas);
  if (areaHit) {
    center = { lat: areaHit.lat, lng: areaHit.lng, label: areaHit.name.split(',')[0].trim() };
    areaHit.matched.forEach((w) => mark([w], ''));
    if (!filters.maxDist) {
      filters.maxDist = 10;
      understood.push(`around ${areaHit.name}`);
    } else {
      understood.push(`of ${areaHit.name}`);
    }
  }

  /* --- 6. date --- */
  const now = new Date();
  const dateHit = parseDate(lower, toks, now);
  if (dateHit) {
    filters.date = dateHit.iso;
    dateHit.words.forEach((w) => mark([w], ''));
    understood.push(`on ${readableDate(dateHit.iso)}`);
  }

  /* --- 7. time of day --- */
  const timeHit = parseTimeWindow(raw, lower, toks);
  if (timeHit) {
    filters.timeFrom = timeHit.from;
    filters.timeTo = timeHit.to;
    timeHit.words.forEach((w) => mark([w], ''));
    understood.push(partLabel(timeHit.from, timeHit.to));
  }

  /* --- 8. service location type --- */
  if (/\b(at home|at my home|my place|my house|come to me|comes to me|mobile|home service|house call|to my place|datang rumah|buat di rumah)\b/i.test(lower)) {
    filters.comesToYou = true;
    filters.type = 'customer';
    mark(['home', 'mobile'], 'comes to you');
  } else if (/\b(at the studio|at studio|at the salon|at salon|in salon|in the salon|at her studio|at their studio|walk in|walk-in|di studio|di salon)\b/i.test(lower)) {
    filters.type = 'provider';
    mark(['studio', 'salon'], 'at the studio');
  }

  /* --- 9. availability phrasing --- */
  if (/\b(available|availability|free|slot|slots|open|bookable|can book|able to book|ada slot|kosong)\b/i.test(lower)) {
    if (!filters.date && !filters.openToday) {
      filters.openToday = true;
      understood.push('open today');
    } else {
      understood.push('with a free slot');
    }
    mark(['available', 'slot', 'free', 'open'], '');
  }

  /* --- 10. residual free text -> name/service search --- */
  const residual = toks.filter((t, i) => !consumed.has(i) && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  if (!filters.cat && residual.length) {
    filters.q = residual.join(' ');
    understood.push(`“${filters.q}”`);
  }
  const missed = residual.filter((t) => filters.cat || !filters.q?.includes(t)).slice(0, 4);

  /* --- sort defaults --- */
  if (!sortDesc && !budgetHint && filters.maxPrice && !filters.sort) filters.sort = 'price_asc';

  const hitsAll = searchProviders(ctx.db, filters, center);
  const actionable = !!(filters.maxPrice || filters.date || filters.timeFrom || filters.timeTo || filters.maxDist || filters.openToday);
  const isQuestion = QUESTION_STARTERS.test(raw) && !actionable;

  return {
    filters,
    understood: dedupe(understood),
    missed: dedupe(missed),
    reply: buildReply(raw, dedupe(understood), dedupe(missed), hitsAll.length, center, isQuestion),
    intent: isQuestion ? 'question' : 'search',
    matchCount: hitsAll.length,
    hits: hitsAll.slice(0, 6).map((h) => ({
      id: h.p.id,
      name: h.p.displayName,
      dist: h.dist,
      price: h.minPrice,
      slots: h.openSlots,
    })),
    center,
  };
}

function dedupe(list: string[]): string[] {
  return list.filter((x, i) => x && list.indexOf(x) === i);
}

function findArea(raw: string, toks: string[], areas: { name: string; lat: number; lng: number }[]) {
  const lower = raw.toLowerCase();
  const aliases: Record<string, string[]> = {
    'Bukit Bintang, KL': ['bukit bintang'],
    'KLCC, KL': ['klcc', 'kl cc'],
    'Bangsar, KL': ['bangsar'],
    'Mont Kiara, KL': ['mont kiara'],
    'Damansara, KL': ['damansara'],
    'Cheras, KL': ['cheras'],
    'Petaling Jaya, SY': ['petaling jaya', 'pj'],
    'Subang Jaya, SY': ['subang jaya', 'subang', 'ss15'],
  };
  for (const a of areas) {
    const names = aliases[a.name] || [a.name.split(',')[0].toLowerCase()];
    for (const n of names) {
      if (new RegExp(`\\b${n.replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower)) {
        return { ...a, matched: n.split(' ') };
      }
    }
  }
  void toks;
  return null;
}

function parseDate(lower: string, toks: string[], today: Date): { iso: string; words: string[] } | null {
  const push = (d: Date, words: string[]) => ({ iso: dISO(d), words });

  if (/\b(today|tonight|hari ini|harini|malam ini)\b/.test(lower)) {
    return push(today, RegExp.$1.split(/\s+/));
  }
  if (/\b(tomorrow|tmr|tmrw|esok)\b/.test(lower)) {
    return push(addDays(today, 1), [RegExp.$1]);
  }
  if (/\b(day after tomorrow|lusa)\b/.test(lower)) return push(addDays(today, 2), ['lusa']);
  if (/\b(next week|minggu depan|nextweek)\b/.test(lower)) return push(addDays(today, 7), ['next', 'week']);
  if (/\b(this weekend|weekend|hujung minggu|sat(?:urday)? or sun(?:day)?)\b/.test(lower)) {
    return push(nextWeekday(today, 6, false), ['weekend']);
  }
  const inDays = lower.match(/\bin (\d{1,2}) days?\b/);
  if (inDays) return push(addDays(today, parseInt(inDays[1], 10)), inDays[0].split(/\s+/));

  const forceNext = /\bnext\b/.test(lower);
  for (let i = 0; i < 7; i++) {
    const names = [WEEKDAYS_EN[i], WEEKDAYS_MS[i], WEEKDAYS_SHORT[i]];
    for (const n of names) {
      if (new RegExp(`\\b${n}\\b`).test(lower)) {
        const d = nextWeekday(today, i, forceNext);
        return push(d, n.split(/\s+/));
      }
    }
  }
  const onThe = lower.match(/\bon the (\d{1,2})(?:st|nd|rd|th)?\b/);
  if (onThe) {
    const day = parseInt(onThe[1], 10);
    const d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d < today) d.setMonth(d.getMonth() + 1);
    return push(d, onThe[0].split(/\s+/));
  }
  void toks;
  return null;
}

function parseTimeWindow(raw: string, lower: string, toks: string[]): { from: number; to: number; words: string[] } | null {
  const afterRe = /\bafter (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const beforeRe = /\bbefore (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const am = raw.match(afterRe);
  if (am) {
    const mins = toMinutes(am[1], am[2], am[3]);
    return { from: mins, to: 0, words: am[0].split(/\s+/) };
  }
  const bm = raw.match(beforeRe);
  if (bm) {
    const mins = toMinutes(bm[1], bm[2], bm[3]);
    return { from: 0, to: mins, words: bm[0].split(/\s+/) };
  }
  if (/\b(morning|pagi)\b/.test(lower)) return { from: 5 * 60, to: 12 * 60, words: [RegExp.$1] };
  if (/\b(lunch(?: ?time)?|tengah hari|midday|noon)\b/.test(lower)) return { from: 12 * 60, to: 14 * 60, words: [RegExp.$1] };
  if (/\b(afternoon|petang)\b/.test(lower)) return { from: 12 * 60, to: 17 * 60, words: [RegExp.$1] };
  if (/\b(evening|night|tonight|malam|after work|afterwork)\b/.test(lower)) return { from: 17 * 60, to: 23 * 60 + 59, words: [RegExp.$1] };
  void toks;
  return null;
}

function toMinutes(hStr: string, mStr: string | undefined, ap: string | undefined): number {
  let h = parseInt(hStr, 10);
  const m = mStr ? parseInt(mStr, 10) : 0;
  const isPm = ap ? ap.toLowerCase() === 'pm' : h < 8; // "after 3" usually means 3pm
  if (isPm && h < 12) h += 12;
  if (!isPm && h === 12) h = 0;
  return h * 60 + m;
}

function buildReply(raw: string, understood: string[], missed: string[], count: number, center: SearchCenter, isQuestion: boolean): string {
  if (isQuestion) {
    return 'That reads like a question rather than a search — I can answer it below, or rephrase it as a request like “lash extensions under RM150 near me tomorrow evening”.';
  }
  if (!understood.length) {
    return `I could not find any filters in “${raw}”. Try something like: “nail service under RM100 near me this Saturday morning”.`;
  }
  const parts = understood.join(' · ');
  let reply = `Understood: ${parts}. Distances are measured from ${center.label}.`;
  if (count === 0) {
    reply += ' No studios match all of that yet — try widening the budget, distance or date.';
  } else {
    reply += ` ${count} ${count === 1 ? 'studio matches' : 'studios match'}.`;
  }
  if (missed.length) reply += ` I ignored: ${missed.join(', ')}.`;
  return reply;
}

/* ----------------------------- medical guard ----------------------------- */

/** PRD Phase 16: "Do not use AI for medical diagnosis or medical claims." */
export function medicalGuard(text: string): string | null {
  const lower = text.toLowerCase();
  const hit = MEDICAL.find((w) => new RegExp(`\\b${w}\\b`).test(lower));
  if (!hit) return null;
  return `I can't help with “${hit}” — Glamoora's assistant does not give medical advice, diagnoses or health claims. Please speak to a doctor or a licensed healthcare professional. I can still help you find a studio, compare services, prices and availability, or explain how booking works.`;
}

/** Serialize filters for a hand-off to Discover via a route param. */
export function encodeFilters(f: SearchFilters, center: SearchCenter | null): string {
  return encodeURIComponent(JSON.stringify({ f, c: center }));
}

export function decodeFilters(param: string | undefined): { filters: SearchFilters; center: SearchCenter | null } | null {
  if (!param) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(param)) as { f: Partial<SearchFilters>; c: SearchCenter | null };
    return { filters: { ...EMPTY_FILTERS, ...parsed.f }, center: parsed.c || null };
  } catch {
    return null;
  }
}

/** Today's ISO date, exposed so screens and the parser agree on "now". */
export function today(): string {
  return todayISO();
}

export function isoFor(offsetDays: number): string {
  return dISO(addDays(new Date(), offsetDays));
}

export function weekdayOf(iso: string): number {
  return parseISO(iso).getDay();
}
