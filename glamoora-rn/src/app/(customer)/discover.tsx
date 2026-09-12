import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import { ProviderCard } from '../../components/cards';
import { MapCanvas, MapPinCard, type MapPin } from '../../components/mapview';
import { TopBar } from '../../components/topbar';
import { Btn, Chip, Empty, Note, Seg } from '../../components/ui';
import { AREAS } from '../../data/seed';
import {
  EMPTY_FILTERS,
  describeFilters,
  minutesToLabel,
  partLabel,
  readableDate,
  searchProviders,
  type SearchCenter,
  type SearchFilters,
  type SortKey,
} from '../../domain/search';
import { decodeFilters } from '../../ai/nlsearch';
import { useApp } from '../../store';
import { C } from '../../theme';
import { addDays, dISO, haversine, todayISO } from '../../utils';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Top' },
  { key: 'distance', label: 'Near' },
  { key: 'rating', label: 'Best' },
  { key: 'price_asc', label: 'Low→High' },
  { key: 'price_desc', label: 'High→Low' },
];

const PARTS: { label: string; from: number; to: number }[] = [
  { label: 'Morning', from: 5 * 60, to: 12 * 60 },
  { label: 'Afternoon', from: 12 * 60, to: 17 * 60 },
  { label: 'Evening', from: 17 * 60, to: 23 * 60 + 59 },
];

