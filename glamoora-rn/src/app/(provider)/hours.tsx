import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Btn, Card, Note } from '../../components/ui';
import { addBlocked, addBreak, removeBlocked, removeBreak, setAvailability } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';
import { WEEKDAYS, todayISO } from '../../utils';

const TIMES: string[] = (() => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  }
  return out;
})();

export default function HoursScreen() {
  const app = useApp();
  const p = app.db.profiles.find((x) => x.userId === app.user?.id);
  const [breakDay, setBreakDay] = useState<number | null>(null);
  const [blockDate, setBlockDate] = useState<string | null>(null);
  if (!p) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const today = new Date().getDay();

  const winFor = (day: number) => {
    const list = app.db.availability.filter((a) => a.providerId === p.id && a.active && a.day === day);
    if (!list.length) return null;
    list.sort((a, b) => a.start.localeCompare(b.start));
    return list[0];
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title="Availability" sub="Weekly hours, breaks & blocked dates" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
          <Note style={{ marginBottom: 14 }}>Changes apply immediately to the slots customers can book. Existing bookings are never affected.</Note>
          {WEEKDAYS.map((nm, i) => {
            const w = winFor(i);
            const brs = app.db.breaks.filter((b) => b.providerId === p.id && b.day === i);
            return (
              <Card key={nm} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Pressable
                    onPress={() => { setAvailability(p.id, i, !w); app.bump(); }}
                    style={{ width: 42, height: 25, borderRadius: 999, backgroundColor: w ? C.green : C.line2, justifyContent: 'center', paddingHorizontal: 3, marginRight: 10 }}
                  >
                    <View style={{ width: 19, height: 19, borderRadius: 9.5, backgroundColor: C.white, transform: [{ translateX: w ? 17 : 0 }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 1 }} />
                  </Pressable>
                  <Text style={{ color: C.plum, fontSize: 14, fontWeight: '700' }}>{nm}</Text>
                  {i === today ? (
                    <View style={{ backgroundColor: C.brand100, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                      <Text style={{ fontSize: 10, color: C.brand800, fontWeight: '600' }}>today</Text>
                    </View>
                  ) : null}
                </View>
                {w ? (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TimePick value={w.start} onChange={(v) => { setAvailability(p.id, i, true, v, w.end); app.bump(); }} />
                    <Text style={{ color: C.ink3, fontSize: 12 }}>to</Text>
                    <TimePick value={w.end} onChange={(v) => { setAvailability(p.id, i, true, w.start, v); app.bump(); }} />
                  </View>
                ) : (
                  <Text style={{ color: C.ink3, fontSize: 12.5 }}>Closed</Text>
                )}
                {brs.length ? (
                  <View style={{ marginTop: 8, gap: 6 }}>
                    {brs.map((b) => (
                      <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ fontSize: 12, color: C.ink2, fontWeight: '500' }}>{b.start}–{b.end}</Text>
                        </View>
                        <View style={{ flex: 1 }} />
                        <Btn label="Remove break" variant="d" size="xs" onPress={() => { removeBreak(b.id); app.bump(); }} />
                      </View>
                    ))}
                  </View>
                ) : null}
                <Btn label="Add break" variant="o" size="xs" icon="add" style={{ marginTop: 8, alignSelf: 'flex-start' }} onPress={() => setBreakDay(i)} />
              </Card>
            );
          })}

          <Text style={{ fontFamily: 'serif', fontSize: 16.5, color: C.plum, fontWeight: '600', marginTop: 18, marginBottom: 10 }}>Blocked dates</Text>
          <BlockForm
            selectedDate={blockDate}
            onPick={(d) => setBlockDate(d)}
          />
          <Card flush>
            {app.db.blocked.filter((k) => k.providerId === p.id).sort((a, b) => a.start.localeCompare(b.start)).map((k) => (
              <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.brand50, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="ban" size={17} color={C.brand700} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: C.plum, fontWeight: '700' }}>{k.start.slice(11, 16)}–{k.end.slice(11, 16)} · {k.start.slice(0, 10)}</Text>
                  <Text style={{ fontSize: 11.5, color: C.ink3 }}>{k.reason || 'Blocked'}</Text>
                </View>
                <Btn label="Remove" variant="d" size="xs" onPress={() => { removeBlocked(k.id); app.bump(); }} />
              </View>
            ))}
            {!app.db.blocked.some((k) => k.providerId === p.id) ? (
              <Text style={{ color: C.ink3, fontSize: 12.5, padding: 12 }}>No blocked times. You are open per your weekly hours.</Text>
            ) : null}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      {breakDay !== null ? (
        <TimeSheet
          title="Add a break"
          a="12:30"
          b="13:30"
          onConfirm={(s, e) => {
            if (parseInt(s) >= parseInt(e)) {
              app.showToast('Break end must be after start');
              return;
            }
            addBreak(p.id, breakDay, s, e);
            app.bump();
            setBreakDay(null);
          }}
          onClose={() => setBreakDay(null)}
        />
      ) : null}
    </View>
  );
}

