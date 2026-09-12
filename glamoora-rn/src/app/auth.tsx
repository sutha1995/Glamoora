import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../store';
import { C } from '../theme';

export default function AuthScreen() {
  const app = useApp();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [regRole, setRegRole] = useState<'customer' | 'provider'>('customer');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [biz, setBiz] = useState('');
  const [bio, setBio] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [cats, setCats] = useState<Record<string, boolean>>({ c1: true });

  const doLogin = (em: string, pw: string) => {
    const e = app.login(em, pw);
    if (e) setErr(e);
    else router.replace('/');
  };
  const doRegister = () => {
    const e = app.register({
      role: regRole, name, email, phone, pass, biz, bio,
      area: 'Bukit Bintang, KL',
      cats: Object.keys(cats).filter((k) => cats[k]),
    });
    if (e) setErr(e);
    else router.replace('/');
  };

  const inputStyle = {
    borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, backgroundColor: C.white,
    padding: 11, paddingHorizontal: 13, fontSize: 14.5, color: C.ink,
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ height: 240, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={require('../../assets/images/logo-full.png')} style={{ height: 160, width: 'auto' }} />
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '600', marginTop: 8 }}>
            Discover · Book · Glow
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', backgroundColor: C.brand100, borderRadius: 12, padding: 3, gap: 3, marginBottom: 16 }}>
            {(['login', 'signup'] as const).map((t) => (
              <Pressable key={t} onPress={() => { setTab(t); setErr(null); }} style={{ flex: 1, paddingVertical: 9, borderRadius: 9, backgroundColor: tab === t ? C.white : 'transparent', alignItems: 'center' }}>
                <Text style={{ color: tab === t ? C.plum : C.ink2, fontWeight: '700', fontSize: 13 }}>{t === 'login' ? 'Log in' : 'Sign up'}</Text>
              </Pressable>
            ))}
          </View>

          {err ? (
            <View style={{ backgroundColor: C.redBg, borderRadius: 10, padding: 10, marginBottom: 12 }}>
              <Text style={{ color: C.red, fontSize: 13 }}>{err}</Text>
            </View>
          ) : null}

          {tab === 'login' ? (
            <View>
              <Text style={lbl}>Email</Text>
              <TextInput style={inputStyle} value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor={C.ink3} autoCapitalize="none" keyboardType="email-address" />
              <Text style={lbl}>Password</Text>
              <TextInput style={inputStyle} value={pass} onChangeText={setPass} placeholder="••••••••" secureTextEntry />
              <Pressable style={primaryBtn} onPress={() => doLogin(email, pass)}>
                <Text style={{ color: C.white, fontWeight: '700', fontSize: 14 }}>Log in</Text>
              </Pressable>
              <View style={{ marginTop: 18 }}>
                <Text style={{ textAlign: 'center', fontSize: 10.5, color: C.ink3, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
                  One-tap demo accounts
                </Text>
                <DemoBtn icon="person-outline" label="Maya — Customer" sub="maya@glamoora.my" onPress={() => doLogin('maya@glamoora.my', 'demo123')} />
                <DemoBtn icon="brush-outline" label="Aina — Beauty Professional" sub="aina@glamoora.my" onPress={() => doLogin('aina@glamoora.my', 'demo123')} />
                <DemoBtn icon="shield-checkmark-outline" label="Admin" sub="admin@glamoora.my" onPress={() => doLogin('admin@glamoora.my', 'demo123')} />
              </View>
            </View>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', backgroundColor: C.brand100, borderRadius: 12, padding: 3, gap: 3, marginBottom: 14 }}>
                {(['customer', 'provider'] as const).map((r) => (
                  <Pressable key={r} onPress={() => setRegRole(r)} style={{ flex: 1, paddingVertical: 9, borderRadius: 9, backgroundColor: regRole === r ? C.white : 'transparent', alignItems: 'center' }}>
                    <Text style={{ color: regRole === r ? C.plum : C.ink2, fontWeight: '700', fontSize: 12.5 }}>
                      {r === 'customer' ? 'I am a customer' : 'I am a professional'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={lbl}>Name</Text>
              <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={C.ink3} />
              <Text style={lbl}>Email</Text>
              <TextInput style={inputStyle} value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor={C.ink3} autoCapitalize="none" keyboardType="email-address" />
              <Text style={lbl}>Phone</Text>
              <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="+60 12-000 0000" placeholderTextColor={C.ink3} keyboardType="phone-pad" />
              <Text style={lbl}>Password</Text>
              <TextInput style={inputStyle} value={pass} onChangeText={setPass} placeholder="Min. 6 characters" secureTextEntry />
              {regRole === 'provider' ? (
                <View>
                  <Text style={lbl}>Business / display name</Text>
                  <TextInput style={inputStyle} value={biz} onChangeText={setBiz} placeholder="e.g. Aina Lash Studio" placeholderTextColor={C.ink3} />
                  <Text style={lbl}>Bio</Text>
                  <TextInput style={[inputStyle, { minHeight: 64, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} placeholder="Tell customers about your craft" placeholderTextColor={C.ink3} multiline />
                  <Text style={lbl}>Categories you offer</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    {app.db.categories.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => setCats((s) => ({ ...s, [c.id]: !s[c.id] }))}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, backgroundColor: cats[c.id] ? C.brand : C.white, borderColor: cats[c.id] ? C.brand : C.line2 }}
                      >
                        <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={13} color={cats[c.id] ? C.white : C.brand700} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: cats[c.id] ? C.white : C.ink2 }}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <Pressable style={primaryBtn} onPress={doRegister}>
                <Text style={{ color: C.white, fontWeight: '700', fontSize: 14 }}>
                  {regRole === 'provider' ? 'Create professional account' : 'Create account'}
                </Text>
              </Pressable>
              <Text style={{ fontSize: 11.5, color: C.ink3, marginTop: 10 }}>
                Hackathon build: payments are mock. No real payment data is collected.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DemoBtn({ icon, label, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 13, marginBottom: 8,
        backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line2, borderStyle: 'dashed', opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color={C.plum} />
      <Text style={{ flex: 1, fontWeight: '600', fontSize: 13, color: C.plum }}>{label}</Text>
      <Text style={{ fontSize: 11, color: C.ink3 }}>{sub}</Text>
    </Pressable>
  );
}
const lbl: TextStyle = { fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 12 };
const primaryBtn: ViewStyle = { backgroundColor: C.plum, borderRadius: 13, paddingVertical: 13, alignItems: 'center', marginTop: 16 };
