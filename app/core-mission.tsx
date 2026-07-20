import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { storage } from "@/src/utils/storage";
import { colors, radius, spacing } from "@/src/theme";

// Standalone Core Mission Statement.
//
// First-time learners reach this screen between the welcome (mountains)
// and the pilot disclaimer on /mission. They can revisit it any time
// from the Account tab. There is NO auto-redirect — the user must tap
// "Continue" to move on, so the screen never "flashes" past anyone.
export default function CoreMissionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ revisit?: string }>();
  const isRevisit = params.revisit === "1";

  async function continueIn() {
    if (!isRevisit && user) {
      const uid = (user as any).id || (user as any).user_id || user.email;
      await storage.setItem(`core_mission_seen:${uid}`, "1");
    }
    if (isRevisit) router.back();
    else router.replace("/mission");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconWrap}>
          <Ionicons name="compass-outline" size={36} color={colors.brand} />
        </View>

        <Text style={styles.eyebrow}>Our core mission</Text>
        <Text style={styles.h1}>
          Mitigate the digital — and now the AI — divide.
        </Text>

        <Text style={styles.body}>
          The core mission for creating this app is to mitigate the digital, and
          now AI, divide. AI was used as a co-creator for this app —
          specifically, <Text style={styles.b}>Perplexity</Text> to verify
          research, and both <Text style={styles.b}>Claude 4.6</Text> and{" "}
          <Text style={styles.b}>ChatGPT 5.4</Text> to verify, and at times,
          write or edit, code. The lessons are presented in a format that
          eventually leads users to understand that coding through AI without
          knowing anything about basic elements of computer
          science / computer engineering is costly and potentially hazardous.
        </Text>

        <Text style={styles.body}>
          It would be unethical for users to think they can build complex
          systems in an hour or less. All users must understand concepts such
          as <Text style={styles.b}>bandwidth</Text>,{" "}
          <Text style={styles.b}>throughput</Text>,{" "}
          <Text style={styles.b}>bottlenecks</Text>,{" "}
          <Text style={styles.b}>timeouts</Text>,{" "}
          <Text style={styles.b}>resets</Text>, and{" "}
          <Text style={styles.b}>memory</Text> to use the available AI tools
          effectively and efficiently — in terms of both time and cost.
        </Text>

        <Text style={styles.body}>
          Consequently, the sequence starts with an{" "}
          <Text style={styles.b}>Introduction to AI</Text> and ends with{" "}
          <Text style={styles.b}>Advanced HTML and API formation</Text> so
          students can comprehend that the foundation greatly matters —
          despite how much fun coding without foundational knowledge might
          seem.
        </Text>

        <Text style={styles.body}>
          Reading Lists will eventually be added along with links to free open
          courses where users may obtain additional knowledge. If funds or
          grants permit on their end or ours, they can seek certification by
          paying the requisite fees on those platforms with which we have no
          affiliation.
        </Text>

        <TouchableOpacity
          style={styles.cta}
          onPress={continueIn}
          testID="core-mission-continue-btn"
        >
          <Text style={styles.ctaText}>{isRevisit ? "Back" : "Continue"}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFF3EE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  h1: { color: colors.text, fontSize: 24, fontWeight: "700", lineHeight: 32 },
  body: { color: colors.text, fontSize: 15, lineHeight: 23 },
  b: { fontWeight: "700" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginTop: spacing.md,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
