/**
 * Slot engine (PRD Phase 6): "Available slots appear / Booked slots disappear /
 * Provider can block time / Overlapping bookings are prevented".
 */
import { clashes, conflictsWith, holdsSlot, slotsForDate } from '../domain/slots';
import { addDays, dISO, timeToMin, todayISO } from '../utils';
import { assert, assertEq, describe } from './harness';

const { it } = describe('Slot engine (PRD Phase 6)');

const win = { start: '10:00', end: '13:00' };
/** Far enough ahead that the same-day lead time never applies. */
const far = dISO(addDays(new Date(), 21));

export async function slotTests(): Promise<void> {
  it('generates a 30-minute grid inside the working window', () => {
    const slots = slotsForDate(win, [], [], [], 60, far);
    assertEq(slots.join(','), '10:00,10:30,11:00,11:30,12:00', 'grid for a 60-minute service');
    assertEq(slotsForDate(win, [], [], [], 30, far).join(','), '10:00,10:30,11:00,11:30,12:00,12:30', 'grid for a 30-minute service');
    assertEq(slotsForDate(win, [], [], [], 90, far).join(','), '10:00,10:30,11:00,11:30', 'grid for a 90-minute service');
  });

  it('returns nothing on a closed day', () => {
    assertEq(slotsForDate(undefined, [], [], [], 60, far).length, 0, 'closed day offers no slots');
  });

  it('never offers a slot that does not fit the remaining window', () => {
    assertEq(slotsForDate(win, [], [], [], 240, far).length, 0, '240 minutes cannot fit in a 180-minute window');
    assertEq(slotsForDate(win, [], [], [], 180, far).join(','), '10:00', 'exactly one 180-minute fit');
    assertEq(slotsForDate(win, [], [], [], 0, far).length, 0, 'a zero-length service is rejected');
  });

  it('removes slots that overlap a break', () => {
    const slots = slotsForDate(win, [{ start: '11:00', end: '12:00' }], [], [], 60, far);
    assertEq(slots.join(','), '10:00,12:00', 'break 11:00–12:00 also blocks 10:30 and 11:30 starts');
  });

  it('removes slots that overlap a blocked range', () => {
    const slots = slotsForDate(win, [], [{ start: '12:00', end: '13:00' }], [], 60, far);
    assertEq(slots.join(','), '10:00,10:30,11:00', 'blocked 12:00–13:00 removes 11:30 and 12:00 starts');
  });

  it('removes slots that overlap an existing appointment', () => {
    const slots = slotsForDate(win, [], [], [{ s: timeToMin('11:00'), e: timeToMin('12:00') }], 60, far);
    assertEq(slots.join(','), '10:00,12:00', 'busy 11:00–12:00');
  });

  it('combines breaks, blocks and appointments', () => {
    const slots = slotsForDate(
      { start: '09:00', end: '18:00' },
      [{ start: '13:00', end: '14:00' }],
      [{ start: '16:00', end: '17:00' }],
      [{ s: timeToMin('10:00'), e: timeToMin('11:00') }],
      60,
      far
    );
    assert(!slots.includes('10:00'), 'appointment removed');
    assert(!slots.includes('13:00'), 'break removed');
    assert(!slots.includes('16:00'), 'block removed');
    assert(slots.includes('09:00'), 'a free morning slot survives');
    assert(slots.includes('17:00'), 'a free evening slot survives');
  });

  it('hides slots that are too close to now on the current day', () => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const slots = slotsForDate({ start: '00:00', end: '23:59' }, [], [], [], 30, todayISO());
    slots.forEach((s) => assert(timeToMin(s) >= nowMin + 15, `${s} is inside the 15-minute lead time`));
    const future = slotsForDate({ start: '00:00', end: '23:59' }, [], [], [], 30, far);
    assert(future.length > slots.length || nowMin < 15, 'a future day offers the full grid');
  });

  it('treats appointments as half-open so back-to-back bookings work', () => {
    const busy = [{ start: '10:00', end: '11:00' }];
    assertEq(conflictsWith(busy, '11:00', '12:00'), false, 'starting exactly when the last one ends is fine');
    assertEq(conflictsWith(busy, '10:30', '11:30'), true, 'overlapping is rejected');
    assertEq(conflictsWith(busy, '09:00', '10:00'), false, 'ending exactly when the next one starts is fine');
    assertEq(conflictsWith(busy, '10:00', '11:00'), true, 'the identical slot is rejected');
  });

  it('clashes() considers breaks, blocks and appointments together', () => {
    assertEq(clashes(600, 660, [{ start: '10:30', end: '11:30' }], [], []), true, 'break clash');
    assertEq(clashes(600, 660, [], [{ start: '09:00', end: '10:15' }], []), true, 'block clash');
    assertEq(clashes(600, 660, [], [], [{ s: 659, e: 720 }]), true, 'appointment clash');
    assertEq(clashes(600, 660, [], [], []), false, 'nothing in the way');
  });

  it('cancelled and rejected bookings release their slot, others hold it', () => {
    assertEq(holdsSlot('cancelled'), false, 'cancelled releases');
    assertEq(holdsSlot('rejected'), false, 'rejected releases');
    assertEq(holdsSlot('pending'), true, 'pending holds');
    assertEq(holdsSlot('confirmed'), true, 'confirmed holds');
    assertEq(holdsSlot('completed'), true, 'completed holds');
    assertEq(holdsSlot('no_show'), true, 'a no-show still held the time');
  });
}
