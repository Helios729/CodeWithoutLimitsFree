import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";

// Always-visible meter in the header. Shows tier + the most-restrictive
// remaining capacity so the learner knows when they'll hit a wall.
export default function TokenMeter() {
  const { usage } = useAuth();
  if (!usage) {
    return (
      <View style={styles.pill} testID="token-meter">
        <Text style={styles.label}>Free</Text>
      </View>
    );
  }

  let label = "";
  let pct = 0;

  if (usage.tier === "day_pass" || usage.tier === "free") {
    const cap = usage.daily_prompts_cap || 1;
    const used = usage.daily_prompts_used || 0;
    const left = Math.max(0, cap - used);
    label =
      usage.tier === "free"
        ? `${left}/${cap} free prompts today`
        : `${left}/${cap} prompts · ${Math.round(
            Math.max(0, usage.daily_tokens_cap - usage.daily_tokens_used) / 1000,
          )}k tok`;
    pct = Math.min(
      (used / Math.max(1, cap)) * 100,
      (usage.daily_tokens_used / Math.max(1, usage.daily_tokens_cap || 1)) * 100,
    );
  } else if (usage.tier === "monthly") {
    const cap = usage.monthly_prompts_cap || 1;
    const left = Math.max(0, cap - (usage.monthly_prompts_used || 0));
    label = `${left}/${cap} prompts left`;
    pct = ((usage.monthly_prompts_used || 0) / Math.max(1, cap)) * 100;
  } else {
    label = "Free";
    pct = 0;
  }

  pct = Math.max(0, Math.min(100, pct));
  const filled = Math.round(pct);

  return (
    <View style={styles.pill} testID="token-meter">
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${filled}%` }]} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    maxWidth: 240,
  },
  bar: {
    width: 56,
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.brandSecondary,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
});
