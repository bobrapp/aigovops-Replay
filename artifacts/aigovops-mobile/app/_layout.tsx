import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { setBaseUrl } from "@workspace/api-client-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as LocalAuthentication from "expo-local-authentication";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LockScreen } from "@/components/LockScreen";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LoginScreen } from "@/components/LoginScreen";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const LOCK_AFTER_SECONDS = 60;

if (DOMAIN) {
  setBaseUrl(`https://${DOMAIN}`);
}

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !biometricAvailable || Platform.OS === "web") return;

    const handleStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        backgroundedAt.current = Date.now();
      } else if (nextState === "active" && backgroundedAt.current !== null) {
        const elapsed = (Date.now() - backgroundedAt.current) / 1000;
        if (elapsed > LOCK_AFTER_SECONDS) {
          setIsLocked(true);
        }
        backgroundedAt.current = null;
      }
    };

    const sub = AppState.addEventListener("change", handleStateChange);
    return () => sub.remove();
  }, [user, biometricAvailable]);

  async function handleUnlock(): Promise<boolean> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock AIGovOps REPLAY - BLACKBOX",
      fallbackLabel: "Use Passcode",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    if (result.success) setIsLocked(false);
    return result.success;
  }

  if (isLoading) return null;
  if (!user) return <LoginScreen />;
  if (isLocked && biometricAvailable) return <LockScreen onUnlock={handleUnlock} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="receipt/[id]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="new-receipt" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
