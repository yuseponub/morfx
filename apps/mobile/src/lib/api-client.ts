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
const WORKSPACE_MEMBERSHIPS_KEY = 'mobile:workspaceMemberships';

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

// -- Workspace memberships cache (offline resilience) -----------------------
//
// Cache the workspace list returned by /api/mobile/workspaces so the app can
// bootstrap offline. Shape must be a plain JSON array of the minimal fields
// the WorkspaceProvider consumes; keep in sync with WorkspaceMembership.

export interface CachedWorkspaceMembership {
  id: string;
  name: string;
  slug: string | null;
}

export async function getCachedWorkspaceMemberships(): Promise<
  CachedWorkspaceMembership[] | null
> {
  const raw = await AsyncStorage.getItem(WORKSPACE_MEMBERSHIPS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CachedWorkspaceMembership[]) : null;
  } catch {
    return null;
  }
}

export async function setCachedWorkspaceMemberships(
  list: CachedWorkspaceMembership[]
): Promise<void> {
  await AsyncStorage.setItem(WORKSPACE_MEMBERSHIPS_KEY, JSON.stringify(list));
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
  /** Opaque storage key returned by /media/upload, OR null for text-only. */
  mediaKey: string | null;
  mediaType: 'image' | 'audio' | null;
  idempotencyKey: string;
  templateName?: string;
  templateVariables?: Record<string, string>;
}

type SendMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | null;

interface ServerSendEnvelope {
  message: {
    id: string;
    status: SendMessageStatus;
  };
}

interface SendMessageResponse {
  /**
   * The send endpoint returns the new/existing message row wrapped in a
   * `{ message: ... }` envelope (matches SendMessageResponseSchema).
   * The outbox drain only needs the server-assigned id; other fields are
   * already reflected in the cached_messages row via the upsert path.
   */
  id: string;
  message?: {
    id: string;
    status: SendMessageStatus;
  };
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

  /**
   * Outbox drain endpoint. Signature matches drainOutbox expectations.
   * Plan 09: request carries idempotencyKey + mediaKey in the JSON body
   * (server accepts the header version as fallback for older clients).
   */
  sendMessage: async (args: SendMessageArgs): Promise<SendMessageResponse> => {
    const raw = await request<ServerSendEnvelope>(
      'POST',
      `/api/mobile/conversations/${encodeURIComponent(args.conversationId)}/messages`,
      {
        idempotencyKey: args.idempotencyKey,
        body: args.body,
        mediaKey: args.mediaKey,
        mediaType: args.mediaType,
        templateName: args.templateName,
        templateVariables: args.templateVariables,
      }
    );
    const msg = raw?.message;
    if (!msg || typeof msg.id !== 'string') {
      throw new MobileApiError(500, raw, 'Server returned malformed send response');
    }
    return { id: msg.id, message: msg };
  },
};
