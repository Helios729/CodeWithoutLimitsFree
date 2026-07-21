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

type Citation = { label?: string; url?: string; title?: string };

type IncomeModule = {
  id: number;
  title: string;
  role_label: string;
  asset: string;
  execution: string;
  energy_maximisation: string;
  why_it_monetises: string;
  ai_basics_learned: string[];
  community_multiplier: string;
  ethical_rule: string | null;
  safety_rule: string | null;
  languages: string[];
  citations: Citation[];
  notes: string[];
  survey_form_url?: string | null;
};

function Section({ icon, label, body }: { icon: any; label: string; body: string }) {
  if (!body) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={colors.brand} />
        <Text style={styles.sectionLabel}>{label}</Text>
      </View>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

export default function IncomeDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = (params.id as string) || "";
  const [m, setM] = useState<IncomeModule | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<IncomeModule>(`/income/modules/${id}`)
      .then((r) => setM(r.data))
      .catch((e) => setError(unwrap(e).message));
  }, [id]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ padding: 4 }}
          testID="income-detail-back-btn"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Income module {id}</Text>
          <Text style={styles.h1} numberOfLines={2}>
            {m?.title || "Loading…"}
          </Text>
        </View>
      </View>

      {!m && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.role}>{m!.role_label}</Text>

          <View style={styles.assetCard}>
            <Text style={styles.assetLabel}>The Asset You Build</Text>
            <Text style={styles.assetBody}>{m!.asset}</Text>
          </View>

          <Section icon="construct-outline" label="Execution" body={m!.execution} />
          <Section
            icon="flash-outline"
            label="Energy maximisation"
            body={m!.energy_maximisation}
          />
          <Section
            icon="cash-outline"
            label="Why it monetises"
            body={m!.why_it_monetises}
          />
          <Section
            icon="people-outline"
            label="Community multiplier"
            body={m!.community_multiplier}
          />
          {m!.ethical_rule ? (
            <Section icon="shield-checkmark-outline" label="Ethical rule" body={m!.ethical_rule} />
          ) : null}
          {m!.safety_rule ? (
            <Section icon="alert-circle-outline" label="Safety rule" body={m!.safety_rule} />
          ) : null}

          {(m!.ai_basics_learned || []).length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="sparkles-outline" size={16} color={colors.brand} />
                <Text style={styles.sectionLabel}>AI basics you&apos;ll learn</Text>
              </View>
              <View style={styles.tagRow}>
                {m!.ai_basics_learned.map((t, i) => (
                  <Text key={i} style={[styles.tag, styles.tagBuild]}>
                    {t}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          {(m!.languages || []).length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="language-outline" size={16} color={colors.brand} />
                <Text style={styles.sectionLabel}>Languages</Text>
              </View>
              <View style={styles.tagRow}>
                {m!.languages.map((l, i) => (
                  <Text key={i} style={styles.tag}>
                    {l}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          {(m!.citations || []).length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="library-outline" size={16} color={colors.brand} />
                <Text style={styles.sectionLabel}>Citations</Text>
              </View>
              {m!.citations.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => (c.url ? openExternal(c.url) : null)}
                  disabled={!c.url}
                  style={styles.citationRow}
                >
                  <Text style={styles.citationLabel}>
                    {c.label || c.title || c.url}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {(m!.notes || []).length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="document-text-outline" size={16} color={colors.brand} />
                <Text style={styles.sectionLabel}>Notes</Text>
              </View>
              {m!.notes.map((n, i) => (
                <Text key={i} style={styles.sectionBody}>
                  • {n}
                </Text>
              ))}
            </View>
          ) : null}

          {m!.survey_form_url ? (
            <TouchableOpacity
              style={styles.surveyCard}
              onPress={() => openExternal(m!.survey_form_url!)}
              testID="income-survey-form-btn"
            >
              <Ionicons name="clipboard-outline" size={18} color={colors.brandSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.surveyTitle}>Share your feedback (Google Form)</Text>
                <Text style={styles.surveyBody}>
                  Tell Community Changers what worked and what didn&apos;t. 5 minutes.
                </Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.brandSecondary} />
            </TouchableOpacity>
          ) : null}
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
  role: {
    color: colors.brandSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  assetCard: {
    backgroundColor: "#EAF1EB",
    borderColor: colors.brandSecondary,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: 6,
  },
  assetLabel: {
    color: colors.brandSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  assetBody: { color: colors.text, fontSize: 14, lineHeight: 21 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: {
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tagBuild: {
    backgroundColor: "#FCE9E2",
    borderColor: colors.brand,
    color: colors.brand,
  },
  citationRow: { paddingVertical: 4 },
  citationLabel: { color: colors.brand, fontSize: 13, textDecorationLine: "underline" },
  surveyCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#EAF1EB",
    borderColor: colors.brandSecondary,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  surveyTitle: { color: colors.brandSecondary, fontSize: 14, fontWeight: "700" },
  surveyBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  error: { color: colors.danger, padding: spacing.lg },
});
