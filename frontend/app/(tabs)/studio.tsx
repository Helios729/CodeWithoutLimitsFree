import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TokenMeter from "@/src/components/TokenMeter";
import ByokPanel from "@/src/components/ByokPanel";
import { useAuth } from "@/src/context/AuthContext";
import { api, unwrap } from "@/src/lib/api";
import { getByokKey } from "@/src/lib/byok";
import { colors, radius, spacing } from "@/src/theme";

type Agent = { name: string; system: string };

export default function Studio() {
  const { refreshUsage, usage } = useAuth();
  const params = useLocalSearchParams<{ template?: string }>();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState("OER AI Tutor Agent");
  const [message, setMessage] = useState(
    "Explain what 'tokens' mean in a large language model in 3 short bullet points.",
  );

  // If a learner taps "Try this template in Studio" on a sub-module, the
  // framework's template arrives here as a query param. Prefill once.
  useEffect(() => {
    if (params.template && typeof params.template === "string") {
      setMessage(params.template);
    }
  }, [params.template]);
  const [reply, setReply] = useState("");
  const [tokens, setTokens] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get<{ agents: Agent[] }>("/agents")
      .then((r) => setAgents(r.data.agents))
      .catch(() => {});
  }, []);

  const [byokKey, setByok] = useState("");
  const isFree = usage?.tier === "free";

  useEffect(() => {
    getByokKey().then(setByok);
  }, []);

  async function send() {
    setError("");
    setReply("");
    setTokens(null);
    setLoading(true);
    try {
      const payload: any = { message, agent };
      // Free tier: include BYOK key if we have one (avoids the 402 round-trip).
      if (isFree && byokKey) payload.byok_key = byokKey;
      const { data } = await api.post<{ reply: string; tokens_charged: number }>(
        "/ai/chat",
        payload,
      );
      setReply(data.reply);
      setTokens(data.tokens_charged);
      await refreshUsage();
    } catch (e) {
      const u = unwrap(e);
      if (u.status === 402) setError(u.message || "Paste your Gemini key below to run on the free tier.");
      else if (u.status === 429) setError(u.message);
      else setError(u.message || "AI call failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>AI Studio</Text>
          <Text style={styles.h1}>Run a low-token prompt</Text>
        </View>
        <TokenMeter />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Agent</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {agents.map((a) => {
              const active = a.name === agent;
              return (
                <TouchableOpacity
                  key={a.name}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setAgent(a.name)}
                  testID={`agent-chip-${a.name.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {a.name.replace(/ Agent$/, "")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Prompt</Text>
          <TextInput
            multiline
            value={message}
            onChangeText={setMessage}
            style={styles.input}
            placeholder="Describe what you want to build…"
            placeholderTextColor={colors.textSecondary}
            testID="prompt-input"
          />

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              (loading || usage?.blocked) && styles.disabled,
            ]}
            onPress={send}
            disabled={loading || !!usage?.blocked}
            testID="submit-prompt-button"
          >
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {loading ? "Thinking…" : "Run with Gemini"}
            </Text>
          </TouchableOpacity>

          {/* BYOK is now optional — power users who want unlimited Flash on
              their own key can paste it. Hidden by default. */}
          {isFree ? <ByokPanel onKeyChange={setByok} /> : null}

          {usage?.blocked ? (
            <Text style={styles.note} testID="studio-quota-note">
              {usage.reason}
            </Text>
          ) : null}

          {error ? (
            <Text style={styles.error} testID="studio-error">
              {error}
            </Text>
          ) : null}

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 16 }} />
          ) : null}

          {reply ? (
            <View style={styles.replyCard} testID="ai-reply">
              <Text style={styles.replyMeta}>
                {agent} · {tokens ?? 0} tokens
              </Text>
              <Text style={styles.replyText}>{reply}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
  h1: { color: colors.text, fontSize: 24, fontWeight: "700" },
  scroll: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  label: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: spacing.sm },
  chipRow: { gap: spacing.sm, paddingVertical: 4, paddingRight: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  input: {
    minHeight: 110,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: "top",
  },
  primaryBtn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  note: { color: colors.textSecondary, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  replyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  replyMeta: {
    color: colors.brand,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  replyText: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
