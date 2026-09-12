import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { C } from '../../theme';

const TABS = [
  { name: 'dashboard', icon: 'grid', label: 'Dashboard' },
  { name: 'calendar', icon: 'calendar', label: 'Calendar' },
  { name: 'services', icon: 'layers', label: 'Services' },
  { name: 'hours', icon: 'time', label: 'Hours' },
  { name: 'studio', icon: 'brush', label: 'Studio' },
] as const;

export default function ProviderLayout() {
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
      <Tabs.Screen name="settings" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
