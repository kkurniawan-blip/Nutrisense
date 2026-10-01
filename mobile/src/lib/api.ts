import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getJSON, secure, setJSON } from './storage';
import { translate } from './i18n';
import type { Lang } from './types';

const TOKEN_KEY = 'nutrisense.token';
const SERVER_KEY = 'nutrisense.server';

function defaultBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // Hosted web build: the backend serves the app itself, so the API is on the same address.
  if (process.env.EXPO_PUBLIC_SAME_ORIGIN_API === '1' && Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  // In Expo Go the dev server's host is the laptop running the backend.
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:8000`;
  return 'http://localhost:8000';
}

let baseUrl = defaultBaseUrl();
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export class NetworkError extends Error {}

let initPromise: Promise<string | null> | null = null;

/** Loads the saved server address and token once. Every request awaits this, so screens that
 * mount before the AuthProvider (e.g. a deep link opened directly) still send the token. */
export function initApi(): Promise<string | null> {
  if (!initPromise) {
    initPromise = (async () => {
      baseUrl = (await getJSON<string | null>(SERVER_KEY, null)) || defaultBaseUrl();
      token = await secure.get(TOKEN_KEY);
      return token;
    })();
  }
  return initPromise;
}

export function getBaseUrl() {
  return baseUrl;
}

export async function setBaseUrl(url: string) {
  baseUrl = url.trim().replace(/\/$/, '') || defaultBaseUrl();
  await setJSON(SERVER_KEY, baseUrl);
}

export async function setToken(value: string | null) {
  token = value;
  if (value) await secure.set(TOKEN_KEY, value);
  else await secure.remove(TOKEN_KEY);
}

/** Told after every request whether the server answered, so "Offline" shows the same on every screen. */
let connectivity: ((online: boolean) => void) | null = null;
export function onConnectivity(fn: ((online: boolean) => void) | null) {
  connectivity = fn;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function messageFrom(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d: any) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('\n');
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as any).message);
  return fallback;
}

type Options = { method?: string; body?: unknown; form?: FormData; timeoutMs?: number };

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  await initApi();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: controller.signal });
  } catch {
    connectivity?.(false);
    throw new NetworkError(`Cannot reach the NutriSense server at ${baseUrl}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status !== 502 && res.status !== 503 && res.status !== 504) connectivity?.(true);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // The API always answers in JSON. A bare 404/5xx page comes from the host in between (a stopped or
    // restarting codespace or server), so treat it like no connection: offline saving takes over.
    if (data === null && [404, 502, 503, 504].includes(res.status)) {
      connectivity?.(false);
      throw new NetworkError(`Cannot reach the NutriSense server at ${baseUrl}`);
    }
    if (res.status === 401 && onUnauthorized && !path.startsWith('/api/auth/login')) onUnauthorized();
    const detail = data?.detail;
    throw new ApiError(res.status, messageFrom(detail, `Request failed (${res.status})`), detail);
  }
  return data as T;
}

/** The app's language, so errors shown on any screen read in it (set by the auth provider). */
let uiLang: Lang = 'id';
export function setUiLang(lang: Lang) {
  uiLang = lang;
}

export function errorText(e: unknown): string {
  if (e instanceof NetworkError) return translate(uiLang, 'cannotReachServer');
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
