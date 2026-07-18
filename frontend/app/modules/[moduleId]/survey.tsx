import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, unwrap } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

// 5-point Likert + 3 short-answer fields, stored in MongoDB.
// Replaces the Google-Forms-per-module idea — no third-party account needed,
// works on low bandwidth, and we own the data.
const LIKERT = ["1", "2", "3", "4", "5"];

export default function ModuleSurvey() {
  const router = useRouter();
  const params = useLocalSearchParams<{ moduleId: string }>();
  const moduleId = (params.moduleId as string) || "";
  const [title, setTitle] = useState("");
  const [clarity, setClarity] = useState(0);
  const [pace, setPace] = useState(0);
  const [relevance, setRelevance] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [worked, setWorked] = useState("");
  const [didNot, setDidNot] = useState("");
  const [change, setChange] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/modules/${moduleId}`).then(r => setTitle(r.data.title || moduleId)).catch(() => {});
  }, [moduleId]);

  async function submit() {
    if (!clarity || !pace || !relevance || !confidence) {
      setError("Please rate all four scales (1-5).");
      return;
    }
    setError(""); setBusy(true);
    try {
      await api.post("/surveys/submit", {
        module_id: moduleId, module_title: title,
        clarity, pace, relevance, confidence,
        worked_well: worked, did_not_work: didNot, would_change: change,
      });
      setDone(true);
    } catch (e) { setError(unwrap(e).message); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.thanks}>
          <Ionicons name="checkmark-circle" size={48} color={colors.brandSecondary} />
          <Text style={styles.h1}>Thank you</Text>
          <Text style={styles.body}>Your feedback shapes the next iteration of this module.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace(`/modules/${moduleId}`)}>
            <Text style={styles.btnText}>Back to module</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const scale = (val: number, set: (n: number) => void, label: string) => (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.likertRow}>
        {LIKERT.map((n, i) => (
          <TouchableOpacity
            key={n}
            style={[styles.likertBtn, val === i + 1 && styles.likertBtnActive]}
            onPress={() => set(i + 1)}
            testID={`likert-${label}-${i + 1}`}
          >
            <Text style={[styles.likertText, val === i + 1 && { color: "#fff" }]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Feedback · {title}</Text>
          <Text style={styles.h1}>How did this module work for you?</Text>
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {scale(clarity, setClarity, "Lessons were clear (1 = not at all, 5 = very clear)")}
          {scale(pace, setPace, "Pace was right (1 = too fast/slow, 5 = just right)")}
          {scale(relevance, setRelevance, "Content was relevant to my goals")}
          {scale(confidence, setConfidence, "I feel more confident after this module")}

          <Text style={styles.label}>What worked well?</Text>
          <TextInput multiline value={worked} onChangeText={setWorked} style={styles.input} placeholder="Optional" placeholderTextColor={colors.textSecondary} />

          <Text style={styles.label}>What didn't work?</Text>
          <TextInput multiline value={didNot} onChangeText={setDidNot} style={styles.input} placeholder="Optional" placeholderTextColor={colors.textSecondary} />

          <Text style={styles.label}>What would you change?</Text>
          <TextInput multiline value={change} onChangeText={setChange} style={styles.input} placeholder="Optional" placeholderTextColor={colors.textSecondary} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} testID="survey-submit-btn">
            <Text style={styles.btnText}>{busy ? "Sending…" : "Submit feedback"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  label: { color: colors.text, fontWeight: "600", fontSize: 14, marginTop: spacing.sm },
  likertRow: { flexDirection: "row", gap: 8 },
  likertBtn: { flex: 1, padding: 14, borderRadius: radius.input, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  likertBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  likertText: { color: colors.text, fontWeight: "700" },
  input: { backgroundColor: colors.surface, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, padding: 12, minHeight: 70, color: colors.text, textAlignVertical: "top" },
  btn: { backgroundColor: colors.brand, padding: 16, borderRadius: radius.pill, alignItems: "center", marginTop: spacing.md },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  thanks: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  body: { color: colors.textSecondary, textAlign: "center", fontSize: 15 },
  error: { color: colors.danger, fontSize: 13 },
});
