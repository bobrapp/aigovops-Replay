import { Ionicons } from "@expo/vector-icons";
import { useVerifyInteraction } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function VerifyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [receiptId, setReceiptId] = useState("");
  const [queryId, setQueryId] = useState<string | null>(null);

  const { data, isLoading, error } = useVerifyInteraction(queryId ?? "");

  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  function handleVerify() {
    const trimmed = receiptId.trim();
    if (!trimmed) {
      shakeX.value = withSequence(
        withSpring(-8), withSpring(8), withSpring(-6), withSpring(6), withSpring(0)
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQueryId(trimmed);
  }

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomInset = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topInset + 24, paddingBottom: bottomInset + 100, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Verify</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Check the cryptographic integrity of any receipt
        </Text>

        <Animated.View style={[styles.inputWrapper, shakeStyle]}>
          <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="finger-print-outline" size={20} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Receipt ID…"
              placeholderTextColor={colors.mutedForeground}
              value={receiptId}
              onChangeText={setReceiptId}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleVerify}
            />
            {receiptId.length > 0 && (
              <Pressable onPress={() => { setReceiptId(""); setQueryId(null); }}>
                <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
        </Animated.View>

        <Pressable
          style={({ pressed }) => [
            styles.verifyBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={handleVerify}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={20} color="#fff" />
              <Text style={styles.verifyBtnText}>Verify Receipt</Text>
            </>
          )}
        </Pressable>

        <View style={[styles.hintBox, { backgroundColor: "rgba(27,59,111,0.06)", borderColor: "rgba(27,59,111,0.15)" }]}>
          <Ionicons name="information-circle-outline" size={15} color={colors.navy} />
          <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
            Find receipt IDs by tapping any receipt in the{" "}
            <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Receipts</Text>
            {" "}tab. The ID appears at the top of each receipt's detail view.
          </Text>
        </View>

        {error && (
          <View style={[styles.resultCard, { backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)" }]}>
            <Ionicons name="alert-circle" size={24} color={colors.error} />
            <Text style={[styles.resultTitle, { color: colors.error }]}>Receipt Not Found</Text>
            <Text style={[styles.resultDetail, { color: colors.mutedForeground }]}>
              No receipt with that ID exists in the system.
            </Text>
          </View>
        )}

        {data && (
          <View style={[styles.resultCard, {
            backgroundColor: data.valid ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            borderColor: data.valid ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
          }]}>
            <LinearGradient
              colors={data.valid ? ["rgba(16,185,129,0.2)", "transparent"] : ["rgba(239,68,68,0.2)", "transparent"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
            <Ionicons
              name={data.valid ? "shield-checkmark" : "shield-outline"}
              size={40}
              color={data.valid ? colors.emerald : colors.error}
            />
            <Text style={[styles.resultTitle, { color: data.valid ? colors.emerald : colors.error }]}>
              {data.valid ? "Valid Receipt" : "Invalid Receipt"}
            </Text>

            {[
              { label: "Prompt Hash", ok: data.promptHashMatch },
              { label: "Response Hash", ok: data.responseHashMatch },
              { label: "Chain Integrity", ok: data.chainIntact },
            ].map((check) => (
              <View key={check.label} style={styles.checkRow}>
                <Ionicons
                  name={check.ok ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={check.ok ? colors.emerald : colors.error}
                />
                <Text style={[styles.checkLabel, { color: colors.foreground }]}>{check.label}</Text>
              </View>
            ))}

            {data.details && (
              <Text style={[styles.resultDetail, { color: colors.mutedForeground }]}>
                {data.details}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginBottom: 24,
  },
  inputWrapper: { marginBottom: 12 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 10,
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  verifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    height: 50,
    marginBottom: 12,
  },
  verifyBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  hintBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
    alignItems: "center",
    overflow: "hidden",
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  resultDetail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  checkLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
