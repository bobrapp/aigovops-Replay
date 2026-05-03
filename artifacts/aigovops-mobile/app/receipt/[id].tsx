import { Ionicons } from "@expo/vector-icons";
import { useGetInteraction, useVerifyInteraction } from "@workspace/api-client-react";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBadge } from "@/components/StatusBadge";
import { useColors } from "@/hooks/useColors";

function HashRow({ label, value }: { label: string; value: string | null | undefined }) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Pressable style={[styles.hashRow, { backgroundColor: colors.secondary, borderColor: colors.border }]} onPress={copy}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.hashLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.hashValue, { color: colors.foreground }]} numberOfLines={1}>
          {value ?? "—"}
        </Text>
      </View>
      <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function ReceiptDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  const { data: receipt, isLoading } = useGetInteraction(id ?? "");
  const [verifying, setVerifying] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const { data: verifyResult, refetch: doVerify } = useVerifyInteraction(id ?? "");

  async function handleVerify() {
    setVerifying(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await doVerify();
    setVerifying(false);
  }

  async function handleReadAloud() {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    if (!receipt) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const statusLabel =
      receipt.policyStatus === "pass"
        ? "Policy passed."
        : receipt.policyStatus === "fail"
        ? "Policy failed."
        : "Policy pending review.";

    const text =
      `Receipt from ${new Date(receipt.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}. ` +
      `Model: ${receipt.model}. ${statusLabel} ` +
      `Prompt: ${receipt.prompt}. ` +
      `Response: ${receipt.response}`;

    setSpeaking(true);
    Speech.speak(text, {
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
    });
  }

  async function handleShare() {
    if (!receipt) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message =
      `AIGovOps REPLAY - BLACKBOX Receipt — ${receipt.model}\n` +
      `═══════════════════════════════\n` +
      `Created: ${new Date(receipt.createdAt).toLocaleString()}\n` +
      `Status: ${receipt.policyStatus.toUpperCase()}\n\n` +
      `Prompt: ${receipt.prompt.slice(0, 200)}${receipt.prompt.length > 200 ? "…" : ""}\n\n` +
      `Chain Hash: ${receipt.chainHash ?? "N/A"}\n\n` +
      `Verified by AIGovOps Foundation · aigovopsfoundation.org`;
    try {
      await Share.share({ message, title: "AIGovOps REPLAY - BLACKBOX Receipt" });
    } catch {
      // user cancelled or share not available
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.navBar, { paddingTop: topInset + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.navBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>Receipt</Text>
        <View style={styles.navActions}>
          <Pressable
            onPress={handleReadAloud}
            style={styles.navBtn}
            disabled={!receipt}
            accessibilityLabel={speaking ? "Stop reading aloud" : "Read receipt aloud"}
            accessibilityRole="button"
          >
            <Ionicons
              name={speaking ? "stop-circle-outline" : "volume-medium-outline"}
              size={22}
              color={speaking ? colors.primary : receipt ? colors.mutedForeground : colors.border}
            />
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={styles.navBtn}
            disabled={!receipt}
            accessibilityLabel="Share receipt"
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={22} color={receipt ? colors.primary : colors.border} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !receipt ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Receipt not found</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 + (Platform.OS === "web" ? 34 : 0) }}
        >
          {/* Header */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <View style={styles.modelChip}>
                <Ionicons name="cube-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.modelText, { color: colors.mutedForeground }]}>{receipt.model}</Text>
              </View>
              <StatusBadge status={receipt.policyStatus} />
            </View>
            <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
              {new Date(receipt.createdAt).toLocaleString()}
            </Text>
            {receipt.tags?.length > 0 && (
              <View style={styles.tags}>
                {receipt.tags.map((t) => (
                  <View key={t} style={[styles.tag, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{t}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Conversation */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PROMPT</Text>
          <View style={[styles.bubble, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.bubbleText, { color: colors.foreground }]}>{receipt.prompt}</Text>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RESPONSE</Text>
          <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.bubbleText, { color: colors.foreground }]}>{receipt.response}</Text>
          </View>

          {/* Hashes */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CRYPTOGRAPHIC PROOF</Text>
          <HashRow label="Chain Hash" value={receipt.chainHash} />
          <HashRow label="Prompt Hash" value={receipt.promptHash} />
          <HashRow label="Response Hash" value={receipt.responseHash} />
          <HashRow label="Prev Hash" value={receipt.prevHash} />

          {/* Policy violations */}
          {receipt.policyViolations?.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>VIOLATIONS</Text>
              <View style={[styles.card, { backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)" }]}>
                {receipt.policyViolations.map((v, i) => (
                  <View key={i} style={styles.violationRow}>
                    <Ionicons name="alert-circle" size={14} color={colors.error} />
                    <Text style={[styles.violationText, { color: colors.error }]}>{v}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Verify result */}
          {verifyResult && (
            <View style={[styles.card, {
              backgroundColor: verifyResult.valid ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
              borderColor: verifyResult.valid ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"
            }]}>
              <View style={styles.verifyResultRow}>
                <Ionicons
                  name={verifyResult.valid ? "shield-checkmark" : "shield-outline"}
                  size={20}
                  color={verifyResult.valid ? colors.emerald : colors.error}
                />
                <Text style={[styles.verifyResultText, { color: verifyResult.valid ? colors.emerald : colors.error }]}>
                  {verifyResult.valid ? "Cryptographic proof verified" : "Verification failed"}
                </Text>
              </View>
            </View>
          )}

          {/* Actions */}
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }
            ]}
            onPress={handleVerify}
            accessibilityLabel="Verify receipt integrity"
            accessibilityRole="button"
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Verify Integrity</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnOutline,
              { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.75 : 1 }
            ]}
            onPress={handleShare}
            accessibilityLabel="Share receipt"
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={18} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Share Receipt</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  navActions: { flexDirection: "row" },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modelChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  modelText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  timestamp: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 6,
  },
  bubble: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  hashRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  hashLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2 },
  hashValue: { fontSize: 12, fontFamily: "Inter_400Regular", fontVariant: ["tabular-nums"] },
  violationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  violationText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  verifyResultRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  verifyResultText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    height: 50,
    marginTop: 8,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  actionBtnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    marginTop: 10,
  },
});
