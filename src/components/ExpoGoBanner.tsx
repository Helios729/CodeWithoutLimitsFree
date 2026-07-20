import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { storage } from "@/src/utils/storage";
import { colors, radius, spacing } from "@/src/theme";

// Heads-up banner that only appears when the app is running inside the
// Expo Go developer sandbox. Expo Go can't deep-link Google OAuth back
// into the JS app, so sign-in falls back to the project picker screen
// and reviewers think the app is broken. Real end users (web visitors
// or anyone who installs a native build) never see this — it's only
// for devs/reviewers QA-ing in Expo Go.
const DISMISS_KEY = "expo_go_banner_dismissed";

function isRunningInExpoGo(): boolean {
  if (Platform.OS === "web") return false;
  // Constants.executionEnvironment === 'storeClient' is the modern signal
  // for "this code is inside the Expo Go app", not a standalone build.
  return Constants.executionEnvironment === "storeClient";
}

export default function ExpoGoBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isRunningInExpoGo()) return;
    storage.getItem(DISMISS_KEY, "").then((v) => {
      if (!v) setShow(true);
    });
  }, []);

  async function dismiss() {
    setShow(false);
    await storage.setItem(DISMISS_KEY, "1");
  }

  if (!show) return null;

  return (
    <View style={styles.card} testID="expo-go-banner">
      <Ionicons name="information-circle" size={22} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Heads-up for reviewers</Text>
        <Text style={styles.body}>
          Google sign-in cannot complete inside the Expo Go sandbox — that's a
          limitation of Expo Go, not the app. Real users see a working sign-in
          when they open the app on the web or install the iOS/Android build.
        </Text>
      </View>
      <TouchableOpacity onPress={dismiss} testID="expo-go-banner-dismiss" hitSlop={10}>
        <Ionicons name="close" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "#FFF3EE",
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  body: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
});
