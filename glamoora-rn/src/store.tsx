import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { C } from './theme';
import { getDB, initDB, me, setSession } from './db/core';
import type { DB } from './types';

interface AppCtx {
  ready: boolean;
  db: DB;
  user: ReturnType<typeof me>;
  version: number;
  bump: () => void;
  login: (email: string, pass: string) => string | null;
  logout: () => void;
  register: (args: {
    role: 'customer' | 'provider';
    name: string;
    email: string;
    phone: string;
    pass: string;
    biz?: string;
    bio?: string;
    area?: string;
    cats?: string[];
  }) => string | null;
  toast: string | null;
  showToast: (msg: string) => void;
}

const Ctx = createContext<AppCtx>(null as unknown as AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      await initDB();
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    })();
  }, []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const login = useCallback(
    (email: string, pass: string): string | null => {
      const d = getDB();
      const u = d.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === pass);
      if (!u) return 'Invalid email or password. Try a demo account below.';
      setSession(u.id);
      bump();
      return null;
    },
    [bump]
  );

  const logout = useCallback(() => {
    setSession(null);
    bump();
  }, [bump]);

  const register = useCallback(
    (args: {
      role: 'customer' | 'provider';
      name: string;
      email: string;
      phone: string;
      pass: string;
      biz?: string;
      bio?: string;
      area?: string;
      cats?: string[];
    }): string | null => {
      const d = getDB();
      const name = args.name.trim();
      const email = args.email.trim().toLowerCase();
      if (name.length < 2) return 'Please enter your name.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Please enter a valid email.';
      if (args.pass.length < 6) return 'Password must be at least 6 characters.';
      if (d.users.some((u) => u.email.toLowerCase() === email)) return 'An account with this email already exists.';
      const id = 'u_' + Math.random().toString(36).slice(2, 10);
      // default area: Bukit Bintang
      const areaName = args.area || 'Bukit Bintang, KL';
      const coords =
        [
          { n: 'Bukit Bintang, KL', lat: 3.145, lng: 101.71 },
          { n: 'KLCC, KL', lat: 3.1579, lng: 101.7117 },
          { n: 'Bangsar, KL', lat: 3.136, lng: 101.675 },
          { n: 'Mont Kiara, KL', lat: 3.167, lng: 101.652 },
          { n: 'Damansara, KL', lat: 3.158, lng: 101.613 },
          { n: 'Cheras, KL', lat: 3.0987, lng: 101.74 },
          { n: 'Petaling Jaya, SY', lat: 3.125, lng: 101.625 },
          { n: 'Subang Jaya, SY', lat: 3.075, lng: 101.587 },
        ].find((x) => x.n === areaName) || { n: areaName, lat: 3.145, lng: 101.71 };
      d.users.push({
        id, role: args.role, email, password: args.pass, name, phone: args.phone,
        area: coords.n, lat: coords.lat, lng: coords.lng, createdAt: Date.now(),
      });
      if (args.role === 'provider') {
        d.profiles.push({
          id: 'p_' + Math.random().toString(36).slice(2, 10),
          userId: id,
          displayName: (args.biz || '').trim() || name + ' Studio',
          bio: (args.bio || '').trim() || 'New on Glamoora — check out my work!',
          addr: coords.n + ' area, Kuala Lumpur',
          lat: coords.lat, lng: coords.lng,
          radiusKm: 10,
          verification: 'unverified',
          avg: 0,
          reviewCount: 0,
          categoryIds: args.cats?.length ? args.cats : ['c1'],
          phone: args.phone,
        });
      }
      setSession(id);
      bump();
      return null;
    },
    [bump]
  );

  const value = useMemo<AppCtx>(
    () => ({ ready, db: getDB(), user: me(), version, bump, login, logout, register, toast, showToast }),
    [ready, version, toast, bump, login, logout, register, showToast]
  );

  return (
    <Ctx.Provider value={value}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {children}
        {!ready && (
          <View style={styles.splashLoader}>
            <ActivityIndicator color={C.white} size="large" />
          </View>
        )}
        {toast && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </View>
    </Ctx.Provider>
  );
}

export function useApp() {
  return useContext(Ctx);
}

const styles = StyleSheet.create({
  splashLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.brand,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    position: 'absolute',
    bottom: 92,
    alignSelf: 'center',
    backgroundColor: C.plum,
    borderRadius: 13,
    paddingHorizontal: 18,
    paddingVertical: 11,
    maxWidth: '90%',
    zIndex: 1000,
  },
  toastText: { color: C.white, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
