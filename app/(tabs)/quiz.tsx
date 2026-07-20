import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { api, unwrap } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

type Topic = {
  topic_id: string;
  title: string;
  description: string;
  source_count: number;
  institutions: string[];
  coming_soon?: boolean;
  teaser?: string;
};

export default function QuizHub() {
  const router = useRouter();
  const { usage, refreshUsage } = useAuth();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchTopics = useCallback(async () => {
    try {
      setError("");
      const { data } = await api.get<{ topics: Topic[] }>("/content/topics");
      setTopics(data.topics);
    } catch (e) {
      setError(unwrap(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTopics();
      refreshUsage();
    }, [fetchTopics, refreshUsage]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchTopics(), refreshUsage()]);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Pick a topic</Text>
          <Text style={styles.h1}>Interactive Quizzes</Text>
        </View>
        <TokenMeter />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.lead}>
          Each quiz is exactly 5 questions, generated from publicly available
          materials at MIT, Stanford, Caltech, CMU, UC Berkeley, ERIC, NSF, and
          data.gov — with full source citations.
        </Text>

        {usage?.blocked ? (
          <View style={styles.alert}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.brand} />
            <Text style={styles.alertText}>{usage.reason}</Text>
            <TouchableOpacity
              style={styles.alertBtn}
              onPress={() => router.push("/(tabs)/account")}
              testID="quiz-upgrade-btn"
            >
              <Text style={styles.alertBtnText}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          topics.map((t) => (
            <TouchableOpacity
              key={t.topic_id}
              style={[styles.card, t.coming_soon && { opacity: 0.55 }]}
              onPress={() => !t.coming_soon && router.push(`/quiz/${t.topic_id}`)}
              disabled={t.coming_soon}
              testID={`topic-${t.topic_id}-btn`}
            >
              <Text style={styles.cardTitle}>
                {t.coming_soon ? "🔒 " : ""}{t.title}
              </Text>
              <Text style={styles.cardDesc}>{t.description}</Text>
              <View style={styles.metaRow}>
                <Ionicons name={t.coming_soon ? "time-outline" : "library-outline"} size={14} color={colors.textSecondary} />
                <Text style={styles.meta}>
                  {t.coming_soon
                    ? `Soon to come${t.teaser ? ` (${t.teaser})` : " — quiz pool in development"}`
                    : `${t.source_count} question${t.source_count === 1 ? "" : "s"} · ${t.institutions.join(", ")}`}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 26, fontWeight: "700" },
  scroll: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  lead: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  cardDesc: { color: colors.textSecondary, fontSize: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  meta: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  error: { color: colors.danger, fontSize: 13 },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#FFF3EE",
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  alertText: { flex: 1, color: colors.text, fontSize: 13 },
  alertBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  alertBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
