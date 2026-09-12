import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Btn, Card, LRow, Note, Pill } from '../../components/ui';
import { resetDB } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';

export default function SettingsScreen() {
  const app = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const u = app.user!;
  const p = app.db.profiles.find((x) => x.userId === u.id);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title="Settings" sub={p?.displayName} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Card flush>
          <LRow icon="person-outline" title={u.name} sub={u.email} />
          <LRow icon="call-outline" title="Phone" sub={u.phone || '—'} />
          <LRow icon="business-outline" title="Studio" sub={(p ? p.displayName + ' · ' : '') + (p?.addr || '')} />
        </Card>
        <Card flush style={{ marginTop: 14 }}>
          <LRow icon="wallet-outline" title="Payments" sub="Mock mode — payments settle after service" right={<Pill status="pending" label="Mock" />} />
          <LRow icon="notifications-outline" title="Notifications" sub="In-app booking alerts" right={<Btn label="View" variant="o" size="sm" onPress={() => router.push('/notifications')} />} />
          <LRow icon="log-out-outline" title="Log out" sub="Switch account" style={{ borderBottomWidth: 0 }} right={<Btn label="Log out" variant="d" size="sm" onPress={app.logout} />} />
        </Card>
        <Card style={{ marginTop: 14, borderColor: C.redBg }}>
          <Text style={{ color: C.red, fontSize: 13.5, fontWeight: '700' }}>Danger zone</Text>
          <Text style={{ color: C.ink3, fontSize: 12.5, marginVertical: 6 }}>
            Reset all demo data (users, bookings, reviews) back to the seed state.
          </Text>
          <Btn label="Reset demo data" variant="d" size="sm" onPress={() => setConfirmReset(true)} />
        </Card>
        <Note>Glamoora · Beauty Services Marketplace · React Native (Expo) · hackathon MVP v1.0</Note>
      </ScrollView>

      {confirmReset ? (
        <View style={{ ...overlay }}>
          <Pressable style={StyleSheet_abs} onPress={() => setConfirmReset(false)} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30 }}>
            <Text style={{ fontFamily: 'serif', fontSize: 17, color: C.plum, marginBottom: 10 }}>Reset demo data?</Text>
            <Text style={{ color: C.ink2, fontSize: 13.5, marginBottom: 14 }}>This wipes all changes and restores the original seed data.</Text>
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
const StyleSheet_abs: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
