import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/theme";

// Native deep-link landing: app receives `myapp://auth#session_id=...`,
// we exchange it server-side and route into the app.
export default function AuthRedirect() {
  const router = useRouter();
  const { exchangeSessionId } = useAuth();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const sid = params.session_id as string | undefined;
    if (!sid) return;
    handled.current = true;
    exchangeSessionId(sid)
      .then(() => router.replace("/(tabs)/home"))
      .catch(() => router.replace("/welcome"));
  }, [params.session_id, exchangeSessionId, router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} />
      <Text style={styles.label}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: 12,
  },
  label: { color: colors.textSecondary },
});
