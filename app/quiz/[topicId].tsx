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

import { useAuth } from "@/src/context/AuthContext";
import { api, unwrap } from "@/src/lib/api";
import { getByokKey } from "@/src/lib/byok";
import { colors, radius, spacing } from "@/src/theme";
import { openExternal } from "@/src/lib/openExternal";

type Source = { url: string; institution: string; title?: string };
type Question = { question: string; options: string[]; source: Source | null };
type ResultDetail = {
  question: string;
  options: string[];
  correct_index: number;
  chosen_index: number;
  is_correct: boolean;
  explanation: string;
  source: Source | null;
};

export default function QuizRunner() {
  const router = useRouter();
  const params = useLocalSearchParams<{ topicId: string }>();
  const topicId = (params.topicId as string) || "";
  const { refreshUsage } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quizId, setQuizId] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [allSources, setAllSources] = useState<Source[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ResultDetail[] | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Free-tier learners need to send their own Gemini key with the request.
        const byok = await getByokKey();
        const payload: any = { topic_id: topicId };
        if (byok) payload.byok_key = byok;
        const { data } = await api.post("/quiz/generate", payload);
        if (cancelled) return;
        setQuizId(data.quiz_id);
        setTopicTitle(data.topic_title);
        setQuestions(data.questions);
        setAllSources(data.all_sources || []);
        setAnswers(new Array(data.questions.length).fill(-1));
        await refreshUsage();
      } catch (e) {
        const u = unwrap(e);
        if (u.status === 402) {
          setError(
            "Free tier: open the Studio tab, paste your Google Gemini key, then come back to start a quiz.",
          );
        } else {
          setError(u.message || "Could not load quiz.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId, refreshUsage]);

  function pick(qi: number, oi: number) {
    if (results) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[qi] = oi;
      return next;
    });
  }

  async function submit() {
    if (answers.some((a) => a < 0)) {
      setError("Answer every question first.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/quiz/submit", {
        quiz_id: quizId,
        answers,
      });
      setResults(data.results);
      setScore(data.score);
    } catch (e) {
      setError(unwrap(e).message || "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          testID="quiz-back-btn"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>5 questions</Text>
          <Text style={styles.h1} numberOfLines={1}>
            {topicTitle || "Loading…"}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.dim}>Generating quiz from premier sources…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
          <Text style={styles.error} testID="quiz-error">
            {error}
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Back to topics</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {results ? (
            <View style={styles.scoreCard} testID="quiz-score">
              <Text style={styles.scoreEyebrow}>Your score</Text>
              <Text style={styles.score}>
                {score} / {results.length}
              </Text>
              <Text style={styles.dim}>
                Sources from premier academic institutions are listed under each
                question.
              </Text>
            </View>
          ) : null}

          {(results
            ? results
            : questions.map((q, i) => ({
                question: q.question,
                options: q.options,
                correct_index: -1,
                chosen_index: answers[i],
                is_correct: false,
                explanation: "",
                source: q.source,
              }))
          ).map((q, qi) => (
            <View
              key={qi}
              style={styles.qCard}
              testID={`quiz-question-${qi}`}
            >
              <Text style={styles.qNum}>Question {qi + 1} of {questions.length || results?.length}</Text>
              <Text style={styles.qText}>{q.question}</Text>
              {q.options.map((opt, oi) => {
                const chosen = q.chosen_index === oi;
                let bg: string = colors.surface;
                let bd: string = colors.border;
                let tc: string = colors.text;
                if (results) {
                  if (oi === q.correct_index) {
                    bg = "#EAF1EB";
                    bd = colors.brandSecondary;
                    tc = colors.brandSecondary;
                  } else if (chosen && oi !== q.correct_index) {
                    bg = "#FBE7E1";
                    bd = colors.danger;
                    tc = colors.danger;
                  }
                } else if (chosen) {
                  bg = "#FCE9E2";
                  bd = colors.brand;
                  tc = colors.brand;
                }
                return (
                  <TouchableOpacity
                    key={oi}
                    style={[
                      styles.option,
                      { backgroundColor: bg, borderColor: bd },
                    ]}
                    onPress={() => pick(qi, oi)}
                    disabled={!!results}
                    testID={`quiz-${qi}-opt-${oi}`}
                  >
                    <Text style={[styles.optionText, { color: tc }]}>
                      {String.fromCharCode(65 + oi)}. {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {results && q.explanation ? (
                <Text style={styles.explanation}>{q.explanation}</Text>
              ) : null}
              {q.source ? (
                <TouchableOpacity
                  onPress={() => openExternal(q.source!.url)}
                  testID={`quiz-${qi}-source`}
                >
                  <Text style={styles.source}>
                    Source: {q.source.institution}
                    {q.source.title ? ` — ${q.source.title}` : ""}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {!results ? (
            <TouchableOpacity
              style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
              onPress={submit}
              disabled={submitting}
              testID="quiz-submit-btn"
            >
              <Text style={styles.primaryBtnText}>
                {submitting ? "Scoring…" : "Submit answers"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace("/(tabs)/quiz")}
              testID="quiz-back-to-topics-btn"
            >
              <Text style={styles.primaryBtnText}>Pick another topic</Text>
            </TouchableOpacity>
          )}

          {allSources.length ? (
            <View style={styles.refCard} testID="quiz-references">
              <Text style={styles.refTitle}>All sources for this quiz</Text>
              {allSources.map((s, i) => (
                <TouchableOpacity
                  key={`${s.url}-${i}`}
                  onPress={() => openExternal(s.url)}
                >
                  <Text style={styles.refRow}>• {s.institution} — {s.url}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  backBtn: { padding: 4 },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  qCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  qNum: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  qText: { color: colors.text, fontSize: 16, fontWeight: "600", lineHeight: 22 },
  option: {
    borderWidth: 1.5,
    borderRadius: radius.input,
    padding: 14,
  },
  optionText: { fontSize: 15, fontWeight: "500" },
  explanation: { color: colors.textSecondary, fontSize: 13, fontStyle: "italic", marginTop: 4 },
  source: {
    color: colors.textSecondary,
    fontSize: 11,
    backgroundColor: colors.bg,
    padding: 8,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    padding: 16,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  scoreCard: {
    backgroundColor: colors.brandSecondary,
    padding: spacing.lg,
    borderRadius: radius.card,
    alignItems: "center",
    gap: 6,
  },
  scoreEyebrow: {
    color: "#E2EBE3",
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  score: { color: "#fff", fontSize: 44, fontWeight: "800" },
  dim: { color: "#E2EBE3", fontSize: 13, textAlign: "center" },
  error: { color: colors.danger, fontSize: 14, textAlign: "center" },
  refCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  refTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  refRow: { color: colors.textSecondary, fontSize: 12 },
});
