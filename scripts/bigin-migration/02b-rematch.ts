/**
 * Bigin → MorfX Migration: Phase 2b - Rematch unmatched orders
 *
 * Second pass with relaxed scoring against ALL records (not just unmatched).
 * Generates rematch-candidates.json for manual review.
 *
 * Usage: npx tsx scripts/bigin-migration/02b-rematch.ts
 */

import * as fs from "fs";
import * as path from "path";

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
  [key: string]: any;
}

interface UnmatchedRef {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  created: string;
}

interface Candidate {
  id: string;
  name: string;
  phone: string | null;
  score: number;
  match_details: string;
  already_matched: boolean;
}

interface RematchEntry {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  created: string;
  candidates: Candidate[];
  best_match: Candidate | null;
  recommendation: "auto_match" | "review" | "truly_unmatched";
}

// ─── Helpers ──────────────────────────────────────────────────────
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let p = raw.replace(/[\s\-\(\)\[\]\.]/g, "");
  if (p.length < 7) return null;
  if (p.startsWith("+57") && p.length === 13) return p;
  if (p.startsWith("57") && !p.startsWith("+") && p.length === 12) return "+" + p;
  if (p.startsWith("3") && p.length === 10) return "+57" + p;
  if (p.startsWith("57") && p.length >= 11 && p.length <= 13) return "+" + p;
  if (p.startsWith("+")) return p;
  if (p.length === 10 && /^\d+$/.test(p)) return "+57" + p;
  return p.length >= 10 ? "+57" + p.replace(/\D/g, "").slice(-10) : null;
}

function extractCallbellId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/chat\/(\d+)/);
  return match ? match[1] : null;
}

function lastNDigits(phone: string | null, n: number): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= n ? digits.slice(-n) : null;
}

/** Normalize name: lowercase, remove accents, &, ., extra spaces */
function normalizeName(name: string | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[&\.\,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dice coefficient on bigrams */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));
  let intersection = 0;
  for (const bg of bigramsA) if (bigramsB.has(bg)) intersection++;
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function timeDiffSeconds(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 1000;
}

function progress(label: string, current: number, total: number) {
  const pct = ((current / total) * 100).toFixed(1);
  process.stdout.write(`\r  [${label}] ${current}/${total} (${pct}%)`);
}

// ─── Indexing ─────────────────────────────────────────────────────
interface IndexedDeal {
  deal: BiginDeal;
  phone: string | null;
  last8: string | null;
  callbellId: string | null;
  normName: string;
}

function indexDeal(deal: BiginDeal): IndexedDeal {
  const phone = normalizePhone(deal.Telefono);
  return {
    deal,
    phone,
    last8: lastNDigits(phone, 8),
    callbellId: extractCallbellId(deal.CallBell),
    normName: normalizeName(deal.Deal_Name),
  };
}

// ─── Scoring ──────────────────────────────────────────────────────
function scoreRematch(
  source: IndexedDeal,
  target: IndexedDeal,
  sourceTimeField: "Created_Time",
  targetTimeField: "Modified_Time"
): { score: number; details: string[] } {
  const details: string[] = [];
  let score = 0;

  // Phone exact match (+40)
  if (source.phone && target.phone && source.phone === target.phone) {
    score += 40;
    details.push("phone exact");
  }
  // Partial phone: last 8 digits (+30)
  else if (source.last8 && target.last8 && source.last8 === target.last8) {
    score += 30;
    details.push("phone last8");
  }

  // Name match
  const nameA = source.normName;
  const nameB = target.normName;
  if (nameA && nameB) {
    if (nameA === nameB) {
      score += 20;
      details.push("name exact(norm)");
    } else {
      const sim = similarity(nameA, nameB);
      if (sim > 0.8) {
        score += 10;
        details.push(`name fuzzy(${(sim * 100).toFixed(0)}%)`);
      }
    }
  }

  // Override: identical normalized name + same phone = strong link regardless of time
  if (nameA && nameB && nameA === nameB && source.phone && target.phone && source.phone === target.phone) {
    if (score < 70) {
      score = 70;
      details.length = 0;
      details.push("name+phone override(70)");
    }
  }

  // CallBell match (+25)
  if (source.callbellId && target.callbellId && source.callbellId === target.callbellId) {
    score += 25;
    details.push("callbell exact");
  }

  // Address: same city (+5)
  if (source.deal.Municipio_Dept && target.deal.Municipio_Dept) {
    if (
      normalizeName(source.deal.Municipio_Dept) ===
      normalizeName(target.deal.Municipio_Dept)
    ) {
      score += 5;
      details.push("same city");
    }
  }

  // Temporal proximity (window: 30 days)
  const timeDiff = timeDiffSeconds(
    source.deal[sourceTimeField],
    target.deal[targetTimeField]
  );
  const THIRTY_DAYS = 30 * 86400;
  if (timeDiff < 3600) {
    score += 15;
    details.push(`temporal(<1h, ${Math.round(timeDiff)}s)`);
  } else if (timeDiff < 86400) {
    score += 10;
    details.push(`temporal(<24h, ${Math.round(timeDiff / 3600)}h)`);
  } else if (timeDiff < 172800) {
    score += 5;
    details.push(`temporal(<48h)`);
  } else if (timeDiff < THIRTY_DAYS) {
    score += 2;
    details.push(`temporal(<30d, ${Math.round(timeDiff / 86400)}d)`);
  } else {
    details.push(`temporal(>30d, ${Math.round(timeDiff / 86400)}d)`);
  }

  // Amount match (+5)
  if (source.deal.Amount && target.deal.Amount && source.deal.Amount === target.deal.Amount) {
    score += 5;
    details.push("amount exact");
  }

  return { score, details };
}

