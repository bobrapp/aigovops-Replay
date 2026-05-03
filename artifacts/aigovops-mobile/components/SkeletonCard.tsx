import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

export function SkeletonCard() {
  const colors = useColors();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.35, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const bg = { backgroundColor: colors.border };

  return (
    <Animated.View
      style={[animStyle, styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityLabel="Loading receipt"
      accessibilityElementsHidden
    >
      <View style={styles.header}>
        <View style={[styles.modelLine, bg]} />
        <View style={[styles.badge, bg]} />
      </View>
      <View style={[styles.promptLine1, bg]} />
      <View style={[styles.promptLine2, bg]} />
      <View style={styles.footer}>
        <View style={[styles.hashLine, bg]} />
        <View style={[styles.timeLine, bg]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modelLine: { width: 80, height: 12, borderRadius: 6 },
  badge: { width: 48, height: 20, borderRadius: 10 },
  promptLine1: { height: 13, borderRadius: 6 },
  promptLine2: { height: 13, borderRadius: 6, width: "65%" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  hashLine: { width: 70, height: 11, borderRadius: 5 },
  timeLine: { width: 90, height: 11, borderRadius: 5 },
});
