// Tiny helper for the Bring-Your-Own-Key (free tier) flow.
// We store the key locally (secure-store on native, localStorage on web)
// so a learner doesn't have to paste it on every prompt — but we DO NOT
// send it anywhere except attached to a single AI request body.
// Clearing it via removeByokKey() wipes it from the device.

import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

const BYOK_KEY = "byok_gemini_key";

export async function getByokKey(): Promise<string> {
  if (Platform.OS === "web") {
    try {
      return (typeof window !== "undefined" && window.localStorage.getItem(BYOK_KEY)) || "";
    } catch {
      return "";
    }
  }
  return (await storage.secureGet(BYOK_KEY, "")) || "";
}

export async function setByokKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await removeByokKey();
    return;
  }
  if (Platform.OS === "web") {
    try {
      window.localStorage.setItem(BYOK_KEY, trimmed);
    } catch {}
    return;
  }
  await storage.secureSet(BYOK_KEY, trimmed);
}

export async function removeByokKey(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      window.localStorage.removeItem(BYOK_KEY);
    } catch {}
    return;
  }
  await storage.secureRemove(BYOK_KEY);
}
