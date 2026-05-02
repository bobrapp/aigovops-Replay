import { Ionicons } from "@expo/vector-icons";
import { useGetChain, useGetStats } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface StatTileProps {
  label: string;
  value: number | string;
  icon: string;
  accent: string;
  sub?: string;
}

function StatTile({ label, value, icon, accent, sub }: StatTileProps) {
  const colors = useColors();
  return (
    <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.tileIcon, { backgroundColor: `${accent}20` }]}>
        <Ionicons name={icon as any} size={22} color={accent} />
      </View>
      <Text style={[styles.tileValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {sub && <Text style={[styles.tileSub, { color: colors.mutedForeground }]}>{sub}</Text>}
    </View>
  );
}

export default function StatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomInset = insets.bottom + (Platform.OS === "web" ? 34 : 100);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetStats();
  const { data: chain, isLoading: chainLoading, refetch: refetchChain } = useGetChain();

  const [refreshing, setRefreshing] = React.useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchChain()]);
    setRefreshing(false);
  }

  const isLoading = statsLoading || chainLoading;
  const passRate = stats && stats.totalInteractions > 0
    ? Math.round((stats.policyPassCount / stats.totalInteractions) * 100)
    : 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 24, paddingBottom: bottomInset, paddingHorizontal: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Dashboard</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        AI interaction governance overview
      </Text>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <>
          {/* Chain status banner */}
          <LinearGradient
            colors={chain?.intact ? [colors.navy, "#1e4080"] : ["#7f1d1d", "#991b1b"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.chainBanner}
          >
            <View style={styles.chainRow}>
              <Ionicons
                name={chain?.intact ? "link" : "warning"}
                size={24}
                color={chain?.intact ? colors.emerald : colors.gold}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.chainTitle}>
                  {chain?.intact ? "Chain Intact" : "Chain Anomaly Detected"}
                </Text>
                <Text style={styles.chainSub}>
                  {chain?.length ?? 0} receipts · head {chain?.headHash?.slice(0, 8) ?? "—"}
                </Text>
              </View>
              <View style={[styles.chainDot, { backgroundColor: chain?.intact ? colors.emerald : colors.gold }]} />
            </View>
          </LinearGradient>

          {/* Stat tiles */}
          <View style={styles.tileGrid}>
            <StatTile
              label="Total Receipts"
              value={stats?.totalInteractions ?? 0}
              icon="document-text"
              accent={colors.primary}
            />
            <StatTile
              label="Pass Rate"
              value={`${passRate}%`}
              icon="checkmark-shield"
              accent={colors.emerald}
              sub={`${stats?.policyPassCount ?? 0} passed`}
            />
            <StatTile
              label="Violations"
              value={stats?.policyFailCount ?? 0}
              icon="close-circle"
              accent={colors.error}
            />
            <StatTile
              label="Replays"
              value={stats?.replayCount ?? 0}
              icon="refresh-circle"
              accent={colors.gold}
            />
          </View>

          {/* Models */}
          {stats?.modelsUsed && stats.modelsUsed.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Models in Use</Text>
              {stats.modelsUsed.map((m) => (
                <View key={m} style={styles.modelRow}>
                  <Ionicons name="cube-outline" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.modelText, { color: colors.foreground }]}>{m}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Recent activity */}
          {stats?.recentActivity && stats.recentActivity.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Activity</Text>
              {stats.recentActivity.slice(0, 5).map((a) => (
                <View key={a.id} style={styles.activityRow}>
                  <Ionicons
                    name={
                      a.type === "created" ? "add-circle-outline"
                        : a.type === "replayed" ? "refresh-outline"
                        : a.type === "verified" ? "shield-checkmark-outline"
                        : "checkmark-circle-outline"
                    }
                    size={16}
                    color={colors.mutedForeground}
                  />
                  <Text style={[styles.activityText, { color: colors.foreground }]} numberOfLines={1}>
                    {a.summary}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { paddingTop: 80, alignItems: "center" },
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
    marginBottom: 20,
  },
  chainBanner: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  chainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chainTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  chainSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  chainDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  tile: {
    flex: 1,
    minWidth: "44%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  tileValue: {
    fontSize: 26,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  tileLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  tileSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modelText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activityText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
