import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, unwrap } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";
import { openExternal } from "@/src/lib/openExternal";

type Resource = {
  name: string;
  type: string;
  modality: string;
  provider: string;
  venue: string;
  license: string;
  commercial_use?: boolean | null;
  huggingface_id?: string;
  url?: string;
  language_pairs?: string[];
  offline?: string;
  notes?: string;
  verified_on?: string;
};

type STT = { covered_by_seamless_m4t_v2?: boolean; resources?: any[]; note?: string };

type Mod = {
  language: { name_en: string; autonym: string; iso_639_3?: string; flores_200_code?: string; regions?: string[]; resource_level?: string };
  default_pivot_languages?: string[];
  recommended_resources: Resource[];
  speech_to_text?: STT;
  integration_notes?: any;
  verification_policy?: string;
  verified_on?: string;
};

function commercialBadge(c?: boolean | null) {
  if (c === true) {
    return <Text style={[styles.badge, styles.badgeGreen]}>Commercial ✓</Text>;
  }
  if (c === false) {
    return <Text style={[styles.badge, styles.badgeAmber]}>Non-commercial</Text>;
  }
  return <Text style={[styles.badge, styles.badgeNeutral]}>Verify licence</Text>;
}

export default function TranslatorDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key: string }>();
  const key = (params.key as string) || "";
  const [m, setM] = useState<Mod | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Mod>(`/translator/${key}`).then((r) => setM(r.data)).catch((e) => setError(unwrap(e).message));
  }, [key]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} testID="translator-detail-back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Translator module</Text>
          <Text style={styles.h1} numberOfLines={2}>{m?.language?.name_en || "Loading…"}</Text>
          {m?.language?.autonym ? <Text style={styles.autonym}>{m.language.autonym}</Text> : null}
        </View>
      </View>

      {!m && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.metaRow}>
            {m!.language.iso_639_3 ? <Text style={styles.metaPill}>ISO {m!.language.iso_639_3}</Text> : null}
            {m!.language.flores_200_code ? <Text style={styles.metaPill}>FLORES {m!.language.flores_200_code}</Text> : null}
            {m!.language.resource_level ? <Text style={[styles.metaPill, styles.metaPillBrand]}>{m!.language.resource_level}</Text> : null}
          </View>

          {m!.default_pivot_languages && m!.default_pivot_languages.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="swap-horizontal-outline" size={16} color={colors.brand} />
                <Text style={styles.sectionLabel}>Pivot languages</Text>
              </View>
              <View style={styles.tagRow}>
                {m!.default_pivot_languages.map((p) => (
                  <Text key={p} style={styles.tag}>{p}</Text>
                ))}
              </View>
            </View>
          ) : null}

          <Text style={styles.sectionH}>{m!.recommended_resources.length} verified resources</Text>
          {m!.recommended_resources.map((r, i) => (
            <View key={i} style={styles.resCard}>
              <View style={styles.resHeader}>
                <Text style={styles.resName}>{r.name}</Text>
                {commercialBadge(r.commercial_use)}
              </View>
              <Text style={styles.resProvider}>{r.provider}</Text>
              <Text style={styles.resVenue}>{r.venue}</Text>
              <View style={styles.tagRow}>
                <Text style={styles.tag}>{r.modality}</Text>
                <Text style={styles.tag}>{r.type}</Text>
                <Text style={[styles.tag, styles.tagBrand]}>{r.license}</Text>
              </View>
              {r.notes ? <Text style={styles.resBody}>{r.notes}</Text> : null}
              {r.offline ? (
                <View style={styles.offlineRow}>
                  <Ionicons name="cloud-offline-outline" size={14} color={colors.brandSecondary} />
                  <Text style={styles.offlineText}>{r.offline}</Text>
                </View>
              ) : null}
              {r.url ? (
                <TouchableOpacity onPress={() => openExternal(r.url!)} style={styles.linkRow}>
                  <Ionicons name="open-outline" size={14} color={colors.brand} />
                  <Text style={styles.linkText} numberOfLines={1}>{r.url}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {m!.speech_to_text ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="mic-outline" size={16} color={colors.brand} />
                <Text style={styles.sectionLabel}>Speech-to-text</Text>
              </View>
              <Text style={styles.sectionBody}>
                {m!.speech_to_text.covered_by_seamless_m4t_v2
                  ? "✓ Covered by SeamlessM4T v2 (Meta, CC-BY-NC-4.0)."
                  : "✗ Not covered by SeamlessM4T v2 — use the dedicated resources or human transcription."}
              </Text>
              {m!.speech_to_text.note ? (
                <Text style={[styles.sectionBody, { fontStyle: "italic", marginTop: 4 }]}>{m!.speech_to_text.note}</Text>
              ) : null}
            </View>
          ) : null}

          {m!.verification_policy ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand} />
                <Text style={styles.sectionLabel}>Verification policy</Text>
              </View>
              <Text style={styles.sectionBody}>{m!.verification_policy}</Text>
              {m!.verified_on ? <Text style={styles.verified}>Verified on {m!.verified_on}</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700" },
  autonym: { color: colors.textSecondary, fontSize: 13, fontStyle: "italic", marginTop: 2 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  metaPill: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: "600", color: colors.textSecondary, overflow: "hidden" },
  metaPillBrand: { backgroundColor: "#FFF3EE", borderColor: colors.brand, color: colors.brand, textTransform: "uppercase" },
  sectionH: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 },
  section: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  sectionBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  resCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: 6 },
  resHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  resName: { color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 },
  resProvider: { color: colors.brandSecondary, fontSize: 12, fontWeight: "600" },
  resVenue: { color: colors.textSecondary, fontSize: 12, fontStyle: "italic" },
  resBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 2 },
  offlineRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 2 },
  offlineText: { color: colors.brandSecondary, fontSize: 12, flex: 1 },
  linkRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 4 },
  linkText: { color: colors.brand, fontSize: 12, flex: 1, textDecorationLine: "underline" },
  badge: { fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.8, overflow: "hidden" },
  badgeGreen: { backgroundColor: "#EAF1EB", color: colors.brandSecondary },
  badgeAmber: { backgroundColor: "#FCE9E2", color: colors.brand },
  badgeNeutral: { backgroundColor: colors.bg, color: colors.textSecondary, borderWidth: 1, borderColor: colors.border },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: "600", borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tagBrand: { backgroundColor: "#FFF3EE", borderColor: colors.brand, color: colors.brand },
  verified: { color: colors.textSecondary, fontSize: 11, fontStyle: "italic", marginTop: 4 },
  error: { color: colors.danger, padding: spacing.lg },
});
