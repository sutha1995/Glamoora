import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import { ProviderCard } from '../../components/cards';
import { TopBar } from '../../components/topbar';
import { Btn, Chip, Empty } from '../../components/ui';
import { minPrice, providerSlots } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';
import { haversine, todayISO } from '../../utils';

interface F {
  q: string; cat: string; maxPrice: number; minRating: number; maxDist: number; type: string; openToday: boolean; sort: string;
}
const DEF: F = { q: '', cat: '', maxPrice: 0, minRating: 0, maxDist: 0, type: '', openToday: false, sort: 'recommended' };

export default function DiscoverScreen() {
  const app = useApp();
  const params = useLocalSearchParams<{ q?: string; cat?: string }>();
  const [f, setF] = useState<F>({ ...DEF, q: params.q || '', cat: params.cat || '' });
  const [showFilters, setShowFilters] = useState(false);
  const u = app.user!;
  const appVersion = app.version;

  const list = useMemo(() => {
    const q = f.q.toLowerCase();
    let ps = app.db.profiles.filter((p) => p.verification !== 'suspended');
    if (q) {
      ps = ps.filter((p) => {
        const svcs = app.db.services.filter((s) => s.providerId === p.id).map((x) => x.name.toLowerCase());
        const cats = p.categoryIds.map((id) => app.db.categories.find((c) => c.id === id)?.name || '').join(' ').toLowerCase();
        return (
          p.displayName.toLowerCase().includes(q) ||
          p.bio.toLowerCase().includes(q) ||
          cats.includes(q) ||
          svcs.some((n) => n.includes(q))
        );
      });
    }
    if (f.cat) ps = ps.filter((p) => p.categoryIds.includes(f.cat));
    if (f.maxPrice) ps = ps.filter((p) => { const m = minPrice(p.id); return m > 0 && m <= f.maxPrice; });
    if (f.minRating) ps = ps.filter((p) => p.avg >= f.minRating);
    if (f.maxDist) ps = ps.filter((p) => haversine(u.lat, u.lng, p.lat, p.lng) <= f.maxDist);
    if (f.type === 'provider') ps = ps.filter((p) => app.db.services.some((s) => s.providerId === p.id && s.locationType !== 'customer'));
    if (f.type === 'customer') ps = ps.filter((p) => app.db.services.some((s) => s.providerId === p.id && s.locationType !== 'provider'));
    if (f.openToday) {
      const t = todayISO();
      ps = ps.filter((p) =>
        app.db.services.some((s) => s.providerId === p.id && s.active && providerSlots(p.id, s.id, t).length > 0)
      );
    }
    const scored = ps.map((p) => ({ p, dist: haversine(u.lat, u.lng, p.lat, p.lng) }));
    switch (f.sort) {
      case 'distance': scored.sort((a, b) => a.dist - b.dist); break;
      case 'rating': scored.sort((a, b) => b.p.avg - a.p.avg || b.p.reviewCount - a.p.reviewCount); break;
      case 'price_asc': scored.sort((a, b) => minPrice(a.p.id) - minPrice(b.p.id)); break;
      case 'price_desc': scored.sort((a, b) => minPrice(b.p.id) - minPrice(a.p.id)); break;
      default: scored.sort((a, b) => rec(b) - rec(a));
    }
    return scored;
    function rec(x: { p: { verification: string; avg: number }; dist: number }) {
      return (x.p.verification === 'verified' ? 2 : 0) + x.p.avg * 2 - x.dist / 8;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.db, f, appVersion, u]);

  const set = (patch: Partial<F>) => setF((s) => ({ ...s, ...patch }));
  const activeChips: { k: keyof F; label: string }[] = [];
  if (f.cat) activeChips.push({ k: 'cat', label: app.db.categories.find((c) => c.id === f.cat)?.name || '' });
  if (f.maxPrice) activeChips.push({ k: 'maxPrice', label: '≤ RM' + f.maxPrice });
  if (f.minRating) activeChips.push({ k: 'minRating', label: f.minRating + '+ stars' });
  if (f.maxDist) activeChips.push({ k: 'maxDist', label: f.maxDist + ' km' });
  if (f.type) activeChips.push({ k: 'type', label: f.type === 'provider' ? 'At studio' : 'At home' });
  if (f.openToday) activeChips.push({ k: 'openToday', label: 'Open today' });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Discover" sub={list.length + ' professionals near you'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, borderRadius: 13, paddingLeft: 12 }}>
            <Ionicons name="search" size={17} color={C.ink3} />
            <TextInput
              style={{ flex: 1, padding: 12, paddingHorizontal: 10, fontSize: 14.5, color: C.ink }}
              placeholder="Search name, service, category…"
              placeholderTextColor={C.ink3}
              value={f.q}
              onChangeText={(v) => set({ q: v })}
              returnKeyType="search"
              onSubmitEditing={() => { if (f.q.trim()) app.track('search', { q: f.q.trim(), from: 'discover' }); }}
            />
          </View>
          <Pressable onPress={() => setShowFilters(true)} style={{ backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, borderRadius: 13, width: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="funnel-outline" size={18} color={C.plum} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <Text style={{ color: C.ink3, fontSize: 12, fontWeight: '600' }}>Sort</Text>
          {['recommended', 'distance', 'rating', 'price_asc', 'price_desc'].map((s) => (
            <Chip key={s} on={f.sort === s} onPress={() => set({ sort: s })}>
              {s === 'recommended' ? 'Top' : s === 'distance' ? 'Near' : s === 'rating' ? 'Best' : s === 'price_asc' ? 'Low→High' : 'High→Low'}
            </Chip>
          ))}
        </View>

        {activeChips.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {activeChips.map((a) => (
              <Chip key={a.k} on onPress={() => set({ [a.k]: a.k === 'openToday' ? false : a.k === 'maxPrice' || a.k === 'minRating' || a.k === 'maxDist' ? 0 : '' } as Partial<F>)}>
                {a.label} ✕
              </Chip>
            ))}
            <Chip mono onPress={() => setF(DEF)}>Clear all</Chip>
          </View>
        )}

        <View style={{ marginTop: 14 }}>
          {list.length ? (
            list.map((x) => (
              <View key={x.p.id} style={{ marginBottom: 11 }}>
                <ProviderCard pid={x.p.id} />
              </View>
            ))
          ) : (
            <Empty icon="search-outline" title="No matches" text="Try widening your filters or searching a different service." action="Reset filters" onAction={() => setF(DEF)} />
          )}
        </View>
      </ScrollView>

      {showFilters ? (
        <View style={overlayStyle}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShowFilters(false)} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, maxHeight: '82%', }}>
            <ScrollView>
              <Text style={{ fontFamily: 'serif', fontSize: 17, color: C.plum, marginBottom: 14 }}>Filters</Text>
              <Text style={flbl}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                {app.db.categories.filter((c) => c.active).map((c) => (
                  <Chip key={c.id} on={f.cat === c.id} onPress={() => set({ cat: f.cat === c.id ? '' : c.id })}>{c.name}</Chip>
                ))}
              </View>
              <Text style={flbl}>Max price: {f.maxPrice ? 'RM' + f.maxPrice : 'any'}</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14 }}>
                {[0, 100, 150, 200, 300, 500].map((v) => (
                  <Chip key={v} on={f.maxPrice === v} onPress={() => set({ maxPrice: v })}>{v === 0 ? 'Any' : 'RM' + v}</Chip>
                ))}
              </View>
              <Text style={flbl}>Minimum rating</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14 }}>
                {[0, 4, 4.5].map((v) => (
                  <Chip key={v} on={f.minRating === v} onPress={() => set({ minRating: v })}>{v === 0 ? 'Any' : v + '+'}</Chip>
                ))}
              </View>
              <Text style={flbl}>Distance</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14 }}>
                {[0, 5, 10, 20, 50].map((v) => (
                  <Chip key={v} on={f.maxDist === v} onPress={() => set({ maxDist: v })}>{v === 0 ? 'Any' : v + ' km'}</Chip>
                ))}
              </View>
              <Text style={flbl}>Service type</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14 }}>
                <Chip on={f.type === ''} onPress={() => set({ type: '' })}>Any</Chip>
                <Chip on={f.type === 'provider'} onPress={() => set({ type: 'provider' })}>At studio</Chip>
                <Chip on={f.type === 'customer'} onPress={() => set({ type: 'customer' })}>At home</Chip>
              </View>
              <Text style={flbl}>Availability</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 16 }}>
                <Chip on={f.openToday} onPress={() => set({ openToday: !f.openToday })}>Open today</Chip>
              </View>
              <Btn label="Show results" variant="p" block onPress={() => setShowFilters(false)} />
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}
const flbl: TextStyle = { fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 };
const overlayStyle: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(40,22,27,0.5)' };
