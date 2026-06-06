// ── Output schema (verbatim RESEARCH.md §Schema — D-07/D-08/D-09/D-10/D-11) ──
// One file per chat, named <number>.json (or <lid>.json if numberMissing).
export interface ChatBackup {
  schemaVersion: 1
  chatId: string                 // raw JID e.g. "573162814531@c.us" or "...@lid"
  number: string | null          // resolved digits, null if unresolved (D-05)
  numberMissing: boolean         // D-05 flag
  contactName: string | null     // pushname / saved name (best-effort, never identity-authoritative)
  archived: boolean              // D-02
  business: {                    // D-08: who is "me" — the migrated business number
    number: string               // own WA number, captured once at session start from WPP.conn / WPP.profile
    name: string | null
  }
  messageCount: number
  scrapedAt: string              // ISO, America/Bogota
  messages: BackupMessage[]
}

// ── Per-message record (business vs client disambiguation, D-08/D-09/D-10) ──
export interface BackupMessage {
  fromMe: boolean                // D-08/D-09 — business vs client disambiguation
  timestamp: string             // D-09 — normalized America/Bogota, e.g. "2026-06-06 14:32:10 -05:00"
  text: string | null           // null for non-text (D-10)
  type: string                  // 'chat' for text; 'image'|'ptt'|'audio'|'video'|'document'|'sticker'|'vcard'|'location'|...
  note?: string                 // D-10 placeholder text for non-text, e.g. "<imagen omitida>"
}

// ── Manifest index + per-chat checkpoint (D-11 three-state resume) ──
export interface Manifest {
  number: string                 // the client/business number this backup folder belongs to
  startedAt: string
  updatedAt: string
  threshold: number              // D-06 effective null-rate threshold used this run
  chats: Record<string /*chatId*/, {
    file: string                 // "573162814531.json"
    status: 'pending' | 'done' | 'failed'
    number: string | null
    numberMissing: boolean
    messageCount: number
    updatedAt: string
    error?: string
  }>
}
