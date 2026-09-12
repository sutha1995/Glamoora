import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Btn, Empty } from '../../components/ui';
import { saveDB } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';
import { timeAgo } from '../../utils';

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  booking_new: 'add',
  booking_confirmed: 'checkmark',
  booking_rejected: 'close',
  booking_cancelled: 'close',
  booking_completed: 'checkmark-done',
  review: 'star',
  review_reminder: 'create',
  message: 'chatbubble-ellipses',
  verification: 'shield-checkmark',
  verification_request: 'shield-outline',
  report: 'flag',
};

export default function NotifsScreen() {
  const app = useApp();
  const u = app.user!;
  const ns = app.db.notifs.filter((n) => n.userId === u.id).sort((a, b) => b.createdAt - a.createdAt);
  const unread = ns.filter((n) => !n.read).length;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title="Notifications" sub={u.name} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        {ns.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: C.ink3, fontSize: 12 }}>{unread} new</Text>
            <Btn
              label="Mark all read"
              variant="o"
              size="xs"
              onPress={() => {
                app.db.notifs.forEach((n) => {
                  if (n.userId === u.id) n.read = true;
                });
                void saveDB();
                app.bump();
              }}
            />
          </View>
        ) : null}
        {ns.length ? (
          ns.map((n) => (
            <View key={n.id} style={{ flexDirection: 'row', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line, alignItems: 'flex-start' }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: n.read ? C.brand50 : C.brand, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ionicons name={ICON[n.type] || 'notifications'} size={17} color={n.read ? C.brand700 : C.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: C.plum, fontWeight: '700' }}>{n.title}</Text>
                <Text style={{ fontSize: 12, color: C.ink2, marginTop: 1 }}>{n.msg}</Text>
                <Text style={{ color: C.ink3, fontSize: 10.5, marginTop: 3 }}>{timeAgo(n.createdAt)}</Text>
              </View>
              {n.read ? null : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand, marginTop: 6 }} />}
            </View>
          ))
        ) : (
          <Empty icon="notifications-outline" title="All caught up" text="Booking updates and reminders will appear here." />
        )}
      </ScrollView>
    </View>
  );
}
