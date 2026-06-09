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
  // Pattern 3 (RESEARCH lines 228-239): read the injected Store via page.evaluate.
  // IMPORTANT: the evaluate body is passed as a STRING, not an arrow function. tsx/esbuild
  // transpiles arrow callbacks (helpers, name-wrapping) in a way that made the SAME WPP.chat.list
  // query return 0 here while a string-eval returned 529 (verified empirically). A string runs
  // verbatim in the page world, immune to the bundler. Keep it dependency-free (no closure vars).
  const refs: Array<{ id: string; name: string | null; archived: boolean }> = await page.evaluate(`
    (async () => {
      const WPP = window.WPP;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // Source of truth = ChatStore.getModelsArray() (reliably populated once main is ready;
      // it includes active + archived, archived being just the c.archive flag). WPP.chat.list()
      // proved flaky on its first call (returned 0 while the store already held 531) — do not use
      // it as the gate. Poll the model array until it has entries (or timeout for empty accounts).
      const deadline = Date.now() + 90000;
      let arr = [];
      while (Date.now() < deadline) {
        try { arr = WPP.whatsapp.ChatStore.getModelsArray(); } catch (e) { arr = []; }
        if (arr && arr.length > 0) break;
        await sleep(2000);
      }
      const byId = new Map();
      for (const c of arr) {
        if (c.isGroup) continue;               // D-01 exclude groups
        if (c.isNewsletter) continue;          // exclude channels/newsletters
        const id = (c.id && c.id._serialized) ? c.id._serialized : String(c.id);
        byId.set(id, { id: id, name: c.name || c.formattedTitle || null, archived: !!c.archive });
      }
      return Array.from(byId.values());
    })()
  `)

  // Belt-and-suspenders (RESEARCH line 241 + PATTERNS line 203): drop any id ending in @g.us /
  // @newsletter / status@broadcast — catches newsletters/status that the users filter may leak on some builds.
  const filtered = refs.filter((r) => !/@g\.us$|@newsletter$|status@broadcast$/.test(r.id))

  const archivedCount = filtered.filter((r) => r.archived).length
  console.log(
    `[wa-reader] Enumerated ${filtered.length} 1:1 chats (${archivedCount} archived) from Store.`,
  )
  return filtered
}
