/**
 * Map view (PRD §5 "Should Have: Map view", §6 location requirements).
 *
 * Deliberately dependency-free: a projected, pannable, zoomable vector canvas
 * over lat/lng. No tile provider, so it needs no API key (PRD §14), works
 * offline at a hackathon venue, and renders identically on web and native.
 *
 * Supports everything §6 asks for: current location, provider coordinates,
 * service-area radius rings, distance calculation and tappable markers.
 * Turn-by-turn navigation is explicitly out of scope.
 *
 * Swapping in react-native-maps/Mapbox later only means replacing `MapCanvas`.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { C, SERIF } from '../theme';
import { fmtRM, haversine } from '../utils';

const KM_PER_DEG_LAT = 110.574;

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  sub?: string;
  rating?: number;
  price?: number;
  verified?: boolean;
  /** Service radius in km — drawn as a ring for the selected studio. */
  radiusKm?: number;
  dimmed?: boolean;
}

export interface MapCanvasProps {
  pins: MapPin[];
  user: { lat: number; lng: number; label?: string };
  areas?: { name: string; lat: number; lng: number }[];
  selectedId?: string | null;
  onSelect?: (pin: MapPin) => void;
  height?: number;
}

interface Projector {
  x: (lng: number) => number;
  y: (lat: number) => number;
  kmToPx: (km: number) => number;
}

