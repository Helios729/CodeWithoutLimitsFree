import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, unwrap } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";
import { openExternal } from "@/src/lib/openExternal";

type Source = { url: string; institution: string };
type Framework = {
  id: string;
  name: string;
  purpose: string;
  template: string;
  example: string;
};
type BuildActivity = {
  kind: "html_lab";
  title: string;
  brief: string;
  starter: string;
};
type Sub = {
  id: string;
  title: string;
  objective: string;
  lesson: string;
  sources: Source[];
  framework?: Framework;
  build_activity?: BuildActivity;
  module_id: string;
  module_title: string;
};

// Sub-module detail screen with:
//   - Lesson body
//   - Source citations (tappable, opens in browser)
//   - Prompt-template card (only on Module 3 sub-modules)
//   - Build lab: phone-resident HTML/CSS/JS sandbox that renders the
//     learner's code right inside the screen via WebView (native) or
//     iframe srcDoc (web). No build tools, no network round-trip — exactly
//     the "single-file mobile coding" pattern from the user's PDF.
export default function SubmoduleDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ moduleId: string; subId: string }>();
  const [s, setS] = useState<Sub | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    api
      .get<Sub>(`/modules/${params.moduleId}/${params.subId}`)
      .then((r) => {
        setS(r.data);
        if (r.data.build_activity) setCode(r.data.build_activity.starter);
      })
      .catch((e) => setError(unwrap(e).message));
  }, [params.moduleId, params.subId]);

  const previewSrc = useMemo(() => code, [previewKey]); // eslint-disable-line

  function run() {
    setPreviewKey((k) => k + 1);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} testID="sub-back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{s?.module_title || "Loading"} · {s?.id}</Text>
          <Text style={styles.h1} numberOfLines={2}>{s?.title || ""}</Text>
        </View>
      </View>

      {!s && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.label}>Objective</Text>
            <Text style={styles.objective}>{s!.objective}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Lesson</Text>
            <Text style={styles.lesson}>{s!.lesson}</Text>
          </View>

          {s!.framework ? (
            <View style={[styles.card, styles.cardAccent]} testID="framework-card">
              <Text style={styles.fwHeader}>
                Prompt framework: {s!.framework.name}
              </Text>
              <Text style={styles.fwPurpose}>{s!.framework.purpose}</Text>
              <Text style={styles.codeBlockLabel}>Template</Text>
              <View style={styles.codeBlock}>
                <Text selectable style={styles.codeText}>{s!.framework.template}</Text>
              </View>
              <Text style={styles.codeBlockLabel}>Example</Text>
              <View style={styles.codeBlock}>
                <Text selectable style={styles.codeText}>{s!.framework.example}</Text>
              </View>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/studio",
                    params: { template: s!.framework!.template },
                  })
                }
                testID="open-in-studio-btn"
              >
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Try this template in Studio</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {s!.build_activity ? (
            <View style={[styles.card, styles.cardBuild]} testID="build-lab">
              <Text style={styles.fwHeader}>{s!.build_activity.title}</Text>
              <Text style={styles.fwPurpose}>{s!.build_activity.brief}</Text>
              <Text style={styles.codeBlockLabel}>Your code (single HTML file)</Text>
              <TextInput
                style={styles.editor}
                value={code}
                onChangeText={setCode}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                testID="build-editor"
              />
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.primaryBtn} onPress={run} testID="build-run-btn">
                  <Ionicons name="play" size={14} color="#fff" />
                  <Text style={styles.primaryBtnText}>Run preview</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setCode(s!.build_activity!.starter)}
                  testID="build-reset-btn"
                >
                  <Text style={styles.secondaryBtnText}>Reset</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.codeBlockLabel}>Live preview</Text>
              <BuildPreview key={previewKey} html={previewSrc} />
              <Text style={styles.fineprint}>
                Save this file (e.g. as <Text style={styles.mono}>app.html</Text>)
                and open it in any browser — it runs offline with no server.
              </Text>
            </View>
          ) : null}

          {s!.sources?.length ? (
            <View style={styles.card} testID="sources-card">
              <Text style={styles.label}>Sources</Text>
              {s!.sources.map((src, i) => (
                <TouchableOpacity key={i} onPress={() => openExternal(src.url)}>
                  <Text style={styles.sourceText}>
                    • {src.institution} — {src.url}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// Cross-platform sandboxed preview. On web we use an <iframe srcDoc>; on
// native we use react-native-webview, which is already bundled with Expo.
function BuildPreview({ html }: { html: string }) {
  if (Platform.OS === "web") {
    return (
      // eslint-disable-next-line react/no-unknown-property
      <iframe
        title="preview"
        srcDoc={html}
        sandbox="allow-scripts"
        // @ts-ignore — RN-web passes through to native iframe
        style={{
          width: "100%",
          height: 320,
          border: "1px solid " + colors.border,
          borderRadius: 12,
          background: "#fff",
        }}
      />
    );
  }
  // Lazy require so web bundles don't choke on react-native-webview.
  const WebView = require("react-native-webview").WebView;
  return (
    <View style={{ height: 320, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
      <WebView originWhitelist={["*"]} source={{ html }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8,
  },
  cardAccent: { borderColor: colors.brandSecondary },
  cardBuild: { borderColor: colors.brand, backgroundColor: "#FFFBF8" },
  label: { color: colors.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  objective: { color: colors.text, fontSize: 15, fontWeight: "600", lineHeight: 22 },
  lesson: { color: colors.text, fontSize: 14, lineHeight: 22 },
  fwHeader: { color: colors.text, fontSize: 16, fontWeight: "700" },
  fwPurpose: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  codeBlockLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 6, letterSpacing: 1 },
  codeBlock: {
    backgroundColor: colors.bg, borderRadius: radius.input,
    borderWidth: 1, borderColor: colors.border, padding: 12,
  },
  codeText: { color: colors.text, fontSize: 13, lineHeight: 19, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  editor: {
    backgroundColor: "#0F1419", color: "#E8E6E3",
    borderRadius: radius.input, padding: 12,
    fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    minHeight: 180, textAlignVertical: "top",
  },
  btnRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  primaryBtn: {
    flexDirection: "row", gap: 6,
    backgroundColor: colors.brand, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: radius.pill, alignItems: "center", justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  secondaryBtn: {
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { color: colors.text, fontWeight: "600", fontSize: 14 },
  fineprint: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  sourceText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, paddingVertical: 2 },
  error: { color: colors.danger, padding: spacing.lg },
});
