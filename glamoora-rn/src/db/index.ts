/**
 * Backend selection — the one place a data store is chosen.
 *
 * Today: `localRepository` (seeded, offline, persisted to AsyncStorage /
 * localStorage). To move to the PRD-recommended Supabase + Postgres stack:
 *
 *   1. add `src/db/supabase.ts` exporting `supabaseRepository: Repository`
 *      (hydrate a local cache in `init()`, keep it fresh with Supabase
 *      Realtime, write through to Postgres, let RLS enforce ownership),
 *   2. create `.env` with EXPO_PUBLIC_BACKEND=supabase plus
 *      EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY,
 *   3. return it from `select()` below.
 *
 * No screen, component or domain rule changes — that is the point of the seam.
 */
import { localRepository } from './local';
import type { Repository } from './repository';

export type BackendKind = 'local' | 'supabase';

const BACKEND = (process.env.EXPO_PUBLIC_BACKEND || 'local') as BackendKind;

function select(): Repository {
  if (BACKEND === 'supabase') {
    // Intentional, visible fallback rather than a silent blank app.
    console.warn(
      '[glamoora] EXPO_PUBLIC_BACKEND=supabase but src/db/supabase.ts is not wired yet — using the local store.'
    );
  }
  return localRepository;
}

export const backend: BackendKind = BACKEND;
export const repo: Repository = select();
export type { Repository };
export { localRepository };
