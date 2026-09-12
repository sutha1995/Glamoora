/**
 * Marketplace metrics (PRD §16) — pure functions over the analytics event log
 * and bookings. No storage imports, so the same numbers can be computed on a
 * device or later inside Postgres.
 */
import type { AnalyticsEvent, AnalyticsEventName, Booking, DB } from '../types';

export interface FunnelStep {
  label: string;
  event: AnalyticsEventName;
  actors: number;
  /** Percentage of the previous step's actors. 100 for the first step. */
  rateFromPrev: number;
  /** Percentage of the entry step's actors. */
  rateFromTop: number;
}

/** The customer discovery funnel exactly as listed in PRD §16. */
export const CUSTOMER_FUNNEL: { label: string; event: AnalyticsEventName }[] = [
  { label: 'Search', event: 'search' },
  { label: 'Category view', event: 'category_view' },
  { label: 'Provider view', event: 'provider_view' },
  { label: 'Service view', event: 'service_view' },
  { label: 'Booking started', event: 'booking_started' },
  { label: 'Booking created', event: 'booking_created' },
  { label: 'Booking completed', event: 'booking_completed' },
  { label: 'Review submitted', event: 'review_submitted' },
];

function uniqueActors(events: AnalyticsEvent[], name: AnalyticsEventName): Set<string> {
  return new Set(events.filter((e) => e.name === name).map((e) => e.actorId));
}

/**
 * Sequential conversion: of the actors who fired `from`, how many fired `to`
 * afterwards? This is the honest reading of "search → provider view
 * conversion" rather than a raw event-count ratio.
 */
export function conversion(events: AnalyticsEvent[], from: AnalyticsEventName, to: AnalyticsEventName): { from: number; to: number; rate: number } {
  const firstFrom = new Map<string, number>();
  events.forEach((e) => {
    if (e.name !== from) return;
    const prev = firstFrom.get(e.actorId);
    if (prev === undefined || e.createdAt < prev) firstFrom.set(e.actorId, e.createdAt);
  });

  const convertedActors = new Set(
    events
      .filter((e) => {
        if (e.name !== to) return false;
        const t = firstFrom.get(e.actorId);
        return t !== undefined && e.createdAt >= t;
      })
      .map((e) => e.actorId)
  ).size;

  const rate = firstFrom.size ? Math.round((convertedActors / firstFrom.size) * 100) : 0;
  return { from: firstFrom.size, to: convertedActors, rate };
}

/** Full ordered funnel with drop-off at each step. */
export function funnel(events: AnalyticsEvent[]): FunnelStep[] {
  const steps = CUSTOMER_FUNNEL.map((s) => ({ ...s, actors: uniqueActors(events, s.event).size }));
  const top = steps[0]?.actors || 0;
  return steps.map((s, i) => {
    const prev = i === 0 ? s.actors : steps[i - 1].actors;
    return {
      ...s,
      rateFromPrev: prev ? Math.round((s.actors / prev) * 100) : 0,
      rateFromTop: top ? Math.round((s.actors / top) * 100) : 0,
    };
  });
}

export interface MarketplaceMetrics {
  customers: number;
  providers: number;
  verifiedProviders: number;
  pendingVerification: number;
  suspendedProviders: number;
  activeServices: number;
  bookings: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  rejected: number;
  noShow: number;
  reviews: number;
  openReports: number;
  /** accepted / decided (non-pending) bookings */
  acceptanceRate: number;
  /** cancelled / all bookings */
  cancellationRate: number;
  /** completed / decided bookings */
  completionRate: number;
  /** mean price of completed bookings */
  avgBookingValue: number;
  /** mean price of all bookings */
  avgRequestedValue: number;
  gmv: number;
  /** customers with >1 completed booking / customers with >=1 completed booking */
  repeatBookingRate: number;
  searchToProvider: number;
  providerToBooking: number;
  bookingToReview: number;
  avgRating: number;
  unreadMessages: number;
}

