/**
 * Sandbox lock-result long-poll endpoint
 *
 * Standalone: debounce-v2-sandbox-integration / Plan 02 (D-07 + Pitfall 5).
 *
 * FOLLOWER UI long-polls este endpoint despues de recibir { deferred: true } de
 * /api/sandbox/process v4 branch. Bloqueamos server-side hasta 30s chequeando la
 * key Redis `sandbox-result:{sandboxSessionId}` (que el HOLDER engine escribe
 * BEFORE su finally block libera el lock — Pitfall 5). En hit, parse + DEL +
 * retornamos el resultado. En timeout, retornamos ready=false.
 *
 * Modulo interruption-system-v2/ NO modificado (D-15). Solo consumimos el
 * `redis` proxy ya exportado.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'

const POLL_INTERVAL_MS = 300
const POLL_TIMEOUT_MS = 30_000

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sandboxSessionId: string }> },
) {
  // Security: auth required (mirrors /api/sandbox/process)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { sandboxSessionId } = await ctx.params
  if (!sandboxSessionId) {
    return NextResponse.json({ error: 'sandboxSessionId required' }, { status: 400 })
  }

  const key = `sandbox-result:${sandboxSessionId}`
  const start = Date.now()

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    let raw: string | null = null
    try {
      raw = await redis.get<string>(key)
    } catch (err) {
      // Redis unavailable — return error immediately rather than poll-loop-on-failure.
      return NextResponse.json(
        { ready: false, error: 'Redis unavailable', message: err instanceof Error ? err.message : String(err) },
        { status: 503 },
      )
    }

    if (raw) {
      // Best-effort DEL — if it fails we still return the result; key has TTL 60s.
      try { await redis.del(key) } catch { /* ignore */ }
      try {
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw
        return NextResponse.json({ ready: true, result })
      } catch (parseErr) {
        return NextResponse.json(
          { ready: false, error: 'Invalid result payload', message: parseErr instanceof Error ? parseErr.message : String(parseErr) },
          { status: 500 },
        )
      }
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  return NextResponse.json({ ready: false, timeout: true }, { status: 200 })
}
