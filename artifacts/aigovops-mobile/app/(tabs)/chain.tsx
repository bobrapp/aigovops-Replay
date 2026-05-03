/**
 * Chain screen — shows the authenticated user's receipt chain status and lets
 * them export the full chain as JSONL, HTML, or SQLite.
 *
 * Export behaviour differs by platform:
 *   web    — fetches with bearer auth, creates a Blob URL, auto-clicks a hidden
 *            anchor so the browser's native download prompt fires.
 *   native — fetches with bearer auth, writes to a temp file via expo-file-system,
 *            then invokes expo-sharing's shareAsync so the OS share sheet appears.
 */

import { Ionicons } from "@expo/vector-icons";
import { useGetStats } from "@workspace/api-client-react";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const BASE_URL = DOMAIN ? `https://${DOMAIN}` : "";

type ExportFormat = { label: string; ext: string; mime: string; path: string };

const FORMATS: ExportFormat[] = [
  {
    label: "JSONL (line-delimited JSON)",
    ext: "jsonl",
    mime: "application/x-ndjson",
    path: "/api/export/jsonl",
  },
  {
    label: "HTML bundle (self-contained)",
    ext: "html",
    mime: "text/html",
    path: "/api/export/html",
  },
  {
    label: "SQLite database",
    ext: "db",
    mime: "application/x-sqlite3",
    path: "/api/export/sqlite",
  },
];

export default function ChainScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const { data: stats, isLoading: statsLoading } = useGetStats();

  const [exporting, setExporting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  async function handleExport(fmt: ExportFormat) {
    setShowPicker(false);
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in to export your chain.");
      return;
    }
    setExporting(true);
    try {
      const url = `${BASE_URL}${fmt.path}`;
      const filename = `aigovops-chain.${fmt.ext}`;

      if (Platform.OS === "web") {
        // Web: fetch with bearer auth, create a Blob URL, trigger browser download.
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          document.body.removeChild(a);
        }, 1000);
      } else {
        // Native: download to a temp file via expo-file-system v55, then invoke
        // the OS share sheet via expo-sharing so the user can save / forward.
        const tmpFile = new File(Paths.cache, filename);
        const downloadedFile = await File.downloadFileAsync(url, tmpFile, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadedFile.uri, {
            mimeType: fmt.mime,
            dialogTitle: `Export chain as ${fmt.ext.toUpperCase()}`,
            UTI: fmt.mime,
          });
        } else {
          Alert.alert("Sharing not available", "Your device does not support file sharing.");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Export failed", msg);
    } finally {
      setExporting(false);
    }
  }

  const chainLength: number = (stats as { chainLength?: number })?.chainLength ?? 0;
  const chainIntact: boolean = (stats as { chainIntact?: boolean })?.chainIntact ?? true;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
    exportBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    exportBtnText: { color: colors.primaryForeground, fontWeight: "600", fontSize: 13 },
    statCard: {
      margin: 16,
      padding: 20,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: 16,
    },
    statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    statLabel: { fontSize: 13, color: colors.mutedForeground, fontWeight: "500" },
    statValue: { fontSize: 22, fontWeight: "700", color: colors.foreground },
    intactBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 99,
    },
    intactText: { fontSize: 13, fontWeight: "700" },
    infoBox: {
      marginHorizontal: 16,
      padding: 16,
      backgroundColor: colors.muted,
      borderRadius: 12,
      gap: 8,
    },
    infoTitle: { fontSize: 14, fontWeight: "600", color: colors.foreground },
    infoText: { fontSize: 13, color: colors.mutedForeground, lineHeight: 20 },
    pickerOverlay: {
      position: "absolute",
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    } as const,
    pickerSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: insets.bottom + 16,
      gap: 10,
    },
    pickerTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.foreground,
      marginBottom: 4,
    },
    formatBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      backgroundColor: colors.muted,
      borderRadius: 12,
    },
    formatBtnText: { fontSize: 14, color: colors.foreground, fontWeight: "500", flex: 1 },
    cancelBtn: {
      padding: 14,
      alignItems: "center",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
    },
    cancelText: { fontSize: 14, color: colors.mutedForeground, fontWeight: "500" },
    spinner: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Hash Chain</Text>
        <Pressable
          style={[styles.exportBtn, (exporting || statsLoading) && { opacity: 0.6 }]}
          onPress={() => setShowPicker(true)}
          disabled={exporting || statsLoading}
        >
          {exporting ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Ionicons name="download-outline" size={16} color={colors.primaryForeground} />
          )}
          <Text style={styles.exportBtnText}>
            {exporting ? "Exporting…" : "Export chain"}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
        {/* Chain status card */}
        <View style={styles.statCard}>
          {statsLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <View style={styles.statRow}>
                <View>
                  <Text style={styles.statLabel}>Total receipts</Text>
                  <Text style={styles.statValue}>{chainLength.toLocaleString()}</Text>
                </View>
                <View
                  style={[
                    styles.intactBadge,
                    {
                      backgroundColor: chainIntact
                        ? "rgba(16,185,129,0.15)"
                        : "rgba(239,68,68,0.15)",
                    },
                  ]}
                >
                  <Ionicons
                    name={chainIntact ? "checkmark-circle" : "alert-circle"}
                    size={18}
                    color={chainIntact ? colors.success : colors.error}
                  />
                  <Text
                    style={[
                      styles.intactText,
                      { color: chainIntact ? colors.success : colors.error },
                    ]}
                  >
                    {chainIntact ? "Chain intact" : "Tampered"}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>About the hash chain</Text>
          <Text style={styles.infoText}>
            Every receipt is cryptographically linked to the previous one using SHA-256. If any
            receipt is altered or deleted, the chain breaks and verification fails.
          </Text>
          <Text style={styles.infoText}>
            Export your chain to keep a portable, tamper-evident record that you can verify offline
            at any time.
          </Text>
        </View>
      </ScrollView>

      {/* Format picker bottom sheet */}
      {showPicker && (
        <Pressable style={styles.pickerOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>Export format</Text>
            {FORMATS.map((fmt) => (
              <Pressable
                key={fmt.ext}
                style={styles.formatBtn}
                onPress={() => handleExport(fmt)}
              >
                <Ionicons name="document-outline" size={18} color={colors.primary} />
                <Text style={styles.formatBtnText}>{fmt.label}</Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "600" }}>
                  .{fmt.ext}
                </Text>
              </Pressable>
            ))}
            <Pressable style={styles.cancelBtn} onPress={() => setShowPicker(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}
