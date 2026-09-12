import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { activeServicesOf, catOf, isFav, me, minPrice, profileOf, serviceOf, toggleFavourite } from '../db/core';
import { C, GRADS, R } from '../theme';
import { fmtRM, haversine } from '../utils';
import { useApp } from '../store';
import { Avatar, Btn, Card, Chip, Row, Stars } from './ui';

export const distTo = (p: { lat: number; lng: number }) => {
  const u = me();
  return u ? haversine(u.lat, u.lng, p.lat, p.lng) : 0;
};

const LOC_LABEL: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  provider: { icon: 'business', label: 'At studio' },
  customer: { icon: 'home', label: 'At your place' },
  both: { icon: 'swap-horizontal', label: 'Studio or your place' },
};
export function LocBadge({ t }: { t: string }) {
  const l = LOC_LABEL[t] || LOC_LABEL.provider;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.brand50, paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: R.pill, marginTop: 4, alignSelf: 'flex-start' }}>
      <Ionicons name={l.icon} size={11} color={C.brand700} />
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: C.ink2 }}>{l.label}</Text>
    </View>
  );
}

export function VerifiedTick() {
  return <Ionicons name="shield-checkmark" size={14} color={C.green} style={{ marginLeft: 4 }} />;
}

export function ProviderCard({ pid }: { pid: string }) {
  const app = useApp();
  const p = profileOf(pid);
  if (!p) return null;
  const u = me();
  const dist = distTo(p);
  const svcs = activeServicesOf(pid);
  const cats = p.categoryIds.map((id) => catOf(id)).filter(Boolean).slice(0, 2);
  const fav = u && u.role === 'customer' && isFav(u.id, pid);
  const onFav = () => {
    if (u?.role !== 'customer') return;
    toggleFavourite(u.id, pid);
    app.bump();
  };
  return (
    <Card
      style={{ width: 252 }}
      onPress={() => router.push({ pathname: '/provider/[id]', params: { id: pid } })}
    >
      <Row style={{ gap: 10 }}>
        <Avatar name={p.displayName} size={46} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 14.5, color: C.plum, fontWeight: '700' }} numberOfLines={1}>{p.displayName}</Text>
            {p.verification === 'verified' && <VerifiedTick />}
          </View>
          <Row style={{ gap: 5, marginTop: 2 }}>
            <Stars n={Math.round(p.avg)} size={11} />
            <Text style={{ color: C.plum, fontWeight: '700', fontSize: 12 }}>{p.avg.toFixed(1)}</Text>
            <Text style={{ color: C.ink3, fontSize: 11 }}>({p.reviewCount})</Text>
          </Row>
        </View>
        <Pressable
          onPress={onFav}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.brand50, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={17} color={C.brand700} />
        </Pressable>
      </Row>
      <Row style={{ gap: 5 }}>
        <Ionicons name="location" size={13} color={C.ink3} />
        <Text style={{ color: C.ink3, fontSize: 12 }}>
          {dist.toFixed(1)} km · {p.addr.split(',')[0]}
        </Text>
      </Row>
      <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
        {cats.map((c) => (
          <Chip key={c!.id} mono>{c!.name}</Chip>
        ))}
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: 2 }}>
        <View>
          <Text style={{ fontSize: 11, color: C.ink3, fontWeight: '500' }}>from</Text>
          <Text style={{ fontWeight: '800', color: C.brand700, fontSize: 14 }}>{svcs.length ? fmtRM(minPrice(pid)) : '—'}</Text>
        </View>
        <Btn label="View Profile" size="sm" variant="p" />
      </Row>
    </Card>
  );
}

export function ServiceRow({ providerId, serviceId, bookable = true }: { providerId: string; serviceId: string; bookable?: boolean }) {
  const s = serviceOf(serviceId);
  if (!s) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, color: C.plum, fontWeight: '700' }}>{s.name}</Text>
        <Text style={{ fontSize: 12, color: C.ink3, marginTop: 2 }} numberOfLines={2}>{s.desc}</Text>
        <LocBadge t={s.locationType} />
      </View>
      <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
        <Text style={{ fontSize: 14.5, color: C.brand700, fontWeight: '800' }}>{fmtRM(s.price)}</Text>
        <Text style={{ fontSize: 11, color: C.ink3 }}>{s.duration} min</Text>
        {bookable && (
          <Btn
            label="Book"
            size="sm"
            variant="p"
            style={{ marginTop: 8 }}
            onPress={() => router.push({ pathname: '/book/[id]', params: { id: providerId, svc: serviceId } })}
          />
        )}
      </View>
    </View>
  );
}

const ART_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  lash: 'eye-outline',
  brow: 'brush-outline',
  massage: 'leaf-outline',
  nail: 'color-palette-outline',
  saree: 'ribbon-outline',
  wax: 'water-outline',
  hair: 'cut-outline',
  spark: 'sparkles-outline',
};
export function PortfolioTile({ item, onPress }: { item: { grad: string; art: string; caption: string }; onPress?: () => void }) {
  const [c1, c2] = GRADS[item.grad] || GRADS.g1;
  return (
    <Pressable onPress={onPress}>
      <LinearGradient
        colors={[c1, c2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1.2 }}
        style={{ width: '100%', aspectRatio: 4 / 4.6, borderRadius: R.md + 2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}
      >
        <Ionicons name={ART_ICON[item.art] || 'sparkles-outline'} size={52} color="rgba(255,255,255,0.92)" />
        {item.caption ? (
          <View style={{ position: 'absolute', left: 8, right: 8, bottom: 8, backgroundColor: 'rgba(40,22,27,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: C.white, fontSize: 10.5, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>
              {item.caption}
            </Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

export function PGrid({ items, onItem }: { items: { grad: string; art: string; caption: string }[]; onItem?: (i: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      {items.map((it, i) => (
        <View key={i} style={{ width: '48.5%' }}>
          <PortfolioTile item={it} onPress={onItem ? () => onItem(i) : undefined} />
        </View>
      ))}
    </View>
  );
}
