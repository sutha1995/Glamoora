import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { ChatThread, threadTitle } from '../../../components/chat';
import { TopBar } from '../../../components/topbar';
import { C } from '../../../theme';

/** One conversation, rendered for whichever side of it is signed in. */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { title, sub } = threadTitle(id);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title={title} sub={sub} />
      <ChatThread conversationId={id} onBack={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} />
    </View>
  );
}
