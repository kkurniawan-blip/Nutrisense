import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';

import { Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import type { Role } from '../../lib/types';
import { colors } from '../../theme';

const VISIBLE: Record<string, Role[]> = {
  home: ['caregiver', 'kader'],
  dashboard: ['officer', 'doctor', 'admin'],
  cases: ['kader', 'officer', 'doctor', 'admin'],
  logistics: ['kader', 'officer', 'doctor', 'admin'],
  pickups: ['caregiver'],
  assistant: ['caregiver', 'kader'],
  profile: ['caregiver', 'kader', 'officer', 'doctor', 'admin'],
};

type IconName = keyof typeof Ionicons.glyphMap;

export default function TabsLayout() {
  const { ready, user, t } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/login" />;

  const tab = (name: string, title: string, icon: IconName) => (
    <Tabs.Screen
      name={name}
      options={{
        title,
        href: VISIBLE[name].includes(user.role) ? undefined : null,
        tabBarIcon: ({ color, size }) => <Ionicons name={icon} color={color} size={size} />,
      }}
    />
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        headerRight: () => (
          <Pressable onPress={() => router.push('/notifications')} style={{ paddingHorizontal: 16 }} accessibilityLabel={t('notifications')}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
          </Pressable>
        ),
      }}
    >
      {tab('home', t('home'), 'home-outline')}
      {tab('dashboard', t('dashboard'), 'stats-chart-outline')}
      {tab('cases', t('cases'), 'medkit-outline')}
      {tab('logistics', t('logistics'), 'cube-outline')}
      {tab('pickups', t('pickups'), 'qr-code-outline')}
      {tab('assistant', t('assistant'), 'chatbubbles-outline')}
      {tab('profile', t('profile'), 'person-circle-outline')}
    </Tabs>
  );
}
