import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/theme";

// Entry router. Signed-out → welcome. Signed-in but mission not yet
// acknowledged → /mission. Otherwise → main tabs. The Demo Presenter
// account skips Core Mission + Pilot disclaimer entirely so a demo
// click lands directly on the dashboard (no flicker, no chance of a
// 404-looking intermediate screen for presenters).
const DEMO_EMAIL = "demo@codewithoutlimits.app";

export default function Index() {
  const { user, loading } = useAuth();
  const [seenCore, setSeenCore] = useState<boolean | null>(null);
  const [seenMission, setSeenMission] = useState<boolean | null>(null);

  useEffect(() => {
    // Reset to "checking" whenever the user changes so we always re-read
    // storage for the new account (otherwise the previous user's flags
    // would carry over on the same device).
    setSeenCore(null);
    setSeenMission(null);
    if (!user) {
      // Signed out — Redirect path doesn't depend on flags. Set non-null
      // so the loading spinner gives way immediately.
      setSeenCore(false);
      setSeenMission(false);
      return;
    }
    // Demo Presenter — always skip the intro screens.
    if (user.email === DEMO_EMAIL) {
      setSeenCore(true);
      setSeenMission(true);
      return;
    }
    const uid = (user as any).id || (user as any).user_id || user.email;
    Promise.all([
      storage.getItem(`core_mission_seen:${uid}`, ""),
      storage.getItem(`mission_seen:${uid}`, ""),
    ]).then(([core, mission]) => {
      setSeenCore(!!core);
      setSeenMission(!!mission);
    });
  }, [user]);

  if (loading || seenCore === null || seenMission === null) {
    return (
      <View style={styles.center} testID="splash-loading">
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href="/welcome" />;
  // Order: Welcome → Core Mission (standalone) → Mission (pilot alert) → Home
  if (!seenCore) return <Redirect href="/core-mission" />;
  if (!seenMission) return <Redirect href="/mission" />;
  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
