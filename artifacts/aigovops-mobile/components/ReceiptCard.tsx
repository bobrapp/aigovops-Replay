import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { StatusBadge } from "@/components/StatusBadge";
import { useColors } from "@/hooks/useColors";

interface Receipt {
  id: string;
  model: string;
  prompt: string;
  policyStatus: "pass" | "fail" | "pending";
  createdAt: string;
  chainHash: string;
}

interface ReceiptCardProps {
  item: Receipt;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ReceiptCard({ item }: ReceiptCardProps) {
  const colors = useColors();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const shortHash = item.chainHash?.slice(0, 8) ?? "—";
  const time = new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
  const promptPreview = item.prompt?.slice(0, 80) ?? "";

  const statusLabel =
    item.policyStatus === "pass"
      ? "passed policy"
      : item.policyStatus === "fail"
      ? "failed policy"
      : "policy pending";

  const accessibilityLabel = `Receipt · ${item.model} · ${statusLabel} · ${date} at ${time}. Prompt: ${promptPreview}${promptPreview.length >= 80 ? "…" : ""}`;

  return (
    <AnimatedPressable
      style={[
        animStyle,
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 20 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
      onPress={() => router.push(`/receipt/${item.id}` as any)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityHint="Double tap to view full receipt details"
    >
      <View style={styles.header}>
        <View style={styles.modelRow}>
          <Ionicons name="cube-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.model, { color: colors.mutedForeground }]}>{item.model}</Text>
        </View>
        <View style={styles.rightMeta}>
          <StatusBadge status={item.policyStatus} size="sm" />
        </View>
      </View>

      <Text style={[styles.prompt, { color: colors.foreground }]} numberOfLines={2}>
        {promptPreview}
      </Text>

      <View style={styles.footer}>
        <Text style={[styles.hash, { color: colors.mutedForeground }]}>
          #{shortHash}
        </Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {date} · {time}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  model: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  rightMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  prompt: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  hash: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    fontVariant: ["tabular-nums"],
  },
  time: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
