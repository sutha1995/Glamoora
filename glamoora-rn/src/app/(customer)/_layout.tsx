import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { C } from '../../theme';

const TABS = [
  { name: 'home', icon: 'home', label: 'Home' },
  { name: 'discover', icon: 'compass', label: 'Discover' },
  { name: 'bookings', icon: 'calendar', label: 'Bookings' },
  { name: 'favourites', icon: 'heart', label: 'Favourites' },
  { name: 'profile', icon: 'person', label: 'Profile' },
] as const;

export default function CustomerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: 'rgba(255,255,255,0.97)', borderTopColor: C.line, height: 60 },
        tabBarActiveTintColor: C.brand700,
        tabBarInactiveTintColor: C.ink3,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ tabBarIcon: ({ color, size }) => <Ionicons name={t.icon as never} size={size} color={color} /> }}
        />
      ))}
      <Tabs.Screen name="provider/[id]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="book/[id]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="book-success/[id]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="review/[id]" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
