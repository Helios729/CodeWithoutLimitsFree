import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, unwrap } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing } from "@/src/theme";

type Seat = {
  user_id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  is_account_owner?: boolean;
};

type Invite = {
  token: string;
  created_at: string;
  expires_at: string;
  label?: string | null;
};

type SeatsData = {
  tier: string;
  seats_used: number;
  seats_allowed: number;
  is_owner: boolean;
  seats: Seat[];
  invites: Invite[];
};

// Owner-only team management. List current seats, generate share links,
// revoke pending invites, kick a teammate. Shows a clear gate when the
// caller isn't on the Monthly plan.
export default function SeatsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<SeatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteLabel, setInviteLabel] = useState("");
  const [lastInvite, setLastInvite] = useState<{ token: string; join_url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const { data } = await api.get<SeatsData>("/account/seats");
      setData(data);
    } catch (e) {
      setError(unwrap(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createInvite() {
    setError("");
    setBusy(true);
    try {
      const { data: inv } = await api.post<{ token: string; join_url: string }>(
        "/account/invite",
        { label: inviteLabel || undefined },
      );
      setLastInvite(inv);
      setInviteLabel("");
      await load();
    } catch (e) {
      setError(unwrap(e).message || "Could not create invite.");
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite(joinUrl: string) {
    try {
      await Share.share({
        message: `Join my Code Without Limits team — we'll share 250 prompts/month. Tap: ${joinUrl}`,
      });
    } catch {}
  }

  async function copyInvite(joinUrl: string) {
    await Clipboard.setStringAsync(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function revoke(token: string) {
    setBusy(true);
    try {
      await api.delete(`/account/invite/${token}`);
      await load();
    } catch (e) {
      setError(unwrap(e).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSeat(seatId: string) {
    setBusy(true);
    try {
      await api.delete(`/account/seats/${seatId}`);
      await load();
    } catch (e) {
      setError(unwrap(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="seats-back-btn" style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Monthly Cooperative</Text>
          <Text style={styles.h1}>Manage your team</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : !data ? (
        <Text style={styles.error}>{error || "Failed to load."}</Text>
      ) : data.tier !== "monthly" ? (
        <View style={styles.gate} testID="seats-gate">
          <Ionicons name="people-outline" size={32} color={colors.brand} />
          <Text style={styles.gateTitle}>Team seats unlock at $10/month</Text>
          <Text style={styles.gateBody}>
            The Monthly Cooperative plan lets you invite up to 2 teammates so
            your 250 prompts/month are pooled. Upgrade from your Account screen.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push("/(tabs)/account")}
            testID="seats-upgrade-btn"
          >
            <Text style={styles.primaryBtnText}>Go to Upgrade</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>
              {data.seats_used} of {data.seats_allowed} seats used
            </Text>
            {data.seats.map((s) => (
              <View key={s.user_id} style={styles.seatRow} testID={`seat-${s.user_id}`}>
                <View style={styles.avatar}>
                  <Ionicons name="person-outline" size={20} color={colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.seatName}>
                    {s.name || s.email}
                    {s.is_account_owner ? "  ·  Owner" : ""}
                    {s.user_id === user?.id ? "  ·  You" : ""}
                  </Text>
                  <Text style={styles.seatEmail}>{s.email}</Text>
                </View>
                {data.is_owner && !s.is_account_owner ? (
                  <TouchableOpacity
                    onPress={() => removeSeat(s.user_id)}
                    disabled={busy}
                    style={styles.removeBtn}
                    testID={`seat-remove-${s.user_id}`}
                  >
                    <Ionicons name="close" size={16} color={colors.danger} />
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>

          {data.is_owner ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Invite a teammate</Text>
              <Text style={styles.body}>
                Generate a one-time link, then share it with them via text,
                email, or chat. They sign in and tap the link to join your team.
              </Text>
              <TextInput
                style={styles.input}
                value={inviteLabel}
                onChangeText={setInviteLabel}
                placeholder="Optional: name or note (e.g. 'Maria')"
                placeholderTextColor={colors.textSecondary}
                testID="invite-label-input"
              />
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (busy || data.seats_used + data.invites.length >= data.seats_allowed) && { opacity: 0.5 },
                ]}
                onPress={createInvite}
                disabled={busy || data.seats_used + data.invites.length >= data.seats_allowed}
                testID="invite-create-btn"
              >
                <Ionicons name="link" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {busy ? "Creating…" : "Create invite link"}
                </Text>
              </TouchableOpacity>

              {lastInvite ? (
                <View style={styles.inviteBox} testID="invite-result">
                  <Text style={styles.inviteLabel}>Share this link:</Text>
                  <Text selectable style={styles.inviteUrl}>{lastInvite.join_url}</Text>
                  <View style={styles.inviteBtnRow}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => copyInvite(lastInvite.join_url)}
                      testID="invite-copy-btn"
                    >
                      <Ionicons name="copy-outline" size={14} color={colors.text} />
                      <Text style={styles.secondaryBtnText}>
                        {copied ? "Copied" : "Copy link"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => shareInvite(lastInvite.join_url)}
                      testID="invite-share-btn"
                    >
                      <Ionicons name="share-social-outline" size={14} color={colors.text} />
                      <Text style={styles.secondaryBtnText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {data.invites.length ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Pending invites</Text>
              {data.invites.map((inv) => (
                <View key={inv.token} style={styles.inviteRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.seatName}>{inv.label || "Unnamed invite"}</Text>
                    <Text style={styles.seatEmail} numberOfLines={1}>
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </Text>
                  </View>
                  {data.is_owner ? (
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => revoke(inv.token)}
                      testID={`invite-revoke-${inv.token}`}
                    >
                      <Text style={styles.removeBtnText}>Revoke</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
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
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardEyebrow: {
    color: colors.brand,
    letterSpacing: 1.5,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  seatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bg, alignItems: "center", justifyContent: "center",
  },
  seatName: { color: colors.text, fontWeight: "600", fontSize: 14 },
  seatEmail: { color: colors.textSecondary, fontSize: 12 },
  removeBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.danger,
  },
  removeBtnText: { color: colors.danger, fontSize: 12, fontWeight: "600" },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.input,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, color: colors.text, fontSize: 14,
  },
  primaryBtn: {
    flexDirection: "row", gap: 8,
    backgroundColor: colors.brand,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  inviteBox: {
    backgroundColor: colors.bg, borderRadius: radius.input, padding: 12, gap: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  inviteLabel: { color: colors.brand, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  inviteUrl: { color: colors.text, fontSize: 12, fontFamily: "monospace" },
  inviteBtnRow: { flexDirection: "row", gap: 8 },
  secondaryBtn: {
    flexDirection: "row", gap: 6, alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  gate: {
    margin: spacing.lg, padding: spacing.lg, gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
    alignItems: "center",
  },
  gateTitle: { color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  gateBody: { color: colors.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
  error: { color: colors.danger, fontSize: 13, padding: spacing.lg },
});
