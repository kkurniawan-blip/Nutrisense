import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import React, { useContext } from 'react';
import { Pressable, View } from 'react-native';

import { TextScaleContext } from '../../components/Text';
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

export default function TabsLayout() {
  const { ready, user, t } = useAuth();
  // Tab labels follow the chosen text size too (capped so five short labels still fit on a 360 px phone).
  const scale = Math.min(useContext(TextScaleContext), 1.15);
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
          // Obvious selected state: filled icon on a soft lavender pill, not colour alone.
          <View style={{ backgroundColor: focused ? colors.primarySoft : 'transparent', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 3 }}>
            <Ionicons name={focused ? activeIcon : icon} color={color} size={23} />
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
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 19, color: colors.text },
        headerTitleAlign: 'left',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: Math.round(12.5 * scale) },
        tabBarStyle: { height: 74, paddingTop: 6, paddingBottom: 10, borderTopWidth: 0, backgroundColor: 'rgba(255,255,255,0.94)', borderTopLeftRadius: 22, borderTopRightRadius: 22, ...shadow },
        sceneStyle: { backgroundColor: colors.bg },
        headerRight: () => (
          <Pressable
            onPress={() => router.push('/notifications')}
            style={{ marginRight: 14, backgroundColor: '#fff', borderRadius: 20, padding: 9, ...shadow }}
            accessibilityLabel={t('notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.primary} />
          </Pressable>
        ),
      }}
    >
      {tab('home', t('home'), 'home-outline', 'home', { headerShown: false })}
      {tab('dashboard', t('dashboard'), 'stats-chart-outline', 'stats-chart')}
      {tab('cases', t('cases'), 'medkit-outline', 'medkit')}
      {tab('assistant', t('assistant'), 'chatbubble-ellipses-outline', 'chatbubble-ellipses', { tabBarLabel: 'Nuri' })}
      {tab('nutriscan', 'NutriScan', 'scan-outline', 'scan', { tabBarLabel: 'Scan' })}
      {tab('logistics', t('logistics'), 'cube-outline', 'cube')}
      {tab('pickups', t('pickups'), 'gift-outline', 'gift')}
      {tab('profile', t('profile'), 'person-circle-outline', 'person-circle')}
    </Tabs>
  );
}
