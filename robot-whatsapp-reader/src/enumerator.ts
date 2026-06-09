// src/enumerator.ts — Store-based enumeration of 1:1 chats (incl. archived), groups excluded.
//
// DEVIATION from robot-godentist (PATTERNS §enumerator.ts): `discoverSucursales` scrapes an ExtJS
// dropdown DOM with rotating selectors — that whole approach is the anti-pattern here. We enumerate
// from the INJECTED Store (window.WPP) instead. The Map-dedupe-by-id idiom mirrors the godentist
// `byId` merge spirit; only the data source changes (DOM → Store).
//
// READ-ONLY (D-15): this file contains NO send path. It only reads the chat list.
import type { Page } from 'playwright'

/**
 * Enumerate every 1:1 chat in the Store, merging active + archived, excluding groups/newsletters/
 * broadcast.
 *  - active individual chats (D-01 excludes groups at the source)
 *  - archived chats merged in so they are not lost (D-02)
 *  - group filter + JID-suffix belt-and-suspenders for newsletters/status that some builds leak
 */
export async function enumerateChats(
  page: Page,
): Promise<Array<{ id: string; name: string | null; archived: boolean }>> {
  // Pattern 3 (RESEARCH lines 228-239): one page.evaluate over the injected Store.
  // NOTE: conn.isMainReady() flips true a moment BEFORE chat.list() is populated (sub-race observed
  // empirically). Poll the Store until it reports chats (or a generous timeout), then snapshot once.
  const refs = await page.evaluate(async () => {
    const WPP = (window as any).WPP
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const deadline = Date.now() + 90_000
    let active: any[] = []
    while (Date.now() < deadline) {
      active = await WPP.chat.list({ onlyUsers: true, count: -1 })
      const storeLen = (() => { try { return WPP.whatsapp.ChatStore.getModelsArray().length } catch { return 0 } })()
      if (active.length > 0 || storeLen > 0) break
      await sleep(2_000)
    }
    const archived = await WPP.chat.list({ onlyArchived: true, count: -1 }) // D-02
    const byId = new Map<string, { id: string; name: string | null; archived: boolean }>()
    for (const c of [...active, ...archived]) {
      if (c.isGroup) continue // D-01 exclude groups
      const id = c.id._serialized ?? c.id.toString()
      byId.set(id, { id, name: c.name ?? c.formattedTitle ?? null, archived: !!c.archive })
    }
    return [...byId.values()]
  })

  // Belt-and-suspenders (RESEARCH line 241 + PATTERNS line 203): drop any id ending in @g.us /
  // @newsletter / status@broadcast — catches newsletters/status that the users filter may leak on some builds.
  const filtered = refs.filter((r) => !/@g\.us$|@newsletter$|status@broadcast$/.test(r.id))

  const archivedCount = filtered.filter((r) => r.archived).length
  console.log(
    `[wa-reader] Enumerated ${filtered.length} 1:1 chats (${archivedCount} archived) from Store.`,
  )
  return filtered
}
