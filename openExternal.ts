import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { getByokKey, removeByokKey, setByokKey } from "@/src/lib/byok";
import { colors, radius, spacing } from "@/src/theme";
import { openExternal } from "@/src/lib/openExternal";

// Free-tier BYOK panel. Used inline on the Studio screen and (via the same
// component) on the active quiz screen. Only renders when the parent tells
// it to (i.e. tier === "free"). Key is persisted to secure storage so the
// learner doesn't have to paste it every prompt.
export default function ByokPanel({
  onKeyChange,
}: {
  onKeyChange?: (key: string) => void;
}) {
  const [key, setKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getByokKey().then((k) => {
      if (k) {
        setKey(k);
        onKeyChange?.(k);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    await setByokKey(key);
    setSaved(true);
    onKeyChange?.(key);
    setTimeout(() => setSaved(false), 1500);
  }

  async function clear() {
    await removeByokKey();
    setKey("");
    onKeyChange?.("");
  }

  return (
    <View style={styles.card} testID="byok-panel">
      <View style={styles.headerRow}>
        <Ionicons name="key-outline" size={18} color={colors.brand} />
        <Text style={styles.title}>Optional: use your own Gemini key</Text>
      </View>
      <Text style={styles.body}>
        Power users only — paste your own Google Gemini key to skip the
        5-prompt daily limit and run unlimited Flash calls on your own quota.
        Your key stays on this device and is sent only inside a single AI
        request, never logged or stored on our servers.
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={key}
          onChangeText={setKey}
          placeholder="AIza… or your Google AI Studio key"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!reveal}
          testID="byok-input"
        />
        <TouchableOpacity
          style={styles.eye}
          onPress={() => setReveal(!reveal)}
          testID="byok-reveal-btn"
        >
          <Ionicons
            name={reveal ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={save}
          disabled={!key.trim()}
          testID="byok-save-btn"
        >
          <Text style={styles.btnPrimaryText}>
            {saved ? "Saved" : "Save on this device"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={clear}
          testID="byok-clear-btn"
        >
          <Text style={styles.btnSecondaryText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => openExternal("https://aistudio.google.com/app/apikey")}
        testID="byok-help-link"
      >
        <Text style={styles.help}>
          Don't have a key yet? Get a free one at aistudio.google.com →
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  eye: { padding: 10 },
  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    flex: 1,
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  btnSecondary: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnSecondaryText: { color: colors.text, fontWeight: "600" },
  help: { color: colors.brand, fontSize: 12, marginTop: 4, fontWeight: "600" },
});
