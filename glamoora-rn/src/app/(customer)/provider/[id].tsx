import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PGrid, ServiceRow, VerifiedTick } from '../../components/cards';
import { TopBar } from '../../components/topbar';
import { Avatar, Card, Chip, Empty, Pill, Row, Sp, Stars } from '../../components/ui';
import { activeServicesOf, availMap, catOf, isFav, me, providerSlots, profileOf, reviewsOf, toggleFavourite, userById } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';
import { addDays, dISO, haversine, parseISO, timeAgo, todayISO } from '../../utils';

export default function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const [tab, setTab] = useState<'services' | 'portfolio' | 'reviews' | 'hours'>('services');
  const p = profileOf(id);
  const appVersion = app.version;

  const data = useMemo(() => {
    if (!p) return null;
    return {
      svcs: activeServicesOf(p.id),
      port: app.db.portfolio.filter((x) => x.providerId === p.id),
      revs: reviewsOf(p.id),
      am: availMap(p.id),
      dist: me() ? haversine(me()!.lat, me()!.lng, p.lat, p.lng) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, app.db, appVersion]);
  if (!p || !data) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const u = me()!;
  const fav = u.role === 'customer' && isFav(u.id, p.id);
  const suspended = p.verification === 'suspended';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title={p.displayName} sub={p.addr} />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={{ height: 120, backgroundColor: C.brand, margin: 16, marginTop: 16, borderRadius: 18, overflow: 'hidden', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <Ionicons name="sparkles" size={120} color="rgba(255,255,255,0.14)" style={{ position: 'absolute', right: -18, bottom: -24 }} />
        </View>
        <View style={{ alignItems: 'center', marginTop: -46 }}>
          <Avatar name={p.displayName} size={84} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 9 }}>
            <Text style={{ fontFamily: 'serif', fontSize: 20, color: C.plum, fontWeight: '600' }}>{p.displayName}</Text>
          </View>
          <Row style={{ gap: 6, marginTop: 3 }}>
            {p.verification === 'verified' ? <Pill status="verified" /> : p.verification === 'pending' ? <Pill status="pending" label="Verification pending" /> : null}
            <Stars n={Math.round(p.avg)} size={13} />
            <Text style={{ color: C.plum, fontWeight: '700', fontSize: 13 }}>{p.avg.toFixed(1)}</Text>
            <Text style={{ color: C.ink3, fontSize: 12 }}>({p.reviewCount}) · {data.dist.toFixed(1)} km</Text>
          </Row>
          <Text style={{ color: C.ink2, fontSize: 13, textAlign: 'center', marginTop: 10, paddingHorizontal: 24, lineHeight: 19 }}>{p.bio}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {p.categoryIds.map((cid) => {
              const c = catOf(cid);
              return c ? <Chip key={cid}>{c.name}</Chip> : null;
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {u.role === 'customer' && (
              <Pressable
                onPress={() => { toggleFavourite(u.id, p.id); app.bump(); }}
                style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: fav ? C.brand50 : C.white, borderWidth: 1.5, borderColor: fav ? C.brand100 : C.line2, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name={fav ? 'heart' : 'heart-outline'} size={18} color={fav ? C.brand : C.brand700} />
              </Pressable>
            )}
            <Card flush style={{ padding: 10 }}>
              <Text style={{ fontSize: 12.5, color: C.ink2, fontWeight: '600' }}>
                {data.am[parseISO(todayISO()).getDay()] ? 'Open today' : 'Closed today'}
              </Text>
            </Card>
          </View>
        </View>

        {suspended ? (
          <View style={{ marginHorizontal: 16, marginTop: 14, backgroundColor: C.redBg, borderRadius: 10, padding: 10 }}>
            <Text style={{ color: C.red, fontSize: 13 }}>This professional is currently suspended and cannot receive bookings.</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 6, margin: 16, backgroundColor: C.brand100, padding: 4, borderRadius: 12 }}>
          {(['services', 'portfolio', 'reviews', 'hours'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: 9, backgroundColor: tab === t ? C.white : 'transparent', alignItems: 'center' }}>
              <Text style={{ color: tab === t ? C.plum : C.ink2, fontWeight: '700', fontSize: 12, textTransform: 'capitalize' }}>{t}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {tab === 'services' ? (
            <Card flush>
              {data.svcs.length ? (
                data.svcs.map((s) => <ServiceRow key={s.id} providerId={p.id} serviceId={s.id} bookable={!suspended} />)
              ) : (
                <Empty icon="pricetag-outline" title="No services yet" text="This professional hasn't listed services." />
              )}
            </Card>
          ) : tab === 'portfolio' ? (
            data.port.length ? <PGrid items={data.port} /> : <Empty icon="images-outline" title="No portfolio yet" text="Work samples will appear here." />
          ) : tab === 'reviews' ? (
            <View>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <Text style={{ fontFamily: 'serif', fontSize: 30, color: C.plum }}>{p.avg.toFixed(1)}</Text>
                <View>
                  <Stars n={Math.round(p.avg)} size={14} />
                  <Text style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>{p.reviewCount} reviews</Text>
                </View>
              </Card>
              {data.revs.length ? (
                <Card flush>
                  {data.revs.map((r) => {
                    const cu = userById(r.customerId);
                    return (
                      <View key={r.id} style={{ padding: 11, borderBottomWidth: 1, borderBottomColor: C.line }}>
                        <Row style={{ gap: 8 }}>
                          <Avatar name={cu?.name || 'Guest'} size={30} />
                          <Text style={{ fontWeight: '700', fontSize: 13, color: C.plum }}>{cu ? cu.name.split(' ')[0] : 'Guest'}</Text>
                          <Stars n={r.rating} size={11} />
                          <Sp />
                          <Text style={{ color: C.ink3, fontSize: 11 }}>{timeAgo(r.createdAt)}</Text>
                        </Row>
                        {r.comment ? <Text style={{ fontSize: 12.5, color: C.ink2, marginTop: 5 }}>{r.comment}</Text> : null}
                      </View>
                    );
                  })}
                </Card>
              ) : (
                <Empty icon="star-outline" title="No reviews yet" text="Reviews appear after completed bookings." />
              )}
            </View>
          ) : (
            <Card flush>
              {Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)).map((d) => {
                const iso = dISO(d);
                const w = data.am[d.getDay()];
                const name = i === 0 ? 'Today' : parseISO(iso).toLocaleDateString('en-MY', { weekday: 'long' });
                if (!w) return <HourRow key={iso} name={name} right={<Text style={{ color: C.ink3, fontSize: 12 }}>Closed</Text>} />;
                const svc0 = data.svcs[0];
                const n = svc0 ? providerSlots(p.id, svc0.id, iso).length : 0;
                return (
                  <HourRow
                    key={iso}
                    name={name}
                    mid={<Text style={{ color: C.ink2, fontSize: 13 }}>{w.start}–{w.end}</Text>}
                    right={
                      !data.svcs.length ? <Text style={{ color: C.ink3, fontSize: 11, fontWeight: '700' }}>—</Text>
                      : n === 0 ? <Text style={{ color: C.amber, fontSize: 11, fontWeight: '700' }}>Fully booked</Text>
                      : <Text style={{ color: C.green, fontSize: 11, fontWeight: '700' }}>{n} slots</Text>
                    }
                  />
                );
              })}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
function HourRow({ name, mid, right }: { name: string; mid?: React.ReactNode; right: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9.5, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: 14 }}>
      <Text style={{ color: C.plum, fontWeight: '700', fontSize: 13, width: 92 }}>{name}</Text>
      <View style={{ flex: 1 }}>{mid}</View>
      {right}
    </View>
  );
}
