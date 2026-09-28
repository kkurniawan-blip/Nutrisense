import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../components/Text';
import { Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import type { Role } from '../../lib/types';
import { colors, fonts, shadow } from '../../theme';

const VISIBLE: Record<string, Role[]> = {
  home: ['caregiver', 'kader'],
  dashboard: ['officer', 'doctor', 'admin'],
  cases: ['kader', 'officer', 'doctor', 'admin'],
  assistant: ['caregiver', 'kader'],
  nutriscan: ['caregiver'],
  logistics: ['kader', 'officer', 'doctor', 'admin'],
  pickups: ['caregiver'],
  profile: ['caregiver', 'kader', 'officer', 'doctor', 'admin'],
};

type IconName = keyof typeof Ionicons.glyphMap;

/** Raised indigo camera key in the middle of the tab bar: NutriScan is one tap away. */
function ScanButton({ onPress }: { onPress?: (e: any) => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel="NutriScan" style={{ flex: 1, alignItems: 'center' }}>
      <View
        style={{
          marginTop: -20,
          width: 60,
          height: 60,
          borderRadius: 18,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 4,
          borderColor: '#fff',
          ...shadow,
        }}
      >
        <Ionicons name="scan-outline" size={30} color="#fff" style={{ position: 'absolute' }} />
        <Ionicons name="camera" size={14} color={colors.accent} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink, marginTop: 2 }}>NutriScan</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { ready, user, t } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/login" />;

  const shown = (name: string) => VISIBLE[name].includes(user.role);
  const tab = (name: string, title: string, icon: IconName, activeIcon: IconName, extra: object = {}) => (
    <Tabs.Screen
      name={name}
      options={{
        title,
        href: shown(name) ? undefined : null,
        tabBarIcon: ({ color, focused }) => (
          // Obvious selected state: filled icon plus an indicator line, not colour alone.
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 22, height: 3, borderRadius: 2, marginBottom: 4, backgroundColor: focused ? colors.primary : 'transparent' }} />
            <Ionicons name={focused ? activeIcon : icon} color={color} size={24} />
          </View>
        ),
        tabBarAccessibilityLabel: title,
        ...extra,
      }}
    />
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 12 },
        tabBarStyle: { height: 76, paddingTop: 2, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' },
        sceneStyle: { backgroundColor: colors.bg },
        headerRight: () => (
          <Pressable
            onPress={() => router.push('/notifications')}
            style={{ marginRight: 14, backgroundColor: '#fff', borderRadius: 12, padding: 9, borderWidth: 1, borderColor: colors.border }}
            accessibilityLabel={t('notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.ink} />
          </Pressable>
        ),
      }}
    >
      {tab('home', t('home'), 'home-outline', 'home', { headerShown: false })}
      {tab('dashboard', t('dashboard'), 'stats-chart-outline', 'stats-chart')}
      {tab('cases', t('cases'), 'medkit-outline', 'medkit')}
      {tab('assistant', t('assistant'), 'chatbubble-ellipses-outline', 'chatbubble-ellipses')}
      <Tabs.Screen
        name="nutriscan"
        options={{
          title: 'NutriScan',
          href: shown('nutriscan') ? undefined : null,
          tabBarButton: shown('nutriscan') ? (props) => <ScanButton onPress={props.onPress ?? undefined} /> : undefined,
        }}
      />
      {tab('logistics', t('logistics'), 'cube-outline', 'cube')}
      {tab('pickups', t('pickups'), 'gift-outline', 'gift')}
      {tab('profile', t('profile'), 'person-circle-outline', 'person-circle')}
    </Tabs>
  );
}
