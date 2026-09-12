import { router } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { MessagesList } from '../../components/chat';
import { TopBar } from '../../components/topbar';
import { repo } from '../../db';
import { useApp } from '../../store';
import { C } from '../../theme';

/**
 * Shared by customers and providers (PRD Phase 13). Lives in the `(shared)`
 * group so neither role's tab bar is mounted while messaging.
 */
export default function MessagesScreen() {
  const app = useApp();
  const u = app.user;
  if (!u) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const threads = repo.conversationsFor(u.id).length;
  const unread = repo.unreadMessages(u.id);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title="Messages" sub={unread ? `${unread} unread · ${threads} thread${threads === 1 ? '' : 's'}` : `${threads} thread${threads === 1 ? '' : 's'}`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <MessagesList
          onOpen={(id) => (id ? router.push({ pathname: '/chat/[id]', params: { id } }) : router.replace('/discover'))}
        />
      </ScrollView>
    </View>
  );
}
