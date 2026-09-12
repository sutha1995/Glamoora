import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../store';
import { C } from '../theme';

function RootNavigator() {
  const { ready, user } = useApp();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const seg0 = segments[0] || '';
    const inGroup = segments[1] || '';
    if (!user) {
      if (seg0 !== 'auth') router.replace('/auth');
      return;
    }
    const home = user.role === 'provider' ? '/dashboard' : user.role === 'admin' ? '/admin' : '/home';
    const isHome =
      (user.role === 'customer' && (inGroup === 'home' || inGroup === 'discover' || inGroup === 'bookings' || inGroup === 'favourites' || inGroup === 'profile' || inGroup === 'notifications' || inGroup === 'provider' || inGroup === 'book' || inGroup === 'review' || inGroup === 'book-success')) ||
      (user.role === 'provider' && (inGroup === 'dashboard' || inGroup === 'calendar' || inGroup === 'services' || inGroup === 'hours' || inGroup === 'studio' || inGroup === 'settings' || inGroup === 'notifications')) ||
      (user.role === 'admin' && seg0 === 'admin');
    if (!user && seg0 === 'auth') return;
    if (user && (seg0 === 'auth' || seg0 === '' || seg0 === 'index')) router.replace(home);
    if (user && seg0 !== 'auth' && !isHome) {
      // role mismatch (e.g. provider on customer tab) — send to their home
      if (user.role === 'provider' && inGroup !== 'dashboard' && inGroup !== 'calendar' && inGroup !== 'services' && inGroup !== 'hours' && inGroup !== 'studio' && inGroup !== 'settings' && inGroup !== 'notifications') router.replace(home);
      if (user.role === 'customer' && inGroup === 'dashboard') router.replace(home);
    }
  }, [ready, user, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: C.bg },
        animation: 'default',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(provider)" />
      <Stack.Screen name="(admin)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AppProvider>
  );
}
