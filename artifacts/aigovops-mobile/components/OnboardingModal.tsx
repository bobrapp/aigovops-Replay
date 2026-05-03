import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export const ONBOARDING_SEEN_KEY = "aigovops_onboarding_seen_v1";

const STEPS = [
  {
    icon: "mic-outline" as const,
    iconColor: "#10B981",
    title: "Record a Chat",
    body: "Paste what you asked the AI and what it replied — word for word. This becomes your evidence.",
  },
  {
    icon: "shield-half-outline" as const,
    iconColor: "#1B3B6F",
    title: "Mint a Receipt",
    body: "We cryptographically sign the conversation with a SHA-256 hash and link it to your personal chain. One character changed? The hash breaks.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    iconColor: "#10B981",
    title: "Verify Any Time",
    body: "Give anyone the receipt ID. They can verify the full cryptographic proof — no account needed.",
  },
  {
    icon: "refresh-circle-outline" as const,
    iconColor: "#F59E0B",
    title: "Replay & Compare",
    body: "Run the same prompt again later and compare the AI's answer — built-in model drift detection.",
  },
];

interface OnboardingModalProps {
  visible: boolean;
  onClose: () => void;
}

export function OnboardingModal({ visible, onClose }: OnboardingModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  async function handleDone() {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1").catch(() => {});
    onClose();
    setStep(0);
  }

  function handleNext() {
    if (isLast) handleDone();
    else setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDone}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 24 },
        ]}
      >
        {/* Header row */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={[styles.headerTitle, { color: colors.mutedForeground }]}>
            How It Works
          </Text>
          <Pressable
            onPress={handleDone}
            style={styles.closeBtn}
            accessibilityLabel="Close tutorial"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Progress dots */}
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === step ? colors.emerald : colors.border,
                  width: i === step ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        {/* Step content */}
        <View style={styles.content}>
          <LinearGradient
            colors={[`${current.iconColor}18`, "transparent"]}
            style={styles.iconBg}
          >
            <View style={[styles.iconRing, { borderColor: `${current.iconColor}35` }]}>
              <Ionicons name={current.icon} size={52} color={current.iconColor} />
            </View>
          </LinearGradient>

          <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>
            Step {step + 1} of {STEPS.length}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>{current.title}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{current.body}</Text>
        </View>

        {/* Navigation */}
        <View style={styles.nav}>
          {step > 0 ? (
            <Pressable
              onPress={handleBack}
              style={[styles.backBtn, { borderColor: colors.border }]}
              accessibilityLabel="Previous step"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={18} color={colors.foreground} />
              <Text style={[styles.backBtnText, { color: colors.foreground }]}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.spacer} />
          )}

          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.nextBtn,
              { backgroundColor: colors.emerald, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityLabel={isLast ? "Got it, close tutorial" : "Next step"}
            accessibilityRole="button"
          >
            <Text style={styles.nextBtnText}>{isLast ? "Got It ✓" : "Next"}</Text>
            {!isLast && <Ionicons name="chevron-forward" size={18} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  iconBg: {
    borderRadius: 80,
    padding: 24,
    marginBottom: 8,
  },
  iconRing: {
    borderWidth: 1.5,
    borderRadius: 60,
    padding: 20,
  },
  stepLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 23,
    maxWidth: 300,
  },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
  backBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  spacer: { flex: 1 },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    paddingVertical: 14,
    minHeight: 52,
  },
  nextBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
