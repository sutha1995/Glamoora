import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Avatar, Btn, Card, Empty, Pill, Row, Seg } from '../../components/ui';
import { profileOf, serviceOf, setBookingStatus } from '../../db/core';
import { openThreadForBooking } from '../../components/chat';
import { useApp } from '../../store';
import { C } from '../../theme';
import { fmtDate, fmtRM, todayISO } from '../../utils';

type Tab = 'upcoming' | 'completed' | 'cancelled';

export default function BookingsScreen() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const u = app.user!;

  const list = app.db.bookings
    .filter((b) => b.customerId === u.id)
    .filter((b) => {
      if (tab === 'upcoming') return ['pending', 'confirmed'].includes(b.status) && b.date >= todayISO();
      if (tab === 'completed') return ['completed', 'no_show'].includes(b.status);
      return ['cancelled', 'rejected'].includes(b.status);
    })
    .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')) * (tab === 'upcoming' ? 1 : -1));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="My bookings" sub={u.name} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Seg
          options={[
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'completed', label: 'Completed' },
            { key: 'cancelled', label: 'Cancelled' },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
          style={{ marginBottom: 16 }}
        />
        {list.length ? (
          list.map((b) => {
            const s = serviceOf(b.serviceId);
            const p = profileOf(b.providerId);
            const reviewed = app.db.reviews.find((r) => r.bookingId === b.id);
            return (
              <Card key={b.id} style={{ marginBottom: 11 }}>
                <Row style={{ gap: 10 }}>
                  {p ? <Avatar name={p.displayName} size={42} /> : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, color: C.plum, fontWeight: '700' }} numberOfLines={1}>{s?.name || 'Service'}</Text>
                    <Text style={{ fontSize: 12, color: C.ink3 }} numberOfLines={1}>{p?.displayName}</Text>
                  </View>
                  <Pill status={b.status} />
                </Row>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 11, padding: 9, paddingHorizontal: 10, marginTop: 9 }}>
                  <Meta icon="calendar-outline" text={fmtDate(b.date)} />
                  <Meta icon="time-outline" text={b.start || '—'} />
                  <Meta icon="wallet-outline" text={fmtRM(b.price)} />
                  <Meta icon="location-outline" text={(b.location || '').split(',')[0]} />
                </View>
                <Text style={{ fontSize: 11, color: C.ink3, marginTop: 7 }}>Ref {b.ref} · {b.payment}</Text>
                {['pending', 'confirmed'].includes(b.status) ? (
                  <Text style={{ fontSize: 11, color: C.ink3, marginTop: 3 }}>
                    Free cancellation any time before your appointment — the slot is released instantly.
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 7, marginTop: 8 }}>
                  {['pending', 'confirmed'].includes(b.status) && (
                    <Btn label="Cancel" variant="d" size="sm" block onPress={() => setConfirmCancel(b.id)} />
                  )}
                  {b.status === 'completed' && !reviewed && (
                    <Btn label="Leave review" variant="p" size="sm" block onPress={() => router.push({ pathname: '/review/[id]', params: { id: b.id } })} />
                  )}
                  {b.status === 'completed' && reviewed && (
                    <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.plum, borderRadius: 10, paddingVertical: 8 }}>
                      <Text style={{ color: C.white, fontSize: 12, fontWeight: '700' }}>Reviewed ★ {reviewed.rating}</Text>
                    </View>
                  )}
                  {p && !['cancelled', 'rejected'].includes(b.status) && (
                    <Btn label="Message" variant="o" size="sm" block icon="chatbubble-ellipses-outline" onPress={() => openThreadForBooking(b)} />
                  )}
                  {p && (
                    <Btn label="View" variant="o" size="sm" block onPress={() => router.push({ pathname: '/provider/[id]', params: { id: p.id } })} />
                  )}
                </View>
              </Card>
            );
          })
        ) : (
          <Empty
            icon="calendar-outline"
            title="Nothing here yet"
            text={
              tab === 'upcoming'
                ? 'Your upcoming appointments will appear here. Find your next glow-up!'
                : tab === 'completed'
                ? 'Completed appointments will appear here.'
                : 'Cancelled or declined bookings will appear here.'
            }
            action={tab === 'upcoming' ? 'Browse services' : undefined}
            onAction={() => router.push('/discover')}
          />
        )}
      </ScrollView>

      {confirmCancel ? (
        <View style={{ ...StyleSheet_overlay }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setConfirmCancel(null)} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30 }}>
            <Text style={{ fontFamily: 'serif', fontSize: 17, color: C.plum, marginBottom: 10 }}>Cancel booking?</Text>
            <Text style={{ color: C.ink2, fontSize: 13.5, marginBottom: 14 }}>The provider will be notified and the time slot released. This cannot be undone.</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn label="Keep booking" variant="o" size="sm" block onPress={() => setConfirmCancel(null)} />
              <Btn
                label="Cancel it"
                variant="d"
                size="sm"
                block
                onPress={() => {
                  setBookingStatus(confirmCancel, true, 'cancel');
                  app.bump();
                  setConfirmCancel(null);
                }}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name={icon} size={13} color={C.brand700} />
      <Text style={{ fontSize: 12, color: C.ink2 }}>{text}</Text>
    </View>
  );
}
const StyleSheet_overlay: import('react-native').ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(40,22,27,0.5)' };
