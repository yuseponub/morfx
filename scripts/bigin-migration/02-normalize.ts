/**
 * Bigin → MorfX Migration: Phase 2 - Normalize, Deduplicate, Link Orders
 *
 * Reads raw pipelines.json and produces:
 *   - data/normalized/contacts.json     — Deduplicated contacts
 *   - data/normalized/order-groups.json  — Linked transaction groups
 *   - data/normalized/unmatched.json     — Unmatched records + stats
 *
 * Usage: npx tsx scripts/bigin-migration/02-normalize.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────
interface BiginDeal {
  id: string;
  Deal_Name: string;
  Telefono: string | null;
  email: string | null;
  CallBell: string | null;
  Direcci_n: string | null;
  Municipio_Dept: string | null;
  Departamento: string | null;
  Amount: number | null;
  Stage: string;
  Sub_Pipeline: string;
  Pipeline: { name: string; id: string };
  Created_Time: string;
  Modified_Time: string;
  Description: string | null;
  Guia: string | null;
  Transportadora: string | null;
  Tag: Array<{ name: string; id: string; color_code: string }>;
  Owner: { name: string; id: string; email: string };
  [key: string]: any;
}

interface NormalizedContact {
  id: string;
  phone: string | null;
  name: string;
  email: string | null;
  callbell_id: string | null;
  address: string | null;
  city: string | null;
  department: string | null;
  all_addresses: Array<{ address: string | null; city: string | null; department: string | null }>;
  order_count: number;
  first_order_date: string;
  last_order_date: string;
  match_method: "phone" | "callbell" | "phone+callbell" | "none";
}

interface OrderGroup {
  group_id: string;
  contact_id: string;
  venta: BiginDeal | null;
  logistica: BiginDeal | null;
  envios_somnio: BiginDeal | null;
  match_confidence: number;
  match_details: string;
}

// ─── Helpers ──────────────────────────────────────────────────────
function uuid(): string {
  return crypto.randomUUID();
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  // Remove whitespace, dashes, parens, brackets
  let p = raw.replace(/[\s\-\(\)\[\]\.]/g, "");

  // Handle obvious garbage
  if (p.length < 7) return null;

  // Colombian cellphone normalization
  if (p.startsWith("+57") && p.length === 13) return p;
  if (p.startsWith("57") && !p.startsWith("+") && p.length === 12) return "+" + p;
  if (p.startsWith("3") && p.length === 10) return "+57" + p;

  // Some have leading country code without +
  if (p.startsWith("57") && p.length === 12) return "+" + p;

  // International numbers - keep as-is with +
  if (p.startsWith("+")) return p;

  // 57 prefix but wrong length (extra/missing digits)
  if (p.startsWith("57") && p.length >= 11 && p.length <= 13) return "+" + p;

  // Bare cellphone without leading 3 (unlikely but handle)
  if (p.length === 10 && /^\d+$/.test(p)) return "+57" + p;

  // Flag as potentially invalid but still return
  return p.length >= 10 ? "+57" + p.replace(/\D/g, "").slice(-10) : null;
}

function extractCallbellId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/chat\/(\d+)/);
  return match ? match[1] : null;
}

function normalizeStage(stage: string): string {
  // Unify accent variants
  if (stage === "DEVOLUCIÓN") return "DEVOLUCION";
  return stage;
}

function parseDateStr(d: string): Date {
  return new Date(d);
}

function timeDiffSeconds(a: string, b: string): number {
  return Math.abs(parseDateStr(a).getTime() - parseDateStr(b).getTime()) / 1000;
}

/**
 * Simple string similarity (Dice coefficient on bigrams) — fast and good enough
 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  if (a === b) return 1;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function progress(label: string, current: number, total: number) {
  const pct = ((current / total) * 100).toFixed(1);
  process.stdout.write(`\r  [${label}] ${current.toLocaleString()}/${total.toLocaleString()} (${pct}%)`);
}

// ─── Step 1: Load and Separate ───────────────────────────────────
function loadAndSeparate(rawPath: string) {
  console.log("Step 1: Loading and separating by sub-pipeline...");
  const raw: BiginDeal[] = JSON.parse(fs.readFileSync(rawPath, "utf-8"));

  const ventas: BiginDeal[] = [];
  const logistica: BiginDeal[] = [];
  const envios: BiginDeal[] = [];
  let skipped = 0;

  for (const deal of raw) {
    // Only Ventas Somnio pipeline
    if (deal.Pipeline?.name !== "Ventas Somnio") {
      skipped++;
      continue;
    }
    // Normalize stage
    deal.Stage = normalizeStage(deal.Stage);

    switch (deal.Sub_Pipeline) {
      case "Ventas Somnio Standard":
        ventas.push(deal);
        break;
      case "LOGISTICA":
        logistica.push(deal);
        break;
      case "ENVIOS SOMNIO":
        envios.push(deal);
        break;
    }
  }

  console.log(`  Ventas: ${ventas.length.toLocaleString()}`);
  console.log(`  Logistica: ${logistica.length.toLocaleString()}`);
  console.log(`  Envios: ${envios.length.toLocaleString()}`);
  console.log(`  Skipped (Sales Pipeline): ${skipped.toLocaleString()}`);

  return { ventas, logistica, envios };
}

// ─── Step 2: Build Phone + CallBell Indexes ──────────────────────
interface IndexedDeal {
  deal: BiginDeal;
  phone: string | null;
  callbellId: string | null;
  matched: boolean;
}

function indexDeals(deals: BiginDeal[]): IndexedDeal[] {
  return deals.map((deal) => ({
    deal,
    phone: normalizePhone(deal.Telefono),
    callbellId: extractCallbellId(deal.CallBell),
    matched: false,
  }));
}

function buildPhoneIndex(indexed: IndexedDeal[]): Map<string, IndexedDeal[]> {
  const map = new Map<string, IndexedDeal[]>();
  for (const item of indexed) {
    if (item.phone) {
      const list = map.get(item.phone) || [];
      list.push(item);
      map.set(item.phone, list);
    }
  }
  return map;
}

function buildCallbellIndex(indexed: IndexedDeal[]): Map<string, IndexedDeal[]> {
  const map = new Map<string, IndexedDeal[]>();
  for (const item of indexed) {
    if (item.callbellId) {
      const list = map.get(item.callbellId) || [];
      list.push(item);
      map.set(item.callbellId, list);
    }
  }
  return map;
}

// ─── Step 3: Match Scoring ───────────────────────────────────────
interface MatchCandidate {
  source: IndexedDeal;
  target: IndexedDeal;
  score: number;
  details: string[];
  timeDiff: number;
}

function scoreMatch(
  source: IndexedDeal, // e.g. logistica record
  target: IndexedDeal, // e.g. venta record
  sourceTimeField: "Created_Time",
  targetTimeField: "Modified_Time"
): MatchCandidate {
  const details: string[] = [];
  let score = 0;

  // Phone match (+40)
  if (source.phone && target.phone && source.phone === target.phone) {
    score += 40;
    details.push("phone exact");
  }

  // Name match (+20 exact, +10 fuzzy)
  const nameA = source.deal.Deal_Name;
  const nameB = target.deal.Deal_Name;
  if (nameA && nameB) {
    const sim = similarity(nameA, nameB);
    if (sim === 1) {
      score += 20;
      details.push("name exact");
    } else if (sim > 0.8) {
      score += 10;
      details.push(`name fuzzy(${(sim * 100).toFixed(0)}%)`);
    }
  }

  // CallBell match (+25)
  if (source.callbellId && target.callbellId && source.callbellId === target.callbellId) {
    score += 25;
    details.push("callbell exact");
  }

  // Address match (+10)
  if (source.deal.Direcci_n && target.deal.Direcci_n) {
    const addrSim = similarity(source.deal.Direcci_n, target.deal.Direcci_n);
    if (addrSim > 0.7) {
      score += 10;
      details.push(`address(${(addrSim * 100).toFixed(0)}%)`);
    }
  }

  // Temporal proximity
  const timeDiff = timeDiffSeconds(
    source.deal[sourceTimeField],
    target.deal[targetTimeField]
  );
  if (timeDiff < 3600) {
    score += 15;
    details.push(`temporal(<1h, ${Math.round(timeDiff)}s)`);
  } else if (timeDiff < 86400) {
    score += 10;
    details.push(`temporal(<24h, ${Math.round(timeDiff / 3600)}h)`);
  } else if (timeDiff < 172800) {
    score += 5;
    details.push(`temporal(<48h)`);
  } else {
    details.push(`temporal(>48h, ${Math.round(timeDiff / 86400)}d)`);
  }

  // Amount match (+5)
  if (source.deal.Amount && target.deal.Amount && source.deal.Amount === target.deal.Amount) {
    score += 5;
    details.push("amount exact");
  }

  return {
    source,
    target,
    score,
    details,
    timeDiff,
  };
}

// ─── Step 4: Link Sub-Pipelines ──────────────────────────────────
function linkSubPipelines(
  sourceRecords: IndexedDeal[], // e.g. logistica
  targetRecords: IndexedDeal[], // e.g. ventas
  label: string,
  sourceTimeField: "Created_Time" = "Created_Time",
  targetTimeField: "Modified_Time" = "Modified_Time"
): { matched: MatchCandidate[]; unmatchedSource: IndexedDeal[]; unmatchedTarget: IndexedDeal[] } {
  console.log(`\nStep: Linking ${label}...`);

  const targetByPhone = buildPhoneIndex(targetRecords);
  const targetByCallbell = buildCallbellIndex(targetRecords);

  const matched: MatchCandidate[] = [];
  const matchedTargetIds = new Set<string>();

  // Sort source by Created_Time to process chronologically
  const sortedSource = [...sourceRecords].sort(
    (a, b) => new Date(a.deal.Created_Time).getTime() - new Date(b.deal.Created_Time).getTime()
  );

  for (let i = 0; i < sortedSource.length; i++) {
    if (i % 1000 === 0) progress(label, i, sortedSource.length);

    const src = sortedSource[i];
    const candidates: MatchCandidate[] = [];

    // Gather candidates by phone
    if (src.phone && targetByPhone.has(src.phone)) {
      for (const tgt of targetByPhone.get(src.phone)!) {
        if (matchedTargetIds.has(tgt.deal.id)) continue;
        candidates.push(scoreMatch(src, tgt, sourceTimeField, targetTimeField));
      }
    }

    // Gather candidates by callbell (if not already found via phone)
    if (src.callbellId && targetByCallbell.has(src.callbellId)) {
      for (const tgt of targetByCallbell.get(src.callbellId)!) {
        if (matchedTargetIds.has(tgt.deal.id)) continue;
        // Avoid duplicates
        if (candidates.some((c) => c.target.deal.id === tgt.deal.id)) continue;
        candidates.push(scoreMatch(src, tgt, sourceTimeField, targetTimeField));
      }
    }

    // Filter by threshold and pick best
    const validCandidates = candidates.filter((c) => c.score >= 60);
    if (validCandidates.length > 0) {
      // Sort by score desc, then by time diff asc (tiebreaker)
      validCandidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timeDiff - b.timeDiff;
      });

      const best = validCandidates[0];
      matched.push(best);
      best.source.matched = true;
      best.target.matched = true;
      matchedTargetIds.add(best.target.deal.id);
    }
  }

  progress(label, sortedSource.length, sortedSource.length);
  console.log("");

  const unmatchedSource = sourceRecords.filter((r) => !r.matched);
  const unmatchedTarget = targetRecords.filter((r) => !matchedTargetIds.has(r.deal.id));

  console.log(`  Matched: ${matched.length.toLocaleString()}`);
  console.log(`  Unmatched source: ${unmatchedSource.length.toLocaleString()}`);
  console.log(`  Unmatched target: ${unmatchedTarget.length.toLocaleString()}`);

  return { matched, unmatchedSource, unmatchedTarget };
}

// ─── Step 5: Build Order Groups ──────────────────────────────────
function buildOrderGroups(
  ventasLogMatches: MatchCandidate[],
  logEnviosMatches: MatchCandidate[],
  unmatchedVentas: IndexedDeal[],
  unmatchedLogistica: IndexedDeal[],
  unmatchedEnvios: IndexedDeal[]
): OrderGroup[] {
  console.log("\nStep: Building order groups...");

  const groups: OrderGroup[] = [];

  // Map logistica deal id -> envios match
  const enviosByLogId = new Map<string, MatchCandidate>();
  for (const m of logEnviosMatches) {
    enviosByLogId.set(m.target.deal.id, m); // target = logistica record
  }

  // Ventas-Logistica matched pairs
  for (const m of ventasLogMatches) {
    const ventaDeal = m.target.deal; // target = venta
    const logDeal = m.source.deal; // source = logistica

    let enviosDeal: BiginDeal | null = null;
    let enviosDetails = "";

    // Check if this logistica has a matching envios
    const enviosMatch = enviosByLogId.get(logDeal.id);
    if (enviosMatch) {
      enviosDeal = enviosMatch.source.deal; // source = envios record
      enviosDetails = ` + envios(${enviosMatch.details.join(", ")})`;
    }

    const confidence = Math.min(m.score / 100, 1);

    groups.push({
      group_id: uuid(),
      contact_id: "", // will be filled in step 6
      venta: ventaDeal,
      logistica: logDeal,
      envios_somnio: enviosDeal,
      match_confidence: parseFloat(confidence.toFixed(2)),
      match_details: `venta-log: ${m.details.join(", ")}${enviosDetails}`,
    });
  }

  // Unmatched ventas → groups with only venta
  for (const v of unmatchedVentas) {
    groups.push({
      group_id: uuid(),
      contact_id: "",
      venta: v.deal,
      logistica: null,
      envios_somnio: null,
      match_confidence: 0,
      match_details: "venta only (no logistica match)",
    });
  }

  // Unmatched logistica → groups with only logistica
  for (const l of unmatchedLogistica) {
    // Check if this logistica has a matching envios
    const enviosMatch = enviosByLogId.get(l.deal.id);
    let enviosDeal: BiginDeal | null = null;
    if (enviosMatch) {
      enviosDeal = enviosMatch.source.deal;
    }

    groups.push({
      group_id: uuid(),
      contact_id: "",
      venta: null,
      logistica: l.deal,
      envios_somnio: enviosDeal,
      match_confidence: 0,
      match_details: "logistica only (no venta match)",
    });
  }

  // Unmatched envios (no logistica match) → standalone groups
  const matchedEnviosIds = new Set(logEnviosMatches.map((m) => m.source.deal.id));
  for (const e of unmatchedEnvios) {
    if (matchedEnviosIds.has(e.deal.id)) continue;
    groups.push({
      group_id: uuid(),
      contact_id: "",
      venta: null,
      logistica: null,
      envios_somnio: e.deal,
      match_confidence: 0,
      match_details: "envios only (no logistica match)",
    });
  }

  console.log(`  Total order groups: ${groups.length.toLocaleString()}`);
  return groups;
}

// ─── Step 6: Deduplicate Contacts ────────────────────────────────
function deduplicateContacts(groups: OrderGroup[]): NormalizedContact[] {
  console.log("\nStep: Deduplicating contacts...");

  // Extract all identifiers from each group
  interface ContactRef {
    phone: string | null;
    callbellId: string | null;
    groupIdx: number;
  }

  const refs: ContactRef[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    // Get phone and callbell from any available deal in the group
    const deal = g.venta || g.logistica || g.envios_somnio;
    if (!deal) continue;

    refs.push({
      phone: normalizePhone(deal.Telefono),
      callbellId: extractCallbellId(deal.CallBell),
      groupIdx: i,
    });
  }

  // Union-Find for grouping contacts
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression
    let curr = x;
    while (curr !== root) {
      const next = parent.get(curr)!;
      parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  // Group by phone first, then by callbell
  const phoneToKey = new Map<string, string>();
  const callbellToKey = new Map<string, string>();

  for (const ref of refs) {
    const keys: string[] = [];

    if (ref.phone) {
      if (!phoneToKey.has(ref.phone)) {
        phoneToKey.set(ref.phone, `p:${ref.phone}`);
      }
      keys.push(phoneToKey.get(ref.phone)!);
    }

    if (ref.callbellId) {
      if (!callbellToKey.has(ref.callbellId)) {
        callbellToKey.set(ref.callbellId, `c:${ref.callbellId}`);
      }
      keys.push(callbellToKey.get(ref.callbellId)!);
    }

    // Union all keys for this ref
    for (let i = 1; i < keys.length; i++) {
      union(keys[0], keys[i]);
    }
  }

  // Assign each group to a contact cluster
  const clusterToGroups = new Map<string, number[]>();
  const noIdentifier: number[] = [];

  for (const ref of refs) {
    let key: string | null = null;
    if (ref.phone) key = find(phoneToKey.get(ref.phone)!);
    else if (ref.callbellId) key = find(callbellToKey.get(ref.callbellId)!);

    if (key) {
      const list = clusterToGroups.get(key) || [];
      list.push(ref.groupIdx);
      clusterToGroups.set(key, list);
    } else {
      noIdentifier.push(ref.groupIdx);
    }
  }

  console.log(`  Contact clusters: ${clusterToGroups.size.toLocaleString()}`);
  console.log(`  Orders with no phone/callbell: ${noIdentifier.length}`);

  // Build contacts from clusters
  const contacts: NormalizedContact[] = [];

  for (const [_clusterKey, groupIdxs] of clusterToGroups) {
    const contactId = uuid();
    const allDeals: BiginDeal[] = [];
    const phones = new Set<string>();
    const callbellIds = new Set<string>();

    for (const idx of groupIdxs) {
      const g = groups[idx];
      g.contact_id = contactId;

      for (const deal of [g.venta, g.logistica, g.envios_somnio]) {
        if (deal) {
          allDeals.push(deal);
          const ph = normalizePhone(deal.Telefono);
          if (ph) phones.add(ph);
          const cbId = extractCallbellId(deal.CallBell);
          if (cbId) callbellIds.add(cbId);
        }
      }
    }

    // Sort deals by date (newest first for "most recent" picks)
    allDeals.sort(
      (a, b) => new Date(b.Created_Time).getTime() - new Date(a.Created_Time).getTime()
    );

    // Pick best name (longest)
    const names = allDeals.map((d) => d.Deal_Name).filter(Boolean);
    const bestName = names.sort((a, b) => b.length - a.length)[0] || "Unknown";

    // Most recent email
    const bestEmail = allDeals.find((d) => d.email)?.email || null;

    // Most recent address
    const mostRecent = allDeals[0];
    const address = mostRecent?.Direcci_n || null;
    const city = mostRecent?.Municipio_Dept || null;
    const department = mostRecent?.Departamento || null;

    // All unique addresses
    const addrSet = new Set<string>();
    const allAddresses: Array<{ address: string | null; city: string | null; department: string | null }> = [];
    for (const d of allDeals) {
      const key = `${d.Direcci_n || ""}|${d.Municipio_Dept || ""}|${d.Departamento || ""}`;
      if (!addrSet.has(key) && (d.Direcci_n || d.Municipio_Dept)) {
        addrSet.add(key);
        allAddresses.push({
          address: d.Direcci_n || null,
          city: d.Municipio_Dept || null,
          department: d.Departamento || null,
        });
      }
    }

    // Dates (from the group level — each group = 1 transaction)
    const orderDates = groupIdxs.map((idx) => {
      const g = groups[idx];
      const deal = g.venta || g.logistica || g.envios_somnio;
      return deal ? deal.Created_Time : "";
    }).filter(Boolean).sort();

    // Match method
    let matchMethod: NormalizedContact["match_method"] = "none";
    if (phones.size > 0 && callbellIds.size > 0) matchMethod = "phone+callbell";
    else if (phones.size > 0) matchMethod = "phone";
    else if (callbellIds.size > 0) matchMethod = "callbell";

    contacts.push({
      id: contactId,
      phone: phones.size > 0 ? [...phones][0] : null,
      name: bestName,
      email: bestEmail,
      callbell_id: callbellIds.size > 0 ? [...callbellIds][0] : null,
      address,
      city,
      department,
      all_addresses: allAddresses,
      order_count: groupIdxs.length,
      first_order_date: orderDates[0] || "",
      last_order_date: orderDates[orderDates.length - 1] || "",
      match_method: matchMethod,
    });
  }

  // Handle groups with no identifier — each becomes its own "contact"
  for (const idx of noIdentifier) {
    const g = groups[idx];
    const deal = g.venta || g.logistica || g.envios_somnio;
    if (!deal) continue;

    const contactId = uuid();
    g.contact_id = contactId;

    contacts.push({
      id: contactId,
      phone: null,
      name: deal.Deal_Name || "Unknown",
      email: deal.email || null,
      callbell_id: null,
      address: deal.Direcci_n || null,
      city: deal.Municipio_Dept || null,
      department: deal.Departamento || null,
      all_addresses: deal.Direcci_n
        ? [{ address: deal.Direcci_n, city: deal.Municipio_Dept, department: deal.Departamento }]
        : [],
      order_count: 1,
      first_order_date: deal.Created_Time,
      last_order_date: deal.Created_Time,
      match_method: "none",
    });
  }

  console.log(`  Total contacts: ${contacts.length.toLocaleString()}`);
  return contacts;
}

// ─── Step 7: Report ──────────────────────────────────────────────
function printReport(contacts: NormalizedContact[], groups: OrderGroup[]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log("NORMALIZATION REPORT");
  console.log(`${"=".repeat(60)}`);

  // 1. Total contacts
  console.log(`\n1. Total contactos unicos: ${contacts.length.toLocaleString()}`);

  // 2. Order distribution
  const orderDist = { one: 0, twoThree: 0, fourPlus: 0 };
  for (const c of contacts) {
    if (c.order_count === 1) orderDist.one++;
    else if (c.order_count <= 3) orderDist.twoThree++;
    else orderDist.fourPlus++;
  }
  console.log(`\n2. Distribucion de ordenes por contacto:`);
  console.log(`   1 orden: ${orderDist.one.toLocaleString()} (${((orderDist.one / contacts.length) * 100).toFixed(1)}%)`);
  console.log(`   2-3 ordenes: ${orderDist.twoThree.toLocaleString()} (${((orderDist.twoThree / contacts.length) * 100).toFixed(1)}%)`);
  console.log(`   4+ ordenes (recompra): ${orderDist.fourPlus.toLocaleString()} (${((orderDist.fourPlus / contacts.length) * 100).toFixed(1)}%)`);

  // 3. Total order groups
  console.log(`\n3. Total grupos de ordenes (transacciones): ${groups.length.toLocaleString()}`);

  // 4-6. Group composition
  let full = 0, ventaLog = 0, ventaOnly = 0, logOnly = 0, envOnly = 0, logEnv = 0;
  for (const g of groups) {
    const hasV = g.venta !== null;
    const hasL = g.logistica !== null;
    const hasE = g.envios_somnio !== null;
    if (hasV && hasL && hasE) full++;
    else if (hasV && hasL) ventaLog++;
    else if (hasV) ventaOnly++;
    else if (hasL && hasE) logEnv++;
    else if (hasL) logOnly++;
    else if (hasE) envOnly++;
  }
  console.log(`\n4. Grupos completos (Ventas+Logistica+Envios): ${full.toLocaleString()}`);
  console.log(`5. Grupos Ventas+Logistica: ${ventaLog.toLocaleString()}`);
  console.log(`   Grupos Logistica+Envios: ${logEnv.toLocaleString()}`);
  console.log(`6. Ventas sin match logistica: ${ventaOnly.toLocaleString()}`);
  console.log(`   Logistica sin match venta: ${logOnly.toLocaleString()}`);
  console.log(`   Envios sin match: ${envOnly.toLocaleString()}`);

  // 7. No identifier
  const noId = contacts.filter((c) => c.match_method === "none").length;
  console.log(`\n7. Contactos sin telefono NI callbell: ${noId}`);

  // 8. Top recompras
  console.log(`\n8. Top 10 contactos con mas recompras:`);
  const topRepurchase = [...contacts].sort((a, b) => b.order_count - a.order_count).slice(0, 10);
  for (const c of topRepurchase) {
    console.log(`   ${c.name} (${c.phone || "no-phone"}): ${c.order_count} transacciones`);
  }

  // 9. Confidence distribution
  const confDist = { above90: 0, above80: 0, above60: 0, below60: 0 };
  for (const g of groups) {
    if (g.match_confidence >= 0.9) confDist.above90++;
    else if (g.match_confidence >= 0.8) confDist.above80++;
    else if (g.match_confidence >= 0.6) confDist.above60++;
    else confDist.below60++;
  }
  console.log(`\n9. Confidence score distribution:`);
  console.log(`   >=90%: ${confDist.above90.toLocaleString()}`);
  console.log(`   80-89%: ${confDist.above80.toLocaleString()}`);
  console.log(`   60-79%: ${confDist.above60.toLocaleString()}`);
  console.log(`   <60% (unmatched/single): ${confDist.below60.toLocaleString()}`);

  // 10. Match method distribution
  const methodDist: Record<string, number> = {};
  for (const c of contacts) {
    methodDist[c.match_method] = (methodDist[c.match_method] || 0) + 1;
  }
  console.log(`\n10. Match method distribution:`);
  for (const [method, count] of Object.entries(methodDist).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${method}: ${count.toLocaleString()}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log("Bigin → MorfX Migration: Normalize Phase");
  console.log(`${"─".repeat(60)}`);

  const rawPath = path.join(__dirname, "data", "pipelines.json");
  const outDir = path.join(__dirname, "data", "normalized");
  fs.mkdirSync(outDir, { recursive: true });

  // Step 1: Load and separate
  const { ventas, logistica, envios } = loadAndSeparate(rawPath);

  // Step 2: Index
  console.log("\nStep 2: Indexing deals...");
  const ventasIdx = indexDeals(ventas);
  const logisticaIdx = indexDeals(logistica);
  const enviosIdx = indexDeals(envios);
  console.log("  Done.");

  // Step 3-4: Link Logistica -> Ventas
  const ventasLogResult = linkSubPipelines(
    logisticaIdx,
    ventasIdx,
    "Logistica→Ventas",
    "Created_Time",
    "Modified_Time"
  );

  // Reset matched flags on logistica for envios matching
  for (const item of logisticaIdx) item.matched = false;

  // Step 3-4: Link Envios -> Logistica
  const logEnviosResult = linkSubPipelines(
    enviosIdx,
    logisticaIdx,
    "Envios→Logistica",
    "Created_Time",
    "Modified_Time"
  );

  // Step 5: Build order groups
  const groups = buildOrderGroups(
    ventasLogResult.matched,
    logEnviosResult.matched,
    ventasLogResult.unmatchedTarget, // unmatched ventas
    ventasLogResult.unmatchedSource.filter((r) => !r.matched), // unmatched logistica (not matched to envios either)
    logEnviosResult.unmatchedSource // unmatched envios
  );

  // Step 6: Deduplicate contacts
  const contacts = deduplicateContacts(groups);

  // Step 7: Save outputs
  console.log("\nSaving outputs...");

  const contactsPath = path.join(outDir, "contacts.json");
  fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2));
  console.log(`  ${contactsPath} (${contacts.length.toLocaleString()} contacts)`);

  const groupsPath = path.join(outDir, "order-groups.json");
  fs.writeFileSync(groupsPath, JSON.stringify(groups, null, 2));
  console.log(`  ${groupsPath} (${groups.length.toLocaleString()} groups)`);

  // Unmatched report
  const unmatched = {
    savedAt: new Date().toISOString(),
    ventasSinLogistica: ventasLogResult.unmatchedTarget.map((r) => ({
      id: r.deal.id,
      name: r.deal.Deal_Name,
      phone: r.phone,
      stage: r.deal.Stage,
      created: r.deal.Created_Time,
    })),
    logisticaSinVenta: ventasLogResult.unmatchedSource
      .filter((r) => !r.matched)
      .map((r) => ({
        id: r.deal.id,
        name: r.deal.Deal_Name,
        phone: r.phone,
        stage: r.deal.Stage,
        created: r.deal.Created_Time,
      })),
    enviosSinLogistica: logEnviosResult.unmatchedSource.map((r) => ({
      id: r.deal.id,
      name: r.deal.Deal_Name,
      phone: r.phone,
      stage: r.deal.Stage,
      created: r.deal.Created_Time,
    })),
    noIdentifier: groups
      .filter((g) => {
        const deal = g.venta || g.logistica || g.envios_somnio;
        return deal && !normalizePhone(deal.Telefono) && !extractCallbellId(deal.CallBell);
      })
      .map((g) => {
        const deal = (g.venta || g.logistica || g.envios_somnio)!;
        return { id: deal.id, name: deal.Deal_Name, stage: deal.Stage };
      }),
  };

  const unmatchedPath = path.join(outDir, "unmatched.json");
  fs.writeFileSync(unmatchedPath, JSON.stringify(unmatched, null, 2));
  console.log(`  ${unmatchedPath}`);

  // Report
  printReport(contacts, groups);

  console.log(`\n${"─".repeat(60)}`);
  console.log("Phase 2 complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
