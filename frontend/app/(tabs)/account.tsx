import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { api, unwrap } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

const TIERS: {
  key: "free" | "day_pass" | "monthly";
  title: string;
  price: string;
  perks: string[];
  highlight?: boolean;
  testID: string;
}[] = [
  {
    key: "free",
    title: "Free",
    price: "$0",
    perks: [
      "5 AI prompts every day — platform-paid",
      "All learning modules + agents",
      "No credit card, no key needed",
      "Built for low-income learners worldwide",
    ],
    testID: "tier-free-btn",
  },
  {
    key: "day_pass",
    title: "Day Pass",
    price: "$3 / 24 hours",
    perks: [
      "6 AI prompts in 24 hours",
      "Quizzes, agent chat, and exports",
      "Auto-downgrades to Free when it expires",
    ],
    testID: "tier-day-btn",
  },
  {
    key: "monthly",
    title: "Monthly Cooperative",
    price: "$10 / month",
    perks: [
      "250 prompts / month — pooled",
      "Share with up to 3 users per account",
      "Includes all Day Pass features",
    ],
    highlight: true,
    testID: "tier-sub-btn",
  },
];

export default function Account() {
  const { user, usage, refreshUsage, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      refreshUsage();
    }, [refreshUsage]),
  );

  async function checkout(plan: "free" | "day_pass" | "monthly") {
    if (plan === "free") {
      // Free tier doesn't open Stripe — it points at the BYOK panel in Studio.
      router.push("/(tabs)/studio");
      return;
    }
    setError("");
    setBusy(plan);
    try {
      const { data } = await api.post<{ url: string }>("/billing/checkout", { plan });
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = data.url;
      } else {
        await Linking.openURL(data.url);
      }
    } catch (e) {
      setError(unwrap(e).message || "Could not start checkout.");
    } finally {
      setBusy("");
    }
  }

  async function onSignOut() {
    await signOut();
    router.replace("/welcome");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profile} testID="account-profile">
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person-outline" size={28} color={colors.text} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name || "Learner"}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
          <TouchableOpacity onPress={onSignOut} testID="sign-out-btn">
            <Ionicons name="log-out-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsCard} testID="account-stats">
          <Text style={styles.eyebrow}>Current plan</Text>
          <Text style={styles.tierLabel}>
            {usage?.tier === "monthly"
              ? "Monthly Cooperative"
              : usage?.tier === "day_pass"
                ? "Day Pass"
                : "Free"}
          </Text>
          {usage?.tier === "day_pass" ? (
            <Text style={styles.statsRow}>
              {usage.daily_prompts_used}/{usage.daily_prompts_cap} prompts used today
            </Text>
          ) : usage?.tier === "monthly" ? (
            <Text style={styles.statsRow}>
              {usage.monthly_prompts_used}/{usage.monthly_prompts_cap} prompts used this month
              {" "}(shared across your team)
            </Text>
          ) : (
            <Text style={styles.statsRow}>
              {usage?.daily_prompts_used ?? 0}/{usage?.daily_prompts_cap ?? 5} free prompts used today
            </Text>
          )}
        </View>

        <Text style={styles.sectionH}>Upgrade</Text>
        {usage?.tier === "monthly" ? (
          <TouchableOpacity
            style={styles.teamLink}
            onPress={() => router.push("/account/seats")}
            testID="manage-team-btn"
          >
            <Ionicons name="people-outline" size={20} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.teamLinkTitle}>Manage your team</Text>
              <Text style={styles.teamLinkBody}>
                Invite up to 2 teammates to share your 250 prompts/month.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
        {TIERS.map((tier) => (
          <View
            key={tier.key}
            style={[styles.tierCard, tier.highlight && styles.tierCardActive]}
          >
            {tier.highlight ? (
              <View style={styles.ribbon}>
                <Text style={styles.ribbonText}>Best value</Text>
              </View>
            ) : null}
            <Text style={styles.tierTitle}>{tier.title}</Text>
            <Text style={styles.tierPrice}>{tier.price}</Text>
            {tier.perks.map((p) => (
              <View key={p} style={styles.perkRow}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.brandSecondary}
                />
                <Text style={styles.perk}>{p}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.tierBtn}
              onPress={() => checkout(tier.key)}
              disabled={!!busy}
              testID={tier.testID}
            >
              <Text style={styles.tierBtnText}>
                {busy === tier.key
                  ? "Opening Stripe…"
                  : tier.key === "free"
                    ? "Current plan"
                    : `Get ${tier.title}`}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {error ? (
          <Text style={styles.error} testID="checkout-error">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          style={styles.missionLink}
          onPress={() => router.push({ pathname: "/core-mission", params: { revisit: "1" } } as any)}
          testID="account-core-mission-btn"
        >
          <Ionicons name="compass-outline" size={18} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.missionLinkTitle}>Our core mission</Text>
            <Text style={styles.missionLinkBody}>Revisit the mission statement anytime.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.missionLink}
          onPress={() => router.push({ pathname: "/mission", params: { revisit: "1" } } as any)}
          testID="account-mission-btn"
        >
          <Ionicons name="construct-outline" size={18} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.missionLinkTitle}>About this pilot</Text>
            <Text style={styles.missionLinkBody}>Pilot disclaimer, water/energy notes, references.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.missionLink, styles.dangerLink]}
          onPress={() => router.push("/delete-account")}
          testID="account-delete-btn"
          accessibilityLabel="Delete my account and personal data"
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.missionLinkTitle, { color: colors.danger }]}>Delete my account</Text>
            <Text style={styles.missionLinkBody}>
              Permanently remove your personal data. Multi-step confirmation.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.danger} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
  dangerLink: { borderColor: "#F5B0B0" },
  missionLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  missionLinkTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  missionLinkBody: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: colors.text, fontSize: 18, fontWeight: "700" },
  email: { color: colors.textSecondary, fontSize: 13 },
  statsCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  eyebrow: {
    color: colors.brand,
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  tierLabel: { color: colors.text, fontSize: 22, fontWeight: "700" },
  statsRow: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  sectionH: { color: colors.text, fontSize: 20, fontWeight: "700", marginTop: spacing.sm },
  tierCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  tierCardActive: {
    borderColor: colors.brand,
    borderWidth: 2,
    shadowColor: colors.brand,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  ribbon: {
    alignSelf: "flex-start",
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: 4,
  },
  ribbonText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  tierTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  tierPrice: { color: colors.brand, fontSize: 16, fontWeight: "700" },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  perk: { color: colors.text, fontSize: 14, flex: 1 },
  tierBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: "center",
    marginTop: 12,
  },
  tierBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: colors.danger, fontSize: 13 },
});
