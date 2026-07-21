import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, unwrap } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing } from "@/src/theme";

// Public-ish landing for an invite link. Steps:
// 1. Anyone (signed in or not) sees who invited them.
// 2. If not signed in, button routes them to /welcome first; we preserve
//    the token in storage so they come back here after sign-in.
// 3. Signed-in user taps Accept → server moves their account_id to the
//    owner's account; we route to home and refresh usage.
type InviteInfo = {
  status: "valid" | "expired" | "used";
  owner_name?: string | null;
  label?: string | null;
};

export default function JoinTeam() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = (params.token as string) || "";
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Missing invite token.");
      setLoading(false);
      return;
    }
    api
      .get<InviteInfo>(`/account/invite/${token}`)
      .then((r) => setInfo(r.data))
      .catch((e) => setError(unwrap(e).message))
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    setError("");
    setAccepting(true);
    try {
      await api.post("/account/invite/accept", { token });
      await refresh();
      router.replace("/(tabs)/home");
    } catch (e) {
      setError(unwrap(e).message || "Could not accept invite.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.brand} size="large" />
        ) : !info || info.status === "expired" || info.status === "used" || error ? (
          <>
            <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
            <Text style={styles.h1}>Invite unavailable</Text>
            <Text style={styles.lead}>
              {info?.status === "expired"
                ? "This invite has expired. Ask the team owner for a new one."
                : info?.status === "used"
                  ? "This invite has already been used."
                  : error || "Invite not found."}
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace(user ? "/(tabs)/home" : "/welcome")}
            >
              <Text style={styles.primaryBtnText}>Back</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Ionicons name="people" size={48} color={colors.brand} />
            <Text style={styles.h1} testID="join-title">
              Join {info.owner_name || "the team"} on Code Without Limits?
            </Text>
            <Text style={styles.lead}>
              You'll share their Monthly plan: 250 AI prompts per month,
              pooled across up to 3 users.
            </Text>
            {info.label ? <Text style={styles.note}>“{info.label}”</Text> : null}

            {user ? (
              <TouchableOpacity
                style={[styles.primaryBtn, accepting && { opacity: 0.6 }]}
                onPress={accept}
                disabled={accepting}
                testID="join-accept-btn"
              >
                <Text style={styles.primaryBtnText}>
                  {accepting ? "Joining…" : "Accept invite"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.replace(`/welcome?next=/account/join?token=${token}`)}
                testID="join-signin-btn"
              >
                <Text style={styles.primaryBtnText}>Sign in to accept</Text>
              </TouchableOpacity>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  h1: { color: colors.text, fontSize: 24, fontWeight: "700", textAlign: "center" },
  lead: { color: colors.textSecondary, fontSize: 15, textAlign: "center", lineHeight: 22 },
  note: { color: colors.text, fontStyle: "italic", fontSize: 14, textAlign: "center" },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
});
