/**
 * Repository contract — the single seam between the UI and the data store.
 *
 * Every screen reads/writes through this interface (via `repo`), never through
 * a concrete backend. Today the only implementation is `localRepository`
 * (seeded, offline, AsyncStorage/localStorage). Swapping in Supabase later
 * means writing `supabaseRepository` against this same interface and changing
 * one line in `src/db/index.ts` — no screen changes.
 *
 * Why the methods are synchronous: the app is offline-first. A Supabase
 * implementation keeps the same shape by hydrating a local cache on `init()`
 * and keeping it fresh with Supabase Realtime, then writing through to
 * Postgres. Row Level Security (PRD §14) still enforces the same ownership
 * rules that `assert*` helpers below enforce client-side.
 */
import type {
  AnalyticsEvent,
  AnalyticsEventName,
  Booking,
  BookingStatus,
  Category,
  Conversation,
  DB,
  Message,
  PaymentStatus,
  PortfolioItem,
  ProviderProfile,
  Report,
  ReportStatus,
  ReportTarget,
  Review,
  Role,
  Service,
  User,
  Verification,
} from '../types';
import type { Window } from '../domain/slots';

export type BookingAction = 'accept' | 'reject' | 'cancel' | 'complete' | 'noshow';

export interface Ok<T> {
  err?: string;
  value?: T;
}

export interface TrackInput {
  name: AnalyticsEventName;
  /** Defaults to the signed-in user; 'system' when there is none. */
  actorId?: string;
  providerId?: string;
  bookingId?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface NewBookingInput {
  customerId: string;
  serviceId: string;
  date: string;
  start: string | null;
  location: string;
  notes: string;
}

export interface NewReportInput {
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: string;
  detail?: string;
}

export type ReportAction = 'none' | 'remove_content' | 'suspend_provider' | 'reinstate_provider';

export interface Repository {
  /* ---------------- lifecycle ---------------- */
  init(): Promise<void>;
  save(): Promise<void>;
  reset(): Promise<void>;
  isReady(): boolean;
  /**
   * The whole dataset as a locally cached, mutable snapshot.
   * Local backend: the live object. Remote backend: the synced cache.
   */
  snapshot(): DB;

  /* ---------------- session ---------------- */
  me(): User | null;
  setSession(userId: string | null): void;

  /* ---------------- lookups ---------------- */
  userById(id: string): User | undefined;
  profileOf(id: string): ProviderProfile | undefined;
  myProfile(): ProviderProfile | undefined;
  servicesOf(providerId: string): Service[];
  activeServicesOf(providerId: string): Service[];
  serviceOf(id: string | null | undefined): Service | undefined;
  catOf(id: string): Category | undefined;
  reviewsOf(providerId: string): Review[];
  portfolioOf(providerId: string): PortfolioItem[];
  isFav(customerId: string, providerId: string): boolean;
  unreadCount(userId: string): number;
  customerName(id: string): string;
  minPrice(providerId: string): number;

  /* ---------------- availability (PRD Phase 6) ---------------- */
  availMap(providerId: string): Record<number, Window>;
  providerSlots(providerId: string, serviceId: string, date: string): string[];

  /* ---------------- bookings (PRD Phase 7) ---------------- */
  createBooking(input: NewBookingInput): Ok<Booking>;
  setBookingStatus(bookingId: string, byCustomer: boolean, action: BookingAction): boolean;
  /** Admin override with a legal-transition guard (PRD Phase 15). */
  setBookingStatusAdmin(bookingId: string, status: BookingStatus): boolean;
  /** Mock payment state machine (PRD Phase 14): unpaid -> mock_paid -> refunded. */
  setPaymentStatus(bookingId: string, status: PaymentStatus): boolean;

  /* ---------------- reviews (PRD Phase 10) ---------------- */
  addReview(bookingId: string, rating: number, comment: string): Ok<Review>;

  /* ---------------- favourites (PRD Phase 11) ---------------- */
  toggleFavourite(customerId: string, providerId: string): boolean;

  /* ---------------- provider catalogue (PRD Phase 4) ---------------- */
  upsertService(svc: Partial<Service> & { providerId: string }): void;
  deleteService(id: string): void;
  setServiceActive(id: string, active: boolean): void;
  addPortfolioItem(providerId: string, serviceId: string, art: string, caption: string): PortfolioItem;
  removePortfolioItem(id: string): void;

  /* ---------------- provider availability management ---------------- */
  setAvailability(providerId: string, day: number, on: boolean, start?: string, end?: string): void;
  addBreak(providerId: string, day: number, start: string, end: string): void;
  removeBreak(id: string): void;
  addBlocked(providerId: string, date: string, start: string, end: string, reason: string): Ok<never>;
  removeBlocked(id: string): void;

  /* ---------------- trust & verification (PRD §15) ---------------- */
  setVerification(providerId: string, v: Verification): void;
  /**
   * Provider asks to be reviewed -> 'pending'. Honest verification: the badge
   * is only ever granted by an admin.
   */
  requestVerification(providerId: string): Ok<never>;

  /* ---------------- admin (PRD Phase 15) ---------------- */
  setCategoryActive(id: string, active: boolean): void;

  /* ---------------- analytics (PRD §16) ---------------- */
  track(input: TrackInput): AnalyticsEvent;
  events(): AnalyticsEvent[];

  /* ---------------- moderation (PRD Phase 15) ---------------- */
  fileReport(input: NewReportInput): Ok<Report>;
  resolveReport(reportId: string, resolution: string, action: ReportAction, status?: ReportStatus): Ok<never>;
  reports(): Report[];

  /* ---------------- messaging (PRD Phase 13) ---------------- */
  conversationsFor(userId: string): Conversation[];
  /** Find-or-create the thread between a customer and a provider. */
  openConversation(customerId: string, providerId: string, bookingId?: string | null): Conversation;
  conversationById(id: string): Conversation | undefined;
  messagesOf(conversationId: string): Message[];
  sendMessage(conversationId: string, senderId: string, body: string): Ok<Message>;
  markThreadRead(conversationId: string, userId: string): void;
  unreadMessages(userId: string): number;
}

/** Roles allowed to perform an action — mirrors the RLS policies of PRD §14. */
export function roleOf(user: User | null): Role | 'anonymous' {
  return user ? user.role : 'anonymous';
}
