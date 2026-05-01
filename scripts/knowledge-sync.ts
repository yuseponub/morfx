#!/usr/bin/env tsx
/**
 * CLI para `pnpm knowledge:sync` (D-55).
 * Pre-PR / dev local. Para auto-sync post-deploy ver Plan 09 (Inngest function).
 *
 * Uso:
 *   pnpm knowledge:sync
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { syncKbDoc } from '@/lib/agents/somnio-v4/knowledge-base/sync'

const KB_ROOT = path.resolve(process.cwd(), 'src/lib/agents/somnio-v4/knowledge')

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

async function main() {
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

main().catch((err) => {
  console.error('[knowledge:sync] fatal:', err)
  process.exit(1)
})
