// src/chat-scraper.ts — full-history extraction + normalize to the D-09/D-10 schema.
//
// DEVIATION from robot-godentist / scripts/kommo-scraper.ts (PATTERNS §chat-scraper, lines 207-226):
// the kommo analog walks the DOM + diffs node lists after each viewport move. That whole mechanic
// is the #1 silent-data-loss trap here (RESEARCH Pitfall 1): WhatsApp Web VIRTUALIZES the message
// list, so off-screen rows unmount from the DOM and a viewport-walk loop DROPS messages permanently.
// We instead pull the FULL history from the in-memory Store in ONE call (see scrapeMessages below).
// We REUSE only the kommo "good parts": the typed-return shape + return-on-empty control flow.
//
// DEVIATION (PATTERNS line 226 + RESEARCH Pitfall 7): timestamps are normalized with date-fns-tz
// (Regla 2), NOT naive native Date string formatting. Store `m.t` is unix-SECONDS UTC, so naive
// formatting would silently use the runner's local tz and shift every message by the offset.
//
// READ-ONLY (D-15): this file contains NO message-emitting path whatsoever and never asks the
// network for a phone number. It only reads the Store. Strictly read-only.
import { formatInTimeZone } from 'date-fns-tz'
import type { Page } from 'playwright'
import type { BackupMessage, ChatBackup } from './types.js'

const TZ = 'America/Bogota'

/**
 * Raw message shape returned from inside the page (the Store, via wa-js). Node-side normalize()
 * turns each of these into a BackupMessage.
 */
export interface RawMsg {
  id: string
  fromMe: boolean
  t: number // unix SECONDS UTC (RESEARCH Pitfall 7)
  type: string // 'chat'|'image'|'ptt'|'audio'|'video'|'document'|'sticker'|'vcard'|'location'|...
  body: string | null
}

/**
 * D-10 placeholder map for non-text message types (no file is ever downloaded — D-10).
 * (RESEARCH lines 447-451, VERBATIM.)
 */
const PLACEHOLDER: Record<string, string> = {
  image: '<imagen omitida>',
  video: '<video omitido>',
  audio: '<audio omitido>',
  ptt: '<nota de voz omitida>',
  document: '<documento omitido>',
  sticker: '<sticker omitido>',
  vcard: '<contacto omitido>',
  location: '<ubicación omitida>',
}

/**
 * Pattern 4 (RESEARCH lines 246-256, VERBATIM): pull the FULL history from the Store in ONE call.
 *
 * DEVIATION (RESEARCH Pitfall 1): the "all messages" sentinel below pulls the entire chat from the
 * in-memory Store. Do NOT implement a DOM viewport-walk / incremental-fetch loop (kommo-scraper.ts
 * lines 104-130) — the WhatsApp Web list is virtualized and walking it silently DROPS messages. The
 * one-shot Store read is mandatory and is the integrity control for backup completeness.
 *
 * Pitfall guard (RESEARCH line 258 / wa-js issue #2552): a message arriving DURING the call could be
 * missed. Mitigation: this is a one-shot offline backup of OLD chats — open each chat once, read the
 * Store once, and the D-16 pilot cross-checks the returned count against the visible chat. (Optional
 * future hardening: re-read once and union by message id.)
 */
export async function scrapeMessages(page: Page, chatId: string): Promise<RawMsg[]> {
  const raw = await page.evaluate(async (chatId) => {
    const WPP = (window as any).WPP
    const msgs = await WPP.chat.getMessages(chatId, { count: -1 }) // full history from Store
    return msgs.map((m: any) => ({
      id: m.id?._serialized ?? String(m.id),
      fromMe: !!m.id?.fromMe, // VERIFIED: fromMe = data.id.fromMe
      t: m.t ?? m.timestamp, // VERIFIED: unix SECONDS
      type: m.type,
      body: m.body ?? m.caption ?? null,
    }))
  }, chatId)
  console.log(`[wa-reader] Scraped ${raw.length} messages from Store for chat ${chatId}.`)
  return raw as RawMsg[]
}

/**
 * Normalize one raw Store message into a BackupMessage (D-09 tz + D-10 placeholders).
 * (RESEARCH lines 452-461, VERBATIM.)
 *  - text message (type 'chat') → { fromMe, timestamp, text: <body>, type } — NO note.
 *  - non-text → { fromMe, timestamp, text: null, type, note: '<... omitido>' } — no download (D-10).
 *  - unix-seconds 0/undefined → still formatted (no crash); falls back to epoch.
 */
export function normalize(raw: RawMsg): BackupMessage {
  const isText = raw.type === 'chat'
  return {
    fromMe: !!raw.fromMe,
    timestamp: formatInTimeZone(new Date((raw.t ?? 0) * 1000), TZ, 'yyyy-MM-dd HH:mm:ss XXX'),
    text: isText ? (raw.body ?? null) : null,
    type: raw.type,
    ...(isText ? {} : { note: PLACEHOLDER[raw.type] ?? `<${raw.type} omitido>` }),
  }
}

/** Inputs the caller assembles (number/numberMissing from number-extractor; business from browser). */
export interface BuildChatBackupArgs {
  chatId: string
  number: string | null
  numberMissing: boolean
  contactName: string | null
  archived: boolean
  business: { number: string; name: string | null }
  raw: RawMsg[]
}

/**
 * Assemble the full ChatBackup (Plan 01 schema). `number`/`numberMissing` come from the caller
 * (number-extractor, Task 2); `business` from browser.ts captureBusinessIdentity (D-08). Messages
 * preserve Store order (chronological). A chat with zero messages returns an empty messages array —
 * not an error; the caller decides what to do with it.
 */
export function buildChatBackup(args: BuildChatBackupArgs): ChatBackup {
  const messages = args.raw.map(normalize)
  return {
    schemaVersion: 1,
    chatId: args.chatId,
    number: args.number,
    numberMissing: args.numberMissing,
    contactName: args.contactName,
    archived: args.archived,
    business: args.business,
    messageCount: messages.length,
    scrapedAt: formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss XXX'),
    messages,
  }
}