export function MapCanvas({ pins, user, areas = [], selectedId, onSelect, height = 340 }: MapCanvasProps) {
  const [size, setSize] = useState({ w: 0, h: height });
  const [center, setCenter] = useState({ lat: user.lat, lng: user.lng });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const startRef = useRef({ x: 0, y: 0 });

  /** Pixels per degree of latitude at the current zoom. */
  const pxPerDegLat = useMemo(() => 900 * zoom, [zoom]);
  const pxPerDegLng = useMemo(() => pxPerDegLat / Math.cos((center.lat * Math.PI) / 180 || 0), [pxPerDegLat, center.lat]);

  const project = useMemo<Projector>(
    () => ({
      x: (lng) => size.w / 2 + (lng - center.lng) * pxPerDegLng + offset.x,
      y: (lat) => size.h / 2 - (lat - center.lat) * pxPerDegLat + offset.y,
      kmToPx: (km) => (km / KM_PER_DEG_LAT) * pxPerDegLat,
    }),
    [size.w, size.h, center.lat, center.lng, pxPerDegLat, pxPerDegLng, offset.x, offset.y]
  );

  // Drag to pan: remember where the offset was when the gesture started so
  // repeated moves are absolute rather than compounding.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
        onPanResponderGrant: () => {
          startRef.current = { x: offsetRef.current.x, y: offsetRef.current.y };
        },
        onPanResponderMove: (_evt, g) => {
          const next = { x: startRef.current.x + g.dx, y: startRef.current.y + g.dy };
          offsetRef.current = next;
          setOffset(next);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    []
  );

  const recenter = () => {
    setCenter({ lat: user.lat, lng: user.lng });
    setOffset({ x: 0, y: 0 });
  };

  const gridStep = 88;
  const selected = pins.find((p) => p.id === selectedId);

  return (
    <View
      style={{ height, borderRadius: 18, overflow: 'hidden', backgroundColor: '#F6EEF0', borderWidth: 1, borderColor: C.line }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: height })}
      {...panResponder.panHandlers}
    >
      {/* grid */}
      {size.w > 0
        ? Array.from({ length: Math.ceil(size.w / gridStep) + 2 }, (_, i) => (
            <View key={'v' + i} style={{ position: 'absolute', left: (i * gridStep + (offset.x % gridStep)) - gridStep, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(168,113,130,0.10)' }} />
          ))
        : null}
      {size.h > 0
        ? Array.from({ length: Math.ceil(size.h / gridStep) + 2 }, (_, i) => (
            <View key={'h' + i} style={{ position: 'absolute', top: (i * gridStep + (offset.y % gridStep)) - gridStep, left: 0, right: 0, height: 1, backgroundColor: 'rgba(168,113,130,0.10)' }} />
          ))
        : null}

      {/* neighbourhood labels */}
      {areas.map((a) => {
        const d = haversine(user.lat, user.lng, a.lat, a.lng);
        return (
          <View key={a.name} style={{ position: 'absolute', left: project.x(a.lng) - 46, top: project.y(a.lat) - 9, width: 92, alignItems: 'center' }} pointerEvents="none">
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(126,79,92,0.45)', marginBottom: 3 }} />
            <Text style={{ fontSize: 9.5, color: 'rgba(94,60,70,0.75)', fontWeight: '700', letterSpacing: 0.3 }} numberOfLines={1}>
              {a.name.split(',')[0].toUpperCase()}
            </Text>
            <Text style={{ fontSize: 8.5, color: 'rgba(94,60,70,0.5)' }}>{d < 0.05 ? 'you are here' : d.toFixed(1) + ' km'}</Text>
          </View>
        );
      })}

      {/* service-area ring for the selected studio */}
      {selected && selected.radiusKm ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: project.x(selected.lng) - project.kmToPx(selected.radiusKm),
            top: project.y(selected.lat) - project.kmToPx(selected.radiusKm),
            width: project.kmToPx(selected.radiusKm) * 2,
            height: project.kmToPx(selected.radiusKm) * 2,
            borderRadius: project.kmToPx(selected.radiusKm),
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(168,113,130,0.55)',
            backgroundColor: 'rgba(168,113,130,0.07)',
          }}
        />
      ) : null}

      {/* distance rings around the customer */}
      {[2, 5].map((km) => (
        <View
          key={km}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: project.x(user.lng) - project.kmToPx(km),
            top: project.y(user.lat) - project.kmToPx(km),
            width: project.kmToPx(km) * 2,
            height: project.kmToPx(km) * 2,
            borderRadius: project.kmToPx(km),
            borderWidth: 1,
            borderColor: 'rgba(126,79,92,0.18)',
          }}
        />
      ))}

      {/* provider markers */}
      {pins.map((p) => {
        const isSel = p.id === selectedId;
        const dist = haversine(user.lat, user.lng, p.lat, p.lng);
        return (
          <Pressable
            key={p.id}
            onPress={() => onSelect?.(p)}
            style={{ position: 'absolute', left: project.x(p.lng) - 17, top: project.y(p.lat) - 34, alignItems: 'center', opacity: p.dimmed && !isSel ? 0.45 : 1 }}
          >
            <View
              style={{
                minWidth: 34,
                paddingHorizontal: 6,
                paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: isSel ? C.plum : C.white,
                borderWidth: 1.5,
                borderColor: isSel ? C.plum : C.brand,
                alignItems: 'center',
                shadowColor: C.plum,
                shadowOpacity: 0.2,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }}
            >
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: isSel ? C.white : C.brand700 }}>
                {p.rating ? '★ ' + p.rating.toFixed(1) : 'NEW'}
              </Text>
            </View>
            <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: isSel ? C.plum : C.brand }} />
            {isSel ? (
              <View style={{ marginTop: 3, backgroundColor: 'rgba(74,50,56,0.9)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9.5, color: C.white, fontWeight: '700' }}>{dist.toFixed(1)} km</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}

      {/* you are here */}
      <View pointerEvents="none" style={{ position: 'absolute', left: project.x(user.lng) - 9, top: project.y(user.lat) - 9 }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(62,124,89,0.25)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.green, borderWidth: 2, borderColor: C.white }} />
        </View>
      </View>

      {/* controls */}
      <View style={{ position: 'absolute', right: 10, top: 10, gap: 6 }}>
        <MapBtn icon="add" onPress={() => setZoom((z) => Math.min(4, z * 1.35))} />
        <MapBtn icon="remove" onPress={() => setZoom((z) => Math.max(0.45, z / 1.35))} />
        <MapBtn icon="locate" onPress={recenter} />
      </View>

      <View style={{ position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 }}>
        <Text style={{ fontSize: 9.5, color: C.ink2, fontWeight: '700' }}>
          {pins.length} studios · drag to pan
        </Text>
      </View>
      <View style={{ position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 }}>
        <Text style={{ fontSize: 9.5, color: C.ink2 }}>{Math.round(project.kmToPx(1))} px = 1 km</Text>
      </View>
    </View>
  );
}

function MapBtn({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 34, height: 34, borderRadius: 11, backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={17} color={C.plum} />
    </Pressable>
  );
}

/** Compact card shown under the map for the selected marker. */
export function MapPinCard({ pin, distanceKm, onView, onBook }: { pin: MapPin; distanceKm: number; onView: () => void; onBook?: () => void }) {
  return (
    <View style={{ marginTop: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 13 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 15.5, color: C.plum, fontWeight: '600' }} numberOfLines={1}>{pin.title}</Text>
            {pin.verified ? <Ionicons name="shield-checkmark" size={13} color={C.green} /> : null}
          </View>
          <Text style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }} numberOfLines={1}>
            {pin.sub}
            {pin.rating ? ` · ★ ${pin.rating.toFixed(1)}` : ''} · {distanceKm.toFixed(1)} km
            {pin.radiusKm ? ` · serves ${pin.radiusKm} km` : ''}
          </Text>
        </View>
        {pin.price ? <Text style={{ fontSize: 14, fontWeight: '800', color: C.brand700 }}>{fmtRM(pin.price)}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
        <Pressable onPress={onView} style={{ flex: 1, backgroundColor: C.plum, borderRadius: 11, paddingVertical: 9, alignItems: 'center' }}>
          <Text style={{ color: C.white, fontSize: 12.5, fontWeight: '700' }}>View profile</Text>
        </Pressable>
        {onBook ? (
          <Pressable onPress={onBook} style={{ flex: 1, backgroundColor: C.brand50, borderWidth: 1, borderColor: C.brand100, borderRadius: 11, paddingVertical: 9, alignItems: 'center' }}>
            <Text style={{ color: C.brand800, fontSize: 12.5, fontWeight: '700' }}>Book</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
