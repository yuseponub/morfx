// ============================================================================
// Standalone debounce-interruption-system-v2 — D-09 layer 3 + LOCK-06.
// Sweeps orphaned `lock:*` keys whose owning session is no longer active.
// Defense against silly bugs (try/finally bypass via OOM kill / lambda timeout).
// Cron: TZ=America/Bogota */5 * * * *  (every 5 minutes)
//
// REVISION B1: implements D-09 verbatim — compares against agent_sessions.status='active'.
// The schema uses `status` (NOT `ended_at`) — verified during revision:
//   supabase/migrations/20260205000000_agent_sessions.sql line 14:
//     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed', 'handed_off'))
//
// Lock key shape (Plan 01): lock:<workspaceId>:<channel>:<identifier>
//   - channel: 'whatsapp' | 'facebook' | 'instagram' (per conversations.channel)
//   - identifier: phone (whatsapp) OR external_subscriber_id (facebook | instagram)
//
// Pattern source: crm-mutation-idempotency-cleanup.ts (TZ=America/Bogota cron pattern).
// ============================================================================

import { inngest } from '@/inngest/client'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('v2-lock-cleanup-cron')

/**
 * Max age (seconds) before a lock is considered stale even if its owning
 * session is technically `status='active'`. Real v4 turns rarely exceed 30s;
 * 60s is defense-in-depth against try/finally bypass (OOM kill / lambda
 * timeout that prevented the finally block from running).
 */
const MAX_TURN_AGE_S = 60

/** Parsed lock key shape: lock:<workspaceId>:<channel>:<identifier>. */
interface ParsedLockKey {
  raw: string
  workspaceId: string
  channel: 'whatsapp' | 'facebook' | 'instagram'
  identifier: string
}

/**
 * Parse a `lock:*` key into its 3 structural components.
 *
 * Identifier MAY contain ':' (some external_subscriber_id formats), so we
 * conservatively split on the FIRST 3 colons and re-join the rest. Returns
 * null on malformed keys (4+ parts required, second part must be a valid
 * channel value).
 */
function parseLockKey(raw: string): ParsedLockKey | null {
  const parts = raw.split(':')
  if (parts.length < 4 || parts[0] !== 'lock') return null
  const workspaceId = parts[1]
  const channel = parts[2] as 'whatsapp' | 'facebook' | 'instagram'
  const identifier = parts.slice(3).join(':')
  if (!['whatsapp', 'facebook', 'instagram'].includes(channel)) return null
  if (!workspaceId || !identifier) return null
  return { raw, workspaceId, channel, identifier }
}

/**
 * Daily 5-minute cron — sweeps orphaned lock:* keys.
 *
 * D-09 layer 3 sweep heuristic:
 *   1. SCAN all `lock:*` keys (cursor-paginated; safer than KEYS for large sets).
 *   2. Parse + collect distinct workspaceIds.
 *   3. Query `agent_sessions` for status='active' rows in those workspaces,
 *      joined with `conversations.channel + phone + external_subscriber_id` so we
 *      can derive the expected lock-key shape per active session.
 *   4. Sweep ANY lock whose key is NOT in the active-session set
 *      (`reason='no_active_session'`).
 *   5. Defense-in-depth: ALSO sweep locks whose `started_at` is older than
 *      MAX_TURN_AGE_S even if their session is active
 *      (`reason='stale_age'`). Catches try/finally bypass.
 *   6. Malformed values are swept (`reason='malformed_value'`).
 *
 * All sweeps emit `lock_orphan_swept_by_cron` (the 14th LockEventLabel, added
 * in Plan 01 REVISION B1).
 *
 * Result encoded in step.run return value so Inngest replay boundaries
 * serialize the captured numbers (Inngest step.run pattern).
 */
