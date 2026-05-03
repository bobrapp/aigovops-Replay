import { Ionicons } from "@expo/vector-icons";
import { useListInteractions } from "@workspace/api-client-react";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReceiptCard } from "@/components/ReceiptCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { useColors } from "@/hooks/useColors";

const SKELETON_COUNT = 5;

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [voiceSearching, setVoiceSearching] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const speechRecRef = useRef<any>(null);

  const { data, isLoading, error, refetch } = useListInteractions({ limit: 50, offset: 0 });

  const items = data?.items ?? [];
  const filtered = search
    ? items.filter(
        (i) =>
          i.model.toLowerCase().includes(search.toLowerCase()) ||
          i.prompt.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  async function handleRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function handleVoiceSearch() {
    if (Platform.OS === "web") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        searchRef.current?.focus();
        return;
      }

      if (voiceSearching) {
        speechRecRef.current?.stop();
        setVoiceSearching(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript as string;
        setSearch(transcript);
        setVoiceSearching(false);
      };
      recognition.onend = () => setVoiceSearching(false);
      recognition.onerror = () => setVoiceSearching(false);
      speechRecRef.current = recognition;
      recognition.start();
      setVoiceSearching(true);
    } else {
      searchRef.current?.focus();
    }
  }

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomInset = insets.bottom + (Platform.OS === "web" ? 34 : 80);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topInset + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: colors.foreground }]}>Receipts</Text>
          <Pressable
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/new-receipt" as any)}
            accessibilityLabel="Add new receipt"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color={colors.primaryForeground} />
          </Pressable>
        </View>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.secondary, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            ref={searchRef}
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by model or prompt…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Search receipts"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable
            onPress={handleVoiceSearch}
            accessibilityLabel={voiceSearching ? "Stop voice search" : "Search by voice"}
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={voiceSearching ? "mic" : "mic-outline"}
              size={16}
              color={voiceSearching ? colors.primary : colors.mutedForeground}
            />
          </Pressable>
        </View>
      </View>

      {isLoading && !refreshing ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Could not load receipts
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retryBtn, { borderColor: colors.border }]}
            accessibilityLabel="Retry loading receipts"
            accessibilityRole="button"
          >
            <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium" }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <ReceiptCard item={item} />}
          scrollEnabled={!!filtered.length}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomInset }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="document-text-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search ? "No matches found" : "No receipts yet"}
              </Text>
              {!search && (
                <>
                  <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                    Tap{" "}
                    <Text
                      style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}
                    >
                      +
                    </Text>{" "}
                    to mint your first cryptographically signed receipt.
                  </Text>
                  <Pressable
                    style={[styles.emptyAction, { backgroundColor: colors.primary }]}
                    onPress={() => router.push("/new-receipt" as any)}
                    accessibilityLabel="Create new receipt"
                    accessibilityRole="button"
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={styles.emptyActionText}>New Receipt</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    gap: 8,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  skeletonList: {
    paddingTop: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 260,
  },
  emptyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  emptyActionText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
  },
});
