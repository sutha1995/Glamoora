import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Avatar, Btn, Card, Chip, Empty, LRow, Pill, StatBox, SwitchRow } from '../../components/ui';
import { profileOf, setBookingStatusAdmin, setCategoryActive, setVerification, serviceOf, userById } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';
import { fmtDate, fmtRM } from '../../utils';
import { MetricsPanel } from '../../components/metrics';
import { ReportsPanel, VerificationQueue } from '../../components/reports';
import type { BookingStatus } from '../../types';

type Tab = 'overview' | 'providers' | 'reports' | 'categories' | 'bookings' | 'users' | 'metrics';

export default function AdminScreen() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const d = app.db;
  const customers = d.users.filter((u) => u.role === 'customer').length;
  const providers = d.users.filter((u) => u.role === 'provider').length;
  const doneN = d.bookings.filter((b) => b.status === 'completed').length;
  const cancelledN = d.bookings.filter((b) => ['cancelled', 'rejected'].includes(b.status)).length;
  const completion = d.bookings.length ? Math.round((doneN / d.bookings.length) * 100) : 0;
  const abv = d.bookings.length ? Math.round(d.bookings.reduce((a, b) => a + b.price, 0) / d.bookings.length) : 0;
  const revN = d.bookings.filter((b) => b.status === 'completed').reduce((a, b) => a + b.price, 0);
  const top = [...d.profiles].sort((a, b) => b.avg - a.avg).slice(0, 5);

  const openReports = d.reports.filter((r) => r.status === 'open').length;
  const pendingVerif = d.profiles.filter((p) => p.verification === 'pending').length;
  const TABS: { k: Tab; label: string; badge?: number }[] = [
    { k: 'overview', label: 'Overview' },
    { k: 'providers', label: 'Providers', badge: pendingVerif },
    { k: 'reports', label: 'Reports', badge: openReports },
    { k: 'categories', label: 'Categories' },
    { k: 'bookings', label: 'Bookings' },
    { k: 'users', label: 'Users' },
    { k: 'metrics', label: 'Metrics' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Admin console" sub="Marketplace controls" right={
        <Pressable onPress={app.logout} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.brand50, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="log-out-outline" size={18} color={C.plum} />
        </Pressable>
      } />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 14 }}>
          {TABS.map((t) => (
            <Pressable key={t.k} onPress={() => setTab(t.k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, backgroundColor: tab === t.k ? C.plum : C.white, borderColor: tab === t.k ? C.plum : C.line2 }}>
              <Text style={{ color: tab === t.k ? C.white : C.ink2, fontWeight: '700', fontSize: 12.5 }}>{t.label}</Text>
              {!!t.badge && (
                <View style={{ minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: tab === t.k ? C.white : C.brand, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: tab === t.k ? C.plum : C.white }}>{t.badge}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'overview' ? (
          <View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <StatBox value={String(customers)} label="Customers" />
              <StatBox value={String(providers)} label="Providers" />
              <StatBox value={String(d.bookings.length)} label="Bookings" />
              <StatBox value={completion + '%'} label="Completed" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <StatBox value={fmtRM(abv)} label="Avg booking" small />
              <StatBox value={fmtRM(revN)} label="GMV (done)" small />
              <StatBox value={String(cancelledN)} label="Cancelled" />
              <StatBox value={String(d.reviews.length)} label="Reviews" />
            </View>
            <Text style={{ fontFamily: 'serif', fontSize: 16.5, color: C.plum, fontWeight: '600', marginBottom: 10 }}>Top rated providers</Text>
            <Card flush>
              {top.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <Avatar name={p.displayName} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: C.plum, fontWeight: '700' }}>{p.displayName}</Text>
                    <Text style={{ fontSize: 11, color: C.ink3 }} numberOfLines={1}>
                      {p.categoryIds.map((id) => d.categories.find((c) => c.id === id)?.name).filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Ionicons key={i} name={i <= Math.round(p.avg) ? 'star' : 'star-outline'} size={11} color={C.gold} />
                    ))}
                  </View>
                  <Text style={{ color: C.plum, fontWeight: '700', fontSize: 13 }}>{p.avg.toFixed(1)}</Text>
                </View>
              ))}
            </Card>
            <Card style={{ marginTop: 12, backgroundColor: C.brand50, borderColor: C.brand100 }}>
              <Text style={{ fontSize: 11.5, color: C.ink3 }}>
                Funnel (demo data): {d.bookings.length} bookings → {d.bookings.filter((b) => b.status !== 'pending').length} decided → {doneN} completed.
              </Text>
            </Card>
          </View>
        ) : null}

        {tab === 'providers' ? (
          <View>
            <VerificationQueue />
            <Card flush>
              {d.profiles.map((p) => (
                <View key={p.id} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13.5, color: C.plum, fontWeight: '700' }} numberOfLines={1}>{p.displayName}</Text>
                    <Text style={{ fontSize: 11.5, color: C.ink3 }} numberOfLines={1}>{p.addr} · ★ {p.avg.toFixed(1)} ({p.reviewCount})</Text>
                    <View style={{ marginTop: 5 }}>
                      <Pill status={p.verification} label={p.verification === 'pending' ? 'Pending verification' : undefined} />
                    </View>
                  </View>
                  {p.verification !== 'verified' ? (
                    <Btn label="Verify" variant="p" size="xs" onPress={() => { setVerification(p.id, 'verified'); app.bump(); app.showToast(p.displayName + ' verified ✓'); }} />
                  ) : null}
                  {p.verification !== 'suspended' ? (
                    <Btn label="Suspend" variant="d" size="xs" onPress={() => { setVerification(p.id, 'suspended'); app.bump(); app.showToast(p.displayName + ' suspended'); }} />
                  ) : (
                    <Btn label="Reactivate" variant="o" size="xs" onPress={() => { setVerification(p.id, 'unverified'); app.bump(); app.showToast(p.displayName + ' reactivated'); }} />
                  )}
                </View>
              ))}
            </Card>
            <Card style={{ marginTop: 12, backgroundColor: C.brand50, borderColor: C.brand100 }}>
              <Text style={{ fontSize: 11.5, color: C.ink3 }}>
                Verified badge is granted manually here. Suspended providers hide from customer booking but stay visible with a warning.
              </Text>
            </Card>
          </View>
        ) : null}

        {tab === 'reports' ? <ReportsPanel /> : null}

        {tab === 'metrics' ? <MetricsPanel /> : null}

        {tab === 'categories' ? (
          <Card flush>
            {d.categories.map((c) => (
              <View key={c.id}>
                <SwitchRow
                  title={c.name}
                  sub={c.desc + ' · ' + d.profiles.filter((p) => p.categoryIds.includes(c.id)).length + ' pros'}
                  value={c.active}
                  onValueChange={(v) => { setCategoryActive(c.id, v); app.bump(); }}
                />
              </View>
            ))}
          </Card>
        ) : null}

        {tab === 'bookings' ? (
          <Card flush>
            {[...d.bookings].sort((a, b) => b.createdAt - a.createdAt).map((b) => {
              const s = serviceOf(b.serviceId);
              const p = profileOf(b.providerId);
              const cu = userById(b.customerId);
              return (
                <View key={b.id} style={{ padding: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13, color: C.plum, fontWeight: '700', flex: 1 }} numberOfLines={1}>{s?.name}</Text>
                    <Pill status={b.status} />
                  </View>
                  <Text style={{ fontSize: 11.5, color: C.ink3, marginVertical: 4 }}>
                    {b.ref} · {cu?.name} → {p?.displayName} · {fmtDate(b.date)} {b.start || ''} · {fmtRM(b.price)}
                  </Text>
                  <StatusPicker b={b} />
                </View>
              );
            })}
          </Card>
        ) : null}

        {tab === 'users' ? (
          <Card flush>
            {d.users.map((u) => (
              <View key={u.id}>
                <LRow
                  icon={u.role === 'provider' ? 'brush-outline' : u.role === 'admin' ? 'shield-checkmark-outline' : 'person-outline'}
                  title={u.name}
                  sub={u.email + ' · ' + (u.phone || '')}
                  right={<Chip mono>{u.role}</Chip>}
                />
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function StatusPicker({ b }: { b: { id: string; status: BookingStatus } }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const opts: BookingStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show'];
  return (
    <View style={{ position: 'relative' }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1.5, borderColor: C.line2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.white }}>
        <Text style={{ fontSize: 12, color: C.ink2, fontWeight: '600' }}>{b.status}</Text>
        <Ionicons name="chevron-down" size={13} color={C.ink3} />
      </Pressable>
      {open ? (
        <View style={{ position: 'absolute', top: 38, left: 0, width: 150, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.line, zIndex: 30, boxShadow: '0 4px 10px rgba(74,50,56,0.15)' }}>
          {opts.map((o) => (
            <Pressable
              key={o}
              onPress={() => {
                const ok = setBookingStatusAdmin(b.id, o);
                if (!ok) app.showToast('That status transition is not allowed');
                else { app.bump(); app.showToast('Booking set to ' + o); }
                setOpen(false);
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line }}
            >
              <Text style={{ fontSize: 12.5, color: o === b.status ? C.brand700 : C.ink }}>{o}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
