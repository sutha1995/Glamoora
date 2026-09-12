export type Role = 'customer' | 'provider' | 'admin';
export type Verification = 'unverified' | 'pending' | 'verified' | 'suspended';
export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed' | 'no_show';
export type LocationType = 'provider' | 'customer' | 'both';

export interface User {
  id: string;
  role: Role;
  email: string;
  password: string;
  name: string;
  phone: string;
  area: string;
  lat: number;
  lng: number;
  createdAt: number;
}

export interface ProviderProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  addr: string;
  lat: number;
  lng: number;
  radiusKm: number;
  verification: Verification;
  avg: number;
  reviewCount: number;
  categoryIds: string[];
  phone: string;
}

export interface Category {
  id: string;
  name: string;
  desc: string;
  icon: string;
  active: boolean;
}

export interface Service {
  id: string;
  providerId: string;
  categoryId: string;
  name: string;
  desc: string;
  price: number;
  duration: number;
  locationType: LocationType;
  active: boolean;
}

export interface PortfolioItem {
  id: string;
  providerId: string;
  serviceId: string | null;
  art: string;
  grad: string;
  caption: string;
}

export interface Availability {
  id: string;
  providerId: string;
  day: number; // 0=Sunday
  start: string;
  end: string;
  active: boolean;
}

export interface BreakSlot {
  id: string;
  providerId: string;
  day: number;
  start: string;
  end: string;
}

export interface BlockedSlot {
  id: string;
  providerId: string;
  start: string; // "YYYY-MM-DD HH:MM"
  end: string;
  reason: string;
}

export type PaymentStatus = 'unpaid' | 'mock_paid' | 'refunded';

export interface Booking {
  id: string;
  ref: string;
  customerId: string;
  providerId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  start: string | null;
  end: string | null;
  price: number;
  location: string;
  locType: LocationType;
  notes: string;
  status: BookingStatus;
  /** Human-readable payment label shown in the UI. */
  payment: string;
  /** Mock payment state machine (PRD Phase 14): unpaid -> mock_paid -> refunded. */
  paymentStatus: PaymentStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Review {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  rating: number;
  comment: string;
  createdAt: number;
}

export interface Favourite {
  customerId: string;
  providerId: string;
  createdAt: number;
}

export interface Notif {
  id: string;
  userId: string;
  type: string;
  title: string;
  msg: string;
  read: boolean;
  createdAt: number;
}

/* ================= analytics (PRD §16) ================= */
export type AnalyticsEventName =
  /* customer */
  | 'signup' | 'category_view' | 'provider_view' | 'service_view'
  | 'booking_started' | 'booking_created' | 'booking_completed' | 'booking_cancelled'
  | 'review_submitted' | 'favourite_added' | 'search'
  /* provider */
  | 'provider_signup' | 'profile_completed' | 'service_created' | 'portfolio_uploaded'
  | 'availability_created' | 'booking_received' | 'booking_accepted' | 'booking_rejected'
  /* moderation */
  | 'report_filed' | 'report_resolved'
  /* ai */
  | 'ai_search' | 'ai_assistant';

export interface AnalyticsEvent {
  id: string;
  name: AnalyticsEventName;
  /** 'system' for events with no signed-in actor. */
  actorId: string;
  role: Role | 'system';
  providerId?: string;
  bookingId?: string;
  meta?: Record<string, string | number | boolean>;
  createdAt: number;
}

/* ================= moderation (PRD §15) ================= */
export type ReportTarget = 'provider' | 'portfolio' | 'review';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  /** The provider that owns the reported content, so admins can act in one place. */
  providerId: string;
  reason: string;
  detail: string;
  status: ReportStatus;
  resolution: string;
  createdAt: number;
  resolvedAt: number | null;
}

/* ================= messaging (PRD Phase 13) ================= */
export interface Conversation {
  id: string;
  customerId: string;
  /** provider_profiles.id */
  providerId: string;
  /** Optional link to the booking the thread is about. */
  bookingId: string | null;
  createdAt: number;
  lastAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readBy: string[];
  createdAt: number;
}

export interface DB {
  v: number;
  session: string | null;
  categories: Category[];
  users: User[];
  profiles: ProviderProfile[];
  services: Service[];
  portfolio: PortfolioItem[];
  availability: Availability[];
  breaks: BreakSlot[];
  blocked: BlockedSlot[];
  bookings: Booking[];
  reviews: Review[];
  favourites: Favourite[];
  notifs: Notif[];
  events: AnalyticsEvent[];
  reports: Report[];
  conversations: Conversation[];
  messages: Message[];
}

export interface Area {
  name: string;
  lat: number;
  lng: number;
}
