// ============================================================================
// Standalone whatsapp-history-importer — Plan 02 (T1)
// Helpers PUROS de mapeo origen (backup Etapa 1) → fila destino (domain).
// Sin I/O, sin DB, deterministas. Testeables sin entorno (map.test.ts).
//
// Clasificación de 3 buckets (RESEARCH §3.2 verbatim):
//   SYSTEM → skip ; TEXT_TYPE con texto → text ; MEDIA → text(body=note) ;
//   resto (TEXT_TYPE sin texto / desconocido) → skip.
// wamid sintético determinista 'import:<chatId>:<idx>' (D-01) = marcador de
// origen + llave de idempotencia.
// ============================================================================

import type { BackupMessage, ChatBackup } from '../../../robot-whatsapp-reader/src/types'

// ── Buckets (RESEARCH §3.2 verbatim) ───────────────────────────────────────
export const SYSTEM_TYPES = new Set<string>([
  'e2e_notification',
  'notification_template',
  'protocol',
  'revoked',
  'gp2',
  'unknown',
  'ciphertext',
  'call_log',
  'group_notification',
])

export const MEDIA_TYPES = new Set<string>([
  'image',
  'video',
  'audio',
  'ptt',
  'document',
  'sticker',
  'vcard',
  'multi_vcard',
  'location',
])

export const TEXT_TYPES = new Set<string>([
  'chat',
  'interactive',
  'automated_greeting_message',
])

/** Fila lista para `importHistoricalChat(...).messages` (estructuralmente compatible). */
export interface InsertMessageRow {
  wamid: string
  direction: 'inbound' | 'outbound'
  type: 'text'
  body: string
  timestamp: string
  status: 'read' | null
}

export interface ChatCounts {
  text: number
  media: number
  skippedSystem: number
  skippedNoText: number
}

export interface ChatPayload {
  phone: string
  contactName: string | null
  rows: InsertMessageRow[]
  counts: ChatCounts
}

/** ¿hay texto legible? (no-null, no-vacío tras trim). */
function hasText(m: BackupMessage): boolean {
  return typeof m.text === 'string' && m.text.trim() !== ''
}

/**
 * Clasifica un mensaje del backup en uno de 3 buckets (RESEARCH §3.2).
 * - system → 'skip' (D-04)
 * - TEXT_TYPE con texto → 'text' (body=text)
 * - MEDIA_TYPE → 'media' (D-03 → type='text', body=note)
 * - resto (TEXT_TYPE sin texto, o tipo desconocido) → 'skip' (ruido)
 */
export function classifyMessage(m: BackupMessage): 'text' | 'media' | 'skip' {
  if (SYSTEM_TYPES.has(m.type)) return 'skip'
  if (TEXT_TYPES.has(m.type) && hasText(m)) return 'text'
  if (MEDIA_TYPES.has(m.type)) return 'media'
  return 'skip'
}

/** wamid sintético determinista (D-01): 'import:<chatId>:<idx>'. */
export function synthWamid(chatId: string, idx: number): string {
  return `import:${chatId}:${idx}`
}

/**
 * Parsea el timestamp del backup ("yyyy-MM-dd HH:mm:ss -05:00", offset incluido)
 * a ISO UTC. El offset explícito hace que `new Date(...)` rinda el instante
 * correcto (RESEARCH §3.5). Retorna null si no parsea (robustez).
 */
export function parseBackupTimestamp(s: string): string | null {
  if (!s || typeof s !== 'string') return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * Mapea un mensaje del backup a una fila destino, o null si se salta
 * (classify='skip', o timestamp inválido).
 */
export function mapMessage(m: BackupMessage, chatId: string, idx: number): InsertMessageRow | null {
  const cls = classifyMessage(m)
  if (cls === 'skip') return null

  const timestamp = parseBackupTimestamp(m.timestamp)
  if (!timestamp) return null

  const body = cls === 'text' ? (m.text ?? '') : (m.note ?? '')

  return {
    wamid: synthWamid(chatId, idx),
    direction: m.fromMe ? 'outbound' : 'inbound',
    type: 'text',
    body,
    timestamp,
    status: m.fromMe ? 'read' : null,
  }
}

/**
 * Construye el payload de un chat: phone (D-08), contactName, filas mapeadas y
 * conteos reconciliables. `rows.length === counts.text + counts.media`.
 */
export function buildChatPayload(chat: ChatBackup): ChatPayload {
  const rows: InsertMessageRow[] = []
  const counts: ChatCounts = { text: 0, media: 0, skippedSystem: 0, skippedNoText: 0 }

  chat.messages.forEach((m, idx) => {
    const cls = classifyMessage(m)
    if (cls === 'skip') {
      if (SYSTEM_TYPES.has(m.type)) counts.skippedSystem++
      else counts.skippedNoText++
      return
    }
    const row = mapMessage(m, chat.chatId, idx)
    if (!row) {
      // text/media pero timestamp inválido → ruido (no se puede insertar).
      counts.skippedNoText++
      return
    }
    rows.push(row)
    if (cls === 'text') counts.text++
    else counts.media++
  })

  return {
    phone: `+${chat.number}`,
    contactName: chat.contactName,
    rows,
    counts,
  }
}
