import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Btn, Pill } from '../../components/ui';
import { removeBlocked, serviceOf, userById } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';
import { addDays, dISO, todayISO } from '../../utils';

export default function CalendarScreen() {
  const app = useApp();
  const [offset, setOffset] = useState(0);
  const p = app.db.profiles.find((x) => x.userId === app.user?.id);
  const t0 = todayISO();

  const monday = useMemo(() => {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day + offset * 7);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  if (!p) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const label =
    days[0].toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) +
    ' – ' +
    days[6].toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title="Calendar" sub={label} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Pressable onPress={() => setOffset((o) => o - 1)} style={{ backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, width: 40, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={16} color={C.plum} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', color: C.plum, fontSize: 13.5 }}>{label}</Text>
          <Pressable onPress={() => setOffset((o) => o + 1)} style={{ backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, width: 40, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-forward" size={16} color={C.plum} />
          </Pressable>
        </View>

        {days.map((d) => {
          const iso = dISO(d);
          const isToday = iso === t0;
          const bs = app.db.bookings.filter((b) => b.providerId === p.id && b.date === iso).sort((a, b) => a.start!.localeCompare(b.start!));
          const bl = app.db.blocked.filter((k) => k.providerId === p.id && k.start.slice(0, 10) === iso);
          const w = app.db.availability.find((a) => a.providerId === p.id && a.active && a.day === d.getDay());
          return (
            <View key={iso} style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: isToday ? C.brand : C.bg, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: isToday ? C.white : C.plum }}>
                  {d.toLocaleDateString('en-MY', { weekday: 'long' })} {d.getDate()}
                  {isToday ? ' · Today' : ''}
                </Text>
                <Text style={{ marginLeft: 'auto', fontWeight: '600', fontSize: 11, color: isToday ? 'rgba(255,255,255,0.8)' : C.ink3 }}>
                  {w ? w.start + '–' + w.end : 'Closed'}
                </Text>
              </View>
              {bl.map((k) => (
                <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: '#FBF3F0' }}>
                  <Text style={{ fontWeight: '800', color: C.plum, width: 44, fontSize: 12 }}>{k.start.slice(11, 16)}</Text>
                  <Text style={{ flex: 1, color: C.ink2, fontSize: 12.5 }} numberOfLines={1}>
                    Blocked · {k.reason}
                  </Text>
                  <Btn
                    label="Remove"
                    variant="o"
                    size="xs"
                    onPress={() => {
                      removeBlocked(k.id);
                      app.bump();
                    }}
                  />
                </View>
              ))}
              {bs.map((b) => {
                const s = serviceOf(b.serviceId);
                const cu = userById(b.customerId);
                return (
                  <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line }}>
                    <Text style={{ fontWeight: '800', color: C.plum, width: 44, fontSize: 12 }}>{b.start}</Text>
                    <Text style={{ flex: 1, color: C.ink2, fontSize: 12.5 }} numberOfLines={1}>
                      {s?.name} — {cu?.name}
                    </Text>
                    <Pill status={b.status} />
                  </View>
                );
              })}
              {!bs.length && !bl.length ? (
                <Text style={{ color: C.ink3, fontSize: 12.5, paddingHorizontal: 12, paddingVertical: 10 }}>
                  {w ? 'No bookings — free to take requests.' : 'Closed this day.'}
                </Text>
              ) : null}
            </View>
          );
        })}

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
          <Legend c={C.amberBg} t="Pending" />
          <Legend c={C.greenBg} t="Booked" />
          <Legend c="#F5E6E0" t="Blocked" />
        </View>
      </ScrollView>
    </View>
  );
}
function Legend({ c, t }: { c: string; t: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c, borderWidth: 1, borderColor: C.line2 }} />
      <Text style={{ fontSize: 11, color: C.ink3 }}>{t}</Text>
    </View>
  );
}
