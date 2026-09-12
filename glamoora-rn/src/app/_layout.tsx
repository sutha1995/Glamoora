import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../store';
import { C } from '../theme';

/**
 * Route guard.
 *
 * `useSegments()` returns *URL* segments — group folders like `(customer)` are
 * stripped — so `['provider', 'p1']` is a customer opening a studio profile and
 * `['admin']` is the console. Roles are enforced by top-level URL segment.
 */
const PUBLIC_ROUTES = new Set(['', 'auth']);
const SHARED_ROUTES = new Set(['notifications', 'messages', 'chat', 'assistant']);
const CUSTOMER_ROUTES = new Set([
  'home', 'discover', 'bookings', 'favourites', 'profile',
  'provider', 'book', 'book-success', 'review',
]);
const PROVIDER_ROUTES = new Set(['dashboard', 'calendar', 'services', 'hours', 'studio', 'settings']);
const ADMIN_ROUTES = new Set(['admin']);

function allowedRoutes(role: string): Set<string> {
  if (role === 'provider') return PROVIDER_ROUTES;
  if (role === 'admin') return ADMIN_ROUTES;
  return CUSTOMER_ROUTES;
}

function homeFor(role: string | undefined): '/home' | '/dashboard' | '/admin' | '/auth' {
  if (!role) return '/auth';
  if (role === 'provider') return '/dashboard';
  if (role === 'admin') return '/admin';
  return '/home';
}

function RootNavigator() {
  const { ready, user } = useApp();
  const segments = useSegments() as unknown as string[];
  const router = useRouter();
  const root = segments[0] ?? '';

  useEffect(() => {
    if (!ready) return;
    const role = user?.role;
    const home = homeFor(role);

    if (!role) {
      if (!PUBLIC_ROUTES.has(root) && !SHARED_ROUTES.has(root)) router.replace('/auth');
      return;
    }
    // Signed-in users may open notifications/messages/chat regardless of role.
    if (SHARED_ROUTES.has(root)) return;
    // index + auth hand off to the role's home once a session exists.
    if (PUBLIC_ROUTES.has(root)) {
      router.replace(home);
      return;
    }
    if (!allowedRoutes(role).has(root)) router.replace(home);
  }, [ready, user, root, router]);

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
      {/* (shared) and (admin) have no layout of their own, so their screens are
          hoisted into this navigator as `(shared)/messages`, `(admin)/admin`, …
          Declaring the bare group names here would warn about missing routes. */}
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