function TimePick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ position: 'relative', flex: 1 }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white, padding: 9, paddingHorizontal: 10, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, color: C.ink, fontWeight: '600' }}>{value}</Text>
        <Ionicons name="chevron-down" size={14} color={C.ink3} />
      </Pressable>
      {open ? (
        <View style={{ position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.line, zIndex: 40, maxHeight: 190, shadowColor: C.plum, shadowOpacity: 0.18, shadowRadius: 10, elevation: 10 }}>
          <ScrollView>
            {TIMES.map((t) => (
              <Pressable key={t} onPress={() => { onChange(t); setOpen(false); }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ fontSize: 13, color: t === value ? C.brand700 : C.ink }}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function BlockForm({ selectedDate, onPick }: { selectedDate: string | null; onPick: (d: string) => void }) {
  const app = useApp();
  const p = app.db.profiles.find((x) => x.userId === app.user?.id)!;
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('12:00');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { iso, label: d.getDate() + ' ' + d.toLocaleDateString('en-MY', { weekday: 'short', month: 'short' }) };
  });
  return (
    <Card style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Date</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
        {days.map((d) => (
          <Pressable
            key={d.iso}
            onPress={() => onPick(d.iso)}
            style={{
              paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
              backgroundColor: selectedDate === d.iso ? C.plum : C.white,
              borderColor: selectedDate === d.iso ? C.plum : C.line2,
            }}
          >
            <Text style={{ fontSize: 12, color: selectedDate === d.iso ? C.white : C.plum, fontWeight: '600' }}>{d.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TimePick value={start} onChange={setStart} />
        <Text style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>to</Text>
        <TimePick value={end} onChange={setEnd} />
      </View>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 }}>Reason (optional)</Text>
      <TextInput style={{ borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white, padding: 10, paddingHorizontal: 12, fontSize: 14, color: C.ink }} value={reason} onChangeText={setReason} placeholder="e.g. Appointment, travel, rest" placeholderTextColor={C.ink3} />
      {err ? (
        <View style={{ backgroundColor: C.redBg, borderRadius: 10, padding: 10, marginTop: 10 }}>
          <Text style={{ color: C.red, fontSize: 13 }}>{err}</Text>
        </View>
      ) : null}
      <Btn
        label="Block this time"
        variant="p"
        size="sm"
        block
        style={{ marginTop: 12 }}
        onPress={() => {
          if (!selectedDate) { setErr('Pick a date first.'); return; }
          if (parseInt(start) >= parseInt(end)) { setErr('End must be after start.'); return; }
          const res = addBlocked(p.id, selectedDate, start, end, reason.trim());
          if (res.err) { setErr(res.err); return; }
          setErr(null);
          setReason('');
          onPick('');
          app.bump();
          app.showToast('Time blocked');
        }}
      />
    </Card>
  );
}

function TimeSheet({ title, a, b, onConfirm, onClose }: { title: string; a: string; b: string; onConfirm: (s: string, e: string) => void; onClose: () => void }) {
  const [s, setS] = useState(a);
  const [e, setE] = useState(b);
  return (
    <View style={{ ...StyleSheet_overlay }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30 }}>
        <Text style={{ fontFamily: 'serif', fontSize: 17, color: C.plum, marginBottom: 14 }}>{title}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TimePick value={s} onChange={setS} />
          <Text style={{ color: C.ink3, fontSize: 12 }}>to</Text>
          <TimePick value={e} onChange={setE} />
        </View>
        <Btn label="Add break" variant="p" block style={{ marginTop: 14 }} onPress={() => onConfirm(s, e)} />
      </View>
    </View>
  );
}
const StyleSheet_overlay = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(40,22,27,0.5)' } as const;
