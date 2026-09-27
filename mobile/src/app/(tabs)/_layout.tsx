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

/** Raised coral camera button in the middle of the tab bar: NutriScan is one tap away. */
function ScanButton({ onPress }: { onPress?: (e: any) => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel="NutriScan" style={{ flex: 1, alignItems: 'center' }}>
      <View
        style={{
          marginTop: -22,
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 5,
          borderColor: '#fff',
          ...shadow,
        }}
      >
        <Ionicons name="camera" size={28} color="#fff" />
      </View>
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primaryDark, marginTop: 2 }}>NutriScan</Text>
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
          // Obvious selected state: filled icon on a soft pill, not colour alone.
          <View style={{ backgroundColor: focused ? colors.primarySoft : 'transparent', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 3 }}>
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
        headerTitleStyle: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.text },
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.extrabold, fontSize: 12 },
        tabBarStyle: { height: 74, paddingTop: 6, paddingBottom: 10, borderTopWidth: 0, backgroundColor: '#fff', ...shadow },
        sceneStyle: { backgroundColor: colors.bg },
        headerRight: () => (
          <Pressable
            onPress={() => router.push('/notifications')}
            style={{ marginRight: 14, backgroundColor: '#fff', borderRadius: 20, padding: 8, ...shadow }}
            accessibilityLabel={t('notifications')}
          >
            <Ionicons name="notifications" size={20} color={colors.primary} />
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
