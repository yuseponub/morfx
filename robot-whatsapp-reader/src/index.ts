// src/index.ts — CLI orchestrator for the read-only WhatsApp history reader.
//
// Wires every module (Plans 01-04) into the RESEARCH architecture-diagram flow:
//   open persistent session → inject wa-js → assert auth → capture business identity →
//   enumerate 1:1 chats → per-chat (resolve number → scrape full history → atomic write →
//   manifest checkpoint) → enforce the D-06 null-rate gate → D-13 pacing between chats.
//
// DEVIATION (PATTERNS §index.ts, line 130): this is a CLI, NOT an HTTP server. We copy the
// robot-godentist SIGTERM/SIGINT graceful-shutdown idiom (index.ts lines 11-17) but NOT the
// HTTP server bootstrap. Resume is via the manifest 3-state machine (D-11), not a flat Set.
//
// ABSOLUTE CONSTRAINT (D-15): there is NO send path anywhere in this file or the whole src/ tree.
// On logout/QR-expiry we pause clean and alert — we NEVER emit anything to "wake" the session.
// `--pilot` runs a small sample then HALTS (D-16); it must NEVER auto-continue into a full sweep.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { config, randDelay } from './config.js'
import {
  openSession,
  injectWaJs,
  assertAuthenticated,
  isLoggedOut,
  captureBusinessIdentity,
  closeSession,
} from './browser.js'
import { enumerateChats } from './enumerator.js'
import { resolveNumber, isResolved } from './number-extractor.js'
import { scrapeMessages, buildChatBackup } from './chat-scraper.js'
import { writeChatBackup } from './writer.js'
import {
  loadManifest,
  markPending,
  markDone,
  markFailed,
  filterRemaining,
} from './manifest.js'

/** Local sleep helper (ms). */
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))

interface Args {
  number: string
  pilot: boolean
  limit: number | null
  resume: boolean
}

/**
 * Parse process.argv (mirror scripts/kommo-scraper.ts arg-parse idiom).
 *   --number <digits>  REQUIRED — the client/business number this run backs up (drives D-14 dirs).
 *   --pilot            flag      — pilot mode (D-16): runs pilotChatCount then HALTS.
 *   --limit <N>        optional  — cap chats this invocation.
 *   --resume           flag      — informational only; resume (skip done) is ALWAYS on via manifest.
 */
