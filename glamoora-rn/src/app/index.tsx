import { Redirect } from 'expo-router';
import React from 'react';
import { useApp } from '../store';

export default function Index() {
  const { ready, user } = useApp();
  if (!ready) return null;
  const home = user ? (user.role === 'provider' ? '/dashboard' : user.role === 'admin' ? '/admin' : '/home') : '/auth';
  return <Redirect href={home} />;
}