// ─── Rematch Logic ───────────────────────────────────────────────
function findCandidates(
  unmatchedIdx: IndexedDeal,
  allTargets: IndexedDeal[],
  targetByPhone: Map<string, IndexedDeal[]>,
  targetByLast8: Map<string, IndexedDeal[]>,
  targetByCallbell: Map<string, IndexedDeal[]>,
  matchedIds: Set<string>,
  sourceTimeField: "Created_Time",
  targetTimeField: "Modified_Time"
): { candidates: Candidate[]; best: Candidate | null; recommendation: "auto_match" | "review" | "truly_unmatched" } {
  // Gather candidate targets efficiently via indexes
  const candidateSet = new Map<string, IndexedDeal>();

  // By exact phone
  if (unmatchedIdx.phone && targetByPhone.has(unmatchedIdx.phone)) {
    for (const t of targetByPhone.get(unmatchedIdx.phone)!) {
      candidateSet.set(t.deal.id, t);
    }
  }

  // By last 8 digits
  if (unmatchedIdx.last8 && targetByLast8.has(unmatchedIdx.last8)) {
    for (const t of targetByLast8.get(unmatchedIdx.last8)!) {
      candidateSet.set(t.deal.id, t);
    }
  }

  // By callbell
  if (unmatchedIdx.callbellId && targetByCallbell.has(unmatchedIdx.callbellId)) {
    for (const t of targetByCallbell.get(unmatchedIdx.callbellId)!) {
      candidateSet.set(t.deal.id, t);
    }
  }

  // Score all candidates
  const scored: Candidate[] = [];
  for (const [, target] of candidateSet) {
    const { score, details } = scoreRematch(unmatchedIdx, target, sourceTimeField, targetTimeField);
    if (score >= 20) {
      // Include even low scores so we can show top 3
      scored.push({
        id: target.deal.id,
        name: target.deal.Deal_Name,
        phone: target.phone,
        score,
        match_details: details.join(", "),
        already_matched: matchedIds.has(target.deal.id),
      });
    }
  }

  // Sort by score desc
  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, 3);
  const best = top3.length > 0 ? top3[0] : null;

  let recommendation: "auto_match" | "review" | "truly_unmatched";
  if (best && best.score > 55) recommendation = "auto_match";
  else if (best && best.score >= 35) recommendation = "review";
  else recommendation = "truly_unmatched";

  return { candidates: top3, best, recommendation };
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log("Bigin → MorfX Migration: Rematch Phase");
  console.log(`${"─".repeat(60)}`);

  const dataDir = path.join(__dirname, "data");
  const normDir = path.join(dataDir, "normalized");

  // Load unmatched refs
  const unmatched = JSON.parse(fs.readFileSync(path.join(normDir, "unmatched.json"), "utf-8"));
  const logSinVentaRefs: UnmatchedRef[] = unmatched.logisticaSinVenta;
  const envSinLogRefs: UnmatchedRef[] = unmatched.enviosSinLogistica;
  console.log(`Unmatched logistica→venta: ${logSinVentaRefs.length}`);
  console.log(`Unmatched envios→logistica: ${envSinLogRefs.length}`);

  // Load ALL raw pipelines
  console.log("\nLoading raw pipelines...");
  const allRaw: BiginDeal[] = JSON.parse(fs.readFileSync(path.join(dataDir, "pipelines.json"), "utf-8"));
  const ventasSomnio = allRaw.filter((d) => d.Pipeline?.name === "Ventas Somnio");

  const allVentas = ventasSomnio.filter((d) => d.Sub_Pipeline === "Ventas Somnio Standard");
  const allLogistica = ventasSomnio.filter((d) => d.Sub_Pipeline === "LOGISTICA");
  console.log(`All ventas: ${allVentas.length.toLocaleString()}`);
  console.log(`All logistica: ${allLogistica.length.toLocaleString()}`);

  // Build ID -> deal lookup
  const dealById = new Map<string, BiginDeal>();
  for (const d of ventasSomnio) dealById.set(d.id, d);

  // Load matched IDs from order-groups to flag already_matched
  const orderGroups = JSON.parse(fs.readFileSync(path.join(normDir, "order-groups.json"), "utf-8"));
  const matchedVentaIds = new Set<string>();
  const matchedLogIds = new Set<string>();
  for (const g of orderGroups) {
    if (g.venta) matchedVentaIds.add(g.venta.id);
    if (g.logistica) matchedLogIds.add(g.logistica.id);
  }
  console.log(`Already matched ventas: ${matchedVentaIds.size.toLocaleString()}`);
  console.log(`Already matched logistica: ${matchedLogIds.size.toLocaleString()}`);

  // Index ALL ventas
  console.log("\nIndexing all ventas...");
  const ventasIdx = allVentas.map(indexDeal);
  const ventasByPhone = new Map<string, IndexedDeal[]>();
  const ventasByLast8 = new Map<string, IndexedDeal[]>();
  const ventasByCallbell = new Map<string, IndexedDeal[]>();
  for (const v of ventasIdx) {
    if (v.phone) {
      const list = ventasByPhone.get(v.phone) || [];
      list.push(v);
      ventasByPhone.set(v.phone, list);
    }
    if (v.last8) {
      const list = ventasByLast8.get(v.last8) || [];
      list.push(v);
      ventasByLast8.set(v.last8, list);
    }
    if (v.callbellId) {
      const list = ventasByCallbell.get(v.callbellId) || [];
      list.push(v);
      ventasByCallbell.set(v.callbellId, list);
    }
  }

  // Index ALL logistica
  console.log("Indexing all logistica...");
  const logIdx = allLogistica.map(indexDeal);
  const logByPhone = new Map<string, IndexedDeal[]>();
  const logByLast8 = new Map<string, IndexedDeal[]>();
  const logByCallbell = new Map<string, IndexedDeal[]>();
  for (const l of logIdx) {
    if (l.phone) {
      const list = logByPhone.get(l.phone) || [];
      list.push(l);
      logByPhone.set(l.phone, list);
    }
    if (l.last8) {
      const list = logByLast8.get(l.last8) || [];
      list.push(l);
      logByLast8.set(l.last8, list);
    }
    if (l.callbellId) {
      const list = logByCallbell.get(l.callbellId) || [];
      list.push(l);
      logByCallbell.set(l.callbellId, list);
    }
  }

  // ── Rematch: Logistica sin Venta ────────────────────────────────
  console.log("\n── Rematching Logistica → Ventas ──");
  const logResults: RematchEntry[] = [];

  for (let i = 0; i < logSinVentaRefs.length; i++) {
    if (i % 50 === 0) progress("Log→Venta", i, logSinVentaRefs.length);
    const ref = logSinVentaRefs[i];
    const deal = dealById.get(ref.id);
    if (!deal) {
      logResults.push({
        id: ref.id,
        name: ref.name,
        phone: ref.phone,
        stage: ref.stage,
        created: ref.created,
        candidates: [],
        best_match: null,
        recommendation: "truly_unmatched",
      });
      continue;
    }

    const srcIdx = indexDeal(deal);
    const { candidates, best, recommendation } = findCandidates(
      srcIdx,
      ventasIdx,
      ventasByPhone,
      ventasByLast8,
      ventasByCallbell,
      matchedVentaIds,
      "Created_Time",
      "Modified_Time"
    );

    logResults.push({
      id: ref.id,
      name: ref.name,
      phone: srcIdx.phone,
      stage: ref.stage,
      created: ref.created,
      candidates,
      best_match: best,
      recommendation,
    });
  }
  progress("Log→Venta", logSinVentaRefs.length, logSinVentaRefs.length);
  console.log("");

  // ── Rematch: Envios sin Logistica ───────────────────────────────
  console.log("\n── Rematching Envios → Logistica ──");
  const envResults: RematchEntry[] = [];

  for (let i = 0; i < envSinLogRefs.length; i++) {
    if (i % 10 === 0) progress("Env→Log", i, envSinLogRefs.length);
    const ref = envSinLogRefs[i];
    const deal = dealById.get(ref.id);
    if (!deal) {
      envResults.push({
        id: ref.id,
        name: ref.name,
        phone: ref.phone,
        stage: ref.stage,
        created: ref.created,
        candidates: [],
        best_match: null,
        recommendation: "truly_unmatched",
      });
      continue;
    }

    const srcIdx = indexDeal(deal);
    const { candidates, best, recommendation } = findCandidates(
      srcIdx,
      logIdx,
      logByPhone,
      logByLast8,
      logByCallbell,
      matchedLogIds,
      "Created_Time",
      "Modified_Time"
    );

    envResults.push({
      id: ref.id,
      name: ref.name,
      phone: srcIdx.phone,
      stage: ref.stage,
      created: ref.created,
      candidates,
      best_match: best,
      recommendation,
    });
  }
  progress("Env→Log", envSinLogRefs.length, envSinLogRefs.length);
  console.log("");

  // ── Save ────────────────────────────────────────────────────────
  const output = {
    generatedAt: new Date().toISOString(),
    logisticaSinVenta: logResults,
    enviosSinLogistica: envResults,
  };

  const outPath = path.join(normDir, "rematch-candidates.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved: ${outPath}`);

  // ── Report ──────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("REMATCH REPORT");
  console.log(`${"=".repeat(60)}`);

  function reportSection(label: string, entries: RematchEntry[]) {
    const auto = entries.filter((e) => e.recommendation === "auto_match");
    const review = entries.filter((e) => e.recommendation === "review");
    const unmatched = entries.filter((e) => e.recommendation === "truly_unmatched");
    const autoConflict = auto.filter((e) => e.best_match?.already_matched);

    console.log(`\n${label} (${entries.length} total):`);
    console.log(`  auto_match (>55):      ${auto.length}`);
    console.log(`  review (35-55):        ${review.length}`);
    console.log(`  truly_unmatched (<35): ${unmatched.length}`);
    console.log(`  auto_match con conflicto (best ya vinculado): ${autoConflict.length}`);

    // Show score distribution
    const scores = entries.map((e) => e.best_match?.score ?? 0);
    const buckets: Record<string, number> = { "0": 0, "1-34": 0, "35-55": 0, "56-70": 0, "71-90": 0, "91+": 0 };
    for (const s of scores) {
      if (s === 0) buckets["0"]++;
      else if (s < 35) buckets["1-34"]++;
      else if (s <= 55) buckets["35-55"]++;
      else if (s <= 70) buckets["56-70"]++;
      else if (s <= 90) buckets["71-90"]++;
      else buckets["91+"]++;
    }
    console.log(`  Score distribution:`);
    for (const [bucket, count] of Object.entries(buckets)) {
      if (count > 0) console.log(`    ${bucket}: ${count}`);
    }

    // Show sample truly_unmatched
    if (unmatched.length > 0) {
      console.log(`  Sample truly_unmatched:`);
      for (const e of unmatched.slice(0, 5)) {
        console.log(`    ${e.name} (${e.phone || "no-phone"}) stage=${e.stage} created=${e.created.slice(0, 10)}`);
      }
    }

    // Show sample review
    if (review.length > 0) {
      console.log(`  Sample review:`);
      for (const e of review.slice(0, 5)) {
        const b = e.best_match!;
        console.log(
          `    ${e.name} → ${b.name} (score=${b.score}, ${b.match_details})${b.already_matched ? " [CONFLICT]" : ""}`
        );
      }
    }
  }

  reportSection("Logistica sin Venta", logResults);
  reportSection("Envios sin Logistica", envResults);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
