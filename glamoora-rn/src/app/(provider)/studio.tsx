import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PGrid } from '../../components/cards';
import { TopBar } from '../../components/topbar';
import { Avatar, Btn, Card, LRow, Pill } from '../../components/ui';
import { addPortfolioItem, removePortfolioItem, serviceOf, saveDB } from '../../db/core';
import { useApp } from '../../store';
import { C } from '../../theme';

export default function StudioScreen() {
  const app = useApp();
  const p = app.db.profiles.find((x) => x.userId === app.user?.id);
  const [biz, setBiz] = useState(p?.displayName || '');
  const [bio, setBio] = useState(p?.bio || '');
  const [phone, setPhone] = useState(p?.phone || '');
  const [cats, setCats] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    p?.categoryIds.forEach((c) => (m[c] = true));
    return m;
  });
  const [portSvc, setPortSvc] = useState('');
  const [caption, setCaption] = useState('');
  const u = app.user;
  if (!p || !u) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const svcs = app.db.services.filter((s) => s.providerId === p.id && s.active);
  const port = app.db.portfolio.filter((x) => x.providerId === p.id);

  const saveProfile = () => {
    p.displayName = biz.trim() || p.displayName;
    p.bio = bio.trim();
    p.phone = phone.trim();
    const chosen = Object.keys(cats).filter((k) => cats[k]);
    if (chosen.length) p.categoryIds = chosen;
    void saveDB();
    app.bump();
    app.showToast('Profile saved');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar
        back
        title="Studio"
        sub="Profile & portfolio"
        right={
          <Pressable onPress={() => router.push('/settings')} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.brand50, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
            <Ionicons name="settings-outline" size={19} color={C.plum} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
          <Card style={{ marginBottom: 14 }}>
            <FieldL>Business / display name</FieldL>
            <TextInput style={inp} value={biz} onChangeText={setBiz} />
            <FieldL>Bio</FieldL>
            <TextInput style={[inp, { minHeight: 70, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} placeholder="Your craft, experience, style…" placeholderTextColor={C.ink3} multiline maxLength={300} />
            <FieldL>Phone</FieldL>
            <TextInput style={inp} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <FieldL>Categories</FieldL>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
              {app.db.categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCats((s) => ({ ...s, [c.id]: !s[c.id] }))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, backgroundColor: cats[c.id] ? C.brand : C.white, borderColor: cats[c.id] ? C.brand : C.line2 }}
                >
                  <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={12} color={cats[c.id] ? C.white : C.brand700} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: cats[c.id] ? C.white : C.ink2 }}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: C.ink3, flex: 1 }}>Verification status</Text>
              <Pill status={p.verification} />
            </View>
            <Btn label="Save profile" variant="p" block style={{ marginTop: 12 }} onPress={saveProfile} />
          </Card>

          <Text style={{ fontFamily: 'serif', fontSize: 16.5, color: C.plum, fontWeight: '600', marginBottom: 10 }}>
            Portfolio <Text style={{ fontFamily: 'sans-serif', fontSize: 12, color: C.ink3 }}>· {port.length} items</Text>
          </Text>
          <Card style={{ marginBottom: 12 }}>
            <FieldL>Service shown</FieldL>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {svcs.map((s) => (
                <Pressable key={s.id} onPress={() => setPortSvc(s.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: portSvc === s.id ? C.brand : C.white, borderColor: portSvc === s.id ? C.brand : C.line2 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: portSvc === s.id ? C.white : C.ink2 }}>{s.name}</Text>
                </Pressable>
              ))}
              {!svcs.length ? <Text style={{ color: C.ink3, fontSize: 12 }}>Add a service first</Text> : null}
            </View>
            <FieldL>Caption</FieldL>
            <TextInput style={inp} value={caption} onChangeText={setCaption} maxLength={60} placeholder="e.g. Volume set — soft wing" placeholderTextColor={C.ink3} />
            <Btn
              label="Add portfolio item"
              variant="b"
              size="sm"
              block
              style={{ marginTop: 10 }}
              disabled={!portSvc}
              onPress={() => {
                const s = serviceOf(portSvc);
                const artKey: Record<string, string> = { c1: 'lash', c2: 'brow', c3: 'massage', c4: 'nail', c5: 'saree', c6: 'wax', c7: 'hair' };
                addPortfolioItem(p.id, portSvc, artKey[s?.categoryId || ''] || 'spark', caption.trim());
                setCaption('');
                app.bump();
                app.showToast('Portfolio item added');
              }}
            />
          </Card>
          {port.length ? (
            <View>
              {port.map((pf) => (
                <View key={pf.id} style={{ width: '48.5%', marginRight: '2.5%', marginBottom: 10, position: 'relative' }}>
                  <PGrid items={[pf]} />
                  <Pressable
                    onPress={() => { removePortfolioItem(pf.id); app.bump(); }}
                    style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 8, backgroundColor: C.redBg, alignItems: 'center', justifyContent: 'center', zIndex: 5 }}
                  >
                    <Ionicons name="close" size={13} color={C.red} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Card>
              <Text style={{ textAlign: 'center', color: C.ink3, fontSize: 13 }}>Show your work — portfolio items appear as styled cards.</Text>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const FieldL = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 }}>{children}</Text>
);
const inp = { borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white, padding: 10, paddingHorizontal: 12, fontSize: 14, color: C.ink } as const;
