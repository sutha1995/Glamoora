/**
 * Report sheet — how customers flag a studio, an artwork or a review.
 * Files a `Report` through the repository; admins triage it in the console.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from 'react-native';
import { repo } from '../db';
import type { ReportTarget } from '../types';
import { useApp } from '../store';
import { C, SERIF } from '../theme';
import { Btn, Chip, Note } from './ui';

const REASONS: Record<ReportTarget, string[]> = {
  provider: [
    'Misleading pricing',
    'No-show or unprofessional behaviour',
    'Asked to pay outside Glamoora',
    'Fake or incentivised reviews',
    'Spam or harassment',
    'Other',
  ],
  portfolio: [
    'Photos do not match the actual work',
    'Inappropriate content',
    "Someone else's work",
    'Other',
  ],
  review: [
    'Fake or incentivised review',
    'Abusive or hateful content',
    'Spam or advertising',
    'Other',
  ],
};

export interface ReportRequest {
  targetType: ReportTarget;
  targetId: string;
  /** Shown in the sheet header so the reporter knows what they are flagging. */
  label: string;
}

export function ReportSheet({ request, onClose }: { request: ReportRequest; onClose: () => void }) {
  const app = useApp();
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const u = app.user;

  const submit = () => {
    if (!u) {
      setErr('Log in to file a report.');
      return;
    }
    const res = repo.fileReport({
      reporterId: u.id,
      targetType: request.targetType,
      targetId: request.targetId,
      reason,
      detail,
    });
    if (res.err) {
      setErr(res.err);
      return;
    }
    app.bump();
    app.showToast('Report sent — the Glamoora team will review it.');
    onClose();
  };

  return (
    <View style={overlay}>
      <Pressable style={backdrop} onPress={onClose} />
      <View style={sheet}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: C.redBg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flag" size={16} color={C.red} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 16.5, color: C.plum, fontWeight: '600' }}>
              Report {request.targetType === 'provider' ? 'this studio' : request.targetType === 'portfolio' ? 'this artwork' : 'this review'}
            </Text>
            <Text style={{ fontSize: 11.5, color: C.ink3 }} numberOfLines={1}>{request.label}</Text>
          </View>
          <Pressable onPress={onClose} style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.brand50, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={16} color={C.plum} />
          </Pressable>
        </View>

        <ScrollView style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled">
          <Text style={lbl}>Reason</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 6 }}>
            {REASONS[request.targetType].map((r) => (
              <Chip key={r} on={reason === r} onPress={() => { setReason(r); setErr(null); }}>{r}</Chip>
            ))}
          </View>
          <Text style={lbl}>Details (optional)</Text>
          <TextInput
            style={input}
            value={detail}
            onChangeText={setDetail}
            placeholder="What happened? Include dates or amounts if relevant."
            placeholderTextColor={C.ink3}
            multiline
            maxLength={500}
          />
          {err ? (
            <View style={{ backgroundColor: C.redBg, borderRadius: 10, padding: 10, marginTop: 10 }}>
              <Text style={{ color: C.red, fontSize: 13 }}>{err}</Text>
            </View>
          ) : null}
          <Note>
            Reports are reviewed by the Glamoora team. Filing a false report can lead to your account being
            restricted. Never share payment details here.
          </Note>
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 14 }}>
            <Btn label="Cancel" variant="o" size="sm" block onPress={onClose} />
            <Btn label="Send report" variant="d" size="sm" block disabled={!reason} onPress={submit} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/** Small flag button used next to reviews and portfolio items. */
export function ReportLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name="flag-outline" size={12} color={C.ink3} />
      <Text style={{ fontSize: 11, color: C.ink3 }}>Report</Text>
    </Pressable>
  );
}

const overlay: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, backgroundColor: 'rgba(40,22,27,0.5)' };
const backdrop: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
const sheet: ViewStyle = {
  position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg,
  borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, maxHeight: '85%',
};
const lbl = { fontSize: 11.5, fontWeight: '700' as const, color: C.ink2, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 7, marginTop: 10 };
const input = {
  borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white,
  padding: 11, fontSize: 14, minHeight: 76, color: C.ink, textAlignVertical: 'top' as const,
};
