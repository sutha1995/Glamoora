import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';
import { LocBadge } from '../../../components/cards';
import { TopBar } from '../../../components/topbar';
import { Btn, Card, Chip, Note, Row } from '../../../components/ui';
import { activeServicesOf, createBooking, providerSlots, profileOf, serviceOf } from '../../../db/core';
import { AREAS } from '../../../data/seed';
import { useApp } from '../../../store';
import { C } from '../../../theme';
import { addDays, addMin, dISO, fmtDate, fmtDateLong, fmtRM, parseISO } from '../../../utils';

export default function BookScreen() {
  const { id, svc: svcParam } = useLocalSearchParams<{ id: string; svc?: string }>();
  const app = useApp();
  const p = profileOf(id);
  const svcs = useMemo(() => (p ? activeServicesOf(p.id) : []), [p, app.version]);
  const [serviceId, setServiceId] = useState<string>(svcParam || svcs[0]?.id || '');
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loc, setLoc] = useState<'studio' | 'home'>('studio');
  const [locArea, setLocArea] = useState<string>(app.user?.area || AREAS[0].name);
  const [err, setErr] = useState<string | null>(null);
  const u = app.user!;

  const svc = serviceOf(serviceId);

  useEffect(() => {
    if (!id) return;
    app.track('booking_started', { studio: p?.displayName || '' }, { providerId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!serviceId) return;
    const s = serviceOf(serviceId);
    app.track('service_view', { name: s?.name || '', price: s?.price || 0 }, { providerId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)), []);
  const openOn = (dow: number) => {
    if (!p) return false;
    const list = app.db.availability.filter((a) => a.providerId === p.id && a.active && a.day === dow);
    return list.length > 0;
  };

  if (!p) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const slots = date && svc ? providerSlots(p.id, svc.id, date) : [];

  const confirm = () => {
    if (!date || !start || !svc) return;
    const atHome = svc.locationType === 'customer' || (svc.locationType === 'both' && loc === 'home');
    const location = atHome ? locArea : p.addr;
    const res = createBooking(u.id, svc.id, date, start, location, notes);
    if (res.err) {
      setErr(res.err);
      return;
    }
    app.bump();
    router.replace({ pathname: '/book-success/[id]', params: { id: res.booking!.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title="Book a service" sub={p.displayName} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: C.brand }} />
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: date ? C.brand : C.line2 }} />
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: start ? C.brand : C.line2 }} />
        </View>

        <Card style={{ marginBottom: 14 }}>
          <Text style={flbl}>1 · Service</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {svcs.map((s) => (
              <Chip key={s.id} on={serviceId === s.id} onPress={() => { setServiceId(s.id); setDate(null); setStart(null); setErr(null); }}>
                {s.name} · {fmtRM(s.price)}
              </Chip>
            ))}
          </View>
          {svc ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12.5, color: C.ink2, lineHeight: 18 }}>{svc.desc}</Text>
              <Row style={{ gap: 6, marginTop: 8 }}>
                <LocBadge t={svc.locationType} />
                <Chip mono>{svc.duration} min</Chip>
                <Chip mono>{fmtRM(svc.price)}</Chip>
              </Row>
            </View>
          ) : null}
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={flbl}>2 · Date & time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
            {days.map((d) => {
              const iso = dISO(d);
              const off = !openOn(d.getDay());
              return (
                <Pressable
                  key={iso}
                  disabled={off}
                  onPress={() => { setDate(iso); setStart(null); setErr(null); }}
                  style={{
                    width: 64, paddingVertical: 9, borderRadius: 13, borderWidth: 1.5, alignItems: 'center',
                    backgroundColor: date === iso ? C.plum : C.white,
                    borderColor: date === iso ? C.plum : C.line2,
                    opacity: off ? 0.4 : 1,
                  }}
                >
                  <Text style={{ fontSize: 10, color: date === iso ? 'rgba(255,255,255,0.75)' : C.ink3, fontWeight: '600', textTransform: 'uppercase' }}>
                    {parseISO(iso).toLocaleDateString('en-MY', { weekday: 'short' })}
                  </Text>
                  <Text style={{ fontSize: 17, color: date === iso ? C.white : C.plum, fontWeight: '800', marginVertical: 2 }}>{d.getDate()}</Text>
                  <Text style={{ fontSize: 10, color: date === iso ? 'rgba(255,255,255,0.75)' : C.ink3 }}>
                    {parseISO(iso).toLocaleDateString('en-MY', { month: 'short' })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {date ? (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: C.ink3, fontSize: 12, marginBottom: 8 }}>{fmtDateLong(date)} · {svc?.duration + ' min'}</Text>
              {slots.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {slots.map((t) => (
                    <Pressable key={t} onPress={() => { setStart(t); setErr(null); }} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, borderWidth: 1.5, backgroundColor: start === t ? C.brand : C.white, borderColor: start === t ? C.brand : C.line2 }}>
                      <Text style={{ color: start === t ? C.white : C.plum, fontWeight: '700', fontSize: 13 }}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={{ backgroundColor: C.brand50, borderRadius: 12, padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>No slots on this day</Text>
                  <Text style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>Fully booked or unavailable. Try another day.</Text>
                </View>
              )}
            </View>
          ) : null}
        </Card>

        {date && start && svc ? (
          <Card style={{ marginBottom: 14 }}>
            <Text style={flbl}>3 · Details</Text>
            <SumRow k="Service" v={svc.name} />
            <SumRow k="Date" v={fmtDate(date)} />
            <SumRow k="Time" v={start + ' – ' + addMin(start, svc.duration)} />
            {svc.locationType === 'provider' ? (
              <SumRow k="Location" v={p.addr} />
            ) : svc.locationType === 'customer' ? (
              <View style={{ marginTop: 8 }}>
                <Text style={flbl}>Your location</Text>
                <AreaPicker value={locArea} onChange={setLocArea} />
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                <Text style={flbl}>Where should this happen?</Text>
                <View style={{ flexDirection: 'row', backgroundColor: C.brand100, borderRadius: 12, padding: 3, gap: 3, marginBottom: 8 }}>
                  {(['studio', 'home'] as const).map((o) => (
                    <Pressable key={o} onPress={() => setLoc(o)} style={{ flex: 1, paddingVertical: 9, borderRadius: 9, backgroundColor: loc === o ? C.white : 'transparent', alignItems: 'center' }}>
                      <Text style={{ color: loc === o ? C.plum : C.ink2, fontWeight: '700', fontSize: 12.5 }}>{o === 'studio' ? 'Their studio' : 'Your location'}</Text>
                    </Pressable>
                  ))}
                </View>
                {loc === 'home' ? <AreaPicker value={locArea} onChange={setLocArea} /> : null}
              </View>
            )}
            <View style={{ marginTop: 10 }}>
              <Text style={flbl}>Notes for the professional (optional)</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white, padding: 11, fontSize: 14, minHeight: 74, color: C.ink, textAlignVertical: 'top' }}
                placeholder="Allergies, preferences, references…"
                placeholderTextColor={C.ink3}
                multiline
                maxLength={200}
                value={notes}
                onChangeText={setNotes}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1.5, borderStyle: 'dashed', borderTopColor: C.line2, marginTop: 12, paddingTop: 12 }}>
              <Row style={{ gap: 6 }}>
                <Ionicons name="wallet-outline" size={15} color={C.ink3} />
                <Text style={{ color: C.ink3, fontSize: 12 }}>Payment</Text>
              </Row>
              <Text style={{ fontFamily: 'serif', fontSize: 20, color: C.plum, fontWeight: '700' }}>{fmtRM(svc.price)}</Text>
            </View>
            <Note>Pay after the service. Mock payment — no card details collected.</Note>
            {err ? (
              <View style={{ backgroundColor: C.redBg, borderRadius: 10, padding: 10, marginTop: 10 }}>
                <Text style={{ color: C.red, fontSize: 13 }}>{err}</Text>
              </View>
            ) : null}
            <Btn label={'Confirm booking · ' + fmtRM(svc.price)} variant="p" block onPress={confirm} style={{ marginTop: 12 }} />
          </Card>
        ) : (
          <Text style={{ textAlign: 'center', color: C.ink3, fontSize: 13 }}>Select a date, then a time slot to continue.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function SumRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: 12 }}>
      <Text style={{ fontSize: 13.5, color: C.ink3 }}>{k}</Text>
      <Text style={{ fontSize: 13.5, color: C.plum, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}
function AreaPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white, padding: 11, paddingHorizontal: 13 }}>
        <Text style={{ fontSize: 14, color: C.ink }}>{value}</Text>
        <Ionicons name="chevron-down" size={16} color={C.ink3} />
      </Pressable>
      {open ? (
        <View style={{ position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.line, zIndex: 30, maxHeight: 220, shadowColor: C.plum, shadowOpacity: 0.15, shadowRadius: 10, elevation: 8 }}>
          <ScrollView>
            {AREAS.map((a) => (
              <Pressable key={a.name} onPress={() => { onChange(a.name); setOpen(false); }} style={{ paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ fontSize: 13.5, color: C.plum }}>{a.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
const flbl: TextStyle = { fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 };
