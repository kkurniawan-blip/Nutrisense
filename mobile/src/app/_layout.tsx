// Only the weights the app uses, so the phone bundle stays small.
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium";
import { IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono/600SemiBold";
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";
import { Unbounded_600SemiBold } from "@expo-google-fonts/unbounded/600SemiBold";
import { Unbounded_700Bold } from "@expo-google-fonts/unbounded/700Bold";
import { useFonts } from "expo-font";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Mascot } from "../components/Mascot";
import { AuthProvider, useAuth } from "../lib/auth";
import { PrefsProvider } from "../lib/prefs";
import { SyncProvider } from "../lib/sync";
import { colors, fonts } from "../theme";

const headerOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.ink,
  headerShadowVisible: false,
  headerTitleStyle: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.text,
  },
  contentStyle: { backgroundColor: colors.bg },
};

const PUBLIC_PATHS = ["/", "/login", "/register"];

/** Any inner screen (child, case, settings, ...) opened without a session goes to login, e.g. after the session expires. */
function AuthGuard() {
  const { ready, user } = useAuth();
  const path = usePathname();
  useEffect(() => {
    if (ready && !user && !PUBLIC_PATHS.includes(path))
      router.replace("/login");
  }, [ready, user, path]);
  return null;
}

function RootStack() {
  const { t } = useAuth();
  return (
    <>
      <AuthGuard />
      <Stack screenOptions={headerOptions}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="register"
          options={{ title: t("signUp") }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: t("settings") }}
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="child/new" options={{ title: t("addChild") }} />
        <Stack.Screen name="child/[id]/index" options={{ title: "" }} />
        <Stack.Screen
          name="child/[id]/measure"
          options={{ title: t("addMeasurement") }}
        />
        <Stack.Screen
          name="child/[id]/symptoms"
          options={{ title: t("reportSymptoms") }}
        />
        <Stack.Screen
          name="child/[id]/nutrition"
          options={{ title: t("nutritionPlan") }}
        />
        <Stack.Screen
          name="child/[id]/meal"
          options={{ title: t("actLogMeal") }}
        />
        <Stack.Screen
          name="child/[id]/history"
          options={{ title: t("growthHistory") }}
        />
        <Stack.Screen
          name="child/[id]/development"
          options={{ title: t("development") }}
        />
        <Stack.Screen
          name="child/[id]/recipes"
          options={{ title: t("recipes") }}
        />
        <Stack.Screen name="food/[id]" options={{ title: "NutriScan" }} />
        <Stack.Screen
          name="privacy"
          options={{ title: t("dataPrivacy") }}
        />
        <Stack.Screen
          name="guide"
          options={{ title: t("healthGuide") }}
        />
        <Stack.Screen name="case/[id]" options={{ title: t("cases") }} />
        <Stack.Screen
          name="supply/[id]"
          options={{ title: t("supplyRequests") }}
        />
        <Stack.Screen name="scan" options={{ title: t("scanPickup") }} />
        <Stack.Screen
          name="notifications"
          options={{ title: t("notifications") }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Unbounded_600SemiBold,
    Unbounded_700Bold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Mascot size={110} bounce />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <AuthProvider>
          <SyncProvider>
            <StatusBar style="dark" />
            <RootStack />
          </SyncProvider>
        </AuthProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
