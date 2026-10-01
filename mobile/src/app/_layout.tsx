// Only the weights the app uses, so the phone bundle stays small.
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";
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
  headerTitleAlign: "left" as const,
  headerTitleStyle: {
    fontFamily: fonts.bold,
    fontSize: 18,
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
        <Stack.Screen name="pregnancy/new" options={{ title: t("addPregnancy") }} />
        <Stack.Screen name="pregnancy/[id]/index" options={{ title: t("pregnancy") }} />
        <Stack.Screen name="pregnancy/[id]/measure" options={{ title: t("motherCheck") }} />
        <Stack.Screen name="pregnancy/[id]/anc" options={{ title: t("ancTitle") }} />
        <Stack.Screen name="pregnancy/[id]/supplements" options={{ title: t("ttdPmt") }} />
        <Stack.Screen name="pregnancy/[id]/danger" options={{ title: t("urgentSigns") }} />
        <Stack.Screen name="pregnancy/[id]/plan" options={{ title: t("birthPlan") }} />
        <Stack.Screen name="pregnancy/[id]/birth" options={{ title: t("recordBirth") }} />
        <Stack.Screen name="pregnancy/[id]/puskesmas" options={{ title: t("flResultsTitle") }} />
        <Stack.Screen name="facility-portal" options={{ title: t("portalTitle") }} />
        <Stack.Screen name="child/[id]/asi" options={{ title: t("asiTitle") }} />
        <Stack.Screen name="child/[id]/kia" options={{ title: t("kiaTitle") }} />
        <Stack.Screen name="mother/new" options={{ title: t("addMother") }} />
        <Stack.Screen name="mothers" options={{ title: t("pregnantMothers") }} />
        <Stack.Screen name="sync" options={{ title: t("syncStatus") }} />
        <Stack.Screen
          name="child/[id]/analysis"
          options={{ title: t("analysisDetail") }}
        />
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
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
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
