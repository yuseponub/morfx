/**
 * Mobile API client.
 *
 * Thin wrapper around fetch() that:
 *   1. Reads the current Supabase access token via supabase.auth.getSession()
 *      and sends it as `Authorization: Bearer <token>`.
 *   2. Reads the selected workspace id from AsyncStorage (in-memory cached)
 *      and sends it as `x-workspace-id: <id>`.
 *   3. Sends `Content-Type: application/json` for bodies.
 *   4. Throws `MobileApiError` on non-2xx responses so callers can branch on
 *      status + body.
 *
 * Base URL comes from `EXPO_PUBLIC_API_BASE_URL` (defaults to
 * https://morfx.app). All endpoints are under `/api/mobile/*` per Plan 43-03.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const DEFAULT_BASE_URL = 'https://morfx.app';
const WORKSPACE_STORAGE_KEY = 'mobile:selectedWorkspaceId';

function getBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL;
}

// -- Workspace selection -----------------------------------------------------

let cachedWorkspaceId: string | null | undefined = undefined;

export async function getSelectedWorkspaceId(): Promise<string | null> {
  if (cachedWorkspaceId !== undefined) return cachedWorkspaceId;
  const stored = await AsyncStorage.getItem(WORKSPACE_STORAGE_KEY);
  cachedWorkspaceId = stored;
  return stored;
}

export async function setSelectedWorkspaceId(id: string): Promise<void> {
  cachedWorkspaceId = id;
  await AsyncStorage.setItem(WORKSPACE_STORAGE_KEY, id);
}

export async function clearSelectedWorkspaceId(): Promise<void> {
  cachedWorkspaceId = null;
  await AsyncStorage.removeItem(WORKSPACE_STORAGE_KEY);
}

// -- Error type --------------------------------------------------------------

export class MobileApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Mobile API error ${status}`);
    this.status = status;
    this.body = body;
    this.name = 'MobileApiError';
  }
}

// -- Request core ------------------------------------------------------------

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  /** Skip auth headers (used for unauthenticated probes like health). */
  skipAuth?: boolean;
  /** Optional extra headers (merged, does not override auth). */
  headers?: Record<string, string>;
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  opts: RequestOptions = {}
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!opts.skipAuth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const workspaceId = await getSelectedWorkspaceId();
    if (workspaceId) {
      headers['x-workspace-id'] = workspaceId;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    throw new MobileApiError(res.status, parsed);
  }

  return parsed as T;
}

// -- Public API --------------------------------------------------------------

interface SendMessageArgs {
  conversationId: string;
  body: string | null;
  mediaUri: string | null;
  mediaType: string | null;
  idempotencyKey: string;
}

interface SendMessageResponse {
  id: string;
}

export const mobileApi = {
  get: <T>(path: string, opts?: RequestOptions): Promise<T> =>
    request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>('POST', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>('PATCH', path, body, opts),
  delete: <T>(path: string, opts?: RequestOptions): Promise<T> =>
    request<T>('DELETE', path, undefined, opts),

  /** Cold-start probe — does not require auth. */
  health: (): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>('GET', '/api/mobile/health', undefined, {
      skipAuth: true,
    }),

  /** Outbox drain endpoint. Signature matches drainOutbox expectations. */
  sendMessage: (args: SendMessageArgs): Promise<SendMessageResponse> =>
    request<SendMessageResponse>(
      'POST',
      `/api/mobile/conversations/${encodeURIComponent(args.conversationId)}/messages`,
      {
        body: args.body,
        mediaUri: args.mediaUri,
        mediaType: args.mediaType,
      },
      {
        headers: { 'Idempotency-Key': args.idempotencyKey },
      }
    ),
};
