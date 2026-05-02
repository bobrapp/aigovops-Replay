import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, isLoading } = useAuth();

  return (
    <LinearGradient
      colors={[colors.navyDark, colors.navy, "#1e4080"]}
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}
    >
      <View style={styles.content}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.icon}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: colors.primaryForeground }]}>AIGovOps</Text>
        <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.7)" }]}>
          Cryptographic AI receipt system
        </Text>

        <View style={styles.features}>
          {[
            { icon: "shield-checkmark", label: "Signed receipts for every AI interaction" },
            { icon: "link", label: "Immutable cryptographic chain" },
            { icon: "checkmark-circle", label: "Policy compliance auditing" },
          ].map((f) => (
            <View key={f.icon} style={styles.featureRow}>
              <Ionicons name={f.icon as any} size={20} color={colors.emerald} />
              <Text style={[styles.featureText, { color: "rgba(255,255,255,0.85)" }]}>
                {f.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
        <Pressable
          onPress={login}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.loginBtn,
            { backgroundColor: colors.emerald, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.navyDark} />
          ) : (
            <>
              <Ionicons name="logo-github" size={20} color={colors.navyDark} />
              <Text style={[styles.loginBtnText, { color: colors.navyDark }]}>
                Sign in with Replit
              </Text>
            </>
          )}
        </Pressable>
        <Text style={[styles.legal, { color: "rgba(255,255,255,0.4)" }]}>
          Secure authentication via Replit OIDC
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 32,
  },
  features: {
    gap: 16,
    width: "100%",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  bottom: {
    paddingHorizontal: 24,
    gap: 12,
    alignItems: "center",
  },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: "100%",
  },
  loginBtnText: {
    fontSize: 17,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  legal: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
