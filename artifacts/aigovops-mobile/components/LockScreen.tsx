import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface LockScreenProps {
  onUnlock: () => Promise<boolean>;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [unlocking, setUnlocking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => handleUnlock(), 400);
    return () => clearTimeout(timer);
  }, []);

  async function handleUnlock() {
    if (unlocking) return;
    setFailed(false);
    setUnlocking(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const success = await onUnlock();
    setUnlocking(false);
    if (!success) setFailed(true);
  }

  return (
    <LinearGradient
      colors={["#0F172A", "#1B3B6F"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
    >
      <View style={styles.content}>
        <View style={styles.iconRing}>
          <View style={[styles.iconInner, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
            <Ionicons
              name={failed ? "lock-closed" : "finger-print"}
              size={42}
              color={failed ? colors.error : colors.emerald}
            />
          </View>
        </View>

        <Text style={styles.appName}>AIGovOps{"\n"}REPLAY · BLACKBOX</Text>

        <Text style={styles.subtitle}>
          {failed
            ? "Authentication failed.\nTap below to try again."
            : "Your governance receipts are locked.\nAuthenticate to continue."}
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.unlockBtn,
            {
              backgroundColor: failed ? colors.error : colors.emerald,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
          onPress={handleUnlock}
          disabled={unlocking}
          accessibilityLabel="Unlock with Face ID or Touch ID"
          accessibilityRole="button"
        >
          {unlocking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="finger-print" size={22} color="#fff" />
              <Text style={styles.unlockBtnText}>
                {failed ? "Try Again" : "Unlock with Biometrics"}
              </Text>
            </>
          )}
        </Pressable>

        <View style={styles.securityNote}>
          <Ionicons name="shield-checkmark" size={12} color="rgba(255,255,255,0.35)" />
          <Text style={styles.securityText}>
            Secured with {Platform.OS === "ios" ? "iOS Keychain" : "Android Keystore"} · Evidence-grade receipts
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: 32,
  },
  iconRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    borderColor: "rgba(16,185,129,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iconInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 26,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 8,
  },
  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    minWidth: 240,
    minHeight: 52,
    justifyContent: "center",
  },
  unlockBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 16,
  },
  securityText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
  },
});
