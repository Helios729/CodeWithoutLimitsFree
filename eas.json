import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { storage } from "@/src/utils/storage";
import { colors, radius, spacing } from "@/src/theme";
import { openExternal } from "@/src/lib/openExternal";

// Shown once after sign-in. Persists a flag so returning learners go
// straight to Home. The "I understand" button is the only way forward,
// ensuring every learner has at least scrolled past the mission.
export default function MissionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ revisit?: string }>();
  const isRevisit = params.revisit === "1";

  async function continueIn() {
    if (!isRevisit && user) {
      const uid = (user as any).id || (user as any).user_id || user.email;
      await storage.setItem(`mission_seen:${uid}`, "1");
    }
    if (isRevisit) router.back();
    else router.replace("/(tabs)/home");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconWrap}>
          <Ionicons name="book-outline" size={36} color={colors.brand} />
        </View>
        <Text style={styles.eyebrow}>Before you begin</Text>
        <Text style={styles.h1}>Why Code Without Limits exists</Text>

        <View style={styles.pilotBox} testID="mission-pilot-box">
          <View style={styles.pilotHead}>
            <Ionicons name="construct-outline" size={18} color={colors.brand} />
            <Text style={styles.pilotTitle}>This is a pilot app.</Text>
          </View>
          <Text style={styles.pilotBody}>
            Like the communities it serves, Community Changers conducts
            continuous self-checks — surveys, user feedback, and internal
            review — to catch broken links, omissions, and errors. Your
            feedback is welcome at every turn. Tap the survey button at the
            end of any module, and flag anything that looks off.
          </Text>
        </View>

        <Text style={styles.body}>
          The core mission for creating this app is to mitigate the digital, and
          now AI, divide. AI was used as a co-creator for this app —
          specifically, <Text style={styles.b}>Perplexity</Text> to verify
          research, and both <Text style={styles.b}>Claude 4.6</Text> and{" "}
          <Text style={styles.b}>ChatGPT 5.4</Text> to verify, and at times
          write or edit, code.
        </Text>

        <Text style={styles.body}>
          The lessons are presented in a format that eventually leads users to
          understand that coding through AI <Text style={styles.b}>without</Text>{" "}
          knowing anything about basic elements of computer science /
          computer engineering is <Text style={styles.b}>costly</Text> and
          potentially <Text style={styles.b}>hazardous</Text>.
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
          despite how much fun coding without foundational knowledge of
          coding might seem.
        </Text>

        <Text style={styles.body}>
          Note that the modules are presented as teasers. Terms with which
          you are not familiar are used. This is to encourage you to use the
          reading materials and learn the concepts well. You can copy the
          link of the YouTube channels and place those links in certain
          text boxes that will provide you with a transcript or summary.
          Most of your time on the app will be spent learning and then
          planning. You will need to be efficient in writing your prompts.
          Do not fall into the trap of using voice mode. With voice mode,
          you are using up more tokens than if you write — unless you are
          a very efficient speaker.
        </Text>

        <Text style={styles.body}>
          Also be mindful of prompting since published estimates suggest
          that one U.S. gallon of water could correspond anywhere from a
          few hundred generated words in high-cost GPT-4-style conditions
          to tens of thousands of short prompt words in ordinary chatbot
          use. Shumba et al. (2024) modeled water-use efficiency for data
          centers across 41 African countries and estimated GPT-4 water
          consumption for selected AI tasks in 11 representative African
          countries. The higher the model and the lengthier the prompt,
          the more water is needed to cool the machines at the centers.
        </Text>

        <Text style={[styles.body, styles.knowledge]}>Knowledge matters.</Text>

        <Text style={styles.body}>
          The reading lists will continuously be populated along with the
          links to the open courses and channels on social media. If funds
          or grants from private, corporate, or other donors permit, users
          can seek certification by remitting the requisite fees on the
          open-course platforms with which we have no affiliation.
        </Text>

        <TouchableOpacity
          style={styles.refLinkRow}
          onPress={() => openExternal("https://arxiv.org/abs/2412.03716")}
          testID="mission-shumba-ref"
        >
          <Ionicons name="library-outline" size={14} color={colors.brandSecondary} />
          <Text style={styles.refText}>
            Shumba, N., Tshekiso, O., Li, P., Fanti, G., & Ren, S. (2024). A
            water efficiency dataset for African data centers. arXiv. https://arxiv.org/abs/2412.03716
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resourcesBtn]}
          onPress={() => router.push("/resources")}
          testID="mission-resources-btn"
        >
          <Ionicons name="book-outline" size={18} color={colors.brand} />
          <Text style={styles.resourcesBtnText}>Open Reading List & Free Courses</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.brand} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={continueIn}
          testID="mission-continue-btn"
        >
          <Text style={styles.primaryBtnText}>I understand — let's begin</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#FFF3EE", alignItems: "center", justifyContent: "center",
    marginBottom: spacing.sm,
  },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 26, fontWeight: "700", lineHeight: 32 },
  body: { color: colors.text, fontSize: 15, lineHeight: 23 },
  b: { fontWeight: "700" },
  pilotBox: {
    backgroundColor: "#FFF3EE",
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: 8,
  },
  pilotHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  pilotTitle: { color: colors.brand, fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
  pilotBody: { color: colors.text, fontSize: 13, lineHeight: 20 },
  knowledge: {
    color: colors.brand,
    fontSize: 18,
    fontWeight: "700",
    fontStyle: "italic",
    textAlign: "center",
    marginVertical: 4,
  },
  refLinkRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "#EAF1EB",
    borderColor: colors.brandSecondary,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  refText: { color: colors.text, fontSize: 11, lineHeight: 16, flex: 1, fontStyle: "italic" },
  resourcesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF3EE",
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    marginTop: 4,
  },
  resourcesBtnText: { color: colors.brand, fontSize: 14, fontWeight: "700", flex: 1 },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 16, borderRadius: radius.pill,
    alignItems: "center", marginTop: spacing.md,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
