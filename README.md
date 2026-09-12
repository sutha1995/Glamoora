# Glamoora

**A beauty-services marketplace for Malaysia** — customers discover verified lash, brow,
massage, nail, saree-draping, waxing and hair artists near them, see real prices and
genuinely free time slots, book in a few taps, and review only after the appointment
actually happened. Studios get a dashboard, a catalogue, a slot calendar, messaging and
analytics; Glamoora gets a moderation console.

Built to the product spec in [`uploads/Glamoora_PRD.pdf`](uploads/Glamoora_PRD.pdf) with
Expo (SDK 57, React Native 0.86), expo-router and TypeScript in strict mode. It runs
**fully offline** on a seeded local store — no backend, no API keys, no network needed to
demo it.

```
glamoora-rn/     the Expo app (everything below refers to this folder)
glamoora/        an earlier single-file prototype, kept for reference
uploads/         the PRD
```

---

## Quick start

```bash
cd glamoora-rn
npm install
npm run web          # http://localhost:8081 — fastest way to see it
npm start            # Expo dev server: press w / a / i for web, Android, iOS
```

Then check the rules before you trust the UI:

```bash
npm run verify       # 122 assertions over the marketplace engine + AI, on plain Node
npx tsc --noEmit     # strict typecheck, 0 errors
npx expo export --platform web --output-dir /tmp/out   # verifies the whole route tree
```

`npm run verify` needs no test framework: it compiles the storage-agnostic modules with
the project's own `tsc`, drops in minimal shims for the two React Native modules the data
layer touches, and runs `src/__tests__` on Node.

---

## Demo logins

Every account uses the password **`demo123`**.

| Role | Email | Who they are |
| --- | --- | --- |
| Customer | `maya@glamoora.my` | Maya Wong, Bukit Bintang — has completed, pending and confirmed bookings, favourites and message threads |
| Customer | `lina@glamoora.my` | Lina Ahmad, KLCC — two completed bookings at the same studio, so repeat recommendations fire |
| Customer | `cindy@glamoora.my` | Cindy Teo, Bangsar — filed a report against a portfolio image |
| Customer | `nadia@glamoora.my` | Nadia Ibrahim, Cheras — browsed but never booked |
| Provider | `aina@glamoora.my` | Aina Lash Studio (verified, 4.9★, lash + brow) |
| Provider | `melissa@glamoora.my` | Tan Nails & Spa (verified, nail + massage) |
| Provider | `priya@glamoora.my` | Priya's Saree Atelier (verified, 5.0★) |
| Provider | `mei@glamoora.my` | Chen Nail Art — **unverified, mobile**, good for the verification-queue story |
| Provider | `zul@glamoora.my` | Zul Brows & Beyond — unverified, newest studio |
| Admin | `admin@glamoora.my` | Moderation console, verification queue, marketplace metrics |

Reset everything to the seed at any time — **Profile → Reset demo data** as a customer,
**Settings → Danger zone** as a provider. When the seed shape changes, bump `DB_VERSION` in
`src/db/local.ts` (and `v` in `src/data/seed.ts`) so persisted caches re-seed instead of
loading stale data.

---

## A five-minute demo script

1. **Customer loop** — sign in as Maya. Home shows *Recommended for you* with the real
   reason on each card ("you have been here 2 times", "on your favourites list").
2. **AI search** — tap **Ask in your own words** and type
   `I need a nail service under RM100 near me this Saturday`. The assistant parses it into
   category, budget, radius and date, shows matching studios, and *Show in Discover* hands
   the filters over — where they are ordinary chips you can edit or clear.
3. **Map** — in Discover switch to **Map**: pannable, zoomable, with distance rings,
   service-radius rings and a card per marker. No tiles, no API key.
4. **Book** — open a studio, pick a service, pick a date: only genuinely free slots are
   offered. Confirm → status `pending`. Try to book the same slot as another customer: it
   is refused.
5. **Provider side** — sign in as Aina (`aina@glamoora.my`). A pending request is waiting
   in *Needs your attention*. Accept → the customer gets a notification. Mark it complete →
   the customer can now review it. Try the ✨ tools: write a service description, get a
   portfolio caption with tags, see bundle maths, read a review summary.
6. **Review** — back as Maya, review the completed booking. The studio's average is
   recomputed from every review it has.
