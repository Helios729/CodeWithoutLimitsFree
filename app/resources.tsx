import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
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

type Book = { title: string; author?: string; url: string; topic?: string; note?: string };
type CourseItem = { name: string; url: string; note?: string };
type CourseGroup = { group: string; items: CourseItem[] };

type Resp = {
  title: string;
  description: string;
  verified_on?: string;
  reading_list: { title: string; subtitle?: string; items: Book[] };
  open_online_courses: { title: string; subtitle?: string; groups: CourseGroup[] };
  footnote?: string;
};

export default function Resources() {
  const router = useRouter();
  const [d, setD] = useState<Resp | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Resp>("/resources")
      .then((r) => setD(r.data))
      .catch((e) => setError(unwrap(e).message));
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} testID="resources-back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Reading list & free courses</Text>
          <Text style={styles.h1} numberOfLines={2}>
            Knowledge first
          </Text>
        </View>
      </View>

      {!d && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {d!.description ? <Text style={styles.tagline}>{d!.description}</Text> : null}

          {/* READING LIST */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="book-outline" size={18} color={colors.brand} />
              <Text style={styles.sectionTitle}>{d!.reading_list.title}</Text>
            </View>
            {d!.reading_list.subtitle ? (
              <Text style={styles.sectionSub}>{d!.reading_list.subtitle}</Text>
            ) : null}
            {d!.reading_list.items.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={styles.card}
                onPress={() => openExternal(b.url)}
                testID={`reading-${i}`}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>{b.title}</Text>
                  <Ionicons name="open-outline" size={16} color={colors.brand} />
                </View>
                {b.author ? <Text style={styles.cardAuthor}>{b.author}</Text> : null}
                {b.topic ? <Text style={styles.cardTopic}>{b.topic}</Text> : null}
                {b.note ? <Text style={styles.cardNote}>{b.note}</Text> : null}
                <Text style={styles.cardUrl} numberOfLines={1}>
                  {b.url}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* OPEN ONLINE COURSES */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="school-outline" size={18} color={colors.brandSecondary} />
              <Text style={[styles.sectionTitle, { color: colors.brandSecondary }]}>
                {d!.open_online_courses.title}
              </Text>
            </View>
            {d!.open_online_courses.subtitle ? (
              <Text style={styles.sectionSub}>{d!.open_online_courses.subtitle}</Text>
            ) : null}
            {d!.open_online_courses.groups.map((g, gi) => (
              <View key={gi} style={styles.group}>
                <Text style={styles.groupLabel}>{g.group}</Text>
                {g.items.map((it, ii) => (
                  <TouchableOpacity
                    key={ii}
                    style={[styles.card, styles.courseCard]}
                    onPress={() => openExternal(it.url)}
                    testID={`course-${gi}-${ii}`}
                  >
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{it.name}</Text>
                      <Ionicons name="open-outline" size={16} color={colors.brandSecondary} />
                    </View>
                    {it.note ? <Text style={styles.cardNote}>{it.note}</Text> : null}
                    <Text style={[styles.cardUrl, { color: colors.brandSecondary }]} numberOfLines={1}>
                      {it.url}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          {d!.footnote ? <Text style={styles.footnote}>{d!.footnote}</Text> : null}
          {d!.verified_on ? <Text style={styles.verified}>Links verified on {d!.verified_on}</Text> : null}
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
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
  tagline: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: colors.brand, fontSize: 18, fontWeight: "700" },
  sectionSub: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: 4,
  },
  courseCard: { borderColor: "#EAF1EB", backgroundColor: "#F4F8F4" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  cardAuthor: { color: colors.textSecondary, fontSize: 12, fontStyle: "italic" },
  cardTopic: {
    color: colors.brandSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 2,
  },
  cardNote: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 2 },
  cardUrl: { color: colors.brand, fontSize: 11, textDecorationLine: "underline", marginTop: 2 },
  group: { gap: 6 },
  groupLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 2,
  },
  footnote: { color: colors.textSecondary, fontSize: 11, fontStyle: "italic", lineHeight: 17 },
  verified: { color: colors.textSecondary, fontSize: 11, textAlign: "center", marginTop: 4 },
  error: { color: colors.danger, padding: spacing.lg },
});
