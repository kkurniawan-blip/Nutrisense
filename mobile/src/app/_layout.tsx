import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../theme';

function RootStack() {
  const { t } = useAuth();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: t('register') }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="child/new" options={{ title: t('addChild') }} />
      <Stack.Screen name="child/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="child/[id]/measure" options={{ title: t('addMeasurement') }} />
      <Stack.Screen name="child/[id]/symptoms" options={{ title: t('reportSymptoms') }} />
      <Stack.Screen name="child/[id]/nutrition" options={{ title: t('nutritionPlan') }} />
      <Stack.Screen name="child/[id]/meal" options={{ title: t('logMeal') }} />
      <Stack.Screen name="case/[id]" options={{ title: t('cases') }} />
      <Stack.Screen name="supply/[id]" options={{ title: t('supplyRequests') }} />
      <Stack.Screen name="scan" options={{ title: t('scanPickup') }} />
      <Stack.Screen name="notifications" options={{ title: t('notifications') }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
