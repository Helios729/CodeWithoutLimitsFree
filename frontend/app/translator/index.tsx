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

type Mod = {
  key: string;
  language: string;
  autonym?: string | null;
  iso_639_3?: string | null;
  resource_level?: string | null;
  regions?: string[];
  resource_count: number;
  speech_to_text_supported: boolean;
};

type Resp = {
  title: string;
  description: string;
  verified_on: string;
  monetisation_note: string;
  licensing_guidance: { commercial_safe?: string[]; non_commercial_only?: string[]; verify_before_commercial?: string[]; note?: string };
  speech_to_text_summary: { seamless_m4t_v2_covers?: string[]; seamless_m4t_v2_does_not_cover?: string[]; note?: string };
  offline_guidance: string;
  primary_venues_referenced: string[];
  modules: Mod[];
};

function levelBadge(level?: string | null) {
  if (!level) return null;
  const map: Record<string, { bg: string; fg: string }> = {
    high: { bg: "#EAF1EB", fg: colors.brandSecondary },
    "low-medium": { bg: "#FFF3EE", fg: colors.brand },
    low: { bg: "#FCE9E2", fg: colors.brand },
    "very-low": { bg: "#F8D6CB", fg: "#A03914" },
  };
  const c = map[level] || { bg: colors.surface, fg: colors.text };
  return (
    <Text style={[styles.levelBadge, { backgroundColor: c.bg, color: c.fg, borderColor: c.fg + "40" }]}>
      {level}
    </Text>
  );
}

export default function TranslatorIndex() {
  const router = useRouter();
  const [d, setD] = useState<Resp | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Resp>("/translator").then((r) => setD(r.data)).catch((e) => setError(unwrap(e).message));
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} testID="translator-back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Open-source translators</Text>
          <Text style={styles.h1} numberOfLines={2}>Translations</Text>
        </View>
      </View>

      {!d && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {d!.description ? <Text style={styles.tagline}>{d!.description}</Text> : null}

          <View style={styles.gapCard}>
            <View style={styles.gapHeader}>
              <Ionicons name="trending-up-outline" size={16} color={colors.brand} />
              <Text style={styles.gapLabel}>The gap is the opportunity</Text>
            </View>
            <Text style={styles.gapBody}>{d!.monetisation_note}</Text>
          </View>

          <Text style={styles.sectionH}>{d!.modules.length} language modules</Text>
          {d!.modules.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={styles.card}
              onPress={() => router.push(`/translator/${m.key}`)}
              testID={`translator-${m.key}`}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{m.language}</Text>
                  {m.autonym ? <Text style={styles.autonym}>{m.autonym}</Text> : null}
                </View>
                {levelBadge(m.resource_level)}
              </View>
              <View style={styles.tagRow}>
                <Text style={styles.tag}>{m.resource_count} resources</Text>
                <Text style={[styles.tag, m.speech_to_text_supported ? styles.tagGreen : styles.tagRose]}>
                  {m.speech_to_text_supported ? "speech ✓" : "speech: manual"}
                </Text>
                {(m.regions || []).slice(0, 2).map((r) => (
                  <Text key={r} style={styles.tag}>{r}</Text>
                ))}
              </View>
            </TouchableOpacity>
          ))}

          <View style={styles.licCard}>
            <Text style={styles.licH}>Licensing at a glance</Text>
            {(d!.licensing_guidance.commercial_safe || []).length > 0 ? (
              <>
                <Text style={styles.licSub}>Commercial-safe:</Text>
                {d!.licensing_guidance.commercial_safe!.map((x, i) => (
                  <Text key={i} style={styles.licBody}>• {x}</Text>
                ))}
              </>
            ) : null}
            {(d!.licensing_guidance.non_commercial_only || []).length > 0 ? (
              <>
                <Text style={styles.licSub}>Non-commercial only:</Text>
                {d!.licensing_guidance.non_commercial_only!.map((x, i) => (
                  <Text key={i} style={styles.licBody}>• {x}</Text>
                ))}
              </>
            ) : null}
            {d!.licensing_guidance.note ? (
              <Text style={[styles.licBody, { marginTop: 6, fontStyle: "italic" }]}>
                {d!.licensing_guidance.note}
              </Text>
            ) : null}
          </View>

          <Text style={styles.verified}>Verified on {d!.verified_on}</Text>
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
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  tagline: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  gapCard: { backgroundColor: "#FFF3EE", borderColor: colors.brand, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: 6 },
  gapHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  gapLabel: { color: colors.brand, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  gapBody: { color: colors.text, fontSize: 13, lineHeight: 20 },
  sectionH: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  autonym: { color: colors.textSecondary, fontSize: 12, fontStyle: "italic", marginTop: 2 },
  levelBadge: { fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.8, overflow: "hidden", borderWidth: 1 },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: "600", borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tagGreen: { backgroundColor: "#EAF1EB", borderColor: colors.brandSecondary, color: colors.brandSecondary },
  tagRose: { backgroundColor: "#FCE9E2", borderColor: colors.brand, color: colors.brand },
  licCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: 4, marginTop: 8 },
  licH: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  licSub: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 6 },
  licBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  verified: { color: colors.textSecondary, fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 8 },
  error: { color: colors.danger, padding: spacing.lg },
});
