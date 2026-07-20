import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TokenMeter from "@/src/components/TokenMeter";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

const sprints = [
  { window: "06:00–06:15", title: "Wake & charge", task: "Solar/off-peak charge, draft today's learning intent on the locked screen." },
  { window: "12:00–12:15", title: "Capture", task: "Offline note + voice capture of one local-knowledge prompt." },
  { window: "16:00–16:15", title: "AI sprint", task: "Run your reusable prompt; refine an asset draft with low-token edits." },
  { window: "20:00–20:15", title: "Verify & share", task: "Human review checklist, then async sync when bandwidth allows." },
];

type ModSummary = {
  module_id: string;
  title: string;
  persona: string;
  tagline: string;
  submodule_count: number;
};

export default function Home() {
  const { user, usage, refreshUsage } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [modules, setModules] = useState<ModSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      refreshUsage();
    }, [refreshUsage]),
  );

  useEffect(() => {
    api.get<{ modules: ModSummary[] }>("/modules").then((r) => setModules(r.data.modules)).catch(() => {});
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshUsage();
    setRefreshing(false);
  };

  const firstName = (user?.name || user?.email || "").split(/[\s@]/)[0];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Welcome back</Text>
          <Text style={styles.hello} testID="home-hello">
            {firstName ? `Hi, ${firstName}` : "Hello"}
          </Text>
        </View>
        <TokenMeter />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.pilotBanner} testID="home-pilot-banner">
          <Ionicons name="construct-outline" size={18} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pilotTitle}>This is a pilot app.</Text>
            <Text style={styles.pilotBody}>
              Like the communities it serves, Community Changers conducts
              continuous self-checks — surveys, user feedback, and internal
              review — to catch broken links, omissions, and errors. Your
              feedback is welcome at every turn. Use the survey at the end
              of any module, or tap any item that looks off.
            </Text>
          </View>
        </View>

        {usage?.blocked ? (
          <View style={styles.alert} testID="quota-alert">
            <Ionicons name="warning-outline" size={20} color={colors.brand} />
            <Text style={styles.alertText}>{usage.reason}</Text>
            <TouchableOpacity style={styles.alertBtn} onPress={() => router.push("/(tabs)/account")} testID="alert-upgrade-btn">
              <Text style={styles.alertBtnText}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        ) : usage?.tier === "free" ? (
          <View style={styles.alert} testID="byok-banner">
            <Ionicons name="gift-outline" size={20} color={colors.brandSecondary} />
            <Text style={styles.alertText}>
              You have {Math.max(0, (usage.daily_prompts_cap || 5) - (usage.daily_prompts_used || 0))} of {usage.daily_prompts_cap || 5} free AI calls left today. (Each Studio prompt or quiz generation uses one. Quizzes will stop counting once your authored question bank is wired in.)
            </Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.cta} onPress={() => router.push("/(tabs)/quiz")} testID="home-start-quiz-btn">
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaEyebrow}>Quick 5-minute sprint</Text>
            <Text style={styles.ctaTitle}>Try a 5-question quiz</Text>
            <Text style={styles.ctaSub}>Sourced from MIT, Stanford, Caltech, CMU, Berkeley.</Text>
          </View>
          <Ionicons name="arrow-forward" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.tileRow}>
          <TouchableOpacity
            style={[styles.tile, styles.tileGreen]}
            onPress={() => router.push("/income")}
            testID="home-income-tile"
          >
            <Ionicons name="cash-outline" size={22} color={colors.brandSecondary} />
            <Text style={styles.tileTitle}>Income & Asset Bank</Text>
            <Text style={styles.tileSub}>17 monetisable digital-asset modules</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tile, styles.tileCream]}
            onPress={() => router.push("/programme")}
            testID="home-programme-tile"
          >
            <Ionicons name="book-outline" size={22} color={colors.brand} />
            <Text style={styles.tileTitle}>About this programme</Text>
            <Text style={styles.tileSub}>Curriculum · workflow · references</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tileRow}>
          <TouchableOpacity
            style={[styles.tile, styles.tileBlue]}
            onPress={() => router.push("/translator")}
            testID="home-translator-tile"
          >
            <Ionicons name="language-outline" size={22} color="#4A5D6E" />
            <Text style={styles.tileTitle}>Translations</Text>
            <Text style={styles.tileSub}>8 open-source language modules</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tile, styles.tileWarm]}
            onPress={() => router.push("/glossary")}
            testID="home-glossary-tile"
          >
            <Ionicons name="book" size={22} color="#8B6F47" />
            <Text style={styles.tileTitle}>Mini dictionary</Text>
            <Text style={styles.tileSub}>Words to know · cited sources</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.resourcesRow}
          onPress={() => router.push("/resources")}
          testID="home-resources-tile"
        >
          <Ionicons name="library-outline" size={22} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>Reading list & free courses</Text>
            <Text style={styles.tileSub}>
              5 free textbooks · CMU OLI · MIT OCW · Harvard edX · Python · Java · HTML · more to come
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.brand} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resourcesRow, { backgroundColor: "#EAF1EB", borderColor: colors.brandSecondary }]}
          onPress={() => router.push("/forms")}
          testID="home-forms-tile"
        >
          <Ionicons name="clipboard-outline" size={22} color={colors.brandSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>Survey forms registry</Text>
            <Text style={styles.tileSub}>
              All 39 survey titles + module ids — for mapping Google Forms
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.brandSecondary} />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Learning modules</Text>
        <Text style={styles.sectionSub}>
          Four modules · {modules.reduce((a, m) => a + m.submodule_count, 0)} sub-modules total,
          including prompt-engineering frameworks and a built-in coding lab.
        </Text>
        {modules.map((m) => (
          <TouchableOpacity
            key={m.module_id}
            style={styles.moduleCard}
            onPress={() => router.push(`/modules/${m.module_id}`)}
            testID={`module-${m.module_id}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.modulePersona}>{m.persona}</Text>
              <Text style={styles.moduleTitle}>{m.title}</Text>
              <Text style={styles.moduleTagline}>{m.tagline}</Text>
              <Text style={styles.moduleMeta}>{m.submodule_count} sub-modules</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>Your daily rail</Text>
        <View style={styles.rail}>
          {sprints.map((s, i) => (
            <View key={s.window} style={styles.railRow}>
              <View style={styles.railNode}><Text style={styles.railNodeText}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.railTime}>{s.window}</Text>
                <Text style={styles.railTitle}>{s.title}</Text>
                <Text style={styles.railTask}>{s.task}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.bg },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  hello: { color: colors.text, fontSize: 24, fontWeight: "700" },
  scroll: { padding: spacing.lg, paddingTop: 0, gap: spacing.lg },
  pilotBanner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#FFF3EE",
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  pilotTitle: { color: colors.brand, fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  pilotBody: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 4 },
  alert: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "#FFF3EE", borderColor: colors.brand, borderWidth: 1, borderRadius: radius.card, padding: spacing.md },
  alertText: { flex: 1, color: colors.text, fontSize: 13 },
  alertBtn: { backgroundColor: colors.brand, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  alertBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  cta: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brand, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md },
  ctaEyebrow: { color: "#FFEFE8", fontSize: 11, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  ctaTitle: { color: "#fff", fontSize: 22, fontWeight: "700", marginTop: 4 },
  ctaSub: { color: "#FFE6DC", fontSize: 13, marginTop: 6 },
  tileRow: { flexDirection: "row", gap: spacing.md },
  tile: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.md,
    gap: 6,
    minHeight: 110,
  },
  tileGreen: { backgroundColor: "#EAF1EB", borderColor: colors.brandSecondary },
  tileCream: { backgroundColor: "#FFF3EE", borderColor: colors.brand },
  tileBlue: { backgroundColor: "#E8EEF2", borderColor: "#7D8B93" },
  tileWarm: { backgroundColor: "#F5EBE0", borderColor: "#AB8674" },
  resourcesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF3EE",
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  tileTitle: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 4 },
  tileSub: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginTop: spacing.md },
  sectionSub: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: -8 },
  moduleCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  modulePersona: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  moduleTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 2 },
  moduleTagline: { color: colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 19 },
  moduleMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 6, fontWeight: "600" },
  rail: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  railRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  railNode: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  railNodeText: { color: "#fff", fontWeight: "700" },
  railTime: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  railTitle: { color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 2 },
  railTask: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
});
