import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PGrid, PortfolioTile, ServiceRow, VerifiedTick } from '../../../components/cards';
import { ReportLink, ReportSheet, type ReportRequest } from '../../../components/report';
import { openThread } from '../../../components/chat';
import { TopBar } from '../../../components/topbar';
import { Avatar, Card, Chip, Empty, Pill, Row, Sp, Stars } from '../../../components/ui';
import { activeServicesOf, availMap, catOf, isFav, me, providerSlots, profileOf, reviewsOf, serviceOf, toggleFavourite, userById } from '../../../db/core';
import { useApp } from '../../../store';
import { C } from '../../../theme';
import { addDays, dISO, haversine, parseISO, timeAgo, todayISO } from '../../../utils';

export default function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const [tab, setTab] = useState<'services' | 'portfolio' | 'reviews' | 'hours'>('services');
  const [report, setReport] = useState<ReportRequest | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
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
  useEffect(() => {
    if (id) app.track('provider_view', { name: p?.displayName || '' }, { providerId: id });
    // Fire once per profile opened, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const u = me();
  if (!p || !data || !u) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
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
            {u.role === 'customer' && !suspended ? (
              <Pressable
                onPress={() => openThread(u.id, p.id)}
                style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={17} color={C.white} />
              </Pressable>
            ) : null}
            {u.role === 'customer' && !suspended ? (
              <Pressable
                onPress={() => setReport({ targetType: 'provider', targetId: p.id, label: p.displayName })}
                style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="flag-outline" size={17} color={C.ink3} />
              </Pressable>
            ) : null}
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
            data.port.length ? <PGrid items={data.port} onItem={(i) => setLightbox(i)} /> : <Empty icon="images-outline" title="No portfolio yet" text="Work samples will appear here." />
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
                        {u.role === 'customer' && r.customerId !== u.id ? (
                          <View style={{ marginTop: 7, alignSelf: 'flex-end' }}>
                            <ReportLink onPress={() => setReport({ targetType: 'review', targetId: r.id, label: `${r.rating}-star review on ${p.displayName}` })} />
                          </View>
                        ) : null}
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
              {Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)).map((d, i) => {
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

      {lightbox !== null && data.port[lightbox] ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 150, backgroundColor: 'rgba(40,22,27,0.72)', justifyContent: 'center', padding: 22 }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setLightbox(null)} />
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 320 }}>
              <PortfolioTile item={data.port[lightbox]} />
            </View>
            <Text style={{ color: C.white, fontSize: 13.5, marginTop: 12, textAlign: 'center' }}>
              {data.port[lightbox].caption || p.displayName}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11.5, marginTop: 3 }}>
              {serviceOf(data.port[lightbox].serviceId)?.name || p.displayName}
            </Text>
            <View style={{ flexDirection: 'row', gap: 9, marginTop: 16 }}>
              <Pressable onPress={() => setLightbox(null)} style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 11, paddingHorizontal: 16, paddingVertical: 9 }}>
                <Text style={{ color: C.white, fontSize: 12.5, fontWeight: '700' }}>Close</Text>
              </Pressable>
              {u.role === 'customer' ? (
                <Pressable
                  onPress={() => { const it = data.port[lightbox]; setLightbox(null); setReport({ targetType: 'portfolio', targetId: it.id, label: it.caption || p.displayName }); }}
                  style={{ backgroundColor: C.white, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 9 }}
                >
                  <Text style={{ color: C.red, fontSize: 12.5, fontWeight: '700' }}>Report artwork</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {report ? <ReportSheet request={report} onClose={() => setReport(null)} /> : null}
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
