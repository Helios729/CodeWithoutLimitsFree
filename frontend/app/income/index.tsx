import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, unwrap } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

type IncomeModSummary = {
  id: number;
  slug: string;
  title: string;
  role_label: string;
  asset: string;
  languages: string[];
  ai_basics_count: number;
};

type IncomeListResp = {
  title: string;
  description: string;
  count: number;
  total_cards?: number;
  duplication_note?: string;
  modules: IncomeModSummary[];
};

export default function IncomeIndex() {
  const router = useRouter();
  const [data, setData] = useState<IncomeListResp | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<IncomeListResp>("/income/modules")
      .then((r) => setData(r.data))
      .catch((e) => setError(unwrap(e).message));
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ padding: 4 }}
          testID="income-back-btn"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Income & Asset Bank</Text>
          <Text style={styles.h1} numberOfLines={2}>
            {data?.title || "Income Modules"}
          </Text>
        </View>
      </View>

      {!data && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.tagline}>{data!.description}</Text>
          <Text style={styles.subCount}>
            {data!.count} monetisable digital-asset modules
          </Text>
          {data!.modules.map((m, idx) => (
            <React.Fragment key={m.id}>
              {idx === data!.modules.length - 1 && data!.duplication_note ? (
                <View style={styles.dupCard}>
                  <View style={styles.dupHeader}>
                    <Ionicons name="git-compare-outline" size={16} color={colors.brandSecondary} />
                    <Text style={styles.dupLabel}>Why is Task 18 the same as Task 2?</Text>
                  </View>
                  <Text style={styles.dupBody}>{data!.duplication_note}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/income/${m.id}`)}
                testID={`income-module-${m.id}`}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.numBadge}>
                    <Text style={styles.numText}>{m.id}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.role}>{m.role_label}</Text>
                    <Text style={styles.cardTitle}>{m.title}</Text>
                  </View>
                </View>
                <Text style={styles.cardBody} numberOfLines={3}>
                  {m.asset}
                </Text>
                <View style={styles.tagRow}>
                  {m.languages.slice(0, 4).map((l) => (
                    <Text key={l} style={styles.tag}>
                      {l}
                    </Text>
                  ))}
                  {m.languages.length > 4 ? (
                    <Text style={styles.tag}>+{m.languages.length - 4}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  tagline: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  subCount: {
    color: colors.brandSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  dupCard: {
    backgroundColor: "#EAF1EB",
    borderColor: colors.brandSecondary,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: 6,
    marginTop: 6,
  },
  dupHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dupLabel: { color: colors.brandSecondary, fontSize: 12, fontWeight: "700" },
  dupBody: { color: colors.text, fontSize: 13, lineHeight: 20 },
  numBadge: {
    backgroundColor: colors.brand,
    borderRadius: 999,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  role: {
    color: colors.brandSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 2 },
  cardBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  tag: {
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  error: { color: colors.danger, padding: spacing.lg },
});
