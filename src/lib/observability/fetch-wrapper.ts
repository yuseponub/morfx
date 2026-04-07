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
 *   - `kind: 'anthropic'` — parses the Claude request body (system,
 *     messages, model, params), reads token usage and content blocks
 *     from a cloned response, and pushes an `ObservabilityAiCall` via
 *     `recordAiCall`. Streaming responses (SSE) are NOT consumed: the
 *     wrapper records a coarse `ai_call_streaming` event and returns
 *     the response untouched. Verified in 42.1-RESEARCH.md that
 *     production agents do not currently use streaming.
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

import { getCollector, getCurrentPurpose } from './context'
import type { ParsedQuery, RecordAiCallInput } from './collector'
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

// ---------------------------------------------------------------------------
// Anthropic capture helpers
// ---------------------------------------------------------------------------

/**
 * The Anthropic SDK accepts `system` either as a plain string OR as an
 * array of content blocks (each `{type: 'text', text: '...'}`, used for
 * prompt caching). Normalize both shapes into a single string so the
 * collector + prompt-version table only deal with one type.
 *
 * Unknown / non-text blocks are silently skipped — they are not part of
 * the dedup-able prompt content.
 */
export function normalizeSystemPrompt(system: unknown): string {
  if (system == null) return ''
  if (typeof system === 'string') return system
  if (Array.isArray(system)) {
    const parts: string[] = []
    for (const block of system) {
      if (
        block != null &&
        typeof block === 'object' &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string'
      ) {
        parts.push((block as { text: string }).text)
      }
    }
    return parts.join('\n')
  }
  return ''
}

/**
 * Detect a Server-Sent Events response that the SDK is going to stream
 * back to the caller. We must NOT call `.json()` on it (that would race
 * with the SDK's own consumer). The wrapper records a coarse event and
 * returns the response untouched.
 */
function isStreamingResponse(
  response: Response,
  requestBodyParsed: { stream?: unknown } | null,
): boolean {
  if (requestBodyParsed?.stream === true) return true
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('text/event-stream')
}

/** Defensively parse a request body that the Anthropic SDK serialised. */
function parseAnthropicRequestBody(
  body: BodyInit | null | undefined,
): Record<string, unknown> | null {
  if (body == null || typeof body !== 'string') return null
  try {
    const parsed = JSON.parse(body)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Shape of the Anthropic non-streaming response payload that we care
 * about. Everything is optional because we treat the body as untrusted
 * — a malformed body must never throw out of the wrapper.
 */
interface AnthropicResponseBody {
  content?: unknown
  stop_reason?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  error?: unknown
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
        // ----- Anthropic capture path ------------------------------
        const requestBodyParsed = parseAnthropicRequestBody(init?.body)
        const purpose = getCurrentPurpose() ?? 'unknown'

        // Streaming fast-path: cannot consume body, just mark it.
        if (isStreamingResponse(response, requestBodyParsed)) {
          collector.recordEvent(
            'tool_call',
            'ai_call_streaming',
            {
              url,
              model: requestBodyParsed?.model,
              purpose,
              statusCode: response.status,
            },
            durationMs,
          )
          return response
        }

        // Non-streaming: clone before reading so the SDK still owns
        // the original body.
        let responseBody: AnthropicResponseBody | null = null
        try {
          responseBody = (await response
            .clone()
            .json()
            .catch(() => null)) as AnthropicResponseBody | null
        } catch {
          responseBody = null
        }

        const systemPrompt = normalizeSystemPrompt(requestBodyParsed?.system)
        const model =
          typeof requestBodyParsed?.model === 'string'
            ? requestBodyParsed.model
            : 'unknown'
        const temperature =
          typeof requestBodyParsed?.temperature === 'number'
            ? requestBodyParsed.temperature
            : undefined
        const maxTokens =
          typeof requestBodyParsed?.max_tokens === 'number'
            ? requestBodyParsed.max_tokens
            : undefined
        const messages = Array.isArray(requestBodyParsed?.messages)
          ? requestBodyParsed.messages
          : []

        const usage = responseBody?.usage ?? {}
        const httpError =
          response.status >= 400
            ? `HTTP ${response.status}: ${
                responseBody?.error
                  ? JSON.stringify(responseBody.error)
                  : 'request failed'
              }`
            : undefined

        const recordInput: RecordAiCallInput = {
          purpose,
          systemPrompt,
          model,
          temperature,
          maxTokens,
          messages,
          responseContent: responseBody?.content,
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
          durationMs,
          statusCode: response.status,
          error: httpError,
        }
        collector.recordAiCall(recordInput)
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
