// src/manifest.ts — 3-state checkpoint machine (D-11) persisted atomically (D-12).
// Per chatId status is one of 'pending' | 'done' | 'failed'. Resume skips 'done'
// and retries 'failed' + 'pending'. This is NOT a flat Set (PATTERNS lines 270-275);
// it is a Record<chatId,{status,...}> so a partially-finished batch is resumable.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Manifest } from './types.js'
import { atomicWriteJson } from './writer.js'

const nowIso = () => new Date().toISOString()
const manifestPath = (outputDir: string) => join(outputDir, 'manifest.json')

/** Reads the existing manifest, or returns a freshly-initialized one (no chats yet). */
export async function loadManifest(
  outputDir: string,
  ownNumber: string,
  threshold: number,
): Promise<Manifest> {
  try {
    const raw = await readFile(manifestPath(outputDir), 'utf-8')
    return JSON.parse(raw) as Manifest
  } catch {
    return { number: ownNumber, startedAt: nowIso(), updatedAt: nowIso(), threshold, chats: {} }
  }
}

/** Atomic-writes the manifest (reuses writer.ts temp+rename — never a truncated checkpoint). */
export async function saveManifest(outputDir: string, m: Manifest): Promise<void> {
  m.updatedAt = nowIso()
  await atomicWriteJson(manifestPath(outputDir), m)
}

/** Marks a chat as in-flight (status:'pending') and persists the manifest. */
export async function markPending(
  outputDir: string,
  m: Manifest,
  chatId: string,
  meta: { file: string; number: string | null; numberMissing: boolean },
): Promise<void> {
  m.chats[chatId] = {
    file: meta.file,
    status: 'pending',
    number: meta.number,
    numberMissing: meta.numberMissing,
    messageCount: 0,
    updatedAt: nowIso(),
  }
  await saveManifest(outputDir, m)
}

/**
 * Marks a chat as 'done' (write succeeded) and persists the manifest.
 *
 * ORDERING CONTRACT (load-bearing — Pitfall 5 / D-12): the orchestrator (Plan 05)
 * MUST call this ONLY AFTER writeChatBackup's `rename` has succeeded. Marking 'done'
 * before the JSON write completes means resume will skip the chat forever, losing it.
 * write chat JSON atomically → rename succeeds → THEN markDone → save manifest.
 */
export async function markDone(
  outputDir: string,
  m: Manifest,
  chatId: string,
  entry: { file: string; number: string | null; numberMissing: boolean; messageCount: number },
): Promise<void> {
  m.chats[chatId] = {
    file: entry.file,
    status: 'done',
    number: entry.number,
    numberMissing: entry.numberMissing,
    messageCount: entry.messageCount,
    updatedAt: nowIso(),
  }
  await saveManifest(outputDir, m)
}

/** Marks a chat as 'failed' with an error string and persists the manifest (retried on resume). */
export async function markFailed(
  outputDir: string,
  m: Manifest,
  chatId: string,
  error: string,
): Promise<void> {
  const prev = m.chats[chatId]
  m.chats[chatId] = {
    file: prev?.file ?? '',
    status: 'failed',
    number: prev?.number ?? null,
    numberMissing: prev?.numberMissing ?? true,
    messageCount: prev?.messageCount ?? 0,
    updatedAt: nowIso(),
    error,
  }
  await saveManifest(outputDir, m)
}

/**
 * Resume filter (D-11): returns only the chat refs that are NOT already 'done'.
 * 'failed' and 'pending' (and never-seen) chats are retried.
 */
export function filterRemaining<T extends { id: string }>(m: Manifest, refs: T[]): T[] {
  return refs.filter((r) => m.chats[r.id]?.status !== 'done')
}
