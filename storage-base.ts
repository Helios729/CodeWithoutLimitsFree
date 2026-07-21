import { Linking, Platform } from "react-native";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "";

/**
 * Open an external URL safely from both Expo Web and native (iOS/Android).
 *
 * Why the backend hop on web:
 *   The Emergent preview environment is cross-origin-isolated
 *   (COOP/COEP). When we call window.open(url, '_blank') the new tab
 *   inherits that isolation context, which makes destinations like
 *   huggingface.co fail with ERR_BLOCKED_BY_RESPONSE.
 *   By routing through our own /api/go?url=... endpoint, the popup
 *   first lands on our own origin and then receives a standard 302
 *   HTTP redirect — which is just a normal browser navigation and is
 *   unaffected by the opener's isolation policy.
 *
 * On native iOS/Android, Linking.openURL is the right thing — the
 * cross-origin issue does not exist there.
 */
export function openExternal(url: string | null | undefined): void {
  if (!url) return;
  try {
    if (Platform.OS === "web") {
      const goUrl =
        BACKEND_URL && /^https?:\/\//i.test(url)
          ? `${BACKEND_URL.replace(/\/$/, "")}/api/go?url=${encodeURIComponent(url)}`
          : url;
      // eslint-disable-next-line no-undef
      window.open(goUrl, "_blank", "noopener,noreferrer");
      return;
    }
    void Linking.openURL(url);
  } catch (_e) {
    try {
      void Linking.openURL(url);
    } catch (_ee) {
      /* noop */
    }
  }
}
