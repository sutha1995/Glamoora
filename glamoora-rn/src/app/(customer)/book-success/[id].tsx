import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { TopBar } from '../../../components/topbar';
import { Btn, Card, Note, Pill } from '../../../components/ui';
import { profileOf, serviceOf, userById } from '../../../db/core';
import { useApp } from '../../../store';
import { C } from '../../../theme';
import { fmtDateLong, fmtRM } from '../../../utils';

export default function BookSuccessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const b = app.db.bookings.find((x) => x.id === id);
  if (!b || b.customerId !== app.user?.id) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <TopBar back title="Booking" />
      </View>
    );
  }
  const s = serviceOf(b.serviceId);
  const p = profileOf(b.providerId);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title="Booking sent" sub={p?.displayName} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110, alignItems: 'center' }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center', marginTop: 24 }}>
          <Ionicons name="checkmark" size={40} color={C.green} />
        </View>
        <Text style={{ fontFamily: 'serif', fontSize: 21, color: C.plum, fontWeight: '600', marginTop: 16 }}>Booking request sent!</Text>
        <Text style={{ color: C.ink3, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
          {s?.name} · {fmtDateLong(b.date)}, {b.start} – {b.end}
          {'\n'}{b.location}
        </Text>
        <View style={{ marginTop: 14, backgroundColor: C.brand50, borderWidth: 1, borderColor: C.brand100, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderStyle: 'dashed' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.brand700 }}>{b.ref}</Text>
        </View>
        <Card style={{ marginTop: 16, width: '100%', maxWidth: 300 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
            <Text style={{ color: C.ink3, fontSize: 13.5 }}>Status</Text>
            <Pill status={b.status} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
            <Text style={{ color: C.ink3, fontSize: 13.5 }}>Payment</Text>
            <Text style={{ color: C.plum, fontWeight: '700', fontSize: 13.5 }}>{fmtRM(b.price)} · after service</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
            <Text style={{ color: C.ink3, fontSize: 13.5 }}>Cancel</Text>
            <Text style={{ color: C.ink2, fontSize: 12.5 }}>Free, anytime before</Text>
          </View>
        </Card>
        <Note>{p?.displayName} will confirm shortly. Track everything in My bookings.</Note>
        <View style={{ flexDirection: 'row', gap: 9, width: '100%', maxWidth: 300, marginTop: 16 }}>
          <Btn label="My bookings" variant="p" size="sm" block onPress={() => router.replace('/bookings')} />
          <Btn label="View studio" variant="o" size="sm" block onPress={() => router.push({ pathname: '/provider/[id]', params: { id: b.providerId } })} />
        </View>
      </ScrollView>
    </View>
  );
}
