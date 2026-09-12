/**
 * Messaging (PRD Phase 13) and moderation / verification (PRD Phase 15).
 */
import { localRepository as repo } from '../db/local';
import { EMPTY_FILTERS, searchProviders } from '../domain/search';
import { AREAS } from '../data/seed';
import { assert, assertEq, describe } from './harness';

const msg = describe('Messaging (PRD Phase 13)');
const mod = describe('Moderation & verification (PRD Phase 15)');

const CUSTOMER = 'umaya';
const OTHER_CUSTOMER = 'ulina';
const STRANGER = 'ucindy';
const STUDIO = 'p1';
const OWNER = 'uaina';
const HOME = { lat: AREAS[0].lat, lng: AREAS[0].lng, label: 'Bukit Bintang' };

function threadWith(customerId: string, providerId: string) {
  return repo.openConversation(customerId, providerId).id;
}

export async function messagingTests(): Promise<void> {
  await repo.reset();

  msg.it('keeps one conversation per customer/studio pair', () => {
    const first = threadWith(CUSTOMER, STUDIO);
    const second = threadWith(CUSTOMER, STUDIO);
    assertEq(first, second, 'same thread id');
    assertEq(
      repo.snapshot().conversations.filter((c) => c.customerId === CUSTOMER && c.providerId === STUDIO).length,
      1,
      'only one conversation row'
    );
  });

  msg.it('links a thread to a booking when one is supplied', () => {
    const booking = repo.snapshot().bookings.find((b) => b.customerId === CUSTOMER && b.providerId === STUDIO);
    const cid = repo.openConversation(CUSTOMER, STUDIO, booking?.id ?? null).id;
    assertEq(repo.conversationById(cid)!.bookingId, booking?.id ?? null, 'booking linked');
  });

  msg.it('delivers a message and marks it unread for the recipient only', () => {
    const cid = threadWith(CUSTOMER, STUDIO);
    const before = repo.unreadMessages(OWNER);
    repo.setSession(CUSTOMER);
    const res = repo.sendMessage(cid, CUSTOMER, 'Hi Aina — do you still have Saturday morning free?');
    assert(!res.err, `send should succeed: ${res.err}`);
    assertEq(repo.unreadMessages(OWNER), before + 1, 'provider sees one unread');
    assertEq(repo.unreadMessages(CUSTOMER), 0, 'sender has nothing unread');
    assertEq(repo.messagesOf(cid).slice(-1)[0].readBy.join(','), CUSTOMER, 'read by the sender');
    assertEq(repo.snapshot().notifs.filter((n) => n.userId === OWNER).length > 0, true, 'provider was notified');
  });

  msg.it('clears unread state when the recipient opens the thread', () => {
    const cid = threadWith(CUSTOMER, STUDIO);
    repo.setSession(OWNER);
    repo.markThreadRead(cid, OWNER);
    assertEq(repo.unreadMessages(OWNER), 0, 'inbox cleared');
  });

  msg.it('lets the provider reply and the customer see it as unread', () => {
    const cid = threadWith(CUSTOMER, STUDIO);
    repo.setSession(OWNER);
    const res = repo.sendMessage(cid, OWNER, 'Yes! 11:00 is still free.');
    assert(!res.err, `provider reply should succeed: ${res.err}`);
    assertEq(repo.unreadMessages(CUSTOMER), 1, 'customer has one unread');
    assertEq(repo.messagesOf(cid).length >= 2, true, 'both messages stored');
  });

  msg.it('blocks anyone who is not in the conversation', () => {
    const cid = threadWith(CUSTOMER, STUDIO);
    const countBefore = repo.messagesOf(cid).length;
    repo.setSession(STRANGER);
    const res = repo.sendMessage(cid, STRANGER, 'let me in');
    assert(!!res.err, 'strangers cannot post into someone else\'s thread');
    assertEq(repo.messagesOf(cid).length, countBefore, 'nothing was stored');
  });

  msg.it('blocks impersonation: the sender must be the signed-in account', () => {
    const cid = threadWith(CUSTOMER, STUDIO);
    repo.setSession(STRANGER);
    const res = repo.sendMessage(cid, CUSTOMER, 'pretending to be Maya');
    assert(!!res.err, 'cannot send as another user');
  });

  msg.it('rejects empty and over-long messages', () => {
    const cid = threadWith(CUSTOMER, STUDIO);
    repo.setSession(CUSTOMER);
    assert(!!repo.sendMessage(cid, CUSTOMER, '   ').err, 'blank message refused');
    assert(!!repo.sendMessage(cid, CUSTOMER, 'x'.repeat(1001)).err, 'over 1000 characters refused');
    assert(!!repo.sendMessage('missing-thread', CUSTOMER, 'hi').err, 'unknown thread refused');
  });

  msg.it('refuses messages to a suspended studio', () => {
    const cid = threadWith(OTHER_CUSTOMER, STUDIO);
    repo.setSession(OTHER_CUSTOMER);
    repo.setVerification(STUDIO, 'suspended');
    const res = repo.sendMessage(cid, OTHER_CUSTOMER, 'hello?');
    assert(!!res.err, 'suspended studios cannot receive messages');
    assert(/suspended/i.test(res.err!), 'explains why');
    repo.setVerification(STUDIO, 'verified');
  });

  msg.it('lists a user\'s threads newest first and hides unrelated ones', () => {
    repo.setSession(CUSTOMER);
    repo.sendMessage(threadWith(CUSTOMER, STUDIO), CUSTOMER, 'one more');
    const threads = repo.conversationsFor(CUSTOMER);
    assert(threads.length > 0, 'customer has threads');
    const stamps = threads.map((t) => t.lastAt);
    assert(stamps.every((s, i) => i === 0 || s <= stamps[i - 1]), 'sorted newest first');
    assertEq(repo.conversationsFor('uadmin').length, 0, 'an admin who is not in a thread sees none');
    assert(repo.conversationsFor(OWNER).length > 0, 'the studio owner sees the same thread');
  });

  repo.setSession(null);
}

