/**
 * Tiny zero-dependency test harness.
 *
 * `npm run verify` compiles src/__tests__ with the project's own tsc and runs
 * the result on plain Node — no jest, no extra installs, works offline.
 *
 * Suites register their cases and are then run immediately (see `runSuite`),
 * so each suite can set up its own database state without leaking into others.
 */
export interface Case {
  suite: string;
  name: string;
  fn: () => void | Promise<void>;
}

export const cases: Case[] = [];
const failures: string[] = [];
let passed = 0;
let total = 0;

export function describe(suite: string) {
  return {
    it(name: string, fn: Case['fn']) {
      cases.push({ suite, name, fn });
    },
  };
}

export function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertIncludes(hay: string, needle: string, msg: string): void {
  if (!hay.includes(needle)) throw new Error(`${msg} — "${hay}" does not contain "${needle}"`);
}

export function assertInRange(n: number, lo: number, hi: number, msg: string): void {
  if (!(n >= lo && n <= hi)) throw new Error(`${msg} — ${n} is not within [${lo}, ${hi}]`);
}

/** Run whatever is registered, then clear the queue. */
export async function runRegistered(): Promise<void> {
  let current = '';
  for (const c of cases) {
    if (c.suite !== current) {
      current = c.suite;
      console.log(`\n${c.suite}`);
    }
    total += 1;
    try {
      await c.fn();
      passed += 1;
      console.log(`  ✓ ${c.name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${c.suite} › ${c.name}: ${msg}`);
      console.log(`  ✗ ${c.name}\n      ${msg}`);
    }
  }
  cases.length = 0;
}

/** Register a suite (its setup runs first) and execute it right away. */
export async function runSuite(register: () => void | Promise<void>): Promise<void> {
  await register();
  await runRegistered();
}

export async function summary(): Promise<number> {
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`${passed}/${total} checks passed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  • ' + f));
    return 1;
  }
  console.log('Marketplace rules, search and AI parsing all behave as specified.');
  return 0;
}
