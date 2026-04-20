import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? '3000';
const DEFAULT_API_TIMEOUT_MS = 30000;

function resolveTimeoutMs(): number {
  const rawTimeout = process.env.EXPO_PUBLIC_API_TIMEOUT_MS?.trim();
  const parsed = Number(rawTimeout);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_API_TIMEOUT_MS;
  }

  return parsed;
}

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, '');
}

function getExpoHostUri(): string | null {
  const constantsAny = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  };

  const hostUri =
    constantsAny.expoConfig?.hostUri ??
    constantsAny.manifest2?.extra?.expoClient?.hostUri ??
    null;

  if (!hostUri) {
    return null;
  }

  const host = hostUri.split(':')[0];
  return host || null;
}

function resolveBaseUrl(): string | undefined {
  const rawBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim() ?? '';
  if (rawBaseUrl) {
    return normalizeUrl(rawBaseUrl);
  }

  const expoHost = getExpoHostUri();

  if (expoHost && expoHost !== 'localhost' && expoHost !== '127.0.0.1') {
    return `http://${expoHost}:${API_PORT}`;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${API_PORT}`;
  }

  if (Platform.OS === 'web' || Platform.OS === 'ios') {
    return `http://localhost:${API_PORT}`;
  }

  return undefined;
}

const resolvedBaseUrl = resolveBaseUrl();
const resolvedTimeoutMs = resolveTimeoutMs();

if (__DEV__) {
  console.info(`[api] baseURL = ${resolvedBaseUrl ?? 'undefined'}`);
  console.info(`[api] timeoutMs = ${resolvedTimeoutMs}`);
}

export const apiClient = axios.create({
  baseURL: resolvedBaseUrl ? `${resolvedBaseUrl}/api` : undefined,
  timeout: resolvedTimeoutMs,
  headers: {
    'Content-Type': 'application/json',
  },
});
