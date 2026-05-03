import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type PolicyStatus = "pass" | "fail" | "pending" | "error";

interface StatusBadgeProps {
  status: PolicyStatus;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const colors = useColors();

  const config: Record<PolicyStatus, { bg: string; text: string; label: string }> = {
    pass: { bg: "rgba(16,185,129,0.15)", text: colors.emerald, label: "PASS" },
    fail: { bg: "rgba(239,68,68,0.15)", text: colors.error, label: "FAIL" },
    pending: { bg: "rgba(245,158,11,0.15)", text: colors.warning, label: "PENDING" },
    error: { bg: "rgba(139,92,246,0.15)", text: colors.mutedForeground, label: "ERROR" },
  };

  const c = config[status] ?? config.error;
  const isSmall = size === "sm";

  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderRadius: isSmall ? 4 : 6 }]}>
      <Text
        style={[
          styles.text,
          {
            color: c.text,
            fontSize: isSmall ? 9 : 11,
            paddingHorizontal: isSmall ? 6 : 8,
            paddingVertical: isSmall ? 2 : 3,
          },
        ]}
      >
        {c.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
  },
  text: {
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
});
