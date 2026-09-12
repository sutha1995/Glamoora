# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Working in this repository

Glamoora is a beauty-services marketplace built to `../uploads/Glamoora_PRD.pdf`.
The full picture (PRD coverage, demo script, architecture, seed data) is in `../README.md`.

## Commands

```bash
npm run verify       # 122 assertions over the rules + AI, plain Node, no test framework
npx tsc --noEmit     # strict typecheck — must stay at 0 errors
npm run web          # dev server on :8081
npx expo export --platform web --output-dir /tmp/out   # the reliable way to see the route tree
```

Run `npm run verify` after touching anything in `src/domain`, `src/db`, `src/ai` or the
booking/review/moderation flows. If you change a rule, add an assertion for it in
`src/__tests__` — the suites are the spec.

## Architecture rules (keep these)

* **Dependencies point one way**: `app/**` → `components/**` → `db/core.ts` (facade) →
  `db/index.ts` (backend selection) → `db/local.ts`. `domain/**` and `ai/**` are pure:
  no React, no storage, no navigation imports. That is what makes them testable on Node.
* Screens never import `db/local` directly — use `db/core` (or `repo` from `db/index`).
  Swapping in Supabase must be a one-file change.
* Slot generation lives only in `domain/slots.ts`; search and filtering only in
  `domain/search.ts` (the AI parser and the Discover chips share it, so they cannot
  disagree); marketplace maths only in `domain/metrics.ts`.
* The AI layer is **offline and deterministic** — no model, no API key, no network.
  Answers must come from data that exists in the DB, and anything not understood must be
  reported rather than guessed.

## Product rules (from the PRD, enforced in `db/local.ts`)

* Never allow a double booking: re-derive slots at write time. `cancelled` and `rejected`
  release the time; `pending`, `confirmed`, `completed` and `no_show` hold it.
* Statuses: `pending → confirmed → completed`, plus `rejected`, `cancelled`, `no_show`.
  Illegal transitions are refused for customers, providers *and* admins.
* Ownership: customers cancel only their own pending booking; providers act only on their
  own bookings; only the customer on a completed booking may review it, once; only a
  participant who is also the signed-in account may post in a thread.
* **Honest verification**: a studio can request it (only with a complete profile); an admin
  grants it; suspension hides the studio from search, booking and messaging; reinstatement
  returns it as unverified. Never render a badge that was not granted.
* Payments are mocked: `unpaid → mock_paid → refunded`. Never imply a real charge.
* Averages are recomputed from the full review set — including after a moderator removes a
  review.
* No real customer PII, no hardcoded secrets, no paid placement in ranking or
  recommendations.

## Conventions that will bite you otherwise

* Every screen must tolerate a null session (`if (!u) return <View />` **after** all its
  hooks) — logout, deep links and hot reload otherwise crash mid-render.
* `useSegments()` returns **URL** segments with group folders stripped: `(customer)/home.tsx`
  is `['home']`, not `['(customer)', 'home']`. The route guard in `src/app/_layout.tsx` maps
  URL segments to role route-sets.
* A group's `index.tsx` maps to `/`, so `(admin)/index.tsx` would collide with the root
  index. Give group screens real filenames (`(admin)/admin.tsx` → `/admin`).
* Do not declare `<Stack.Screen name="(group)" />` for layout-less groups — their children
  are hoisted and auto-discovered; declaring them warns "No route named … exists".
* RN 0.86: use `boxShadow: '0 4px 12px rgba(…)'`, not the deprecated `shadow*` props
  (they warn on every render).
* Validate icon names against
  `node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json`
  before using them — an invalid name warns at runtime (e.g. `spa` does not exist; use
  `hand-left`).
* When the seed shape changes, bump `DB_VERSION` in `src/db/local.ts` and `v` in
  `src/data/seed.ts` together, or persisted caches will load stale data.
* Demo accounts all use the password `demo123` (see `../README.md`).
