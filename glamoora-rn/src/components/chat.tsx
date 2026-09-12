/**
 * Messaging UI (PRD Phase 13) — simple customer ↔ provider text chat.
 *
 * Shared by both roles: the same components render inside `(shared)/messages`
 * and `(shared)/chat/[id]`, so a customer and a provider see one consistent
 * thread. Persistence and unread counts go through the repository.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { repo } from '../db';
import type { Conversation, Message } from '../types';
import { useApp } from '../store';
import { C, SERIF } from '../theme';
import { fmtDate, fmtRM, timeAgo } from '../utils';
import { Avatar, Btn, Card, Empty, Pill, Row } from './ui';

/** Find-or-create a thread and open it. Used by every "Message" entry point. */
export function openThread(customerId: string, providerId: string, bookingId: string | null = null): string {
  const conv = repo.openConversation(customerId, providerId, bookingId);
  router.push({ pathname: '/chat/[id]', params: { id: conv.id } });
  return conv.id;
}

/** Open the thread for a booking, from either side of it. */
export function openThreadForBooking(booking: { id: string; customerId: string; providerId: string }): string {
  return openThread(booking.customerId, booking.providerId, booking.id);
}

/** The other side of a conversation, from the current user's point of view. */
export function otherParty(conv: Conversation) {
  const me = repo.me();
  const profile = repo.profileOf(conv.providerId);
  const iAmProvider = !!me && !!profile && profile.userId === me.id;
  if (iAmProvider) {
    const customer = repo.userById(conv.customerId);
    return {
      id: conv.customerId,
      name: customer?.name || 'Customer',
      sub: customer?.area || 'Glamoora customer',
      kind: 'customer' as const,
    };
  }
  return {
    id: profile?.userId || '',
    name: profile?.displayName || 'Studio',
    sub: profile?.addr || 'Beauty professional',
    kind: 'provider' as const,
    providerId: conv.providerId,
  };
}

function lastMessage(messages: Message[]): Message | undefined {
  return messages.length ? messages[messages.length - 1] : undefined;
}

