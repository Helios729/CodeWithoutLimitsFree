import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, unwrap } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";
import { openExternal } from "@/src/lib/openExternal";

type Term = {
  term: string;
  short: string;
  definition: string;
  examples?: string[];
  source?: { title?: string; publisher?: string; url?: string };
};

type Resp = { title: string; description: string; verified_on?: string; terms: Term[] };

export default function Glossary() {
  const router = useRouter();
  const [d, setD] = useState<Resp | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get<Resp>("/glossary").then((r) => setD(r.data)).catch((e) => setError(unwrap(e).message));
  }, []);

  const filtered = d?.terms.filter((t) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      t.term.toLowerCase().includes(needle) ||
      t.short.toLowerCase().includes(needle) ||
      t.definition.toLowerCase().includes(needle)
    );
  }) || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} testID="glossary-back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Mini dictionary</Text>
          <Text style={styles.h1} numberOfLines={2}>Words to know</Text>
        </View>
      </View>

      {!d && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.tagline}>{d!.description}</Text>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search words or definitions…"
              placeholderTextColor={colors.textSecondary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              testID="glossary-search"
            />
          </View>

          <Text style={styles.countLine}>
            {filtered.length} {filtered.length === 1 ? "term" : "terms"}
            {q ? ` matching “${q}”` : " · each entry cites a reputable source"}
          </Text>

          {filtered.map((t) => {
            const open = !!expanded[t.term];
            return (
              <TouchableOpacity
                key={t.term}
                style={styles.card}
                onPress={() => setExpanded({ ...expanded, [t.term]: !open })}
                activeOpacity={0.7}
                testID={`glossary-term-${t.term}`}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTerm}>{t.term}</Text>
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
                </View>
                <Text style={styles.short}>{t.short}</Text>

                {open ? (
                  <View style={styles.body}>
                    <Text style={styles.def}>{t.definition}</Text>
                    {(t.examples || []).length > 0 ? (
                      <>
                        <Text style={styles.subH}>Examples</Text>
                        {t.examples!.map((ex, i) => (
                          <Text key={i} style={styles.example}>• {ex}</Text>
                        ))}
                      </>
                    ) : null}
                    {t.source ? (
                      <View style={styles.sourceRow}>
                        <Ionicons name="library-outline" size={13} color={colors.brandSecondary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sourceLabel}>Source</Text>
                          <Text style={styles.sourceTitle}>{t.source.title}</Text>
                          {t.source.publisher ? <Text style={styles.sourcePub}>{t.source.publisher}</Text> : null}
                          {t.source.url ? (
                            <TouchableOpacity onPress={() => openExternal(t.source!.url!)}>
                              <Text style={styles.sourceUrl} numberOfLines={1}>{t.source.url}</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  tagline: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  countLine: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 4 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: 6 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTerm: { color: colors.text, fontSize: 16, fontWeight: "700" },
  short: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  body: { gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  def: { color: colors.text, fontSize: 13, lineHeight: 20 },
  subH: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 4 },
  example: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  sourceRow: { flexDirection: "row", gap: 8, marginTop: 6, padding: 10, backgroundColor: "#EAF1EB", borderRadius: 8 },
  sourceLabel: { color: colors.brandSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  sourceTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  sourcePub: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  sourceUrl: { color: colors.brand, fontSize: 11, textDecorationLine: "underline", marginTop: 2 },
  error: { color: colors.danger, padding: spacing.lg },
});
