// src/writer.ts — crash-safe persistence (D-12 atomic write).
// Atomic temp+rename only: after a successful write the final file is complete-or-absent,
// NEVER truncated. In-place synchronous writes are forbidden (PATTERNS lines 270-272 / Pitfall 5).
import { writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChatBackup } from './types.js'

/**
 * Atomic JSON write: write to a temp path on the SAME filesystem, then rename.
 * `rename` is atomic on POSIX + NTFS (MoveFileEx) — a crash mid-write leaves the
 * final path either untouched or fully replaced, never a truncated half-file (D-12).
 * Verbatim idiom from RESEARCH.md Pattern 6 (lines 293-298).
 */
export async function atomicWriteJson(finalPath: string, data: unknown): Promise<void> {
  const tmp = `${finalPath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tmp, finalPath) // atomic on same filesystem (POSIX + NTFS MoveFileEx)
}

/**
 * Writes one chat backup atomically to `<number|chatId>.json` and returns the
 * filename written (for the manifest entry). Does NOT touch the manifest — the
 * write-then-checkpoint ordering is the caller's responsibility (Task 2 + Plan 05).
 */
export async function writeChatBackup(outputDir: string, backup: ChatBackup): Promise<string> {
  // D-07: number-named file; fall back to a fs-safe chatId when the number is missing.
  const filename = `${backup.number ?? backup.chatId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`
  await mkdir(outputDir, { recursive: true })
  await atomicWriteJson(join(outputDir, filename), backup)
  console.log(`[wa-reader] wrote ${backup.messageCount} messages → ${filename}`)
  return filename
}