function parseArgs(argv: string[]): Args {
  let number = ''
  let pilot = false
  let limit: number | null = null
  let resume = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--number') number = (argv[++i] ?? '').replace(/\D/g, '')
    else if (a === '--pilot') pilot = true
    else if (a === '--limit') limit = parseInt(argv[++i] ?? '', 10) || null
    else if (a === '--resume') resume = true
  }
  if (!number) {
    throw new Error(
      'USAGE: --number <digits> [--pilot] [--limit N] [--resume]  (--number is REQUIRED, D-14)',
    )
  }
  return { number, pilot, limit, resume }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // D-14 — per-number output dir + isolated browser profile.
  const outputDir = path.join('output', args.number)
  const userDataDir = path.join('profiles', args.number)
  await mkdir(outputDir, { recursive: true })
  await mkdir(userDataDir, { recursive: true })

  console.log(
    `[wa-reader] Starting ${args.pilot ? 'PILOT' : 'SWEEP'} for --number ${args.number} ` +
      `(output=${outputDir}, profile=${userDataDir})`,
  )

  const { ctx, page } = await openSession(userDataDir)
  try {
    // 1. Login + Store ready.
    console.log('[wa-reader] Scan the QR (Linked Devices) if prompted, then wait...')
    await injectWaJs(page)
    await assertAuthenticated(page) // throws NOT_AUTHENTICATED on failure (D-15 fail-safe).

    // 2. D-08 — who is "me" (the migrated business number).
    const business = await captureBusinessIdentity(page)

    // 3. D-11 — load/resume the manifest (3-state checkpoint machine).
    const manifest = await loadManifest(outputDir, args.number, config.nullRateThreshold)

    // 4. Enumerate, then skip already-done chats (D-11 resume is always on).
    const allRefs = await enumerateChats(page)
    let refs = filterRemaining(manifest, allRefs)
    console.log(
      `[wa-reader] ${allRefs.length} total chats; ${refs.length} remaining after resume-filter ` +
        `(${allRefs.length - refs.length} already done).`,
    )

    // 5. Effective limit: pilot → pilotChatCount; else --limit ?? perSessionChatCap ?? all.
    const limit = args.pilot
      ? config.pilotChatCount
      : (args.limit ?? config.perSessionChatCap ?? refs.length)
    refs = refs.slice(0, limit)
    console.log(`[wa-reader] This invocation will process up to ${refs.length} chats.`)

    // 6. Per-chat pipeline with null-counting for the D-06 gate.
    let processed = 0
    let nulls = 0

    for (const ref of refs) {
      try {
        // Provisional manifest entry — chat is in-flight (status:'pending').
        await markPending(outputDir, manifest, ref.id, {
          file: '',
          number: null,
          numberMissing: true,
        })

        // Settle after selecting the chat (D-13 humanized timing).
        await sleep(randDelay(config.postOpenDelayMs))

        // Resolve the phone number (D-04 → D-05) and count it toward the D-06 gate.
        const number = await resolveNumber(page, ref.id)
        processed++
        if (!isResolved(number)) nulls++

        // Pull the FULL history from the Store in one call (no DOM viewport-walk, Pitfall 1).
        const raw = await scrapeMessages(page, ref.id)

        const backup = buildChatBackup({
          chatId: ref.id,
          number,
          numberMissing: !isResolved(number),
          contactName: ref.name,
          archived: ref.archived,
          business,
          raw,
        })

        // ORDER IS LOAD-BEARING (Pitfall 5 / D-12): write the JSON atomically FIRST,
        // then mark the chat done. A crash between them just retries the chat next run.
        const file = await writeChatBackup(outputDir, backup)
        await markDone(outputDir, manifest, ref.id, {
          file,
          number,
          numberMissing: !isResolved(number),
          messageCount: backup.messageCount,
        })
      } catch (err) {
        // Per-chat failure: record it and continue; the chat is retried on the next run.
        await markFailed(outputDir, manifest, ref.id, String(err))
        console.error(`[wa-reader] Chat ${ref.id} FAILED (will retry next run):`, err)
      }

      // Running null-rate — the single most important pilot metric (log every chat).
      const rate = processed > 0 ? nulls / processed : 0
      console.log(
        `[wa-reader] progress: ${processed} processed, ${nulls} null → null-rate ${rate.toFixed(3)} ` +
          `(threshold ${config.nullRateThreshold}, minSample ${config.nullRateMinSample})`,
      )

      // D-06 GATE: once we have a meaningful sample, a high null-rate is a serious extractor bug —
      // FAIL LOUD rather than produce a massively-incomplete backup in silence. Guarded by
      // nullRateMinSample so the 5-chat pilot is never tripped prematurely.
      if (processed >= config.nullRateMinSample && nulls / processed > config.nullRateThreshold) {
        throw new Error(
          `NULL_RATE_GATE_TRIPPED: ${(nulls / processed).toFixed(3)} > ${config.nullRateThreshold} ` +
            `after ${processed} chats — the number extractor is likely broken. Aborting before mass backup (D-06).`,
        )
      }

      // D-15 fail-safe: if the session dropped mid-run, pause clean + alert. The in-flight chat
      // stays 'pending' (markDone was not reached). We NEVER send anything to wake the session.
      if (await isLoggedOut(page)) {
        console.error(
          '[wa-reader] SESSION LOST — pausing clean. Re-scan the QR (Linked Devices) and re-run ' +
            'with --resume. NOTHING was sent.',
        )
        break
      }

      // D-13 anti-ban pacing between chats (randomized, humanized).
      await sleep(randDelay(config.interChatDelayMs))
    }

    const finalRate = processed > 0 ? (nulls / processed).toFixed(3) : '0.000'

    // 7. PILOT HALT (D-16): after the sample, STOP. The pilot must NEVER auto-continue to a sweep.
    if (args.pilot) {
      console.log(
        `\n[wa-reader] PILOT COMPLETE — ${processed} chats, null-rate ${finalRate}. ` +
          `Inspect output/${args.number}/ (chat JSON + manifest) then authorize the full sweep ` +
          `(Plan 06 gate). NOT sweeping.`,
      )
      return
    }

    console.log(
      `\n[wa-reader] BATCH COMPLETE — ${processed} chats this run, null-rate ${finalRate}. ` +
        `Re-run the same command to resume the remaining chats (skips done, D-11).`,
    )
  } finally {
    // Always release the persistent context.
    await closeSession(ctx)
  }
}

// ── Graceful shutdown (robot-godentist idiom; CLI, so NO HTTP server bootstrap) ──
const shutdown = () => {
  console.log('[wa-reader] Shutting down...')
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// ── Top-level fail-safe wrapper (D-15): any throw → clean message, exit 1, NEVER send ──
main().catch((err) => {
  console.error('[wa-reader] FATAL —', err instanceof Error ? err.message : err)
  console.error(
    '[wa-reader] Paused clean. Nothing was sent (read-only, D-15). Fix the cause and re-run ' +
      'with --resume to continue where it stopped.',
  )
  process.exitCode = 1
})
