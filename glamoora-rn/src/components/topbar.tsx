import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { me, unreadCount } from '../db/core';
import { C } from '../theme';

export function TopBar({
  back, title, sub, brand, right,
}: {
  back?: boolean;
  title?: string;
  sub?: string;
  brand?: boolean;
  right?: React.ReactNode;
}) {
  const path = usePathname();
  const u = me();
  const bell = () =>
    u ? (
      <Pressable
        onPress={() => router.push('/notifications')}
        style={{ position: 'relative', width: 38, height: 38, borderRadius: 12, backgroundColor: C.brand50, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="notifications-outline" size={20} color={C.plum} />
        {unreadCount(u.id) > 0 && (
          <View
            style={{
              position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8,
              backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
              borderWidth: 2, borderColor: C.bg,
            }}
          >
            <Text style={{ color: C.white, fontSize: 9.5, fontWeight: '700' }}>{unreadCount(u.id) > 9 ? '9+' : unreadCount(u.id)}</Text>
          </View>
        )}
      </Pressable>
    ) : null;
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16 }}>
        {back ? (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.brand50, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={20} color={C.plum} />
          </Pressable>
        ) : brand ? (
          <Pressable onPress={() => router.replace('/')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Image source={require('../../assets/images/logo-mark.png')} style={{ height: 30, width: 'auto' }} />
              <Text style={{ fontFamily: 'serif', letterSpacing: 2.2, fontSize: 13.5, color: C.plum, fontWeight: '600' }}>GLAMOORA</Text>
            </View>
          </Pressable>
        ) : null}
        {title ? (
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'serif', fontSize: 16, color: C.plum, flexShrink: 1 }} numberOfLines={1}>{title}</Text>
            {sub ? <Text style={{ fontSize: 11, color: C.ink3 }} numberOfLines={1}>{sub}</Text> : null}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {right}
        {u && path !== '/notifications' && bell()}
      </View>
    </SafeAreaView>
  );
}
