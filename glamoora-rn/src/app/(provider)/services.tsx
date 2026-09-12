import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LocBadge } from '../../components/cards';
import { TopBar } from '../../components/topbar';
import { Btn, Card, Empty, Pill, SwitchRow } from '../../components/ui';
import { catOf, deleteService, setServiceActive, upsertService } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';
import { fmtRM } from '../../utils';
import type { Service } from '../../types';

export default function ServicesScreen() {
  const app = useApp();
  const p = app.db.profiles.find((x) => x.userId === app.user?.id);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  if (!p) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const svcs = app.db.services.filter((s) => s.providerId === p.id);
  const editing = svcs.find((s) => s.id === editingId) || null;
  const catOpts = p.categoryIds.map((id) => catOf(id)).filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title="Services" sub={svcs.length + ' services · ' + svcs.filter((s) => s.active).length + ' active'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
          {adding || editing ? (
            <ServiceForm key={editing?.id || 'new'} existing={editing} catOpts={catOpts.map((c) => c!.id)} onDone={() => { setAdding(false); setEditingId(null); }} />
          ) : (
            <Btn label="Add service" variant="b" block icon="add" onPress={() => setAdding(true)} />
          )}
          <Card flush style={{ marginTop: adding || editing ? 12 : 0 }}>
            {svcs.length ? (
              svcs.map((s) => (
                <View key={s.id} style={{ borderBottomWidth: 1, borderBottomColor: C.line, padding: 13, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14, color: C.plum, fontWeight: '700' }} numberOfLines={1}>{s.name}</Text>
                      {!s.active ? <Pill status="cancelled" label="inactive" /> : null}
                    </View>
                    <Text style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>{fmtRM(s.price)} · {s.duration} min</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <LocBadge t={s.locationType} />
                      <View style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5 }}>
                        <Text style={{ fontSize: 10.5, color: C.ink2, fontWeight: '500' }}>{catOf(s.categoryId)?.name}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <SwitchRowInline on={s.active} onToggle={(v) => { setServiceActive(s.id, v); app.bump(); }} />
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <Btn label="Edit" variant="o" size="xs" onPress={() => { setEditingId(s.id); setAdding(false); }} />
                      {!s.active ? <Btn label="Delete" variant="d" size="xs" onPress={() => { deleteService(s.id); app.bump(); }} /> : null}
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Empty icon="pricetag-outline" title="No services yet" text="Add your first service so customers can book you." action="Add service" onAction={() => setAdding(true)} />
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SwitchRowInline({ on, onToggle }: { on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onToggle(!on)}
      style={{ width: 42, height: 25, borderRadius: 999, backgroundColor: on ? C.green : C.line2, justifyContent: 'center', paddingHorizontal: 3 }}
    >
      <View style={{ width: 19, height: 19, borderRadius: 9.5, backgroundColor: C.white, transform: [{ translateX: on ? 17 : 0 }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 1 }} />
    </Pressable>
  );
}

function ServiceForm({ existing, catOpts, onDone }: { existing: Service | null; catOpts: string[]; onDone: () => void }) {
  const app = useApp();
  const p = app.db.profiles.find((x) => x.userId === app.user?.id)!;
  const [name, setName] = useState(existing?.name || '');
  const [cat, setCat] = useState(existing?.categoryId || catOpts[0] || 'c1');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [dur, setDur] = useState(existing?.duration || 60);
  const [loc, setLoc] = useState<Service['locationType']>(existing?.locationType || 'provider');
  const [desc, setDesc] = useState(existing?.desc || '');
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    const pr = parseFloat(price);
    if (name.trim().length < 2 || !(pr > 0)) {
      setErr('Give the service a name and a price.');
      return;
    }
    upsertService({ id: existing?.id, providerId: p.id, name: name.trim(), categoryId: cat, price: pr, duration: dur, locationType: loc, desc: desc.trim() });
    app.bump();
    app.showToast(existing ? 'Service updated' : 'Service added — customers can now book it');
    onDone();
  };

  return (
    <Card style={{ marginBottom: 12, borderColor: C.brand100 }}>
      <FieldL>Service name</FieldL>
      <TextInput style={inp} value={name} onChangeText={setName} placeholder="e.g. Classic Lash Set" placeholderTextColor={C.ink3} />
      <FieldL>Category</FieldL>
      <PickRow value={cat} options={catOpts.map((id) => ({ v: id, label: catOf(id)?.name || id }))} onChange={setCat} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <FieldL>Price (RM)</FieldL>
          <TextInput style={inp} value={price} onChangeText={setPrice} placeholder="0" placeholderTextColor={C.ink3} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <FieldL>Duration</FieldL>
          <PickRow value={String(dur)} options={[15, 30, 45, 60, 90, 120, 150, 180].map((d) => ({ v: String(d), label: d + ' min' }))} onChange={(v) => setDur(parseInt(v))} />
        </View>
      </View>
      <FieldL>Where is this done?</FieldL>
      <PickRow
        value={loc}
        options={[
          { v: 'provider', label: 'At my studio' },
          { v: 'customer', label: 'At the customer location' },
          { v: 'both', label: 'Either' },
        ]}
        onChange={(v) => setLoc(v as Service['locationType'])}
      />
      <FieldL>Description</FieldL>
      <TextInput style={[inp, { minHeight: 64, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} placeholder="What is included, results, aftercare…" placeholderTextColor={C.ink3} multiline />
      {err ? (
        <View style={{ backgroundColor: C.redBg, borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <Text style={{ color: C.red, fontSize: 13 }}>{err}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label={existing ? 'Save changes' : 'Add service'} variant="p" size="sm" block onPress={save} />
        <Btn label="Cancel" variant="o" size="sm" onPress={onDone} />
      </View>
    </Card>
  );
}
function FieldL({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 }}>{children}</Text>;
}
const inp = { borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white, padding: 10, paddingHorizontal: 12, fontSize: 14, color: C.ink } as const;
function PickRow({ value, options, onChange }: { value: string; options: { v: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.v === value)?.label || value;
  return (
    <View style={{ position: 'relative' }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white, padding: 10, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 14, color: C.ink }}>{cur}</Text>
        <Ionicons name="chevron-down" size={15} color={C.ink3} />
      </Pressable>
      {open ? (
        <View style={{ position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.line, zIndex: 30, maxHeight: 200, shadowColor: C.plum, shadowOpacity: 0.15, shadowRadius: 10, elevation: 8 }}>
          <ScrollView>
            {options.map((o) => (
              <Pressable key={o.v} onPress={() => { onChange(o.v); setOpen(false); }} style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ fontSize: 13.5, color: o.v === value ? C.brand700 : C.plum, fontWeight: o.v === value ? '700' : '400' }}>{o.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
