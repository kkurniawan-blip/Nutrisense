import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
  useFonts,
} from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Mascot } from '../components/Mascot';
import { AuthProvider, useAuth } from '../lib/auth';
import { SyncProvider } from '../lib/sync';
import { colors, fonts } from '../theme';

const headerOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.primaryDark,
  headerShadowVisible: false,
  headerTitleStyle: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.text },
  contentStyle: { backgroundColor: colors.bg },
};

function RootStack() {
  const { t } = useAuth();
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: t('register') }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="child/new" options={{ title: t('addChild') }} />
      <Stack.Screen name="child/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="child/[id]/measure" options={{ title: `📏 ${t('addMeasurement')}` }} />
      <Stack.Screen name="child/[id]/symptoms" options={{ title: `🌡️ ${t('reportSymptoms')}` }} />
      <Stack.Screen name="child/[id]/nutrition" options={{ title: `🥗 ${t('nutritionPlan')}` }} />
      <Stack.Screen name="child/[id]/meal" options={{ title: '📸 NutriScan' }} />
      <Stack.Screen name="child/[id]/history" options={{ title: `📏 ${t('growthHistory')}` }} />
      <Stack.Screen name="child/[id]/development" options={{ title: `🧠 ${t('development')}` }} />
      <Stack.Screen name="child/[id]/recipes" options={{ title: `👩‍🍳 ${t('recipes')}` }} />
      <Stack.Screen name="privacy" options={{ title: `🔐 ${t('dataPrivacy')}` }} />
      <Stack.Screen name="guide" options={{ title: `📖 ${t('healthGuide')}` }} />
      <Stack.Screen name="case/[id]" options={{ title: t('cases') }} />
      <Stack.Screen name="supply/[id]" options={{ title: t('supplyRequests') }} />
      <Stack.Screen name="scan" options={{ title: t('scanPickup') }} />
      <Stack.Screen name="notifications" options={{ title: `🔔 ${t('notifications')}` }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Mascot size={110} bounce />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SyncProvider>
          <StatusBar style="dark" />
          <RootStack />
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
