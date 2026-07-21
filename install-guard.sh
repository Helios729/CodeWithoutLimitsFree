import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme";

export default function BillingCancel() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.body}>
        <Ionicons name="close-circle-outline" size={64} color={colors.textSecondary} />
        <Text style={styles.h1}>Checkout canceled</Text>
        <Text style={styles.lead}>No charge was made. You can upgrade any time.</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace("/(tabs)/account")}
          testID="billing-cancel-back-btn"
        >
          <Text style={styles.primaryBtnText}>Back to account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  h1: { color: colors.text, fontSize: 24, fontWeight: "700" },
  lead: { color: colors.textSecondary, fontSize: 15, textAlign: "center" },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
