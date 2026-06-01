#!/usr/bin/env tsx
/**
 * scripts/reembed-kb-v4.ts
 * Standalone: ui-agent-content-editor / Plan 02 Task 3.
 *
 * RE-EMBED de UNA sola vez de los 18 topics de somnio-sales-v4, usando el
 * serializador canonico `buildContentToEmbed` (Plan 01). Esto hace que TODOS los
 * embeddings legacy + futuros provengan de la MISMA funcion (RESEARCH Pitfall 1 / A1):
 * la equivalencia byte-a-byte con los embeddings derivados de .md es IMPOSIBLE
 * (el parser es lossy), asi que re-embebemos los 18 topics una vez de forma deliberada.
 *
 * ORDEN OBLIGATORIO (Regla 5):
 *   1. El usuario aplica supabase/migrations/20260601100000_kb_scope_summary.sql en Studio
 *      (agrega la columna scope_summary + backfill de los 18 valores).
 *   2. RECIEN ENTONCES se corre este script (lee scope_summary ya poblado de la fila).
 *   Correr esto ANTES de aplicar la migracion produciria embeddings sin scope_summary.
 *
 * Regla 3 (excepcion CLI): este archivo vive en scripts/ (no en src/app/** ni domain),
 *   misma clase de excepcion que scripts/knowledge-sync.ts — puede usar createAdminClient.
 * Regla 6: filtra y actualiza UNICAMENTE filas agent_id='somnio-sales-v4' del workspace
 *   Somnio. v4 esta DORMANT en prod (0 trafico) — re-embeber es seguro, impacto cliente = 0.
 *
 * Uso (UNA vez, despues de la migracion):
 *   npx tsx scripts/reembed-kb-v4.ts
 *   (requiere OPENAI_API_KEY_SALESV4 o OPENAI_API_KEY en el entorno)
 */
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildContentToEmbed } from '@/lib/agents/somnio-v4/knowledge-base/serialize'
import { generateEmbedding } from '@/lib/agents/somnio-v4/knowledge-base/embed'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from '@/lib/agents/somnio-v4/config'

interface KbRow {
  id: string
  topic: string
  scope_summary: string | null
  hechos_del_producto: string | null
  posicion_del_negocio: string | null
  debe_contener: string[] | null
  nunca_decir: string[] | null
  cuando_escalar: string[] | null
}

async function main() {
  console.log('========================================================================')
  console.log('[reembed-kb-v4] Run ONCE after migration 20260601100000 applied.')
  console.log('[reembed-kb-v4] v4 is DORMANT — safe.')
  console.log('========================================================================')

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('agent_knowledge_base')
    .select(
      'id, topic, scope_summary, hechos_del_producto, posicion_del_negocio, debe_contener, nunca_decir, cuando_escalar'
    )
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('workspace_id', SOMNIO_WORKSPACE_ID)

  if (error) {
    console.error('[reembed-kb-v4] FATAL fetch error:', error.message)
    process.exit(1)
  }

  const rows = (data ?? []) as KbRow[]
  if (rows.length === 0) {
    console.error(
      '[reembed-kb-v4] No rows for somnio-sales-v4 in workspace Somnio. Did the migration/seed run?'
    )
    process.exit(1)
  }

  console.log(`[reembed-kb-v4] ${rows.length} topics found. Re-embedding each...`)

  let ok = 0
  let skippedDegenerate = 0
  let failed = 0

  for (const row of rows) {
    // Guard: si TODO el contenido fuente esta vacio, el embedding seria degenerado.
    // Reportar el topic y continuar con el resto (no crashear toda la corrida).
    const debeContener = row.debe_contener ?? []
    const nuncaDecir = row.nunca_decir ?? []
    const cuandoEscalar = row.cuando_escalar ?? []
    const allEmpty =
      !(row.scope_summary && row.scope_summary.trim().length > 0) &&
      !(row.hechos_del_producto && row.hechos_del_producto.trim().length > 0) &&
      !(row.posicion_del_negocio && row.posicion_del_negocio.trim().length > 0) &&
      debeContener.length === 0 &&
      nuncaDecir.length === 0 &&
      cuandoEscalar.length === 0

    if (allEmpty) {
      console.warn(
        `[reembed-kb-v4] ⚠ ${row.topic} → SKIPPED (all content columns empty; would produce a degenerate embedding)`
      )
      skippedDegenerate++
      continue
    }

    try {
      const contentToEmbed = buildContentToEmbed({
        scope_summary: row.scope_summary,
        hechos_del_producto: row.hechos_del_producto,
        posicion_del_negocio: row.posicion_del_negocio,
        debe_contener: debeContener,
        nunca_decir: nuncaDecir,
        cuando_escalar: cuandoEscalar,
      })

      const bodyHash = createHash('sha256').update(contentToEmbed).digest('hex')
      const embedding = await generateEmbedding(contentToEmbed)

      const { error: updErr } = await supabase
        .from('agent_knowledge_base')
        .update({
          embedding,
          body_hash: bodyHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('agent_id', SOMNIO_V4_AGENT_ID)
        .eq('workspace_id', SOMNIO_WORKSPACE_ID)

      if (updErr) {
        console.error(`[reembed-kb-v4] ✗ ${row.topic} → UPDATE failed: ${updErr.message}`)
        failed++
        process.exitCode = 1
        continue
      }

      console.log(`[reembed-kb-v4] ✓ ${row.topic} → re-embedded (hash ${bodyHash.slice(0, 12)}…)`)
      ok++
    } catch (err) {
      console.error(`[reembed-kb-v4] ✗ ${row.topic} → ${(err as Error).message}`)
      failed++
      process.exitCode = 1
    }
  }

  console.log('========================================================================')
  console.log(
    `[reembed-kb-v4] done: re-embedded=${ok} skipped_degenerate=${skippedDegenerate} failed=${failed} (of ${rows.length})`
  )
  console.log('========================================================================')
}

main().catch((err) => {
  console.error('[reembed-kb-v4] fatal:', err)
  process.exit(1)
})
