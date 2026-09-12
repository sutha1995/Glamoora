import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from 'react-native';
import { PortfolioTile, ProviderCard } from '../../components/cards';
import { TopBar } from '../../components/topbar';
import { Avatar, Chip, HScroll, SectionTitle, Stars } from '../../components/ui';
import { saveDB } from '../../db/core';
import { lastViewed, recommendFor, topCategories } from '../../ai/recommend';
import { AREAS } from '../../data/seed';
import { useApp } from '../../store';
import { C, SERIF } from '../../theme';
import { haversine } from '../../utils';

const AI_EXAMPLES = [
  'Nail service under RM100 near me this Saturday',
  'Massage at home tomorrow evening',
  'What does the verified badge mean?',
];

export default function HomeScreen() {
  const app = useApp();
  const [q, setQ] = useState('');
  const u = app.user;
  const appVersion = app.version;

  const here = u ? { lat: u.lat, lng: u.lng, label: u.area.split(',')[0] } : null;

  /** Personalised, and every card says why (PRD Phase 16). */
  const recs = useMemo(() => (u && here ? recommendFor(app.db, u, here, 6) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.db, u, appVersion, here?.lat, here?.lng]);

  /** "Nearby" means nearby: pure distance, no reputation mixed in. */
  const visibleProfiles = useMemo(
    () =>
      !u
        ? []
        : app.db.profiles
        .filter((p) => p.verification !== 'suspended')
        .map((p) => ({ p, dist: haversine(u.lat, u.lng, p.lat, p.lng) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.db, u, appVersion]
  );

  /** One-tap return to the last studio browsed but not booked. */
  const resume = useMemo(() => (u ? lastViewed(app.db, u) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.db, u, appVersion]);

  /** Categories this customer engages with most, shown first. */
  const myCats = useMemo(() => (u ? topCategories(app.db, u, 3).map((c) => c.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.db, u, appVersion]);

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

  // Logged out (or session still resolving): the root guard is redirecting.
  if (!u) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

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
              returnKeyType="search"
              onSubmitEditing={() => { if (q.trim()) app.track('search', { q: q.trim(), from: 'home' }); router.push({ pathname: '/discover', params: { q } }); }}
            />
          </View>
          <Pressable
            onPress={() => { if (q.trim()) app.track('search', { q: q.trim(), from: 'home' }); router.push({ pathname: '/discover', params: { q } }); }}
            style={{ backgroundColor: C.plum, borderRadius: 13, width: 46, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="search" size={18} color={C.white} />
          </Pressable>
        </View>

        <View style={{ marginTop: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.line2, borderRadius: 14, padding: 12 }}>
          <Pressable
            onPress={() => {
              app.track('ai_assistant', { from: 'home', q: q.trim().slice(0, 60) });
              router.push(q.trim() ? { pathname: '/assistant', params: { q: q.trim() } } : '/assistant');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Open the AI assistant"
          >
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.brand100, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles" size={19} color={C.brand700} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.plum }}>Ask in your own words</Text>
              <Text style={{ fontSize: 11, color: C.ink3, marginTop: 2, lineHeight: 15 }}>
                {q.trim()
                  ? `Let the on-device AI read “${q.trim()}”`
                  : 'On-device AI: budget, distance, date and time become real filters.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.ink3} />
          </Pressable>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {AI_EXAMPLES.map((ex) => (
              <Chip
                key={ex}
                onPress={() => {
                  app.track('ai_search', { from: 'home', q: ex.slice(0, 60) });
                  router.push({ pathname: '/assistant', params: { q: ex } });
                }}
              >
                {ex}
              </Chip>
            ))}
          </View>
        </View>

        {resume ? (
          <Pressable
            onPress={() => router.push({ pathname: '/provider/[id]', params: { id: resume.id } })}
            style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.line2, borderRadius: 13, padding: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Continue where you left off"
          >
            <Ionicons name="time-outline" size={17} color={C.brand700} />
            <Text style={{ flex: 1, fontSize: 12, color: C.ink2 }} numberOfLines={1}>
              <Text style={{ fontWeight: '800', color: C.plum }}>Pick up where you left off · </Text>
              {resume.displayName}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={C.ink3} />
          </Pressable>
        ) : null}

        {recs.length ? (
          <View style={{ marginTop: 20 }}>
            <SectionTitle title="Recommended for you" action="Ask AI" onAction={() => router.push('/assistant')} />
            <Text style={{ fontSize: 11, color: C.ink3, marginTop: -4, marginBottom: 8 }}>
              Ranked on-device from your own favourites, bookings and browsing — each card shows the real reason.
            </Text>
            <HScroll>
              {recs.map((r) => (
                <Pressable
                  key={r.p.id}
                  onPress={() => {
                    app.track('provider_view', { from: 'home_recommended', reason: r.reason.slice(0, 40) }, { providerId: r.p.id });
                    router.push({ pathname: '/provider/[id]', params: { id: r.p.id } });
                  }}
                  style={recCard}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.p.displayName}, ${r.reason}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <Avatar name={r.p.displayName} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: C.plum, flexShrink: 1 }} numberOfLines={1}>
                          {r.p.displayName}
                        </Text>
                        {r.p.verification === 'verified' ? <Ionicons name="checkmark-circle" size={13} color={C.green} /> : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        {r.p.reviewCount ? <Stars n={r.p.avg} size={10} /> : null}
                        <Text style={{ fontSize: 10.5, color: C.ink3 }} numberOfLines={1}>
                          {r.p.reviewCount ? `${r.p.avg.toFixed(1)} (${r.p.reviewCount})` : 'New'} · {r.dist.toFixed(1)} km
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ marginTop: 10, backgroundColor: C.brand50, borderRadius: 10, padding: 9, borderWidth: 1, borderColor: C.brand100 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: C.brand700, letterSpacing: 0.7 }}>WHY THIS ONE</Text>
                    <Text style={{ fontSize: 11.5, color: C.ink2, marginTop: 3, lineHeight: 16, fontWeight: '600' }}>{r.reason}</Text>
                    {r.also.length ? (
                      <Text style={{ fontSize: 10.5, color: C.ink3, marginTop: 4, lineHeight: 15 }}>{r.also.join(' · ')}</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </HScroll>
          </View>
        ) : null}

        <View style={{ marginTop: 20 }}>
          <SectionTitle title="Browse services" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {app.db.categories
              .filter((c) => c.active)
              .slice()
              .sort((a, b) => {
                const ia = myCats.indexOf(a.id);
                const ib = myCats.indexOf(b.id);
                return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
              })
              .map((c) => {
                const count = app.db.profiles.filter((p) => p.verification !== 'suspended' && p.categoryIds.includes(c.id)).length;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => { app.track('category_view', { cat: c.id, name: c.name }); router.push({ pathname: '/discover', params: { cat: c.id } }); }}
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
  const u = app.user;
  if (!u) return null;
  return (
    <>
      <Pressable style={StyleSheet_overlay} onPress={onClose} />
      <View style={{ position: 'absolute', top: 46, right: 0, width: 252, backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 6, zIndex: 50, boxShadow: '0 4px 14px rgba(74,50,56,0.18)' }}>
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

const recCard: ViewStyle = {
  width: 252,
  backgroundColor: C.white,
  borderWidth: 1,
  borderColor: C.line2,
  borderRadius: 15,
  padding: 12,
  boxShadow: '0 4px 12px rgba(74,50,56,0.07)',
};
