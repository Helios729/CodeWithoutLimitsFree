import axios, { AxiosError } from "axios";
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

// Single base — everything routes through /api per the ingress contract.
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 60000,
});

const TOKEN_KEY = "auth_token";

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return typeof window !== "undefined"
        ? window.localStorage.getItem(TOKEN_KEY)
        : null;
    } catch {
      return null;
    }
  }
  return (await storage.secureGet(TOKEN_KEY, "")) || null;
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {}
    return;
  }
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {}
    return;
  }
  await storage.secureRemove(TOKEN_KEY);
}

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type ApiError = { status: number; message: string; data?: any };

export function unwrap(err: unknown): ApiError {
  const e = err as AxiosError<any>;
  const status = e?.response?.status ?? 0;
  const data = e?.response?.data;
  const message =
    (data && (data.message || data.detail)) ||
    e?.message ||
    "Network error";
  return { status, message, data };
}
