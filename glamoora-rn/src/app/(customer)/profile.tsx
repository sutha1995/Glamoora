import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Avatar, Btn, Card, LRow, Note, StatBox } from '../../components/ui';
import { resetDB } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';
import { fmtRM } from '../../utils';

export default function ProfileScreen() {
  const app = useApp();
  const u = app.user;
  const [confirmReset, setConfirmReset] = useState(false);
  if (!u) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const mine = app.db.bookings.filter((b) => b.customerId === u.id);
  const done = mine.filter((b) => b.status === 'completed');
  const favN = app.db.favourites.filter((f) => f.customerId === u.id).length;
  const unread = app.db.messages.filter((m) => {
    const c = app.db.conversations.find((x) => x.id === m.conversationId);
    return c?.customerId === u.id && m.senderId !== u.id && !m.readBy.includes(u.id);
  }).length;
  /** Real spend: what this customer actually completed. Payments are mocked, so
      this is the value of finished appointments, never a charged amount. */
  const spent = done.reduce((sum, b) => sum + b.price, 0);

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
          <StatBox value={String(done.length)} label="Completed" />
          <StatBox value={String(favN)} label="Favourites" />
          <StatBox value={fmtRM(spent)} label="Completed value" small />
        </View>

        <Card flush style={{ marginTop: 14 }}>
          <LRow
            icon="location-outline"
            title="Home location"
            sub={`${u.area} · distances and "near me" are measured from here`}
            right={<Btn label="Change" variant="o" size="sm" onPress={() => router.push('/discover')} />}
          />
          <LRow
            icon="chatbubble-ellipses-outline"
            title="Messages"
            sub={unread ? `${unread} unread from studios` : 'Your conversations with studios'}
            right={<Btn label="Open" variant="o" size="sm" onPress={() => router.push('/messages')} />}
          />
          <LRow
            icon="sparkles-outline"
            title="AI assistant"
            sub="Search in plain words, ask how things work"
            right={<Btn label="Ask" variant="o" size="sm" onPress={() => router.push('/assistant')} />}
          />
          <LRow
            icon="notifications-outline"
            title="Notifications"
            sub="Booking updates & reminders"
            right={<Btn label="View" variant="o" size="sm" onPress={() => router.push('/notifications')} />}
          />
          {u.role === 'admin' ? (
            <LRow
              icon="shield-checkmark-outline"
              title="Admin console"
              sub="Manage providers, categories & bookings"
              right={<Btn label="Open" variant="p" size="sm" onPress={() => router.replace('/admin')} />}
            />
          ) : null}
          <LRow
            icon="log-out-outline"
            title="Log out"
            sub="Switch account"
            style={{ borderBottomWidth: 0 }}
            right={<Btn label="Log out" variant="d" size="sm" onPress={app.logout} />}
          />
        </Card>

        <Card style={{ marginTop: 14, borderColor: C.redBg }}>
          <Text style={{ color: C.red, fontSize: 13.5, fontWeight: '700' }}>Demo data</Text>
          <Text style={{ color: C.ink3, fontSize: 12.5, marginVertical: 6 }}>
            Restore every account, booking, review and message to the original seed. Useful before a demo run.
          </Text>
          <Btn label="Reset demo data" variant="d" size="sm" onPress={() => setConfirmReset(true)} />
        </Card>

        <Note>Glamoora hackathon MVP · mock payments · demo data only — no real personal data is stored.</Note>
      </ScrollView>

      {confirmReset ? (
        <View style={overlay}>
          <Pressable style={abs} onPress={() => setConfirmReset(false)} />
          <View style={sheet}>
            <Text style={{ fontFamily: 'serif', fontSize: 17, color: C.plum, marginBottom: 10 }}>Reset demo data?</Text>
            <Text style={{ color: C.ink2, fontSize: 13.5, marginBottom: 14 }}>
              This wipes every change made in this session and restores the original seed data. You will be signed out.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn label="Cancel" variant="o" size="sm" block onPress={() => setConfirmReset(false)} />
              <Btn
                label="Reset everything"
                variant="d"
                size="sm"
                block
                onPress={async () => {
                  await resetDB();
                  setConfirmReset(false);
                  app.logout();
                  app.bump();
                  router.replace('/');
                }}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const overlay: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(40,22,27,0.5)' };
const abs: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
const sheet: ViewStyle = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: C.bg,
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  padding: 18,
  paddingBottom: 30,
};