export default function DiscoverScreen() {
  const app = useApp();
  const params = useLocalSearchParams<{ q?: string; cat?: string; ai?: string }>();
  const [f, setF] = useState<SearchFilters>({ ...EMPTY_FILTERS, q: params.q || '', cat: params.cat || '' });
  const [center, setCenter] = useState<SearchCenter | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [selPin, setSelPin] = useState<string | null>(null);
  const u = app.user;
  const v = app.version;

  /* A natural-language search arriving from the AI assistant. */
  useEffect(() => {
    const decoded = decodeFilters(params.ai);
    if (!decoded) return;
    setF(decoded.filters);
    setCenter(decoded.center);
    setAiNote(describeFilters(app.db, decoded.filters, decoded.center).join(' · ') || 'your request');
    setMode('list');
    setSelPin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ai]);

  const here: SearchCenter | null = u ? { lat: u.lat, lng: u.lng, label: u.area.split(',')[0] } : null;
  const origin = center || here;

  const list = useMemo(() => {
    if (!u || !origin) return [];
    return searchProviders(app.db, f, origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.db, f, origin?.lat, origin?.lng, v, u]);

  if (!u || !origin) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const pins: MapPin[] = list.map((h) => ({
    id: h.p.id,
    lat: h.p.lat,
    lng: h.p.lng,
    title: h.p.displayName,
    sub: h.p.categoryIds
      .map((cid) => app.db.categories.find((c) => c.id === cid)?.name)
      .filter(Boolean)
      .join(' · '),
    rating: h.p.reviewCount ? h.p.avg : undefined,
    price: h.minPrice || undefined,
    verified: h.p.verification === 'verified',
    radiusKm: h.p.radiusKm,
    dimmed: false,
  }));
  const selProfile = selPin ? list.find((h) => h.p.id === selPin)?.p : null;

  const set = (patch: Partial<SearchFilters>) => {
    setF((s) => ({ ...s, ...patch }));
    setAiNote(null);
  };

  const chips: { key: keyof SearchFilters; label: string; clear: Partial<SearchFilters> }[] = [];
  if (f.cat) chips.push({ key: 'cat', label: app.db.categories.find((c) => c.id === f.cat)?.name || '', clear: { cat: '' } });
  if (f.q) chips.push({ key: 'q', label: `“${f.q}”`, clear: { q: '' } });
  if (f.maxPrice) chips.push({ key: 'maxPrice', label: '≤ RM' + f.maxPrice, clear: { maxPrice: 0 } });
  if (f.minRating) chips.push({ key: 'minRating', label: f.minRating + '+ stars', clear: { minRating: 0 } });
  if (f.maxDist) chips.push({ key: 'maxDist', label: `within ${f.maxDist} km`, clear: { maxDist: 0 } });
  if (f.verified) chips.push({ key: 'verified', label: 'Verified', clear: { verified: false } });
  if (f.type === 'provider') chips.push({ key: 'type', label: 'At studio', clear: { type: '' } });
  if (f.type === 'customer' || f.comesToYou) chips.push({ key: 'comesToYou', label: 'Comes to you', clear: { type: '', comesToYou: false } });
  if (f.date) chips.push({ key: 'date', label: readableDate(f.date), clear: { date: '' } });
  else if (f.openToday) chips.push({ key: 'openToday', label: 'Open today', clear: { openToday: false } });
  if (f.timeFrom || f.timeTo) chips.push({ key: 'timeFrom', label: partLabel(f.timeFrom, f.timeTo), clear: { timeFrom: 0, timeTo: 0 } });

  const activePart = PARTS.find((p) => p.from === f.timeFrom && p.to === f.timeTo);
  const dateChips = [
    { label: 'Any day', iso: '' },
    { label: 'Today', iso: todayISO() },
    { label: 'Tomorrow', iso: dISO(addDays(new Date(), 1)) },
    { label: 'This weekend', iso: nextWeekend() },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Discover" sub={`${list.length} professional${list.length === 1 ? '' : 's'} ${f.maxDist ? `within ${f.maxDist} km of ${origin.label}` : 'near you'}`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, borderRadius: 13, paddingLeft: 12 }}>
            <Ionicons name="search" size={17} color={C.ink3} />
            <TextInput
              style={{ flex: 1, padding: 12, paddingHorizontal: 10, fontSize: 14.5, color: C.ink }}
              placeholder="Search name, service, category…"
              placeholderTextColor={C.ink3}
              value={f.q}
              onChangeText={(t) => set({ q: t })}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (f.q.trim()) app.track('search', { q: f.q.trim(), from: 'discover' });
              }}
            />
          </View>
          <Pressable
            onPress={() => router.push('/assistant')}
            style={{ backgroundColor: C.plum, borderRadius: 13, width: 46, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Ask the AI assistant"
          >
            <Ionicons name="sparkles" size={19} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => setShowFilters(true)}
            style={{ backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, borderRadius: 13, width: 46, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Open filters"
          >
            <Ionicons name="funnel-outline" size={18} color={C.plum} />
          </Pressable>
        </View>

        {aiNote ? (
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.brand50, borderRadius: 12, padding: 11, paddingRight: 8 }}>
            <Ionicons name="sparkles" size={15} color={C.plum} />
            <Text style={{ flex: 1, fontSize: 12, color: C.ink2, lineHeight: 17 }}>
              <Text style={{ fontWeight: '800', color: C.plum }}>AI search · </Text>
              {aiNote}. Edit any filter below — nothing is locked.
            </Text>
            <Pressable onPress={() => setAiNote(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss AI note">
              <Ionicons name="close" size={15} color={C.ink3} />
            </Pressable>
          </View>
        ) : null}

        <Seg
          options={[
            { key: 'list', label: 'List' },
            { key: 'map', label: 'Map' },
          ]}
          value={mode}
          onChange={(k) => setMode(k as 'list' | 'map')}
          style={{ marginTop: 10 }}
        />

        {mode === 'map' ? (
          <View style={{ marginTop: 12 }}>
            <MapCanvas
              pins={pins}
              user={{ lat: origin.lat, lng: origin.lng, label: origin.label }}
              areas={AREAS}
              selectedId={selPin}
              onSelect={(pin) => setSelPin(pin.id)}
              height={320}
            />
            {selProfile ? (
              <MapPinCard
                pin={pins.find((x) => x.id === selProfile.id)!}
                distanceKm={haversine(origin.lat, origin.lng, selProfile.lat, selProfile.lng)}
                onView={() => router.push({ pathname: '/provider/[id]', params: { id: selProfile.id } })}
                onBook={() => router.push({ pathname: '/book/[id]', params: { id: selProfile.id } })}
              />
            ) : (
              <Text style={{ fontSize: 11.5, color: C.ink3, marginTop: 9, textAlign: 'center' }}>
                Tap a marker to see the studio, its rating, distance and service radius.
              </Text>
            )}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={{ color: C.ink3, fontSize: 12, fontWeight: '600' }}>Sort</Text>
          {SORTS.map((s) => (
            <Chip key={s.key} on={f.sort === s.key} onPress={() => set({ sort: s.key })}>
              {s.label}
            </Chip>
          ))}
        </View>

        {chips.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {chips.map((a) => (
              <Chip key={String(a.key)} on onPress={() => set(a.clear)}>
                {a.label} ✕
              </Chip>
            ))}
            <Chip
              mono
              onPress={() => {
                setF(EMPTY_FILTERS);
                setCenter(null);
                setAiNote(null);
                setSelPin(null);
              }}
            >
              Clear all
            </Chip>
          </View>
        )}

        {f.date || f.timeFrom || f.timeTo ? (
          <Note style={{ marginTop: 10 }}>
            Showing studios with a genuinely free slot {f.date ? `on ${readableDate(f.date)}` : 'today'}
            {f.timeFrom || f.timeTo ? `, ${partLabel(f.timeFrom, f.timeTo).toLowerCase()}` : ''}. Closed days, breaks,
            blocked time and existing appointments are already excluded.
          </Note>
        ) : null}

        <View style={{ marginTop: 14 }}>
          {list.length ? (
            list.map((h) => (
              <View key={h.p.id} style={{ marginBottom: 11 }}>
                <ProviderCard pid={h.p.id} />
                {h.openSlots > 0 && (f.date || f.openToday || f.timeFrom || f.timeTo) ? (
                  <Text style={{ fontSize: 11, color: C.green, fontWeight: '700', marginTop: -6, marginBottom: 4 }}>
                    {h.openSlots} free slot{h.openSlots === 1 ? '' : 's'} in this window
                  </Text>
                ) : null}
              </View>
            ))
          ) : (
            <Empty
              icon="search-outline"
              title="No matches"
              text="Try widening your budget, distance or date — or ask the AI assistant in plain words."
              action="Reset filters"
              onAction={() => {
                setF(EMPTY_FILTERS);
                setCenter(null);
                setAiNote(null);
              }}
            />
          )}
        </View>
      </ScrollView>

      {showFilters ? (
        <View style={overlayStyle}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShowFilters(false)} />
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: C.bg,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 18,
              paddingBottom: 30,
              maxHeight: '86%',
            }}
          >
            <ScrollView>
              <Text style={{ fontFamily: 'serif', fontSize: 17, color: C.plum, marginBottom: 4 }}>Filters</Text>
              <Text style={{ fontSize: 11.5, color: C.ink3, marginBottom: 14 }}>
                Distances measured from {origin.label}
                {center ? ' (set by your AI search)' : ''}.
              </Text>

              <Text style={flbl}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                {app.db.categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <Chip key={c.id} on={f.cat === c.id} onPress={() => set({ cat: f.cat === c.id ? '' : c.id })}>
                      {c.name}
                    </Chip>
                  ))}
              </View>

              <Text style={flbl}>Max price: {f.maxPrice ? 'RM' + f.maxPrice : 'any'}</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
                {[0, 80, 100, 150, 200, 300, 500].map((val) => (
                  <Chip key={val} on={f.maxPrice === val} onPress={() => set({ maxPrice: val, sort: val ? 'price_asc' : f.sort })}>
                    {val === 0 ? 'Any' : 'RM' + val}
                  </Chip>
                ))}
              </View>

              <Text style={flbl}>Minimum rating</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14 }}>
                {[0, 4, 4.5, 4.8].map((val) => (
                  <Chip key={val} on={f.minRating === val} onPress={() => set({ minRating: val })}>
                    {val === 0 ? 'Any' : val + '+'}
                  </Chip>
                ))}
              </View>

              <Text style={flbl}>Distance</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
                {[0, 3, 5, 10, 20, 50].map((val) => (
                  <Chip key={val} on={f.maxDist === val} onPress={() => set({ maxDist: val })}>
                    {val === 0 ? 'Any' : val + ' km'}
                  </Chip>
                ))}
              </View>

              <Text style={flbl}>Date</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
                {dateChips.map((d) => (
                  <Chip
                    key={d.label}
                    on={(f.date || (f.openToday ? todayISO() : '')) === d.iso}
                    onPress={() => set({ date: d.iso, openToday: d.iso === todayISO() ? f.openToday : false })}
                  >
                    {d.label}
                  </Chip>
                ))}
              </View>

              <Text style={flbl}>Time of day {activePart ? `· ${minutesToLabel(activePart.from)}–${minutesToLabel(activePart.to)}` : ''}</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
                <Chip on={!f.timeFrom && !f.timeTo} onPress={() => set({ timeFrom: 0, timeTo: 0 })}>
                  Any time
                </Chip>
                {PARTS.map((p) => (
                  <Chip
                    key={p.label}
                    on={activePart?.label === p.label}
                    onPress={() => set(activePart?.label === p.label ? { timeFrom: 0, timeTo: 0 } : { timeFrom: p.from, timeTo: p.to })}
                  >
                    {p.label}
                  </Chip>
                ))}
              </View>

              <Text style={flbl}>Service type</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
                <Chip on={f.type === '' && !f.comesToYou} onPress={() => set({ type: '', comesToYou: false })}>
                  Any
                </Chip>
                <Chip on={f.type === 'provider'} onPress={() => set({ type: 'provider', comesToYou: false })}>
                  At studio
                </Chip>
                <Chip on={f.type === 'customer' || f.comesToYou} onPress={() => set({ type: 'customer', comesToYou: true })}>
                  Comes to you
                </Chip>
              </View>

              <Text style={flbl}>Trust & availability</Text>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 18, flexWrap: 'wrap' }}>
                <Chip on={f.verified} onPress={() => set({ verified: !f.verified })}>
                  Verified only
                </Chip>
                <Chip on={f.openToday} onPress={() => set({ openToday: !f.openToday })}>
                  Open today
                </Chip>
                {center ? (
                  <Chip
                    mono
                    onPress={() => {
                      setCenter(null);
                      setAiNote(null);
                    }}
                  >
                    Reset to my location
                  </Chip>
                ) : null}
              </View>

              <Btn label={`Show ${list.length} result${list.length === 1 ? '' : 's'}`} variant="p" block onPress={() => setShowFilters(false)} />
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function nextWeekend(): string {
  const now = new Date();
  const delta = (6 - now.getDay() + 7) % 7;
  return dISO(addDays(now, delta));
}

const flbl: TextStyle = { fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 };
const overlayStyle: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(40,22,27,0.5)' };
