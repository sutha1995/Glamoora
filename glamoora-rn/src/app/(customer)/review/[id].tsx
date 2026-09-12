import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Avatar, Btn, Card, StarPicker } from '../../components/ui';
import { addReview, profileOf, serviceOf } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';
import { fmtDate } from '../../utils';

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const b = app.db.bookings.find((x) => x.id === id);
  if (!b || b.customerId !== app.user?.id || b.status !== 'completed') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <TopBar back title="Review" />
      </View>
    );
  }
  const s = serviceOf(b.serviceId);
  const p = profileOf(b.providerId);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title="Leave a review" sub={p?.displayName} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Card style={{ alignItems: 'center' }}>
          <Avatar name={p?.displayName || '?'} size={64} />
          <Text style={{ fontFamily: 'serif', fontSize: 17, color: C.plum, marginTop: 10 }}>{p?.displayName}</Text>
          <Text style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>{s?.name} · {fmtDate(b.date)}</Text>
          <StarPicker value={stars} onChange={setStars} />
          <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Your review</Text>
            <TextInput
              style={{ borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white, padding: 11, fontSize: 14, minHeight: 80, color: C.ink, textAlignVertical: 'top' }}
              placeholder="How was the experience? Results? Hygiene? Would you recommend?"
              placeholderTextColor={C.ink3}
              multiline
              value={comment}
              onChangeText={setComment}
            />
          </View>
          {err ? (
            <View style={{ alignSelf: 'stretch', backgroundColor: C.redBg, borderRadius: 10, padding: 10, marginTop: 10 }}>
              <Text style={{ color: C.red, fontSize: 13 }}>{err}</Text>
            </View>
          ) : null}
          <Btn
            label="Submit review"
            variant="p"
            block
            disabled={stars === 0}
            onPress={() => {
              const res = addReview(b.id, stars, comment);
              if (res.err) {
                setErr(res.err);
                return;
              }
              app.bump();
              app.showToast('Thank you! Your review is live. ✦');
              router.replace('/bookings');
            }}
            style={{ marginTop: 12, alignSelf: 'stretch' }}
          />
        </Card>
      </ScrollView>
    </View>
  );
}
