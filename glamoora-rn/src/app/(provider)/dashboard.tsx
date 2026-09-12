import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Btn, Card, Chip, Pill, Row, SectionTitle, Sp, StatBox } from '../../components/ui';
import { activeServicesOf, profileOf, serviceOf, setBookingStatus, userById } from '../../db/core';
import { openThreadForBooking } from '../../components/chat';
import { useApp } from '../../store';
import { C } from '../../theme';
import { fmtDate, fmtRM, todayISO } from '../../utils';

const AI_TOOLS = [
  { tool: 'describe', label: '✍️ Service description' },
  { tool: 'caption', label: '🖼️ Portfolio caption' },
  { tool: 'bundle', label: '🎁 Bundle ideas' },
  { tool: 'reviews', label: '⭐ Review summary' },
  { tool: 'score', label: '📈 Profile strength' },
];

export default function DashboardScreen() {
  const app = useApp();
  const p = app.db.profiles.find((x) => x.userId === app.user?.id);
  const t0 = todayISO();

  const data = useMemo(() => {
    if (!p) return null;
    const mine = app.db.bookings.filter((b) => b.providerId === p.id);
    return {
      today: mine.filter((b) => b.date === t0 && !['cancelled', 'rejected'].includes(b.status)).sort((a, b) => a.start!.localeCompare(b.start!)),
      pending: mine.filter((b) => b.status === 'pending' && b.date >= t0).sort((a, b) => (a.date + a.start!).localeCompare(b.date + b.start!)),
      upcoming: mine.filter((b) => b.date > t0 && ['pending', 'confirmed'].includes(b.status)).sort((a, b) => (a.date + a.start!).localeCompare(b.date + b.start!)),
      completed: mine.filter((b) => b.status === 'completed').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
      earnings: mine.filter((b) => ['confirmed', 'completed'].includes(b.status) && b.date.slice(0, 7) === t0.slice(0, 7)).reduce((a, b) => a + b.price, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.db, app.version]);
  if (!p || !data) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const checks = [
    { ok: !!(p.displayName && p.bio && p.categoryIds.length > 0), label: 'Complete profile & categories', to: '/studio' },
    { ok: activeServicesOf(p.id).length > 0, label: 'Add at least one service with price', to: '/services' },
    { ok: app.db.availability.filter((a) => a.providerId === p.id && a.active).length >= 3, label: 'Set weekly availability', to: '/hours' },
    { ok: app.db.portfolio.filter((x) => x.providerId === p.id).length > 0, label: 'Add portfolio items', to: '/studio' },
  ];
  const showChecklist = checks.some((c) => !c.ok);

  const act = (bid: string, a: 'accept' | 'reject' | 'complete' | 'noshow' | 'cancel') => {
    const ok = setBookingStatus(bid, false, a);
    if (ok) {
      app.bump();
      app.showToast({ accept: 'Booking accepted', reject: 'Booking declined', complete: 'Marked completed', noshow: 'Marked no-show', cancel: 'Booking cancelled' }[a]);
    }
  };

  const row = (b: (typeof app.db.bookings)[number], withActions: boolean) => {
    const s = serviceOf(b.serviceId);
    const cu = userById(b.customerId);
    return (
      <View key={b.id} style={{ marginBottom: 6 }}>
        <Row style={{ gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, color: C.plum, fontWeight: '700' }} numberOfLines={1}>
              {b.start} · {s?.name}
            </Text>
            <Text style={{ fontSize: 12, color: C.ink3 }} numberOfLines={1}>
              {cu?.name || 'Customer'} · {fmtRM(b.price)}
            </Text>
          </View>
          <Pill status={b.status} />
        </Row>
        {withActions ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 8 }}>
            {b.status === 'pending' && (
              <>
                <Btn label="Accept" variant="p" size="xs" block onPress={() => act(b.id, 'accept')} />
                <Btn label="Decline" variant="d" size="xs" block onPress={() => act(b.id, 'reject')} />
              </>
            )}
            {b.status === 'confirmed' && (
              <>
                <Btn label="Complete" variant="p" size="xs" block onPress={() => act(b.id, 'complete')} />
                <Btn label="No-show" variant="o" size="xs" block onPress={() => act(b.id, 'noshow')} />
                <Btn label="Cancel" variant="d" size="xs" block onPress={() => act(b.id, 'cancel')} />
              </>
            )}
            {!['cancelled', 'rejected'].includes(b.status) && (
              <Btn label="Message" variant="o" size="xs" block icon="chatbubble-ellipses-outline" onPress={() => openThreadForBooking(b)} />
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Studio dashboard" sub={p.displayName + ' · ' + new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        {showChecklist ? (
          <Card style={{ marginBottom: 14 }}>
            <Text style={{ fontFamily: 'serif', color: C.plum, fontSize: 15, fontWeight: '600' }}>Set up your studio</Text>
            {checks.map((c, i) => (
              <Row key={i} style={{ gap: 9, marginTop: 10 }}>
                <View style={{ width: 20, height: 20, borderRadius: 7, backgroundColor: c.ok ? C.greenBg : C.amberBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={c.ok ? 'checkmark' : 'close'} size={12} color={c.ok ? C.green : C.amber} />
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: C.ink2 }}>{c.label}</Text>
                {!c.ok && <Btn label="Fix" variant="o" size="xs" onPress={() => router.push(c.to)} />}
              </Row>
            ))}
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <StatBox value={String(data.today.length)} label="Today" />
          <StatBox value={String(data.pending.length)} label="Pending" />
          <StatBox value={fmtRM(data.earnings)} label="This month" small />
          <StatBox value={'★ ' + p.avg.toFixed(1)} label="Rating" />
        </View>

        <Card style={{ marginBottom: 14, backgroundColor: C.brand50, borderColor: C.brand100 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles" size={18} color={C.brand700} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.plum }}>AI studio assistant</Text>
              <Text style={{ fontSize: 11, color: C.ink3, marginTop: 1, lineHeight: 15 }}>
                Writes from your real prices, hours and reviews — on-device, nothing uploaded.
              </Text>
            </View>
            <Btn label="Open" variant="p" size="xs" onPress={() => router.push('/assistant')} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {AI_TOOLS.map((t) => (
              <Chip key={t.tool} onPress={() => router.push({ pathname: '/assistant', params: { tool: t.tool } })}>
                {t.label}
              </Chip>
            ))}
          </View>
        </Card>

        <SectionTitle title="Needs your attention" />
        <Card style={{ marginBottom: 14 }}>
          {data.pending.length ? data.pending.map((b) => row(b, true)) : (
            <Row style={{ gap: 10 }}>
              <Ionicons name="checkmark-circle" size={18} color={C.green} />
              <Text style={{ fontSize: 13, color: C.ink2 }}>All caught up — no pending requests. 🎉</Text>
            </Row>
          )}
        </Card>

        <SectionTitle title="Today" />
        <Card style={{ marginBottom: 14 }}>
          {data.today.length ? data.today.map((b) => row(b, true)) : <Text style={{ color: C.ink3, fontSize: 13, paddingVertical: 4 }}>No bookings today.</Text>}
        </Card>

        <SectionTitle title="Upcoming" action="Calendar" onAction={() => router.push('/calendar')} />
        <Card style={{ marginBottom: 14 }}>
          {data.upcoming.slice(0, 4).map((b) => {
            const s = serviceOf(b.serviceId);
            const cu = userById(b.customerId);
            return (
              <Row key={b.id} style={{ gap: 8, paddingVertical: 6 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, color: C.plum, fontWeight: '700' }}>{fmtDate(b.date)} · {b.start}</Text>
                  <Text style={{ fontSize: 12, color: C.ink3 }} numberOfLines={1}>
                    {s?.name} · {cu?.name}
                  </Text>
                </View>
                <Pill status={b.status} />
              </Row>
            );
          })}
          {!data.upcoming.length ? <Text style={{ color: C.ink3, fontSize: 13, paddingVertical: 4 }}>Nothing scheduled yet.</Text> : null}
        </Card>

        <SectionTitle title="Recently completed" />
        <Card>
          {data.completed.map((b) => {
            const s = serviceOf(b.serviceId);
            const cu = userById(b.customerId);
            return (
              <Row key={b.id} style={{ gap: 8, paddingVertical: 6 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, color: C.plum, fontWeight: '700' }}>{fmtDate(b.date)}</Text>
                  <Text style={{ fontSize: 12, color: C.ink3 }} numberOfLines={1}>
                    {s?.name} · {cu?.name}
                  </Text>
                </View>
                <Text style={{ color: C.ink3, fontSize: 12 }}>{fmtRM(b.price)}</Text>
              </Row>
            );
          })}
          {!data.completed.length ? <Text style={{ color: C.ink3, fontSize: 13, paddingVertical: 4 }}>No completed appointments yet.</Text> : null}
        </Card>
      </ScrollView>
    </View>
  );
}
