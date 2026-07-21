import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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

import TokenMeter from "@/src/components/TokenMeter";
import { api, unwrap } from "@/src/lib/api";
import { openExternal } from "@/src/lib/openExternal";
import { colors, radius, spacing } from "@/src/theme";

type Sub = {
  id: string;
  title: string;
  objective: string;
  difficulty?: string;
  has_build_activity: boolean;
  has_framework: boolean;
};

type Mod = {
  module_id: string;
  title: string;
  persona: string;
  tagline: string;
  color: string;
  tabs?: string[];
  survey_form_url?: string | null;
  submodules: Sub[];
};

export default function ModuleDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ moduleId: string }>();
  const moduleId = (params.moduleId as string) || "";
  const [m, setM] = useState<Mod | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<string>("");

  useEffect(() => {
    api
      .get<Mod>(`/modules/${moduleId}`)
      .then((r) => {
        setM(r.data);
        if (r.data.tabs && r.data.tabs.length > 0) {
          setActiveTab(r.data.tabs[0]);
        }
      })
      .catch((e) => setError(unwrap(e).message));
  }, [moduleId]);

  const hasTabs = !!(m?.tabs && m.tabs.length > 0);
  const visibleSubs = hasTabs
    ? m!.submodules.filter((s) => (s.difficulty || "") === activeTab)
    : m?.submodules || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} testID="module-back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{m?.persona || "Module"}</Text>
          <Text style={styles.h1} numberOfLines={2}>{m?.title || "Loading…"}</Text>
        </View>
        <TokenMeter />
      </View>

      {!m && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.tagline}>{m!.tagline}</Text>
          <TouchableOpacity
            style={[styles.card, { borderColor: colors.brandSecondary, backgroundColor: "#EAF1EB", flexDirection: "row", alignItems: "center", gap: 12 }]}
            onPress={() => router.push(`/modules/${m!.module_id}/survey`)}
            testID="module-survey-btn"
          >
            <Ionicons name="chatbox-ellipses-outline" size={22} color={colors.brandSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.brandSecondary }]}>Share feedback on this module</Text>
              <Text style={styles.cardBody}>Helps us improve the next iteration. ~60 seconds.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.brandSecondary} />
          </TouchableOpacity>
          {hasTabs ? (
            <View style={styles.tabBar}>
              {m!.tabs!.map((t) => {
                const isActive = t === activeTab;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setActiveTab(t)}
                    style={[styles.tab, isActive && styles.tabActive]}
                    testID={`module-tab-${t.toLowerCase()}`}
                  >
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {visibleSubs.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.card}
              onPress={() => router.push(`/modules/${m!.module_id}/${s.id}`)}
              testID={`submodule-${s.id}`}
            >
              <View style={styles.cardHeader}>
                <View style={styles.numBadge}><Text style={styles.numText}>{s.id}</Text></View>
                <Text style={styles.cardTitle}>{s.title}</Text>
              </View>
              <Text style={styles.cardBody}>{s.objective}</Text>
              <View style={styles.tagRow}>
                {s.has_framework ? <Text style={styles.tag}>Prompt template</Text> : null}
                {s.has_build_activity ? <Text style={[styles.tag, styles.tagBuild]}>Build lab</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
          {m!.survey_form_url ? (
            <TouchableOpacity
              style={styles.surveyCard}
              onPress={() => openExternal(m!.survey_form_url!)}
              testID="module-survey-form-btn"
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

          <TouchableOpacity
            style={styles.readingCard}
            onPress={() => router.push("/resources")}
            testID="module-resources-link"
          >
            <Ionicons name="library-outline" size={18} color="#8B6F47" />
            <View style={{ flex: 1 }}>
              <Text style={styles.readingTitle}>Reading List & Free Courses</Text>
              <Text style={styles.readingBody}>
                Curated free textbooks, open-courseware, and language-specific
                tutorials — more added as Community Changers vets new sources.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8B6F47" />
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  tagline: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  numBadge: {
    backgroundColor: colors.brand, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  numText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 },
  cardBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  tag: {
    backgroundColor: colors.bg, color: colors.text,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    fontSize: 11, fontWeight: "600", borderWidth: 1, borderColor: colors.border,
    overflow: "hidden",
  },
  tagBuild: { backgroundColor: "#FCE9E2", borderColor: colors.brand, color: colors.brand },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radius.pill,
  },
  tabActive: { backgroundColor: colors.brand },
  tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fff", fontWeight: "700" },
  readingCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#F5EBE0",
    borderColor: "#AB8674",
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    marginTop: 8,
  },
  readingTitle: { color: "#8B6F47", fontSize: 14, fontWeight: "700" },
  readingBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  surveyCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#EAF1EB",
    borderColor: colors.brandSecondary,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    marginTop: 8,
  },
  surveyTitle: { color: colors.brandSecondary, fontSize: 14, fontWeight: "700" },
  surveyBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  error: { color: colors.danger, padding: spacing.lg },
});
