import { router } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Avatar, Btn, Card, LRow, Note, Row, StatBox } from '../../components/ui';
import { useApp } from '../../store';
import { C } from '../../theme';

export default function ProfileScreen() {
  const app = useApp();
  const u = app.user;
  if (!u) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const mine = app.db.bookings.filter((b) => b.customerId === u.id);
  const done = mine.filter((b) => b.status === 'completed').length;
  const favN = app.db.favourites.filter((f) => f.customerId === u.id).length;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Profile" sub={u.email} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <Avatar name={u.name} size={58} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: C.plum, fontWeight: '700' }}>{u.name}</Text>
            <Text style={{ color: C.ink3, fontSize: 12 }}>{u.email}</Text>
            <Text style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>{u.phone || '—'}</Text>
          </View>
        </Card>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <StatBox value={String(mine.length)} label="Bookings" />
          <StatBox value={String(done)} label="Completed" />
          <StatBox value={String(favN)} label="Favourites" />
          <StatBox value="RM 0" label="Spent" small />
        </View>
        <Card flush style={{ marginTop: 14 }}>
          <LRow icon="location-outline" title="Home location" sub={u.area} right={<Btn label="Change" variant="o" size="sm" onPress={() => router.push('/discover')} />} />
          {u.role === 'admin' ? (
            <LRow icon="shield-checkmark-outline" title="Admin console" sub="Manage providers, categories & bookings" right={<Btn label="Open" variant="p" size="sm" onPress={() => router.replace('/admin')} />} />
          ) : null}
          <LRow icon="notifications-outline" title="Notifications" sub="Booking updates & reminders" right={<Btn label="View" variant="o" size="sm" onPress={() => router.push('/notifications')} />} />
          <LRow icon="log-out-outline" title="Log out" sub="Switch account" style={{ borderBottomWidth: 0 }} right={<Btn label="Log out" variant="d" size="sm" onPress={app.logout} />} />
        </Card>
        <Note>Glamoora hackathon MVP · mock payments · demo data only — no real personal data is stored.</Note>
      </ScrollView>
    </View>
  );
}
