import { Redirect } from 'expo-router';
import React from 'react';

import { Loading, Screen } from '../components/ui';
import { useAuth } from '../lib/auth';

export default function Index() {
  const { ready, user } = useAuth();
  if (!ready)
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={user.role === 'caregiver' || user.role === 'kader' ? '/home' : '/dashboard'} />;
}
