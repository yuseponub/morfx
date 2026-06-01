#!/usr/bin/env tsx
/**
 * CLI para `pnpm knowledge:sync` (D-55).
 * Pre-PR / dev local. Para auto-sync post-deploy ver Plan 09 (Inngest function).
 *
 * Uso:
 *   pnpm knowledge:sync          # inicial-import-only (aborta si la DB ya tiene v4)
 *   pnpm knowledge:sync --force  # re-seed intencional (sobrescribe la DB con .md)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GUARD D-01 / Pitfall 4 (standalone ui-agent-content-editor):              │
 * │   Desde D-01 la BASE DE DATOS es la FUENTE DE VERDAD del KB de            │
 * │   somnio-sales-v4 — la UI edita las filas in-place y re-embeddea al       │
 * │   guardar. Este script camina los `.md` del repo y haria UPSERT a         │
 * │   `agent_knowledge_base`, SOBRESCRIBIENDO las ediciones de la UI con      │
 * │   `.md` viejos. Por eso ahora es initial-import-only: si la DB ya tiene   │
 * │   filas v4, aborta (exit 1) salvo que pases `--force` (re-seed            │
 * │   intencional). El equivalente async (Inngest knowledge-sync-v4.ts) se    │
 * │   mantiene apagado por defecto via platform_config.                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { syncKbDoc } from '@/lib/agents/somnio-v4/knowledge-base/sync'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SOMNIO_V4_AGENT_ID,
  SOMNIO_WORKSPACE_ID,
} from '@/lib/agents/somnio-v4/config'

const KB_ROOT = path.resolve(process.cwd(), 'src/lib/agents/somnio-v4/knowledge')

/**
 * Decisión pura del guard D-01 / Pitfall 4 (unit-tested en Plan 05 Task 4):
 *   abortar el sync cuando la DB ya tiene filas v4 (existingCount > 0) y NO se
 *   pasó `--force`. Con --force se procede (re-seed intencional); con DB vacía
 *   se procede (import inicial).
 */
export function shouldAbortSync(existingCount: number, force: boolean): boolean {
  return existingCount > 0 && !force
}

async function walkMd(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir).catch(() => [])
  for (const name of entries) {
    const full = path.join(dir, name)
    const st = await stat(full)
    if (st.isDirectory()) {
      out.push(...(await walkMd(full)))
    } else if (st.isFile() && name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Cuenta filas existentes de `agent_knowledge_base` para somnio-sales-v4 en el
 * workspace Somnio. Excepción Regla 3 aceptada: esto es un CLI bajo `scripts/`
 * (misma clase de excepción que el resto de este archivo) — no es app layer.
 */
async function countExistingV4Rows(): Promise<number> {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('agent_knowledge_base')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('workspace_id', SOMNIO_WORKSPACE_ID)
  if (error) throw new Error(`count agent_knowledge_base falló: ${error.message}`)
  return count ?? 0
}

async function main() {
  const force =
    process.argv.includes('--force') || process.argv.includes('--seed')

  // GUARD D-01 / Pitfall 4: chequear la DB ANTES de caminar los .md.
  const existingCount = await countExistingV4Rows()
  if (shouldAbortSync(existingCount, force)) {
    console.error('')
    console.error(
      '════════════════════════════════════════════════════════════════════════',
    )
    console.error('  ⛔ knowledge:sync ABORTADO (D-01 / Pitfall 4)')
    console.error(
      '════════════════════════════════════════════════════════════════════════',
    )
    console.error('')
    console.error(
      `  La BASE DE DATOS ya tiene ${existingCount} filas de KB para`,
    )
    console.error(`  '${SOMNIO_V4_AGENT_ID}' y es la FUENTE DE VERDAD (source of truth).`)
    console.error('')
    console.error('  Correr este sync SOBRESCRIBIRÍA las ediciones de la UI con los')
    console.error('  archivos .md (potencialmente viejos) del repositorio.')
    console.error('')
    console.error('  Si REALMENTE querés re-sembrar la DB desde los .md (re-seed')
    console.error('  intencional), volvé a correr con --force:')
    console.error('')
    console.error('      pnpm knowledge:sync --force')
    console.error('')
    console.error(
      '════════════════════════════════════════════════════════════════════════',
    )
    process.exit(1)
  }

  if (force && existingCount > 0) {
    console.log(
      '[knowledge:sync] --force: overwriting DB from .md (D-01 override)',
    )
  }

  console.log(`[knowledge:sync] root: ${KB_ROOT}`)
  const files = await walkMd(KB_ROOT)
  if (files.length === 0) {
    console.log('[knowledge:sync] (empty corpus — Plan 11 will populate)')
    return
  }
  console.log(`[knowledge:sync] processing ${files.length} files`)

  let ok = 0
  let fail = 0
  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf8')
      const r = await syncKbDoc(file, raw)
      console.log(`[knowledge:sync] ✓ ${path.relative(process.cwd(), file)} → ${r.action}`)
      ok++
    } catch (err) {
      console.error(`[knowledge:sync] ✗ ${path.relative(process.cwd(), file)}: ${(err as Error).message}`)
      fail++
      process.exitCode = 1
    }
  }
  console.log(`[knowledge:sync] done: ok=${ok} fail=${fail}`)
}

// Solo ejecuta main() cuando el archivo se corre como CLI (no cuando un test lo
// importa para probar `shouldAbortSync` — Plan 05 Task 4).
if (process.argv[1]?.endsWith('knowledge-sync.ts')) {
  main().catch((err) => {
    console.error('[knowledge:sync] fatal:', err)
    process.exit(1)
  })
}
