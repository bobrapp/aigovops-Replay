import { Ionicons } from "@expo/vector-icons";
import { useCreateInteraction } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

const MODELS = ["gpt-4o", "gpt-4", "claude-3-5-sonnet", "claude-3-opus", "gemini-1.5-pro", "llama-3.1"];

export default function NewReceiptScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [saveError, setSaveError] = useState<"auth" | "generic" | null>(null);

  const promptRef = useRef<TextInput>(null);
  const responseRef = useRef<TextInput>(null);

  const [listeningFor, setListeningFor] = useState<"prompt" | "response" | null>(null);
  const [nativeDictateHint, setNativeDictateHint] = useState<"prompt" | "response" | null>(null);

  const { mutateAsync, isPending } = useCreateInteraction();

  async function handleSubmit() {
    if (!prompt.trim() || !response.trim()) return;
    setSaveError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await mutateAsync({ data: { prompt: prompt.trim(), response: response.trim(), model } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const status = (err as { status?: number })?.status;
      setSaveError(status === 401 ? "auth" : "generic");
    }
  }

  function startVoice(field: "prompt" | "response", currentValue: string) {
    if (Platform.OS !== "web") {
      if (field === "prompt") promptRef.current?.focus();
      else responseRef.current?.focus();
      setNativeDictateHint(field);
      setTimeout(() => setNativeDictateHint(null), 3500);
      return;
    }

    if (typeof window === "undefined") return;
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    if (listeningFor === field) {
      setListeningFor(null);
      return;
    }

    setListeningFor(field);
    const recognition = new SpeechRec();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onend = () => setListeningFor(null);
    recognition.onerror = () => setListeningFor(null);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        .map((r: any) => r[0].transcript)
        .join(" ")
        .trim();
      if (field === "prompt") {
        setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
      } else {
        setResponse((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.start();
  }

  function MicButton({ field, value }: { field: "prompt" | "response"; value: string }) {
    const active = listeningFor === field;
    return (
      <Pressable
        onPress={() => startVoice(field, value)}
        style={[
          styles.micBtn,
          { backgroundColor: active ? `${colors.primary}18` : "transparent" },
        ]}
        accessibilityLabel={active ? "Stop voice input" : `Start voice input for ${field}`}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={active ? "mic" : "mic-outline"}
          size={15}
          color={active ? colors.primary : colors.mutedForeground}
        />
        <Text style={[styles.micLabel, { color: active ? colors.primary : colors.mutedForeground }]}>
          {Platform.OS === "web" ? (active ? "Listening…" : "Dictate") : "Dictate"}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.navBar, { paddingTop: topInset + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>New Receipt</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={isPending || !prompt.trim() || !response.trim()}
          style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityLabel="Save receipt"
          accessibilityRole="button"
          accessibilityState={{ disabled: isPending || !prompt.trim() || !response.trim() }}
        >
          {isPending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={[styles.saveBtnText, { color: (prompt && response) ? colors.primary : colors.mutedForeground }]}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 + (Platform.OS === "web" ? 34 : 0) }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>MODEL</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modelScroll}>
          {MODELS.map((m) => (
            <Pressable
              key={m}
              onPress={() => setModel(m)}
              style={[
                styles.modelChip,
                {
                  backgroundColor: m === model ? colors.primary : colors.secondary,
                  borderColor: m === model ? colors.primary : colors.border,
                },
              ]}
              accessibilityLabel={`Select model ${m}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: m === model }}
            >
              <Text style={[styles.modelChipText, { color: m === model ? "#fff" : colors.foreground }]}>
                {m}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Prompt field */}
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 0, marginBottom: 0 }]}>PROMPT</Text>
          <MicButton field="prompt" value={prompt} />
        </View>
        {nativeDictateHint === "prompt" && (
          <View style={[styles.dictateHint, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
            <Ionicons name="mic" size={13} color={colors.primary} />
            <Text style={[styles.dictateHintText, { color: colors.foreground }]}>
              Tap the 🎤 key on your keyboard to speak
            </Text>
          </View>
        )}
        <TextInput
          ref={promptRef}
          style={[styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          multiline
          numberOfLines={5}
          placeholder="Enter the AI prompt…"
          placeholderTextColor={colors.mutedForeground}
          value={prompt}
          onChangeText={setPrompt}
          textAlignVertical="top"
          accessibilityLabel="AI prompt"
          accessibilityHint="What you asked the AI. Tap Dictate or use the microphone key on your keyboard to speak."
        />

        {/* Response field */}
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 0, marginBottom: 0 }]}>RESPONSE</Text>
          <MicButton field="response" value={response} />
        </View>
        {nativeDictateHint === "response" && (
          <View style={[styles.dictateHint, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
            <Ionicons name="mic" size={13} color={colors.primary} />
            <Text style={[styles.dictateHintText, { color: colors.foreground }]}>
              Tap the 🎤 key on your keyboard to speak
            </Text>
          </View>
        )}
        <TextInput
          ref={responseRef}
          style={[styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          multiline
          numberOfLines={6}
          placeholder="Enter the AI response…"
          placeholderTextColor={colors.mutedForeground}
          value={response}
          onChangeText={setResponse}
          textAlignVertical="top"
          accessibilityLabel="AI response"
          accessibilityHint="What the AI replied. Tap Dictate or use the microphone key on your keyboard to speak."
        />

        <View style={[styles.infoBox, { backgroundColor: "rgba(27,59,111,0.08)", borderColor: "rgba(27,59,111,0.2)" }]}>
          <Ionicons name="information-circle-outline" size={16} color="#1B3B6F" />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Your receipt will be cryptographically signed and added to the immutable chain.
          </Text>
        </View>

        {saveError === "auth" && (
          <View style={[styles.errorBox, { backgroundColor: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)" }]}>
            <Ionicons name="lock-closed-outline" size={18} color="#d97706" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.errorTitle, { color: "#92400e" }]}>Session expired</Text>
              <Text style={[styles.errorSub, { color: "#b45309" }]}>
                Please sign in again to save receipts.
              </Text>
            </View>
            <Pressable
              style={[styles.errorBtn, { backgroundColor: "#d97706" }]}
              onPress={login}
              accessibilityLabel="Sign in again"
              accessibilityRole="button"
            >
              <Text style={styles.errorBtnText}>Sign In</Text>
            </Pressable>
          </View>
        )}

        {saveError === "generic" && (
          <View style={[styles.errorBox, { backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)" }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={[styles.errorTitle, { color: colors.error, flex: 1 }]}>
              Failed to save — please try again.
            </Text>
          </View>
        )}
      </ScrollView>
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
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  saveBtn: { width: 56, height: 44, alignItems: "flex-end", justifyContent: "center" },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
  },
  micBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  micLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  dictateHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  dictateHintText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  modelScroll: { marginBottom: 4 },
  modelChip: {
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 36,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    justifyContent: "center",
  },
  modelChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    minHeight: 120,
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 16,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  errorTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  errorSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  errorBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  errorBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