7. **Trust** — as admin (`admin@glamoora.my`) open the console: verification queue
   (Mei's request), reports, and marketplace metrics with the full funnel from PRD §16.
   Suspend a studio and watch it vanish from search, bookings and messaging.

---

## Architecture

Four layers, with dependencies pointing one way only:

```
src/app/**            screens (expo-router, file-based routes)
src/components/**     presentational pieces: cards, chat, map, metrics, reports, ui
src/ai/**             offline AI: nlsearch, assistant, recommend
src/domain/**         pure rules: slots, search, metrics   ← no storage, no navigation
src/db/**             the seam: repository (contract) → local (impl) → index (selection)
src/data/seed.ts      the demo dataset
```

**`src/domain` is pure.** `slots.ts` generates the slot grid from working hours, breaks,
blocked ranges, existing appointments, service duration and a 15-minute lead time on the
current day. `search.ts` is the single matcher used by both the manual filter chips and
the AI parser, so the two can never disagree. `metrics.ts` computes acceptance,
cancellation, completion and repeat rates, GMV, and an actor-based sequential funnel.
None of them import storage or React — which is why they are directly testable on Node.

**`src/db` is the swap point.** `repository.ts` defines the contract (60+ methods:
lookups, availability, bookings, reviews, favourites, catalogue, verification, analytics,
moderation, messaging). `local.ts` implements it over an in-memory seeded DB persisted to
AsyncStorage / localStorage. `index.ts` picks the implementation from
`EXPO_PUBLIC_BACKEND`. Screens import friendly names from `core.ts`, never a concrete
backend.

To move to Supabase later:

1. add `src/db/supabase.ts` exporting `supabaseRepository: Repository` — hydrate a local
   cache in `init()`, keep it fresh with Realtime, write through to Postgres;
2. set `EXPO_PUBLIC_BACKEND=supabase` plus the URL and anon key in `.env`;
3. return it from `select()` in `src/db/index.ts`.

No screen, component or domain rule changes. Row Level Security then enforces server-side
the same ownership rules `local.ts` already enforces client-side.

### Routes

`/auth` · `/home` · `/discover` · `/bookings` · `/favourites` · `/profile` ·
`/provider/[id]` · `/book/[id]` · `/book-success/[id]` · `/review/[id]` · `/dashboard` ·
`/calendar` · `/services` · `/hours` · `/studio` · `/settings` · `/admin` ·
`/notifications` · `/messages` · `/chat/[id]` · `/assistant`

The root layout guards every route by URL segment against role route-sets (public, shared,
customer, provider, admin): signed-in users may always reach the shared screens
(notifications, messages, chat, assistant) and are otherwise redirected to their own role
home. Every screen also survives a null session, so logout, deep links and hot reload
cannot crash it.

---

## The AI layer: offline, deterministic, honest

PRD Phase 16 asks for AI. This implementation uses **no model, no API key and no network**
— which means no latency, no cost, no vendor risk, and a demo that cannot fail on venue
Wi-Fi. It is also auditable: the same input always produces the same output, and
`npm run verify` asserts that.

**`src/ai/nlsearch.ts` — natural language → real filters.**
`"I need a nail service under RM100 near me this Saturday"` becomes
`{cat: c4, maxPrice: 100, maxDist: 5, date: <next Saturday>}`. It also reads Malay and
Manglish (`murah`, `esok`, `pagi`, `dekat Bangsar`, `nak`), named areas (which move the
search centre), explicit clock times (`after 3pm`), `top rated` → 4.5★, `verified only`,
`at home` → comes-to-you, and weekday/weekend/`in 3 days` dates. It reports both what it
understood **and** what it ignored, rather than silently guessing.

**`src/ai/assistant.ts` — the assistant.**
Explains categories, quotes live price and duration ranges from actual listings, compares
two categories or two named studios, and answers booking, cancellation, rescheduling,
payment, verification, reporting and review questions from the rules this app really
implements — including the awkward truths ("there is no reschedule button; cancel and
rebook", "payments are mocked; nothing is charged"). Provider tools generate service
descriptions, portfolio captions with tags, bundle ideas (a 10% saving rounded to the
nearest RM5, capped at five hours), review summaries by keyword frequency over real review
text, review reply drafts, and a profile-strength score that mirrors the verification
checks.

**`src/ai/recommend.ts` — explainable recommendations.**
Ranked from the customer's own favourites, completed bookings and browsing events. Every
card carries the true reason. Suspended studios can never appear, and neither can a studio
the customer already has an appointment with.

**Guardrails.** Medical questions are refused before anything else: the assistant does not
diagnose, advise on pregnancy, allergies, infections or skin conditions, and says so while
pointing to a professional (PRD Phase 16: *"Do not use AI for medical diagnosis or medical
claims"*). Verification status is never embellished — a studio is `verified` only when an
admin granted it, `pending` while queued, and unverified otherwise.

---

## Rules that are enforced, not just drawn

* **No double booking.** Slots are re-derived at write time from hours, breaks, blocked
  ranges and every booking that still holds its slot; `cancelled` and `rejected` release
  the time immediately.
* **Status machine.** `pending → confirmed → completed` (or `rejected` / `cancelled` /
  `no_show`). Illegal jumps are refused for customers, providers and admins alike.
* **Ownership.** Customers may only cancel their own pending booking; providers may only
  act on their own bookings; only the customer on a completed booking may review it, once;
  only a participant who is also the signed-in account may post in a thread.
* **Honest verification.** A studio can *request* verification only with a complete
  profile; the badge is granted by an admin; suspension hides the studio from search,
  booking and messaging; reinstatement returns it as unverified.
* **Mock payments only.** `unpaid → mock_paid → refunded`, nothing else. No card, no
  gateway, no money.
* **Reviews recompute averages** from the full review set, including after a moderator
  removes one, so ratings can never drift or hide a removal.

---

## Testing

`npm run verify` — 122 assertions across seven suites:

| Suite | Covers |
| --- | --- |
| Slot engine | grid generation, closed days, breaks, blocks, appointments, lead time, half-open adjacency, released statuses |
| Search & filters | category, price, rating, distance, centre override, location type, verified-only, availability windows, sorting, free text |
| AI search | the PRD demo sentence, time of day, `top rated`, area re-centring, home service, Malay/Manglish, clock times, honest "missed" reporting, question routing, medical refusal, filter hand-off round-trip |
| Booking lifecycle | creation, double-booking prevention, invalid slots, closed days, inactive services, suspended studios, transitions, ownership, cancellation releasing slots, review rules, mock payments, admin overrides, notifications, analytics |
| Messaging | one thread per pair, booking links, unread counts, read receipts, replies, non-participants, impersonation, empty/over-long messages, suspended studios, ordering |
| Moderation | verification requests and refusals, admin-granted badge, report dedupe, content removal with rating recompute, portfolio removal, suspension hiding a studio from search, reinstatement, "no action" |
| Analytics | metrics input, headline rates by hand, repeat customers, actor-based conversion, divide-by-zero, out-of-order events, funnel shape, provider reach, event attribution and ordering |
| AI assistant | medical refusal, grounded answers, honest fallback, greeting per role, category and price explainers, comparisons, studio profiles, booking/cancel/reschedule/payment/verification/report/review answers, availability, hand-off, provider intents, and every writing tool |
| Recommendations | truthful reasons, suspended excluded, upcoming bookings excluded, repeat ranking, favourites, determinism, limit and ordering, real availability claims, last-viewed, category affinity |

---

## The seeded dataset

8 studios across 7 categories in 8 KL/Selangor areas, with 13 accounts, 31 services, 36
portfolio items, 46 weekly availability rows, 10 breaks, 1 blocked range, 9 bookings
(5 completed, 2 confirmed, 1 pending, 1 rejected), 11 reviews, 3 conversations with 9
messages, 3 reports, 6 notifications and 99 analytics events — synthesised so the funnel,
conversion and repeat-booking numbers are non-trivial on first launch. 5 studios are
verified, 1 is in the verification queue, 2 are unverified.

All data is fictional. No real customer PII, no real credentials, no secrets anywhere in
the repository.

---

## What is deliberately *not* built

* **Real payments.** Mocked behind the payment state machine, as the PRD allows for a
  hackathon build. Swapping in Stripe or a Malaysian gateway means implementing that
  abstraction, not touching the booking flow.
* **A real backend.** The repository seam is in place; Supabase is not wired because no
  credentials exist for this project. `EXPO_PUBLIC_BACKEND=supabase` currently logs a
  visible warning and falls back to the local store rather than showing a blank app.
* **Map tiles.** The map is a projected canvas with markers, rings and pan/zoom. Dropping
  in `react-native-maps` means replacing one component (`src/components/mapview.tsx`);
  everything above it already speaks in lat/lng.
* **Push notifications.** In-app notification centre only.
* **Image upload.** Portfolio items are deterministic gradient tiles with captions.
* **Real authentication.** Demo email + password against the seeded user list; no hashing,
  no sessions, no OAuth.
* **A learned AI model.** The assistant is rule-based by design (see above). Its seams —
  `parseRequest`, `askAssistant`, `recommendFor` — are where an LLM or a real
  recommendation model could be introduced later without touching the UI.

---

## PRD coverage

| Phase | Scope | Status |
| --- | --- | --- |
| 0–3 | Foundations, design system, auth, roles | done |
| 4 | Provider profiles, services, portfolio | done |
| 5 | Discovery: search, filters, sorting, categories | done (+ map view) |
| 6 | Availability, breaks, blocked time, slot engine | done |
| 7 | Booking flow with double-booking prevention | done |
| 8 | Provider dashboard and calendar | done |
| 9 | Booking management, statuses, notifications | done |
| 10 | Reviews and rating recomputation | done |
| 11 | Favourites | done |
| 12 | Notification centre | done |
| 13 | Messaging between customer and studio | done |
| 14 | Mock payments behind an abstraction | done |
| 15 | Admin: moderation, reports, verification queue, category control | done |
| 16 | AI: NL search, assistant, provider tools, recommendations | done (offline, deterministic) |
| §16 | Analytics events, funnel, marketplace metrics | done |
| §21 | Tests and build checks after each phase | done (`npm run verify`) |