export const v2LockCleanupCron = inngest.createFunction(
  {
    id: 'debounce-v2-lock-cleanup',
    name: 'debounce-v2: Lock Cleanup (orphans)',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota */5 * * * *' },
  async ({ step }) => {
    const result = await step.run('sweep-orphaned-locks', async () => {
      // 1. Enumerate all lock:* keys via SCAN (cursor-paginated; NEVER use KEYS
      //    which is O(N) and blocks the Redis instance for large sets).
      const lockKeys: string[] = []
      let cursor: string | number = 0
      do {
        const [nextCursor, batch] = (await redis.scan(cursor, {
          match: 'lock:*',
          count: 200,
        })) as [string, string[]]
        lockKeys.push(...batch)
        cursor =
          typeof nextCursor === 'string' ? Number.parseInt(nextCursor, 10) : nextCursor
      } while (cursor !== 0)

      if (lockKeys.length === 0) {
        return {
          swept: 0,
          kept: 0,
          errors: 0,
          scanned: 0,
          active_sessions_checked: 0,
        }
      }

      // 2. Parse keys + collect distinct workspaceIds for the agent_sessions query.
      const parsed: ParsedLockKey[] = []
      const malformedKeys: string[] = []
      for (const k of lockKeys) {
        const p = parseLockKey(k)
        if (p) {
          parsed.push(p)
        } else {
          malformedKeys.push(k)
          logger.warn({ lockKey: k }, 'malformed lock key — will sweep')
        }
      }
      const workspaceIds = [...new Set(parsed.map((p) => p.workspaceId))]

      // 3. D-09 verbatim: fetch active agent_sessions for these workspaces
      //    joined with conversations(channel, phone, external_subscriber_id) so we
      //    can derive the expected lock-key shape per active session.
      const supabase = createAdminClient()
      const { data: activeSessions, error: sessErr } =
        workspaceIds.length > 0
          ? await supabase
              .from('agent_sessions')
              .select(
                `id, workspace_id, status, conversation:conversations!inner(channel, phone, external_subscriber_id)`,
              )
              .in('workspace_id', workspaceIds)
              .eq('status', 'active')
          : { data: [], error: null }

      if (sessErr) {
        logger.error(
          { err: sessErr.message },
          'agent_sessions query failed — skip sweep this run',
        )
        return {
          swept: 0,
          kept: 0,
          errors: 1,
          scanned: lockKeys.length,
          active_sessions_checked: 0,
          query_error: sessErr.message,
        }
      }

      // 4. Build the set of "lock keys backed by an active session" so we can
      //    sweep the rest.
      const activeLockKeys = new Set<string>()
      for (const s of activeSessions ?? []) {
        // conversation may be array (PostgREST relational select) or object;
        // handle both forms defensively.
        const convRaw = (s as { conversation: unknown }).conversation
        const conv = (Array.isArray(convRaw) ? convRaw[0] : convRaw) as
          | {
              channel: 'whatsapp' | 'facebook' | 'instagram'
              phone: string | null
              external_subscriber_id: string | null
            }
          | undefined
        if (!conv) continue
        const ch = conv.channel
        const id = ch === 'whatsapp' ? conv.phone : conv.external_subscriber_id
        if (!id) continue
        activeLockKeys.add(`lock:${(s as { workspace_id: string }).workspace_id}:${ch}:${id}`)
      }

      // 5. Sweep malformed keys first (cannot be reconciled with a session).
      let swept = 0
      let kept = 0
      let errors = 0
      for (const k of malformedKeys) {
        try {
          await redis.del(k)
          emitLockEvent('lock_orphan_swept_by_cron', {
            lock_key: k,
            reason: 'malformed_value',
            workspaceId: null,
          })
          swept++
        } catch (err) {
          logger.error(
            {
              lockKey: k,
              err: err instanceof Error ? err.message : String(err),
            },
            'lock sweep error (malformed)',
          )
          errors++
        }
      }

      // 6. Sweep parsed keys: any lock NOT in activeLockKeys is orphaned. ALSO
      //    sweep "active-but-old" locks where started_at exceeds MAX_TURN_AGE_S
      //    (defense-in-depth — try/finally bypass).
      for (const p of parsed) {
        try {
          const raw = await redis.get<string | Record<string, unknown>>(p.raw)
          if (raw === null || raw === undefined) {
            // already gone (TTL beat us)
            continue
          }

          let parsedVal: {
            holder_uuid?: string
            started_at?: string
            has_sent_anything?: boolean
          } = {}
          let valueMalformed = false
          try {
            parsedVal =
              typeof raw === 'string'
                ? JSON.parse(raw)
                : (raw as typeof parsedVal)
          } catch {
            valueMalformed = true
          }

          if (valueMalformed) {
            await redis.del(p.raw)
            emitLockEvent('lock_orphan_swept_by_cron', {
              lock_key: p.raw,
              reason: 'malformed_value',
              workspaceId: p.workspaceId,
            })
            swept++
            continue
          }

          const ageMs = parsedVal.started_at
            ? Date.now() - Date.parse(parsedVal.started_at)
            : Number.POSITIVE_INFINITY
          const isInActiveSet = activeLockKeys.has(p.raw)
          const isStale = ageMs > MAX_TURN_AGE_S * 1000

          if (!isInActiveSet || isStale) {
            await redis.del(p.raw)
            emitLockEvent('lock_orphan_swept_by_cron', {
              lock_key: p.raw,
              reason: !isInActiveSet ? 'no_active_session' : 'stale_age',
              workspaceId: p.workspaceId,
              holder_uuid: parsedVal.holder_uuid ?? null,
              age_ms: Number.isFinite(ageMs) ? ageMs : null,
            })
            swept++
          } else {
            kept++
          }
        } catch (err) {
          logger.error(
            {
              lockKey: p.raw,
              err: err instanceof Error ? err.message : String(err),
            },
            'lock sweep error',
          )
          errors++
        }
      }

      return {
        swept,
        kept,
        errors,
        scanned: lockKeys.length,
        active_sessions_checked: activeLockKeys.size,
      }
    })

    logger.info(
      { ...result, cronRunAt: new Date().toISOString() },
      'v2-lock-cleanup-cron complete',
    )
    return result
  },
)
