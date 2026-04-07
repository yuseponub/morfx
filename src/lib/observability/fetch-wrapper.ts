/**
 * Universal fetch wrapper for the production observability module.
 *
 * Wraps a `fetch`-compatible function and, when an
 * `ObservabilityCollector` is active in the AsyncLocalStorage context,
 * captures every HTTP call made through it. Two flavors:
 *
 *   - `kind: 'supabase'` — parses the PostgREST URL/body/headers and
 *     pushes an `ObservabilityQuery` into the collector via
 *     `recordQuery`.
 *   - `kind: 'anthropic'` — STUB. Plan 04 will replace this with the
 *     full `recordAiCall` flow (token counts, prompt version, cost
 *     estimate). Until then we only record a coarse `ai_call_raw`
 *     event so the timeline still shows the call happened.
 *
 * Design rules (verified in 42.1-RESEARCH.md, Pattern 2 + Pitfall 1):
 *
 *   1. **Fast-path when no collector.** If `getCollector()` returns
 *      null (feature flag OFF or no turn in scope) the wrapper just
 *      forwards to the underlying fetch with literally one extra
 *      function call. Zero parsing, zero allocations.
 *
 *   2. **Never throws from instrumentation.** Errors raised by the
 *      original fetch are re-thrown unchanged after being recorded.
 *      Bugs inside the wrapper itself must not corrupt the production
 *      agent path (REGLA 6).
 *
 *   3. **No import from ./index.** We import `getCollector` directly
 *      from `./context` to avoid a circular module graph between the
 *      barrel and the consumers wired by the supabase admin client.
 */

import { getCollector } from './context'
import type { ParsedQuery } from './collector'
import type { ObservabilityQuery } from './types'

/** Which underlying client this wrapper instruments. */
export type FetchKind = 'supabase' | 'anthropic'

/**
 * Parse a PostgREST URL + method + body into the structured shape
 * expected by `ObservabilityCollector.recordQuery`.
 *
 * Implementation notes:
 *
 *   - Uses native `new URL()` so encoded filter values are decoded
 *     correctly (Pitfall 3).
 *   - The PostgREST path convention is
 *     `/rest/v1/<table>` for normal table operations and
 *     `/rest/v1/rpc/<fn>` for stored procedure calls.
 *   - `select=` is split into a `string[]` of column names so the UI
 *     can render them as chips. All other search params become entries
 *     in `filters`.
 *   - Method → operation mapping mirrors the PostgREST verb table.
 */
export function parsePostgrestUrl(
  url: string,
  method: string,
  body: BodyInit | null | undefined,
): ParsedQuery {
  let pathname = ''
  const searchParams = new URLSearchParams()
  try {
    const u = new URL(url)
    pathname = u.pathname
    u.searchParams.forEach((v, k) => searchParams.append(k, v))
  } catch {
    // Malformed URL — fall through to "unknown" defaults below.
  }

  // /rest/v1/<table> or /rest/v1/rpc/<fn>
  const match = pathname.match(/\/rest\/v1\/(rpc\/)?([^/?]+)/)
  const isRpc = !!match?.[1]
  const tableName = match?.[2] ?? 'unknown'

  const filters: Record<string, string> = {}
  let columns: string[] | null = null
  searchParams.forEach((v, k) => {
    if (k === 'select') {
      columns = v
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    } else {
      filters[k] = v
    }
  })

  const upper = method.toUpperCase()
  const operation: ObservabilityQuery['operation'] = isRpc
    ? 'rpc'
    : upper === 'GET'
      ? 'select'
      : upper === 'POST'
        ? 'insert'
        : upper === 'PATCH'
          ? 'update'
          : upper === 'PUT'
            ? 'upsert'
            : upper === 'DELETE'
              ? 'delete'
              : 'unknown'

  let requestBody: unknown = null
  if (body != null) {
    if (typeof body === 'string') {
      try {
        requestBody = JSON.parse(body)
      } catch {
        requestBody = body
      }
    }
    // Non-string bodies (Blob, FormData, ArrayBuffer, ReadableStream)
    // are intentionally left as null — the supabase-js client always
    // sends JSON strings for table operations, so this only happens
    // for edge cases we do not need to capture.
  }

  return { tableName, operation, filters, columns, requestBody }
}

/**
 * Read the PostgREST `Content-Range` header and return the total row
 * count. Format: `<start>-<end>/<total>` where `<total>` is either an
 * integer or `*` (server didn't compute the total).
 */
export function rowCountFromContentRange(response: Response): number | undefined {
  const header = response.headers.get('content-range')
  if (!header) return undefined
  const slash = header.lastIndexOf('/')
  if (slash === -1) return undefined
  const totalRaw = header.slice(slash + 1)
  if (totalRaw === '*' || totalRaw === '') return undefined
  const total = Number.parseInt(totalRaw, 10)
  return Number.isFinite(total) ? total : undefined
}

/** Resolve a `RequestInfo | URL` argument into a plain string URL. */
function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

/** Resolve the HTTP method from `init` or a `Request` instance. */
function resolveMethod(input: RequestInfo | URL, init: RequestInit | undefined): string {
  if (init?.method) return init.method
  if (typeof input !== 'string' && !(input instanceof URL)) return input.method ?? 'GET'
  return 'GET'
}

/**
 * Build an instrumented `fetch` function. Pass the result to
 * `createClient(..., { global: { fetch } })` (Supabase) or
 * `new Anthropic({ fetch })` (Anthropic).
 *
 * The factory is pure — it captures `originalFetch` and `kind` in a
 * closure. No module-level state.
 */
export function makeObservableFetch(
  originalFetch: typeof fetch = fetch,
  kind: FetchKind,
): typeof fetch {
  return async function observableFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const collector = getCollector()
    // Fast path: no active turn → behave exactly like the underlying
    // fetch with zero overhead beyond this null check.
    if (!collector) return originalFetch(input, init)

    const startedAt = performance.now()
    const url = resolveUrl(input)
    const method = resolveMethod(input, init)

    try {
      const response = await originalFetch(input, init)
      const durationMs = performance.now() - startedAt

      if (kind === 'supabase') {
        const parsed = parsePostgrestUrl(url, method, init?.body)
        const rowCount = rowCountFromContentRange(response)
        const errorMsg = response.status >= 400 ? `HTTP ${response.status}` : undefined
        collector.recordQuery(parsed, durationMs, response.status, rowCount, errorMsg)
      } else {
        // TODO(plan-04): replace with full recordAiCall including
        // prompt version resolution, token counts, cost estimate, and
        // response content capture. For now we only mark that an AI
        // call happened so the timeline is not blank.
        collector.recordEvent(
          'tool_call',
          'ai_call_raw',
          {
            url,
            method,
            statusCode: response.status,
          },
          durationMs,
        )
      }

      return response
    } catch (err) {
      const durationMs = performance.now() - startedAt
      const error = err instanceof Error ? err : new Error(String(err))
      collector.recordError({
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
      // Also surface the failed call in the appropriate bag so the
      // turn timeline shows where it died.
      if (kind === 'supabase') {
        const parsed = parsePostgrestUrl(url, method, init?.body)
        collector.recordQuery(parsed, durationMs, 0, undefined, error.message)
      } else {
        collector.recordEvent(
          'error',
          'ai_call_failed',
          {
            url,
            method,
            error: error.message,
          },
          durationMs,
        )
      }
      throw err
    }
  }
}
