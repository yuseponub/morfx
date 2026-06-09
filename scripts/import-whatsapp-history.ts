/**
 * Standalone whatsapp-history-importer — Plan 02 (T3)
 * CLI para importar historiales de WhatsApp respaldados por Etapa 1 al inbox MorfX.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/import-whatsapp-history.ts \
 *     --backup robot-whatsapp-reader/output/573202067077 \
 *     --workspace <uuid> --phone-number-id <id> [--apply] [--limit N]
 *
 * Default = DRY-RUN (no escribe). `--apply` escribe vía el domain. `--limit N`
 * procesa solo los primeros N chats `done` (para el piloto, D-06).
 *
 * Regla 3: TODA la escritura pasa por `importHistoricalChat` (domain). CERO acceso
 * directo a Supabase desde este script (sin cliente admin ni SDK — verificable con grep).
 * El env (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) lo lee el domain
 * al instanciar su cliente admin → correr con `--env-file=.env.local` (Node ≥20).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importHistoricalChat } from '@/lib/domain/whatsapp-history-import'
import { buildChatPayload } from './lib/whatsapp-history/map'
import type { ChatBackup, Manifest } from '../robot-whatsapp-reader/src/types'

// ── Args ────────────────────────────────────────────────────────────────────
interface Args {
  backup: string
  workspace: string
  phoneNumberId: string
  apply: boolean
  limit: number | null
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined
  }
  const backup = get('--backup')
  const workspace = get('--workspace')
  const phoneNumberId = get('--phone-number-id')
  const apply = argv.includes('--apply')
  const limitRaw = get('--limit')
  const limit = limitRaw != null ? Number.parseInt(limitRaw, 10) : null

  const missing: string[] = []
  if (!backup) missing.push('--backup')
  if (!workspace) missing.push('--workspace')
  if (!phoneNumberId) missing.push('--phone-number-id')
  if (missing.length > 0) {
    console.error(`ERROR: faltan argumentos requeridos: ${missing.join(', ')}`)
    console.error(
      'Uso: npx tsx --env-file=.env.local scripts/import-whatsapp-history.ts ' +
        '--backup <dir> --workspace <uuid> --phone-number-id <id> [--apply] [--limit N]',
    )
    process.exit(1)
  }
  if (limit != null && (Number.isNaN(limit) || limit <= 0)) {
    console.error('ERROR: --limit debe ser un entero positivo')
    process.exit(1)
  }
  return { backup: backup!, workspace: workspace!, phoneNumberId: phoneNumberId!, apply, limit }
}

// ── Acumuladores del reporte ─────────────────────────────────────────────────
interface Report {
  chatsTotal: number
  chatsDone: number
  chatsPending: number
  chatsFailed: number
  chatsProcessed: number
  skippedMissing: string[] // chatIds sin número (D-02)
  errors: Array<{ chatId: string; error: string }>
  text: number
  media: number
  skippedSystem: number
  skippedNoText: number
  reconManifestMsgCount: number // Σ messageCount de chats procesados (manifest)
  // solo apply:
  contactsCreated: number
  contactsFound: number
  convosCreated: number
  convosMerged: number
  inserted: number
  duplicated: number
}

function emptyReport(): Report {
  return {
    chatsTotal: 0, chatsDone: 0, chatsPending: 0, chatsFailed: 0, chatsProcessed: 0,
    skippedMissing: [], errors: [],
    text: 0, media: 0, skippedSystem: 0, skippedNoText: 0, reconManifestMsgCount: 0,
    contactsCreated: 0, contactsFound: 0, convosCreated: 0, convosMerged: 0, inserted: 0, duplicated: 0,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const mode = args.apply ? 'APPLY (escribe en DB)' : 'DRY-RUN (no escribe)'
  console.log(`\n=== Import WhatsApp History — ${mode} ===`)
  console.log(`backup:        ${args.backup}`)
  console.log(`workspace:     ${args.workspace}`)
  console.log(`phoneNumberId: ${args.phoneNumberId}`)
  if (args.limit != null) console.log(`limit:         ${args.limit} chats done`)
  console.log('')

  // Manifest
  const manifestPath = join(args.backup, 'manifest.json')
  let manifest: Manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  } catch (e) {
    console.error(`ERROR leyendo manifest.json en ${manifestPath}: ${(e as Error).message}`)
    process.exit(1)
  }

  const r = emptyReport()
  const entries = Object.entries(manifest.chats)
  r.chatsTotal = entries.length
  for (const [, e] of entries) {
    if (e.status === 'done') r.chatsDone++
    else if (e.status === 'pending') r.chatsPending++
    else if (e.status === 'failed') r.chatsFailed++
  }

  let doneEntries = entries.filter(([, e]) => e.status === 'done')
  if (args.limit != null) doneEntries = doneEntries.slice(0, args.limit)

  const ctx = { workspaceId: args.workspace, source: 'history_import' as const }

  for (const [chatId, entry] of doneEntries) {
    const chatPath = join(args.backup, entry.file)
    let chat: ChatBackup
    try {
      chat = JSON.parse(readFileSync(chatPath, 'utf8')) as ChatBackup
    } catch (e) {
      r.errors.push({ chatId, error: `no se pudo leer ${entry.file}: ${(e as Error).message}` })
      continue
    }

    // D-02: número ausente → SKIP + alerta. NUNCA importar, NUNCA inventar número.
    if (chat.numberMissing || chat.number == null) {
      r.skippedMissing.push(chatId)
      continue
    }

    const payload = buildChatPayload(chat)
    r.text += payload.counts.text
    r.media += payload.counts.media
    r.skippedSystem += payload.counts.skippedSystem
    r.skippedNoText += payload.counts.skippedNoText
    r.reconManifestMsgCount += chat.messages.length
    r.chatsProcessed++

    if (!args.apply) continue // dry-run: solo acumular conteos proyectados

    const res = await importHistoricalChat(ctx, {
      phone: payload.phone,
      phoneNumberId: args.phoneNumberId,
      contactName: payload.contactName,
      messages: payload.rows,
    })
    if (!res.success || !res.data) {
      r.errors.push({ chatId, error: res.error ?? 'error desconocido' })
      continue
    }
    if (res.data.contactCreated) r.contactsCreated++
    else r.contactsFound++
    if (res.data.conversationCreated) r.convosCreated++
    else r.convosMerged++
    r.inserted += res.data.messagesInserted
    r.duplicated += res.data.messagesDuplicated
  }

  printReport(args, r)
}

function printReport(args: Args, r: Report) {
  const mapped = r.text + r.media
  const skipped = r.skippedSystem + r.skippedNoText
  const reconSum = mapped + skipped

  console.log('────────────────────────────────────────────────────')
  console.log('REPORTE')
  console.log('────────────────────────────────────────────────────')
  console.log(`Chats en manifest:   ${r.chatsTotal}  (done=${r.chatsDone}, pending=${r.chatsPending}, failed=${r.chatsFailed})`)
  console.log(`Chats procesados:    ${r.chatsProcessed}${args.limit != null ? ` (limit ${args.limit})` : ''}`)
  console.log(`Saltados (sin número, D-02): ${r.skippedMissing.length}`)
  if (r.skippedMissing.length > 0) {
    for (const id of r.skippedMissing.slice(0, 20)) console.log(`   ⚠ ${id}`)
    if (r.skippedMissing.length > 20) console.log(`   … (+${r.skippedMissing.length - 20} más)`)
  }
  console.log(`Chats con error:     ${r.errors.length}`)
  for (const e of r.errors.slice(0, 20)) console.log(`   ✗ ${e.chatId}: ${e.error}`)
  if (r.errors.length > 20) console.log(`   … (+${r.errors.length - 20} más)`)

  console.log('')
  console.log('Mensajes:')
  if (args.apply) {
    console.log(`   insertados:        ${r.inserted}`)
    console.log(`   duplicados:        ${r.duplicated}  (idempotencia: ya existían)`)
  } else {
    console.log(`   insertables (proy): ${mapped}  (text=${r.text}, media=${r.media})`)
  }
  console.log(`   saltados (system):  ${r.skippedSystem}`)
  console.log(`   saltados (no-texto):${r.skippedNoText}`)

  if (args.apply) {
    console.log('')
    console.log('Contactos:     creados=' + r.contactsCreated + '  encontrados=' + r.contactsFound)
    console.log('Conversaciones: creadas=' + r.convosCreated + '  mergeadas=' + r.convosMerged)
  }

  console.log('')
  console.log('Reconciliación vs manifest (chats procesados):')
  console.log(`   Σ counts (text+media+skipSystem+skipNoText) = ${reconSum}`)
  console.log(`   Σ messageCount (manifest)                   = ${r.reconManifestMsgCount}`)
  if (reconSum === r.reconManifestMsgCount) {
    console.log('   ✓ CUADRA')
  } else {
    console.log(`   ✗ DELTA = ${reconSum - r.reconManifestMsgCount} — revisar clasificación antes de --apply`)
  }
  console.log('────────────────────────────────────────────────────')
  if (!args.apply) {
    console.log('DRY-RUN: no se escribió nada. Repetir con --apply (y --limit para el piloto) para escribir.')
  }
  console.log('')
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
