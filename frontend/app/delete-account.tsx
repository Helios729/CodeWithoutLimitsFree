/**
 * Public data-deletion page — Play Store & GDPR compliant.
 *
 * URL (works from any browser, no app install required):
 *   https://token-limit-enforcer.preview.emergentagent.com/delete-account
 *
 * Behaviour:
 *   • Anyone can land here.
 *   • If not signed in, we prompt them to sign in first (or use demo
 *     mode if that's why they're testing).
 *   • Once signed in, a 3-step guardrail (read → type "DELETE" →
 *     final tap) prevents accidental wipes.
 *   • Deletion runs synchronously against POST /api/account/delete
 *     and shows the server's own summary of what was removed.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing } from "@/src/theme";

type Info = {
  deleted_immediately: string[];
  retained_for_legal_reasons: string[];
  retention_period_days: number;
  contact_email: string;
  processing_time: string;
};

type Step = "review" | "confirm" | "final" | "done" | "error";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [info, setInfo] = useState<Info | null>(null);
  const [step, setStep] = useState<Step>("review");
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Record<string, number> | null>(null);

  // Fetch the transparency policy from the backend so wording never drifts.
  useEffect(() => {
    let cancelled = false;
    api
      .get<Info>("/account/delete/info")
      .then(({ data }) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        // Fallback so the page still renders even if the API is down
        if (!cancelled)
          setInfo({
            deleted_immediately: [
              "Your profile (name, email, avatar)",
              "All sign-in sessions",
              "Every survey / module feedback you submitted",
              "Quiz attempts and prompt-usage history",
              "Any personal Gemini API key you saved",
            ],
            retained_for_legal_reasons: [
              "Stripe payment records (7 years, per tax + PCI rules)",
              "Anonymized account row if other pooled members exist",
              "One-line audit entry (hashed, no personal info)",
            ],
            retention_period_days: 2555,
            contact_email: "support@communitychangers.us",
            processing_time: "Immediate.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitDelete() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{
        ok: boolean;
        summary: Record<string, number>;
      }>("/account/delete", {
        confirm: "DELETE",
        reason: reason.slice(0, 200),
        channel: Platform.OS === "web" ? "web" : "app",
      });
      setSummary(data.summary || {});
      setStep("done");
      // Locally clear auth token so the app immediately reflects the deletion.
      try {
        await signOut();
      } catch {}
    } catch (e: any) {
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Deletion failed. Please email support@communitychangers.us.",
      );
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  // -------------- render states --------------

  if (loading || !info) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  // Not signed in → tell them what to do (Play Store reviewers must be
  // able to complete deletion, so this branch matters).
  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Stack.Screen options={{ title: "Delete account", headerShown: false }} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.h1}>Delete your account</Text>
          <Text style={styles.p}>
            To permanently delete your Code Without Limits account and personal
            data, please sign in first so we can verify it&apos;s really you.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push("/welcome")}
            testID="delete-signin-btn"
          >
            <Text style={styles.primaryBtnText}>Sign in to continue</Text>
          </TouchableOpacity>
          <Text style={styles.footnote}>
            No longer have access to the account? Email{" "}
            <Text style={styles.link}>{info.contact_email}</Text> with your account
            email address and we&apos;ll process the deletion manually within 7
            days.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Success terminal state
  if (step === "done") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Stack.Screen options={{ title: "Deleted", headerShown: false }} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.doneCard}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            <Text style={styles.h1}>Your account has been deleted</Text>
            <Text style={styles.p}>
              Your personal data was removed from our systems. You&apos;ve been
              signed out automatically.
            </Text>
            {summary && Object.keys(summary).length > 0 && (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>Removed:</Text>
                {Object.entries(summary)
                  .filter(([, n]) => typeof n === "number" && n >= 0)
                  .map(([k, n]) => (
                    <Text key={k} style={styles.summaryRow}>
                      • {n} record{n === 1 ? "" : "s"} from{" "}
                      <Text style={styles.mono}>{k}</Text>
                    </Text>
                  ))}
              </View>
            )}
            <Text style={styles.footnote}>
              A copy of this confirmation was written to our audit log (no
              personal info) so we can prove your request was honoured. Payment
              records remain for {Math.round(info.retention_period_days / 365)}{" "}
              years as required by tax law.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace("/welcome")}
              testID="delete-return-home"
            >
              <Text style={styles.primaryBtnText}>Return to home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Stack.Screen options={{ title: "Something went wrong", headerShown: false }} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={48} color={colors.danger} />
            <Text style={styles.h1}>Deletion couldn&apos;t complete</Text>
            <Text style={styles.p}>{error}</Text>
            <Text style={styles.footnote}>
              Your account was NOT deleted. Please email{" "}
              <Text style={styles.link}>{info.contact_email}</Text> and we&apos;ll
              handle it manually.
            </Text>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setStep("review")}
            >
              <Text style={styles.secondaryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // -------------- main flow (review → confirm → final) --------------
  const stepNumber = step === "review" ? 1 : step === "confirm" ? 2 : 3;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ title: "Delete account", headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header with progress + back button */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (step === "review") router.back();
              else if (step === "confirm") setStep("review");
              else setStep("confirm");
            }}
            testID="delete-back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.stepPill}>Step {stepNumber} of 3</Text>
        </View>

        <Text style={styles.h1}>Delete your account</Text>
        <Text style={styles.signedInAs}>
          Signed in as <Text style={styles.mono}>{user.email}</Text>
        </Text>

        {/* STEP 1 — review the policy */}
        {step === "review" && (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={styles.cardTitle}>Deleted immediately</Text>
              </View>
              {info.deleted_immediately.map((line, i) => (
                <Text key={i} style={styles.bullet}>
                  • {line}
                </Text>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="archive-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.cardTitle}>Retained for legal reasons</Text>
              </View>
              {info.retained_for_legal_reasons.map((line, i) => (
                <Text key={i} style={styles.bullet}>
                  • {line}
                </Text>
              ))}
            </View>

            <View style={styles.warnBox}>
              <Ionicons name="warning-outline" size={20} color="#8B4A00" />
              <Text style={styles.warnText}>
                This action cannot be undone. Any active Day Pass or Monthly
                subscription must be cancelled separately from your Stripe
                billing portal — deleting the account does NOT stop future
                charges.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.dangerBtn}
              onPress={() => setStep("confirm")}
              testID="delete-continue-to-confirm"
            >
              <Text style={styles.dangerBtnText}>Continue to confirmation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.footnote}>
              Prefer email instead? Contact{" "}
              <Text style={styles.link}>{info.contact_email}</Text> — we&apos;ll
              handle it within 7 days.
            </Text>
          </>
        )}

        {/* STEP 2 — type DELETE */}
        {step === "confirm" && (
          <>
            <Text style={styles.p}>
              To confirm you really want to permanently delete your account,
              please type the word <Text style={styles.mono}>DELETE</Text> in the
              box below.
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Type DELETE"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              testID="delete-confirm-input"
            />
            <Text style={styles.optionalLabel}>Optional — tell us why</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="This helps us improve. Max 200 characters."
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, styles.inputMultiline]}
              multiline
              maxLength={200}
              testID="delete-reason-input"
            />
            <TouchableOpacity
              style={[
                styles.dangerBtn,
                confirmText.trim().toUpperCase() !== "DELETE" && styles.btnDisabled,
              ]}
              disabled={confirmText.trim().toUpperCase() !== "DELETE"}
              onPress={() => setStep("final")}
              testID="delete-to-final-btn"
            >
              <Text style={styles.dangerBtnText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setStep("review")}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </TouchableOpacity>
          </>
        )}

        {/* STEP 3 — final tap */}
        {step === "final" && (
          <>
            <View style={styles.finalCard}>
              <Ionicons name="alert-circle" size={40} color={colors.danger} />
              <Text style={styles.h2}>Last chance</Text>
              <Text style={styles.p}>
                Tapping the red button below will permanently delete your
                account and personal data. This cannot be reversed.
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.dangerBtn,
                pressed && styles.dangerBtnPressed,
                busy && styles.btnDisabled,
              ]}
              disabled={busy}
              onPress={submitDelete}
              testID="delete-final-btn"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.dangerBtnText}>Yes, permanently delete my account</Text>
              )}
            </Pressable>
            <TouchableOpacity
              style={styles.secondaryBtn}
              disabled={busy}
              onPress={() => setStep("confirm")}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  backBtn: { flexDirection: "row", alignItems: "center", padding: 6, gap: 2 },
  backText: { color: colors.text, fontSize: 15, fontWeight: "500" },
  stepPill: {
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    fontSize: 12,
    fontWeight: "600",
    overflow: "hidden",
  },
  h1: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: 4 },
  h2: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 4 },
  p: { fontSize: 15, lineHeight: 22, color: colors.text },
  signedInAs: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  bullet: { fontSize: 14, lineHeight: 21, color: colors.text },
  warnBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFF6E0",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#F5D583",
    alignItems: "flex-start",
  },
  warnText: { flex: 1, fontSize: 13, lineHeight: 19, color: "#5B3200" },
  dangerBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  dangerBtnPressed: { opacity: 0.85 },
  dangerBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { padding: 12, alignItems: "center" },
  secondaryBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: "top" },
  optionalLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  finalCard: {
    backgroundColor: "#FFECEC",
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#F5B0B0",
  },
  doneCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorCard: {
    backgroundColor: "#FFECEC",
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "#F5B0B0",
  },
  summaryBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "stretch",
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 4,
  },
  summaryRow: { fontSize: 13, color: colors.text, lineHeight: 20 },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    color: colors.text,
  },
  link: { color: colors.brand, textDecorationLine: "underline" },
  footnote: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
});
