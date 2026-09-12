/**
 * Marketplace analytics panel (PRD §16) — funnel, rates and the raw event log.
 * Pure presentation over `domain/metrics`; works on any backend.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { funnel, marketplaceMetrics, metricsInputFromDb, type FunnelStep } from '../domain/metrics';
import { useApp } from '../store';
import { C, SERIF } from '../theme';
import { timeAgo } from '../utils';
import { Card, Chip, Note, SectionTitle, StatBox } from './ui';

const EVENT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  signup: 'person-add',
  provider_signup: 'briefcase',
  search: 'search',
  category_view: 'albums',
  provider_view: 'eye',
  service_view: 'pricetag',
  booking_started: 'calendar',
  booking_created: 'add-circle',
  booking_received: 'notifications',
  booking_accepted: 'checkmark-circle',
  booking_rejected: 'close-circle',
  booking_completed: 'checkmark-done',
  booking_cancelled: 'close',
  review_submitted: 'star',
  favourite_added: 'heart',
  profile_completed: 'clipboard',
  service_created: 'pricetag',
  portfolio_uploaded: 'images',
  availability_created: 'time',
  report_filed: 'flag',
  report_resolved: 'shield-checkmark',
  ai_search: 'sparkles',
  ai_assistant: 'chatbubble-ellipses',
};

export function MetricsPanel() {
  const app = useApp();
  const d = app.db;
  const [logFilter, setLogFilter] = useState<string>('');
  const v = app.version;

  const m = useMemo(() => marketplaceMetrics(metricsInputFromDb(d)), [d, v]);

  const steps = useMemo(() => funnel(d.events), [d.events, v]);
  const log = useMemo(
    () => (logFilter ? d.events.filter((e) => e.name === logFilter) : d.events).slice(0, 40),
    [d.events, logFilter, v]
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <StatBox value={String(m.bookings)} label="Bookings" />
        <StatBox value={String(m.completed)} label="Completed" />
        <StatBox value={m.completionRate + '%'} label="Completion" />
        <StatBox value={m.acceptanceRate + '%'} label="Accepted" />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <StatBox value={m.cancellationRate + '%'} label="Cancelled" />
        <StatBox value={m.repeatBookingRate + '%'} label="Repeat" />
        <StatBox value={'★ ' + m.avgRating.toFixed(1)} label="Avg rating" />
        <StatBox value={String(m.activeServices)} label="Live services" />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <StatBox value={'RM' + m.avgBookingValue} label="Avg value" small />
        <StatBox value={'RM' + m.gmv.toLocaleString('en-MY')} label="GMV" small />
        <StatBox value={String(m.openReports)} label="Open reports" small />
        <StatBox value={String(m.unreadMessages)} label="Unread msgs" small />
      </View>

      <SectionTitle title="Discovery funnel" />
      <Card style={{ marginBottom: 14 }}>
        {steps.map((s, i) => (
          <FunnelRow key={s.event} step={s} index={i} max={Math.max(...steps.map((x) => x.actors), 1)} />
        ))}
        <Note>
          Actors are unique users, so a step can never exceed the one above it. Search → provider view
          {' '}{m.searchToProvider}% · provider view → booking {m.providerToBooking}% · completed → review {m.bookingToReview}%.
        </Note>
      </Card>

      <SectionTitle title="Provider supply" />
      <Card style={{ marginBottom: 14 }}>
        <SupplyRow label="Verified studios" value={m.verifiedProviders} total={m.providers} color={C.green} />
        <SupplyRow label="Awaiting verification" value={m.pendingVerification} total={m.providers} color={C.amber} />
        <SupplyRow label="Suspended" value={m.suspendedProviders} total={m.providers} color={C.red} />
        <SupplyRow label="Unverified" value={m.providers - m.verifiedProviders - m.pendingVerification - m.suspendedProviders} total={m.providers} color={C.ink3} />
      </Card>

      <SectionTitle title="Event log" action={logFilter ? 'Show all' : undefined} onAction={() => setLogFilter('')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {['search', 'provider_view', 'booking_created', 'booking_accepted', 'booking_completed', 'review_submitted'].map((n) => (
          <Chip key={n} on={logFilter === n} onPress={() => setLogFilter(logFilter === n ? '' : n)}>
            {n.replace(/_/g, ' ')}
          </Chip>
        ))}
      </View>
      <Card flush>
        {log.length ? (
          log.map((e) => {
            const actor = d.users.find((u) => u.id === e.actorId);
            const provider = e.providerId ? d.profiles.find((p) => p.id === e.providerId) : undefined;
            return (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.brand50, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={EVENT_ICON[e.name] || 'pulse'} size={15} color={C.brand700} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12.5, color: C.plum, fontWeight: '700' }} numberOfLines={1}>
                    {e.name.replace(/_/g, ' ')}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.ink3 }} numberOfLines={1}>
                    {actor ? actor.name : 'system'}
                    {provider ? ' → ' + provider.displayName : ''}
                    {e.meta && Object.keys(e.meta).length ? ' · ' + Object.entries(e.meta).map(([k, val]) => `${k}=${val}`).join(' ') : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 10.5, color: C.ink3 }}>{timeAgo(e.createdAt)}</Text>
              </View>
            );
          })
        ) : (
          <Text style={{ padding: 16, color: C.ink3, fontSize: 12.5, textAlign: 'center' }}>
            No events yet — browse as a customer and the funnel fills in live.
          </Text>
        )}
      </Card>
    </View>
  );
}

function FunnelRow({ step, index, max }: { step: FunnelStep; index: number; max: number }) {
  const widthPct = Math.max(4, Math.round((step.actors / max) * 100));
  return (
    <View style={{ marginBottom: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 12.5, color: C.plum, fontWeight: '600' }}>
          {index + 1}. {step.label}
        </Text>
        <Text style={{ fontSize: 11.5, color: C.ink3 }}>
          {step.actors} {step.actors === 1 ? 'user' : 'users'}
          {index > 0 ? ` · ${step.rateFromPrev}% of prev` : ''}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: C.brand50, overflow: 'hidden' }}>
        <View style={{ width: `${widthPct}%`, height: 8, borderRadius: 4, backgroundColor: index === 0 ? C.brand : C.brand700 }} />
      </View>
    </View>
  );
}

function SupplyRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <View style={{ marginBottom: 9 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 12.5, color: C.ink2 }}>{label}</Text>
        <Text style={{ fontSize: 12, color: C.plum, fontWeight: '700', fontFamily: SERIF }}>
          {value}/{total}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.brand50, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

export function MetricsTeaser({ onPress }: { onPress: () => void }) {
  const app = useApp();
  const n = app.db.events.length;
  return (
    <Pressable onPress={onPress}>
      <Card style={{ marginTop: 12, backgroundColor: C.brand50, borderColor: C.brand100 }}>
        <Text style={{ fontSize: 11.5, color: C.ink2 }}>
          {n} analytics events captured · tap Metrics for the full funnel.
        </Text>
      </Card>
    </Pressable>
  );
}
