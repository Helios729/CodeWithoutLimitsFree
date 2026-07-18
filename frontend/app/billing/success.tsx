import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

// Stripe redirects here after checkout. We reconcile with /billing/verify
// in case the webhook hasn't fired yet, then refresh the usage meter.
export default function BillingSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const { refreshUsage } = useAuth();
  const [state, setState] = useState<"loading" | "paid" | "pending" | "error">("loading");
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    const sid = params.session_id as string | undefined;
    if (!sid) {
      setState("error");
      return;
    }
    (async () => {
      try {
        const { data } = await api.get<{ paid: boolean; plan: string | null }>(
          `/billing/verify?session_id=${encodeURIComponent(sid)}`,
        );
        setPlan(data.plan);
        await refreshUsage();
        setState(data.paid ? "paid" : "pending");
      } catch {
        setState("error");
      }
    })();
  }, [params.session_id, refreshUsage]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.body}>
        {state === "loading" ? (
          <>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={styles.dim}>Confirming your payment…</Text>
          </>
        ) : state === "paid" ? (
          <>
            <Ionicons name="checkmark-circle" size={64} color={colors.brandSecondary} />
            <Text style={styles.h1} testID="billing-success-title">You're in!</Text>
            <Text style={styles.lead}>
              {plan === "monthly"
                ? "Your Monthly Cooperative is active — share with up to 3 users."
                : "Your Day Pass is active for the next 24 hours."}
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace("/(tabs)/home")}
              testID="billing-continue-btn"
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </>
        ) : state === "pending" ? (
          <>
            <Ionicons name="time-outline" size={64} color={colors.brand} />
            <Text style={styles.h1}>Almost there…</Text>
            <Text style={styles.lead}>
              Stripe is still finalizing the payment. Your tier will activate as
              soon as the webhook lands.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace("/(tabs)/account")}
            >
              <Text style={styles.primaryBtnText}>Back to account</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Ionicons name="alert-circle-outline" size={64} color={colors.danger} />
            <Text style={styles.h1}>Could not verify</Text>
            <Text style={styles.lead}>Please try again or contact support.</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace("/(tabs)/account")}
            >
              <Text style={styles.primaryBtnText}>Back</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  h1: { color: colors.text, fontSize: 26, fontWeight: "700", textAlign: "center" },
  lead: { color: colors.textSecondary, fontSize: 15, textAlign: "center", lineHeight: 22 },
  dim: { color: colors.textSecondary, fontSize: 14 },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
