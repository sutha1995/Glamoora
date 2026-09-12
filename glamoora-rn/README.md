# Glamoora — the app

Expo (SDK 57) · React Native 0.86 · expo-router · TypeScript strict.
Runs offline on a seeded local store: no backend, no API keys, no network needed to demo.

**Full documentation lives in [`../README.md`](../README.md)** — PRD coverage, architecture,
the AI layer, marketplace rules, demo script and demo logins. Conventions for working in
this codebase are in [`AGENTS.md`](AGENTS.md).

## Run it

```bash
npm install
npm run web          # http://localhost:8081
npm start            # then press w / a / i for web, Android, iOS
```

Sign in with any demo account, password `demo123`:
`maya@glamoora.my` (customer) · `aina@glamoora.my` (studio) · `admin@glamoora.my` (admin).

## Check it

```bash
npm run verify       # 122 assertions: slot engine, bookings, reviews, payments,
                     # messaging, moderation, analytics, search, AI parser, assistant
npx tsc --noEmit     # strict typecheck, 0 errors
npx expo export --platform web --output-dir /tmp/out   # prints the whole route tree
```

`npm run verify` needs no test framework. `scripts/verify.mjs` compiles the
storage-agnostic modules with the project's own `tsc`, writes minimal shims for the two
React Native modules the data layer touches, then runs `src/__tests__` on plain Node.

## Layout

```
src/app/          routes: (customer) (provider) (admin) (shared) + auth, index, _layout
src/components/   cards · chat · mapview · metrics · report(s) · topbar · ui
src/ai/           nlsearch (words → filters) · assistant (Q&A + provider writing tools)
                  · recommend (explainable suggestions) — all offline and deterministic
src/domain/       pure rules: slots · search · metrics
src/db/           repository (contract) · local (seeded impl) · index (backend selection)
                  · core (facade screens import) · storage (KV)
src/data/seed.ts  the demo dataset
src/__tests__/    the verification suites (run with npm run verify)
```

## Swapping in a real backend

`src/db/repository.ts` is the seam. Implement `supabaseRepository: Repository` in
`src/db/supabase.ts`, set `EXPO_PUBLIC_BACKEND=supabase`, and return it from `select()` in
`src/db/index.ts`. No screen, component or domain rule changes — until then, that env var
logs a visible warning and falls back to the local store rather than showing a blank app.
