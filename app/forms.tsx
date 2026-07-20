import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, unwrap } from "@/src/lib/api";
import { openExternal } from "@/src/lib/openExternal";
import { colors, radius, spacing } from "@/src/theme";

type FormItem = {
  kind: "learning" | "income" | "translator" | "programme";
  module_id: string;
  title: string;
  survey_title: string;
  form_url: string | null;
  native_survey_path: string | null;
};

type Resp = {
  title: string;
  instructions: string;
  count: number;
  items: FormItem[];
};

const KIND_LABEL: Record<FormItem["kind"], { label: string; color: string; bg: string }> = {
  learning: { label: "Learning module", color: colors.brand, bg: "#FFF3EE" },
  income: { label: "Income module", color: colors.brandSecondary, bg: "#EAF1EB" },
  translator: { label: "Translator", color: "#4A5D6E", bg: "#E8EEF2" },
  programme: { label: "Programme-wide", color: "#8B6F47", bg: "#F5EBE0" },
};

export default function FormsRegistry() {
  const router = useRouter();
  const [d, setD] = useState<Resp | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api
      .get<Resp>("/forms")
      .then((r) => setD(r.data))
      .catch((e) => setError(unwrap(e).message));
  }, []);

  const filtered = useMemo(() => {
    if (!d) return [];
    if (!q.trim()) return d.items;
    const needle = q.toLowerCase();
    return d.items.filter(
      (i) =>
        i.title.toLowerCase().includes(needle) ||
        i.survey_title.toLowerCase().includes(needle) ||
        i.module_id.toLowerCase().includes(needle)
    );
  }, [d, q]);

  const wired = d?.items.filter((i) => !!i.form_url).length || 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} testID="forms-back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Survey forms registry</Text>
          <Text style={styles.h1} numberOfLines={2}>
            Map each form to a module
          </Text>
        </View>
      </View>

      {!d && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.helpCard}>
            <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.helpBody}>{d!.instructions}</Text>
          </View>

          <View style={styles.counterRow}>
            <Text style={styles.counterText}>
              <Text style={styles.b}>{d!.count}</Text> surveys total
            </Text>
            <Text style={styles.counterText}>
              <Text style={styles.b}>{wired}</Text> with Google Form URL
            </Text>
            <Text style={styles.counterText}>
              <Text style={styles.b}>{d!.count - wired}</Text> awaiting URL
            </Text>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search by title or id…"
              placeholderTextColor={colors.textSecondary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              testID="forms-search"
            />
          </View>

          {filtered.map((item) => {
            const kind = KIND_LABEL[item.kind];
            return (
              <View key={item.module_id} style={styles.card}>
                <View style={styles.kindRow}>
                  <Text style={[styles.kindPill, { color: kind.color, backgroundColor: kind.bg, borderColor: kind.color + "40" }]}>
                    {kind.label}
                  </Text>
                  {item.form_url ? (
                    <Text style={[styles.kindPill, styles.linkedPill]}>Linked ✓</Text>
                  ) : (
                    <Text style={[styles.kindPill, styles.awaitingPill]}>Awaiting URL</Text>
                  )}
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.surveyTitle} selectable>
                  {item.survey_title}
                </Text>
                <Text style={styles.idLine} selectable>
                  module_id: <Text style={styles.mono}>{item.module_id}</Text>
                </Text>
                {item.form_url ? (
                  <TouchableOpacity
                    style={styles.openBtn}
                    onPress={() => openExternal(item.form_url!)}
                    testID={`form-open-${item.module_id}`}
                  >
                    <Ionicons name="open-outline" size={14} color="#fff" />
                    <Text style={styles.openBtnText}>Open the Google Form</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}

          <Text style={styles.footnote}>
            To wire a Google Form, edit{" "}
            <Text style={styles.mono}>backend/curriculum_data/survey_forms.json</Text>{" "}
            and add{" "}
            <Text style={styles.mono}>{`{ "module_id": "…", "form_url": "https://forms.gle/…" }`}</Text>{" "}
            to the <Text style={styles.mono}>surveys</Text> array. The module_id
            is the value shown on each card above.
          </Text>
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
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  helpCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#FFF3EE",
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  helpBody: { color: colors.text, fontSize: 12, lineHeight: 18, flex: 1 },
  counterRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "space-between" },
  counterText: { color: colors.text, fontSize: 12 },
  b: { fontWeight: "700", color: colors.brand },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: 4,
  },
  kindRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  kindPill: {
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
  },
  linkedPill: { backgroundColor: "#EAF1EB", color: colors.brandSecondary, borderColor: colors.brandSecondary + "40" },
  awaitingPill: { backgroundColor: colors.bg, color: colors.textSecondary, borderColor: colors.border },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 4 },
  surveyTitle: { color: colors.brand, fontSize: 13, fontStyle: "italic", marginTop: 2 },
  idLine: { color: colors.textSecondary, fontSize: 11, marginTop: 6 },
  mono: { fontFamily: "monospace", color: colors.text },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brand,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  openBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  footnote: {
    color: colors.textSecondary,
    fontSize: 11,
    fontStyle: "italic",
    lineHeight: 17,
    marginTop: 8,
  },
  error: { color: colors.danger, padding: spacing.lg },
});
