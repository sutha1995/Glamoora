import { router } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { ProviderCard } from '../../components/cards';
import { TopBar } from '../../components/topbar';
import { Empty } from '../../components/ui';
import { useApp } from '../../store';
import { C } from '../../theme';

export default function FavouritesScreen() {
  const app = useApp();
  const u = app.user!;
  const favs = app.db.favourites
    .filter((f) => f.customerId === u.id)
    .map((f) => f.providerId)
    .filter((id) => {
      const p = app.db.profiles.find((x) => x.id === id);
      return p && p.verification !== 'suspended';
    });
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Favourites" sub={favs.length + ' saved professionals'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        {favs.length ? (
          favs.map((id) => (
            <View key={id} style={{ marginBottom: 11 }}>
              <ProviderCard pid={id} />
            </View>
          ))
        ) : (
          <Empty
            icon="heart-outline"
            title="No favourites yet"
            text="Tap the heart on any professional to save them here for quick rebooking."
            action="Discover professionals"
            onAction={() => router.push('/discover')}
          />
        )}
      </ScrollView>
    </View>
  );
}
