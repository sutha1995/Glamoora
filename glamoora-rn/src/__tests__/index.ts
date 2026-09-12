/**
 * Verification entry point: `npm run verify`.
 *
 * Runs every suite against the real seeded marketplace data through the
 * repository seam, so the PRD's acceptance criteria are checked end to end:
 * slot generation, double-booking prevention, ownership rules, review rules,
 * mock payments, messaging, moderation, analytics and the offline AI parser.
 */
import { runSuite, summary } from './harness';
import { slotTests } from './slots.test';
import { searchTests } from './search.test';
import { bookingTests } from './booking.test';
import { messagingTests, moderationTests } from './messaging.test';
import { metricsTests } from './metrics.test';
import { assistantTests } from './assistant.test';
import { recommendTests } from './recommend.test';

async function main(): Promise<void> {
  console.log('Glamoora — marketplace rules & offline AI verification');
  console.log('(runs on plain Node against the seeded local repository)');

  await runSuite(slotTests);
  await runSuite(searchTests);
  await runSuite(bookingTests);
  await runSuite(messagingTests);
  await runSuite(moderationTests);
  await runSuite(metricsTests);
  await runSuite(assistantTests);
  await runSuite(recommendTests);

  process.exit(await summary());
}

main().catch((e) => {
  console.error('\nVerification crashed:', e);
  process.exit(1);
});