export interface MetricsInput {
  events: AnalyticsEvent[];
  bookings: Booking[];
  customers: number;
  providers: number;
  verifiedProviders: number;
  pendingVerification: number;
  suspendedProviders: number;
  activeServices: number;
  reviews: number;
  avgRating: number;
  openReports: number;
  unreadMessages: number;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export function marketplaceMetrics(i: MetricsInput): MarketplaceMetrics {
  const b = i.bookings;
  const decided = b.filter((x) => x.status !== 'pending');
  const accepted = b.filter((x) => ['confirmed', 'completed', 'no_show'].includes(x.status));
  const cancelled = b.filter((x) => x.status === 'cancelled');
  const rejected = b.filter((x) => x.status === 'rejected');
  const completed = b.filter((x) => x.status === 'completed');
  const noShow = b.filter((x) => x.status === 'no_show');
  const confirmed = b.filter((x) => x.status === 'confirmed');
  const pending = b.filter((x) => x.status === 'pending');

  const completedByCustomer = new Map<string, number>();
  completed.forEach((x) => completedByCustomer.set(x.customerId, (completedByCustomer.get(x.customerId) || 0) + 1));
  const repeatCustomers = [...completedByCustomer.values()].filter((n) => n > 1).length;

  const sum = (list: Booking[]) => list.reduce((a, x) => a + x.price, 0);

  return {
    customers: i.customers,
    providers: i.providers,
    verifiedProviders: i.verifiedProviders,
    pendingVerification: i.pendingVerification,
    suspendedProviders: i.suspendedProviders,
    activeServices: i.activeServices,
    bookings: b.length,
    pending: pending.length,
    confirmed: confirmed.length,
    completed: completed.length,
    cancelled: cancelled.length,
    rejected: rejected.length,
    noShow: noShow.length,
    reviews: i.reviews,
    openReports: i.openReports,
    acceptanceRate: pct(accepted.length, decided.length),
    cancellationRate: pct(cancelled.length, b.length),
    completionRate: pct(completed.length, decided.length),
    avgBookingValue: completed.length ? Math.round(sum(completed) / completed.length) : 0,
    avgRequestedValue: b.length ? Math.round(sum(b) / b.length) : 0,
    gmv: sum(completed),
    repeatBookingRate: pct(repeatCustomers, completedByCustomer.size),
    searchToProvider: conversion(i.events, 'search', 'provider_view').rate,
    providerToBooking: conversion(i.events, 'provider_view', 'booking_created').rate,
    bookingToReview: conversion(i.events, 'booking_completed', 'review_submitted').rate,
    avgRating: i.avgRating,
    unreadMessages: i.unreadMessages,
  };
}

/** Provider-side events for one studio, newest first (PRD §16 provider events). */
export function providerEvents(events: AnalyticsEvent[], providerId: string): AnalyticsEvent[] {
  return events.filter((e) => e.providerId === providerId);
}

/** How many times a studio's profile was viewed, and by how many people. */
export function providerReach(events: AnalyticsEvent[], providerId: string): { views: number; uniqueViewers: number } {
  const views = events.filter((e) => e.name === 'provider_view' && e.providerId === providerId);
  return { views: views.length, uniqueViewers: new Set(views.map((e) => e.actorId)).size };
}

/**
 * Builds the metrics input straight from a DB snapshot so the admin panel and
 * any future server-side report compute identical numbers.
 */
export function metricsInputFromDb(db: DB): MetricsInput {
  const rated = db.reviews.filter((r) => r.rating > 0);
  const unread = db.messages.filter((m) => m.readBy.length < 2).length;
  return {
    events: db.events,
    bookings: db.bookings,
    customers: db.users.filter((u) => u.role === 'customer').length,
    providers: db.profiles.length,
    verifiedProviders: db.profiles.filter((p) => p.verification === 'verified').length,
    pendingVerification: db.profiles.filter((p) => p.verification === 'pending').length,
    suspendedProviders: db.profiles.filter((p) => p.verification === 'suspended').length,
    activeServices: db.services.filter((s) => s.active).length,
    reviews: db.reviews.length,
    avgRating: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating, 0) / rated.length) * 10) / 10 : 0,
    openReports: db.reports.filter((r) => r.status === 'open').length,
    unreadMessages: unread,
  };
}
