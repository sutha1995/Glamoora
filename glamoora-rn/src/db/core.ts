/**
 * Compatibility facade over the active `Repository`.
 *
 * Screens import these friendly names; every call delegates to `repo`, so the
 * concrete backend (local today, Supabase later) is chosen once in
 * `src/db/index.ts`. New code should prefer `import { repo } from '../db'`.
 */
import { repo } from './index';
import type { Booking, Review } from '../types';
import type { BookingAction } from './repository';

export { repo };
export { slotsForDate, SLOT_GRID_MIN, LEAD_TIME_MIN } from '../domain/slots';
export { DB_VERSION } from './local';

/* ---------------- lifecycle ---------------- */
export const initDB = () => repo.init();
export const saveDB = () => repo.save();
export const resetDB = () => repo.reset();
export const isReady = () => repo.isReady();
export const getDB = () => repo.snapshot();

/* ---------------- session ---------------- */
export const me = () => repo.me();
export const setSession = (userId: string | null) => repo.setSession(userId);

/* ---------------- lookups ---------------- */
export const userById = (id: string) => repo.userById(id);
export const profileOf = (id: string) => repo.profileOf(id);
export const myProfile = () => repo.myProfile();
export const servicesOf = (providerId: string) => repo.servicesOf(providerId);
export const activeServicesOf = (providerId: string) => repo.activeServicesOf(providerId);
export const serviceOf = (id: string | null | undefined) => repo.serviceOf(id);
export const catOf = (id: string) => repo.catOf(id);
export const reviewsOf = (providerId: string) => repo.reviewsOf(providerId);
export const portfolioOf = (providerId: string) => repo.portfolioOf(providerId);
export const isFav = (customerId: string, providerId: string) => repo.isFav(customerId, providerId);
export const unreadCount = (userId: string) => repo.unreadCount(userId);
export const customerName = (id: string) => repo.customerName(id);
export const minPrice = (providerId: string) => repo.minPrice(providerId);

/* ---------------- availability ---------------- */
export const availMap = (providerId: string) => repo.availMap(providerId);
export const providerSlots = (providerId: string, serviceId: string, date: string) =>
  repo.providerSlots(providerId, serviceId, date);

/* ---------------- bookings ---------------- */
export function createBooking(
  customerId: string,
  serviceId: string,
  date: string,
  start: string | null,
  location: string,
  notes: string
): { err?: string; booking?: Booking } {
  const res = repo.createBooking({ customerId, serviceId, date, start, location, notes });
  return res.err ? { err: res.err } : { booking: res.value };
}

export const setBookingStatus = (bookingId: string, byCustomer: boolean, action: BookingAction) =>
  repo.setBookingStatus(bookingId, byCustomer, action);
export const setBookingStatusAdmin = (bookingId: string, status: Parameters<typeof repo.setBookingStatusAdmin>[1]) =>
  repo.setBookingStatusAdmin(bookingId, status);
export const setPaymentStatus = (bookingId: string, status: Parameters<typeof repo.setPaymentStatus>[1]) =>
  repo.setPaymentStatus(bookingId, status);

/* ---------------- reviews ---------------- */
export function addReview(
  bookingId: string,
  rating: number,
  comment: string
): { err?: string; review?: Review } {
  const res = repo.addReview(bookingId, rating, comment);
  return res.err ? { err: res.err } : { review: res.value };
}

/* ---------------- favourites ---------------- */
export const toggleFavourite = (customerId: string, providerId: string) =>
  repo.toggleFavourite(customerId, providerId);

/* ---------------- provider catalogue ---------------- */
export const upsertService = (svc: Parameters<typeof repo.upsertService>[0]) => repo.upsertService(svc);
export const deleteService = (id: string) => repo.deleteService(id);
export const setServiceActive = (id: string, active: boolean) => repo.setServiceActive(id, active);
export const addPortfolioItem = (providerId: string, serviceId: string, art: string, caption: string) =>
  repo.addPortfolioItem(providerId, serviceId, art, caption);
export const removePortfolioItem = (id: string) => repo.removePortfolioItem(id);

/* ---------------- availability management ---------------- */
export const setAvailability = (providerId: string, day: number, on: boolean, start?: string, end?: string) =>
  repo.setAvailability(providerId, day, on, start, end);
export const addBreak = (providerId: string, day: number, start: string, end: string) =>
  repo.addBreak(providerId, day, start, end);
export const removeBreak = (id: string) => repo.removeBreak(id);
export const addBlocked = (providerId: string, date: string, start: string, end: string, reason: string) =>
  repo.addBlocked(providerId, date, start, end, reason);
export const removeBlocked = (id: string) => repo.removeBlocked(id);

/* ---------------- trust, verification, admin ---------------- */
export const setVerification = (providerId: string, v: Parameters<typeof repo.setVerification>[1]) =>
  repo.setVerification(providerId, v);
export const requestVerification = (providerId: string) => repo.requestVerification(providerId);
export const setCategoryActive = (id: string, active: boolean) => repo.setCategoryActive(id, active);

/* ---------------- analytics ---------------- */
export const track = (input: Parameters<typeof repo.track>[0]) => repo.track(input);
export const events = () => repo.events();

/* ---------------- moderation ---------------- */
export const fileReport = (input: Parameters<typeof repo.fileReport>[0]) => repo.fileReport(input);
export const resolveReport = (
  reportId: string,
  resolution: string,
  action: Parameters<typeof repo.resolveReport>[2],
  status?: Parameters<typeof repo.resolveReport>[3]
) => repo.resolveReport(reportId, resolution, action, status);
export const reports = () => repo.reports();

/* ---------------- messaging ---------------- */
export const conversationsFor = (userId: string) => repo.conversationsFor(userId);
export const openConversation = (customerId: string, providerId: string, bookingId?: string | null) =>
  repo.openConversation(customerId, providerId, bookingId);
export const conversationById = (id: string) => repo.conversationById(id);
export const messagesOf = (conversationId: string) => repo.messagesOf(conversationId);
export const sendMessage = (conversationId: string, senderId: string, body: string) =>
  repo.sendMessage(conversationId, senderId, body);
export const markThreadRead = (conversationId: string, userId: string) =>
  repo.markThreadRead(conversationId, userId);
export const unreadMessages = (userId: string) => repo.unreadMessages(userId);
