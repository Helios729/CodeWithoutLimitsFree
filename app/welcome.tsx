import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing } from "@/src/theme";

// Emergent-managed Google auth flow. On web we navigate the whole tab;
// on native we open an in-app browser session and read the redirect URL
// from the result (plus a deep-link listener as a fallback).
export default function Welcome() {
  const router = useRouter();
  const { user, exchangeSessionId, demoSignIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  function parseSessionId(url: string): string | null {
    try {
      const u = new URL(url);
      const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
      const fromHash = new URLSearchParams(hash).get("session_id");
      const fromQuery = u.searchParams.get("session_id");
      return fromHash || fromQuery;
    } catch {
      const m = url.match(/session_id=([^&#]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    }
  }

  async function handleSignIn() {
    setError("");
    setBusy(true);
    try {
      const redirectUrl =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin + "/"
          : Linking.createURL("auth");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(
        redirectUrl,
      )}`;

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.location.href = authUrl;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type !== "success" || !result.url) {
        setBusy(false);
        return;
      }
      const sid = parseSessionId(result.url);
      if (!sid) throw new Error("No session_id returned");
      await exchangeSessionId(sid);
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDemo() {
    setError("");
    setDemoBusy(true);
    try {
      const demoUser = await demoSignIn();
      // For presentations: skip the Core Mission + Pilot disclaimer
      // intros so the dashboard is one tap away. We pre-mark them as
      // "seen" for the demo user; index.tsx then routes the user
      // straight to /(tabs)/home with no flicker.
      try {
        const uid = (demoUser as any).id || demoUser.email;
        await storage.setItem(`core_mission_seen:${uid}`, "1");
        await storage.setItem(`mission_seen:${uid}`, "1");
      } catch {}
      // Route through "/" — the Index reads the seen flags we just set
      // and redirects to the dashboard. This avoids encoding the
      // "(tabs)" group prefix in the URL bar which can 404 on static
      // exports / refresh.
      router.replace("/");
    } catch (e: any) {
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Demo mode unavailable. Please try Google sign-in.",
      );
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <View style={styles.bg}>
      <KenscoffMountains />

      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.brandRow}>
          <View style={styles.dot} />
          <Text style={styles.brandName}>Code Without Limits</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow} testID="welcome-eyebrow">
            Small AI · Mobile-first · Community-owned
          </Text>
          <Text style={styles.h1} testID="welcome-title">
            Turn local knowledge into ownable assets.
          </Text>
          <Text style={styles.lead}>
            A phone-first learning studio for low-bandwidth, energy-constrained
            contexts — built by Carline Romain for Mondial Connections &
            Community Changers Foundations.
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.disabled]}
            onPress={handleSignIn}
            disabled={busy || demoBusy}
            testID="login-google-btn"
            accessibilityLabel="Sign in with Google"
          >
            <Text style={styles.primaryBtnText}>
              {busy ? "Opening Google…" : "Sign in with Google"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.demoBtn, demoBusy && styles.disabled]}
            onPress={handleDemo}
            disabled={busy || demoBusy}
            testID="login-demo-btn"
            accessibilityLabel="Continue in Demo Mode"
          >
            <Text style={styles.demoBtnText}>
              {demoBusy ? "Loading demo…" : "Continue in Demo Mode →"}
            </Text>
          </TouchableOpacity>

          {error ? (
            <Text style={styles.error} testID="auth-error">
              {error}
            </Text>
          ) : null}
          <Text style={styles.fine}>
            By signing in, you agree to be a co-learner. We do not sell
            community language data without consent.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

// Misty silhouette of the Kenscoff mountains (Haiti) — atmospheric
// perspective in the user's three-colour palette:
//   • #7D8B93 muted blue-grey  → far range, cool & high
//   • #C9BAB7 pale rosy-beige  → mid range, warm haze
//   • #AB8674 muted terracotta → foreground silhouette (the original
//     "mound" warmth), kept LIGHT so the hero text remains uplifted.
// Ridgelines are jagged & asymmetric (straight L-segments with one
// dominant peak per ridge) to read as real Kenscoff peaks rather than
// sinusoidal hills.
function KenscoffMountains() {
  const { width, height } = Dimensions.get("window");
  const svgHeight = Math.max(height, 600);
  return (
    <View style={styles.mountainWrap} pointerEvents="none">
      {/* Sky: cream → soft warm beige horizon */}
      <LinearGradient
        colors={["#F7F5F0", "#EFE4D6", "#E2D0BF"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Svg
        width={width}
        height={svgHeight}
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMax slice"
        style={styles.mountainSvg}
      >
        <Defs>
          {/* Warm rosy-beige horizon glow */}
          <SvgLinearGradient id="dawn" x1="0" y1="0.3" x2="0" y2="1">
            <Stop offset="0" stopColor="#C9BAB7" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#C9BAB7" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#AB8674" stopOpacity="0.18" />
          </SvgLinearGradient>
          {/* Far ridge — muted blue-grey (cool, distant, hazy) */}
          <SvgLinearGradient id="ridge1" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#7D8B93" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#7D8B93" stopOpacity="0.75" />
          </SvgLinearGradient>
          {/* Mid ridge — pale rosy-beige (warmer than far, still hazy) */}
          <SvgLinearGradient id="ridge2" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#C9BAB7" stopOpacity="0.78" />
            <Stop offset="1" stopColor="#B7A4A0" stopOpacity="0.92" />
          </SvgLinearGradient>
          {/* Foreground ridge — muted terracotta (light at the crest,
              richer at the base — never muddy / never opaque-dark) */}
          <SvgLinearGradient id="ridge3" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#C9A38C" stopOpacity="0.85" />
            <Stop offset="1" stopColor="#AB8674" stopOpacity="0.95" />
          </SvgLinearGradient>
        </Defs>

        {/* Horizon dawn wash */}
        <Path d="M0,210 L800,210 L800,600 L0,600 Z" fill="url(#dawn)" />

        {/* Far ridge — muted blue-grey. Jagged, asymmetric, one dominant
            peak slightly right of centre. Sharp diagonals, not sinusoidal. */}
        <Path
          d="M 0,360
             L 45,335
             L 95,318
             L 140,295
             L 185,308
             L 235,272
             L 285,238
             L 330,205
             L 365,178
             L 405,150
             L 442,128
             L 478,165
             L 510,195
             L 548,215
             L 595,182
             L 640,228
             L 690,260
             L 740,278
             L 800,295
             L 800,600 L 0,600 Z"
          fill="url(#ridge1)"
        />

        {/* Mid ridge — rosy-beige. Lower amplitude, asymmetric again,
            peak offset to the left to interlock with the far ridge. */}
        <Path
          d="M 0,440
             L 40,425
             L 95,390
             L 145,360
             L 192,332
             L 232,308
             L 270,280
             L 305,310
             L 348,340
             L 392,308
             L 438,348
             L 485,330
             L 532,365
             L 580,348
             L 628,378
             L 678,360
             L 728,395
             L 778,410
             L 800,418
             L 800,600 L 0,600 Z"
          fill="url(#ridge2)"
        />

        {/* Foreground ridge — muted terracotta. Short & light so it
            never covers the hero copy. Asymmetric small foothills with a
            single warm crest right-of-centre. */}
        <Path
          d="M 0,538
             L 65,525
             L 130,532
             L 200,512
             L 268,520
             L 335,498
             L 395,485
             L 445,510
             L 498,495
             L 552,478
             L 605,505
             L 668,495
             L 728,515
             L 780,508
             L 800,512
             L 800,600 L 0,600 Z"
          fill="url(#ridge3)"
        />
      </Svg>

      {/* Light top-down haze to lift the hero text above the distant
          peaks. Lower opacity than before because the foreground is now
          terracotta-light, not slate-dark, so we need less protection. */}
      <LinearGradient
        colors={[
          "rgba(247,245,240,0.42)",
          "rgba(247,245,240,0.12)",
          "rgba(247,245,240,0)",
        ]}
        locations={[0, 0.4, 0.65]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  mountainWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  mountainSvg: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.brand,
  },
  brandName: { color: colors.text, fontWeight: "700", fontSize: 16 },
  hero: { gap: spacing.md },
  eyebrow: {
    color: colors.brand,
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  h1: {
    color: colors.text,
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 42,
  },
  lead: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  actions: { gap: spacing.md },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  demoBtn: {
    backgroundColor: "transparent",
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  demoBtnText: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  fine: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: "center",
  },
});