export async function moderationTests(): Promise<void> {
  await repo.reset();
  const db = repo.snapshot();

  mod.it('never auto-grants the verified badge on request', () => {
    const p = db.profiles.find((x) => x.verification === 'unverified' && x.bio.length > 20)!;
    const res = repo.requestVerification(p.id);
    assert(!res.err, `a complete studio should be able to ask: ${res.err}`);
    assertEq(repo.profileOf(p.id)!.verification, 'pending', 'goes to the queue, not to verified');
    assertEq(
      repo.snapshot().notifs.filter((n) => n.type === 'verification_request').length > 0,
      true,
      'admins were notified'
    );
  });

  mod.it('refuses duplicate, verified and suspended verification requests', () => {
    const queued = db.profiles.find((x) => x.verification === 'pending')!;
    assert(!!repo.requestVerification(queued.id).err, 'already in the queue');
    assert(!!repo.requestVerification(STUDIO).err, 'already verified');
    repo.setVerification('p6', 'suspended');
    assert(!!repo.requestVerification('p6').err, 'suspended studios must contact support');
    assert(!!repo.requestVerification('missing').err, 'unknown studio');
    repo.setVerification('p6', 'unverified');
  });

  mod.it('refuses incomplete studios', () => {
    const bare = db.profiles.find((x) => x.verification === 'unverified')!;
    const bio = bare.bio;
    bare.bio = 'short';
    const res = repo.requestVerification(bare.id);
    assert(!!res.err, 'a thin profile cannot be queued');
    assert(/bio/i.test(res.err!), 'says what is missing');
    bare.bio = bio;
  });

  mod.it('grants the badge only from the admin side and tells the studio', () => {
    const p = db.profiles.find((x) => x.verification === 'pending')!;
    repo.setVerification(p.id, 'verified');
    assertEq(repo.profileOf(p.id)!.verification, 'verified', 'badge applied by an admin');
    const note = repo.snapshot().notifs.find((n) => n.userId === p.userId && n.type === 'verification');
    assert(!!note, 'the studio was notified');
    assert(/verified/i.test(note!.title), 'notification says verified');
  });

  mod.it('records a report once per reporter and target', () => {
    const target = db.reviews[0];
    const first = repo.fileReport({ reporterId: STRANGER, targetType: 'review', targetId: target.id, reason: 'Offensive language', detail: 'Rude wording about the artist' });
    assert(!first.err, `report should be accepted: ${first.err}`);
    assertEq(first.value!.status, 'open', 'starts open');
    assert(!!repo.fileReport({ reporterId: STRANGER, targetType: 'review', targetId: target.id, reason: 'Spam' }).err, 'duplicate refused');
    const other = repo.fileReport({ reporterId: OTHER_CUSTOMER, targetType: 'review', targetId: target.id, reason: 'Spam' });
    assert(!other.err, 'a different reporter can still report it');
    assert(!!repo.fileReport({ reporterId: STRANGER, targetType: 'review', targetId: 'missing', reason: 'Spam' }).err, 'unknown content refused');
    assert(!!repo.fileReport({ reporterId: STRANGER, targetType: 'review', targetId: db.reviews[1].id, reason: '   ' }).err, 'reason required');
  });

  mod.it('removes an offending review and recomputes the studio rating', () => {
    const target = repo.snapshot().reviews[0];
    const providerId = target.providerId;
    const report = repo.fileReport({ reporterId: 'unadia', targetType: 'review', targetId: target.id, reason: 'Offensive language' }).value!;
    assert(!!report, 'the report was accepted');

    const res = repo.resolveReport(report.id, 'Removed: abusive language', 'remove_content');
    assert(!res.err, `resolve should succeed: ${res.err}`);

    const after = repo.snapshot();
    assert(!after.reviews.some((r) => r.id === target.id), 'review deleted');
    const closed = after.reports.find((r) => r.id === report.id)!;
    assertEq(closed.status, 'resolved', 'report closed');
    assertEq(closed.resolution, 'Removed: abusive language', 'resolution recorded');
    assert(closed.resolvedAt !== null, 'timestamped');

    const kept = after.reviews.filter((r) => r.providerId === providerId);
    const p = repo.profileOf(providerId)!;
    assertEq(p.reviewCount, kept.length, 'review count updated');
    assertEq(p.avg, kept.length ? Math.round((kept.reduce((a, r) => a + r.rating, 0) / kept.length) * 10) / 10 : 0, 'average recomputed');
    assert(!!repo.resolveReport(report.id, 'again', 'none').err, 'cannot resolve twice');
  });

  mod.it('removes an offending portfolio image', () => {
    const p = repo.snapshot().profiles.find((x) => repo.portfolioOf(x.id).length > 0)!;
    const itemId = repo.portfolioOf(p.id)[0].id;
    const report = repo.fileReport({ reporterId: OTHER_CUSTOMER, targetType: 'portfolio', targetId: itemId, reason: 'Watermarked / stolen image' }).value!;
    const res = repo.resolveReport(report.id, 'Image removed', 'remove_content');
    assert(!res.err, `resolve should succeed: ${res.err}`);
    assert(!repo.portfolioOf(p.id).some((i) => i.id === itemId), 'image removed from the gallery');
    assert(!repo.snapshot().portfolio.some((i) => i.id === itemId), 'image removed from the store');
  });

  mod.it('suspending a studio hides it from discovery and reinstating brings it back', () => {
    const target = 'p6';
    const report = repo.fileReport({ reporterId: STRANGER, targetType: 'provider', targetId: target, reason: 'No-shows and fake portfolio' }).value!;
    const listed = () => searchProviders(repo.snapshot(), EMPTY_FILTERS, HOME).some((h) => h.p.id === target);

    assert(listed(), 'searchable before suspension');
    repo.resolveReport(report.id, 'Suspended after two substantiated no-show reports', 'suspend_provider');
    assertEq(repo.profileOf(target)!.verification, 'suspended', 'studio suspended');
    assertEq(listed(), false, 'gone from search');
    assert(!!repo.requestVerification(target).err, 'suspended studios cannot re-queue themselves');

    const reinstate = repo.fileReport({ reporterId: 'uadmin', targetType: 'provider', targetId: target, reason: 'Appeal accepted' }).value!;
    repo.resolveReport(reinstate.id, 'Reinstated after appeal', 'reinstate_provider');
    assertEq(repo.profileOf(target)!.verification, 'unverified', 'back as unverified, not auto-verified');
    assertEq(listed(), true, 'searchable again');
  });

  mod.it('"no action" keeps the content in place', () => {
    const target = repo.snapshot().reviews[0];
    const report = repo.fileReport({ reporterId: 'uadmin', targetType: 'review', targetId: target.id, reason: 'Spam', detail: 'false alarm' }).value!;
    assert(!!report, 'the report was accepted');
    repo.resolveReport(report.id, '', 'none');
    assert(repo.snapshot().reviews.some((r) => r.id === target.id), 'review kept');
    const closed = repo.snapshot().reports.find((r) => r.id === report.id)!;
    assertEq(closed.status, 'resolved', 'still closed');
    assertEq(closed.resolution, 'No action needed', 'default resolution text');
  });

  mod.it('blocks suspending a booking into an impossible state', () => {
    assert(!!repo.resolveReport('missing-report', 'x', 'none').err, 'unknown report refused');
  });

  mod.it('records moderation analytics events', () => {
    const names = repo.events().map((e) => e.name);
    assert(names.includes('report_filed'), 'report_filed tracked');
    assert(names.includes('report_resolved'), 'report_resolved tracked');
  });
}