/* ============================== thread list ============================== */
export function MessagesList({ onOpen }: { onOpen: (conversationId: string) => void }) {
  const app = useApp();
  const u = app.user;
  const v = app.version;

  const rows = useMemo(() => {
    if (!u) return [];
    return repo.conversationsFor(u.id).map((conv) => {
      const msgs = repo.messagesOf(conv.id);
      const other = otherParty(conv);
      const unread = msgs.filter((m) => m.senderId !== u.id && !m.readBy.includes(u.id)).length;
      const booking = conv.bookingId ? app.db.bookings.find((b) => b.id === conv.bookingId) : undefined;
      return { conv, msgs, other, unread, last: lastMessage(msgs), booking };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u?.id, app.db, v]);

  if (!u) return null;

  if (!rows.length) {
    return (
      <Empty
        icon="chatbubbles-outline"
        title="No messages yet"
        text={
          u.role === 'provider'
            ? 'Questions from customers about your services and availability will appear here.'
            : 'Message a professional about their work, pricing or availability before you book.'
        }
        action={u.role === 'provider' ? undefined : 'Find a professional'}
        onAction={u.role === 'provider' ? undefined : () => onOpen('')}
      />
    );
  }

  return (
    <View>
      {rows.map(({ conv, other, unread, last, booking }) => (
        <Pressable key={conv.id} onPress={() => onOpen(conv.id)} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
          <Card style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ position: 'relative' }}>
              <Avatar name={other.name} size={46} />
              {unread > 0 ? (
                <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white }}>
                  <Text style={{ color: C.white, fontSize: 9.5, fontWeight: '800' }}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Row style={{ gap: 6 }}>
                <Text style={{ fontSize: 14, color: C.plum, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{other.name}</Text>
                {booking ? <Pill status={booking.status} /> : null}
              </Row>
              <Text style={{ fontSize: 12.5, color: unread ? C.ink : C.ink3, fontWeight: unread ? '600' : '400', marginTop: 2 }} numberOfLines={2}>
                {last ? (last.senderId === u.id ? 'You: ' : '') + last.body : 'Say hello 👋'}
              </Text>
              {conv.bookingId && booking ? (
                <Text style={{ fontSize: 11, color: C.brand700, marginTop: 3 }} numberOfLines={1}>
                  {repo.serviceOf(booking.serviceId)?.name} · {fmtDate(booking.date)} {booking.start || ''}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 10.5, color: C.ink3, alignSelf: 'flex-start', marginTop: 2 }}>
              {last ? timeAgo(last.createdAt) : ''}
            </Text>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

/* ============================== thread view ============================== */
const QUICK_CUSTOMER = ['Is this slot still free?', 'Do you take walk-ins?', 'What should I prepare?'];
const QUICK_PROVIDER = ['Yes, that slot is free!', 'Please arrive 5 minutes early.', 'Let me check and get back to you.'];

export function ChatThread({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const app = useApp();
  const u = app.user;
  const v = app.version;
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const conv = useMemo(() => repo.conversationById(conversationId), [conversationId, v]);
  const messages = useMemo(() => (conv ? repo.messagesOf(conv.id) : []), [conv, v]);

  useEffect(() => {
    if (conv && u) repo.markThreadRead(conv.id, u.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.id, messages.length, u]);

  useEffect(() => {
    if (messages.length) {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
      return () => clearTimeout(t);
    }
  }, [messages.length]);

  if (!conv || !u) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, padding: 20 }}>
        <Btn label="Back" variant="o" size="sm" onPress={onBack} />
        <Empty icon="chatbubble-outline" title="Conversation not found" text="It may have been removed." />
      </View>
    );
  }

  const other = otherParty(conv);
  const booking = conv.bookingId ? app.db.bookings.find((b) => b.id === conv.bookingId) : undefined;
  const service = booking ? repo.serviceOf(booking.serviceId) : undefined;
  const quick = u.role === 'provider' ? QUICK_PROVIDER : QUICK_CUSTOMER;

  const send = (text: string) => {
    const body = text.trim();
    if (!body) return;
    const res = repo.sendMessage(conv.id, u.id, body);
    if (res.err) {
      setErr(res.err);
      return;
    }
    setErr(null);
    setDraft('');
    app.bump();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      {booking ? (
        <Pressable onPress={() => {}} style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Card style={{ backgroundColor: C.brand50, borderColor: C.brand100, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="calendar" size={16} color={C.brand700} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 12.5, color: C.plum, fontWeight: '700' }} numberOfLines={1}>
                {service?.name || 'Booking'} · {fmtDate(booking.date)} {booking.start || ''}
              </Text>
              <Text style={{ fontSize: 11, color: C.ink3 }} numberOfLines={1}>
                {booking.ref} · {fmtRM(booking.price)} · {booking.location}
              </Text>
            </View>
            <Pill status={booking.status} />
          </Card>
        </Pressable>
      ) : null}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 10, gap: 8 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <Text style={{ textAlign: 'center', fontSize: 11, color: C.ink3, marginBottom: 6 }}>
          This is a demo chat. Never share payment details or pay outside Glamoora.
        </Text>
        {messages.length === 0 ? (
          <Text style={{ textAlign: 'center', fontSize: 12.5, color: C.ink3, paddingVertical: 18 }}>
            No messages yet — say hello to {other.name.split(' ')[0]}.
          </Text>
        ) : null}
        {messages.map((m, i) => {
          const mine = m.senderId === u.id;
          const prev = messages[i - 1];
          const showAvatar = !mine && (!prev || prev.senderId !== m.senderId);
          return (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              {showAvatar ? <Avatar name={other.name} size={26} /> : !mine ? <View style={{ width: 26 }} /> : null}
              <View
                style={{
                  maxWidth: '78%',
                  backgroundColor: mine ? C.plum : C.white,
                  borderWidth: mine ? 0 : 1,
                  borderColor: C.line,
                  borderRadius: 15,
                  borderBottomRightRadius: mine ? 5 : 15,
                  borderBottomLeftRadius: mine ? 15 : 5,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontSize: 13.5, color: mine ? C.white : C.ink, lineHeight: 19 }}>{m.body}</Text>
                <Text style={{ fontSize: 9.5, color: mine ? 'rgba(255,255,255,0.6)' : C.ink3, marginTop: 3, textAlign: 'right' }}>
                  {new Date(m.createdAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                  {mine ? (m.readBy.length > 1 ? ' · read' : ' · sent') : ''}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          {quick.map((q) => (
            <Pressable key={q} onPress={() => send(q)} style={{ backgroundColor: C.brand50, borderWidth: 1, borderColor: C.brand100, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
              <Text style={{ fontSize: 11.5, color: C.brand800, fontWeight: '600' }}>{q}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {err ? (
        <View style={{ marginHorizontal: 16, marginBottom: 6, backgroundColor: C.redBg, borderRadius: 10, padding: 9 }}>
          <Text style={{ color: C.red, fontSize: 12.5 }}>{err}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>
        <TextInput
          style={{ flex: 1, backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 10, fontSize: 14, color: C.ink, maxHeight: 96 }}
          placeholder={`Message ${other.name.split(' ')[0]}…`}
          placeholderTextColor={C.ink3}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={1000}
        />
        <Pressable
          onPress={() => send(draft)}
          disabled={!draft.trim()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: draft.trim() ? C.plum : C.line2, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="send" size={18} color={C.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Headline for the thread screen: who you are talking to. */
export function threadTitle(conversationId: string): { title: string; sub: string } {
  const conv = repo.conversationById(conversationId);
  if (!conv) return { title: 'Messages', sub: '' };
  const other = otherParty(conv);
  return {
    title: other.name,
    sub: other.kind === 'provider' ? 'Beauty professional' : 'Customer',
  };
}

export function ThreadHeaderName({ conversationId }: { conversationId: string }) {
  const t = threadTitle(conversationId);
  return <Text style={{ fontFamily: SERIF, fontSize: 16, color: C.plum }}>{t.title}</Text>;
}
