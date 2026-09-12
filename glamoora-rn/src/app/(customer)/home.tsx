import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from 'react-native';
import { PortfolioTile, ProviderCard } from '../../components/cards';
import { TopBar } from '../../components/topbar';
import { HScroll, SectionTitle } from '../../components/ui';
import { saveDB } from '../../db/core';
import { AREAS } from '../../data/seed';
import { useApp } from '../../store';
import { C, SERIF } from '../../theme';
import { haversine } from '../../utils';

export default function HomeScreen() {
  const app = useApp();
  const [q, setQ] = useState('');
  const u = app.user!;
  const appVersion = app.version;

  const visibleProfiles = useMemo(
    () =>
      app.db.profiles
        .filter((p) => p.verification !== 'suspended')
        .map((p) => ({ p, dist: haversine(u.lat, u.lng, p.lat, p.lng) }))
        .sort((a, b) => score(b) - score(a))
        .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.db, u, appVersion]
  );
  function score(x: { p: { verification: string; avg: number }; dist: number }) {
    return (x.p.verification === 'verified' ? 2 : 0) + x.p.avg * 2 - x.dist / 8;
  }

  const featured = useMemo(
    () =>
      app.db.portfolio
        .filter((pf) => {
          const p = app.db.profiles.find((x) => x.id === pf.providerId);
          return p && p.verification === 'verified';
        })
        .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.db, appVersion]
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar brand right={<LocationPill />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Text style={{ fontFamily: SERIF, fontSize: 21, color: C.plum, fontWeight: '600' }}>
          Selamat datang, {u.name.split(' ')[0]} ✦
        </Text>
        <Text style={{ fontSize: 12.5, color: C.ink3, marginTop: 2 }}>What beauty service are you looking for?</Text>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, borderRadius: 13, paddingLeft: 12 }}>
            <Ionicons name="search" size={17} color={C.ink3} />
            <TextInput
              style={{ flex: 1, padding: 12, paddingHorizontal: 10, fontSize: 14.5, color: C.ink }}
              placeholder="Search services, artists, categories…"
              placeholderTextColor={C.ink3}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => router.push({ pathname: '/discover', params: { q } })}
            />
          </View>
          <Pressable
            onPress={() => router.push({ pathname: '/discover', params: { q } })}
            style={{ backgroundColor: C.plum, borderRadius: 13, width: 46, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="search" size={18} color={C.white} />
          </Pressable>
        </View>

        <View style={{ marginTop: 20 }}>
          <SectionTitle title="Browse services" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {app.db.categories
              .filter((c) => c.active)
              .map((c) => {
                const count = app.db.profiles.filter((p) => p.verification !== 'suspended' && p.categoryIds.includes(c.id)).length;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push({ pathname: '/discover', params: { cat: c.id } })}
                    style={{ width: '48.5%', marginBottom: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 14, alignItems: 'center', paddingVertical: 12 }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: C.brand100, alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}>
                      <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={22} color={C.brand700} />
                    </View>
                    <Text style={{ fontSize: 11, color: C.plum, fontWeight: '700', textAlign: 'center', paddingHorizontal: 6, lineHeight: 14 }}>{c.name}</Text>
                    <Text style={{ fontSize: 9.5, color: C.ink3, fontWeight: '600', marginTop: 2 }}>{count} pros</Text>
                  </Pressable>
                );
              })}
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <SectionTitle title="Nearby professionals" action="See all" onAction={() => router.push('/discover')} />
          <HScroll>
            {visibleProfiles.map((x) => (
              <ProviderCard key={x.p.id} pid={x.p.id} />
            ))}
          </HScroll>
        </View>

        <View style={{ marginTop: 16 }}>
          <SectionTitle title="Featured work" action="Explore" onAction={() => router.push('/discover')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {featured.map((pf) => (
              <View key={pf.id} style={{ width: '48.5%', marginBottom: 10 }}>
                <PortfolioTile item={pf} onPress={() => router.push({ pathname: '/provider/[id]', params: { id: pf.providerId } })} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function LocationPill() {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
      >
        <Ionicons name="location" size={14} color={C.brand700} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.plum }}>{useAppName()}</Text>
      </Pressable>
      {open ? <AreaSheet onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
function useAppName() {
  const app = useApp();
  return app.user ? app.user.area.split(',')[0] : '';
}
function AreaSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const u = app.user!;
  return (
    <>
      <Pressable style={StyleSheet_overlay} onPress={onClose} />
      <View style={{ position: 'absolute', top: 46, right: 0, width: 252, backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 6, zIndex: 50, shadowColor: C.plum, shadowOpacity: 0.18, shadowRadius: 14, elevation: 10 }}>
      {AREAS.map((a) => {
        const d = haversine(u.lat, u.lng, a.lat, a.lng);
        return (
          <Pressable
            key={a.name}
            onPress={() => {
              u.area = a.name;
              u.lat = a.lat;
              u.lng = a.lng;
              void saveDB();
              app.bump();
              onClose();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10 }}
          >
            <Ionicons name="location-outline" size={15} color={C.brand700} />
            <Text style={{ flex: 1, fontSize: 13, color: C.plum }}>{a.name}</Text>
            <Text style={{ fontSize: 11, color: C.ink3 }}>{d < 0.05 ? 'current' : d.toFixed(1) + ' km'}</Text>
          </Pressable>
        );
      })}
      </View>
    </>
  );
}
const StyleSheet_overlay: ViewStyle = { position: 'absolute', top: 40, left: 0, right: 0, bottom: 0, zIndex: 40 };
