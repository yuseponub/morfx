/**
 * Bigin → MorfX Migration: Phase 1 - Download All Records
 *
 * Downloads all records from Bigin CRM (Pipelines + Contacts modules)
 * and saves them as raw JSON files.
 *
 * Usage: npx tsx scripts/bigin-migration/01-download.ts
 */

import * as fs from "fs";
import * as path from "path";

// Load env from script-local .env (no dotenv dependency)
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = value;
  }
}

// ─── Config ───────────────────────────────────────────────────────
const CONFIG = {
  clientId: process.env.ZOHO_CLIENT_ID!,
  clientSecret: process.env.ZOHO_CLIENT_SECRET!,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN!,
  apiDomain: process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.com",
  accountsUrl: process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com",
  perPage: 200,
  rateLimitDelay: 700, // ms between requests (~85 req/min, safe under 100)
  maxRetries: 5,
  dataDir: path.join(__dirname, "data"),
};

const MODULES_TO_DOWNLOAD = [
  {
    name: "Pipelines",
    fields: [
      "Owner",
      "Amount",
      "Deal_Name",
      "Closing_Date",
      "Account_Name",
      "Stage",
      "Created_By",
      "Modified_By",
      "Created_Time",
      "Modified_Time",
      "Description",
      "Contact_Name",
      "Last_Activity_Time",
      "Pipeline",
      "Tag",
      "Sub_Pipeline",
      "Associated_Products",
      "Secondary_Contacts",
      "shopifyforbigin0__Shopify_Lead_Source",
      "shopifyforbigin0__Shopify_Order_Id",
      "shopifyforbigin0__Shopify_Sync_Data",
      "Municipio_Dept",
      "Direcci_n",
      "Telefono",
      "Guia",
      "Departamento",
      "CallBell",
      "Transportadora",
      "email",
      "Record_Creation_Source_ID__s",
    ],
  },
  {
    name: "Contacts",
    fields: [
      "Owner",
      "First_Name",
      "Last_Name",
      "Account_Name",
      "Email",
      "Title",
      "Phone",
      "Home_Phone",
      "Mobile",
      "Created_By",
      "Modified_By",
      "Created_Time",
      "Modified_Time",
      "Full_Name",
      "Mailing_Street",
      "Mailing_City",
      "Mailing_State",
      "Mailing_Zip",
      "Mailing_Country",
      "Description",
      "Email_Opt_Out",
      "Last_Activity_Time",
      "Tag",
      "Direccion",
      "creacion",
      "creation",
      "shopifyforbigin0__Shopify_Contact_Id",
      "shopifyforbigin0__Shopify_Lead_Source",
      "shopifyforbigin0__Shopify_Sync_Data",
      "Record_Creation_Source_ID__s",
    ],
  },
  {
    name: "Products",
    fields: [], // will fetch field list dynamically
  },
];

// ─── Auth ─────────────────────────────────────────────────────────
let accessToken: string = "";

async function refreshAccessToken(): Promise<string> {
  const url = `${CONFIG.accountsUrl}/oauth/v2/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    refresh_token: CONFIG.refreshToken,
  });

  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`Failed to refresh token: ${JSON.stringify(data)}`);
  }

  accessToken = data.access_token;
  console.log("  [auth] Access token refreshed");
  return accessToken;
}

// ─── API Client ───────────────────────────────────────────────────
async function biginGet(
  endpoint: string,
  retries = 0
): Promise<{ data: any[]; info: any } | null> {
  const url = `${CONFIG.apiDomain}/bigin/v2/${endpoint}`;

  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });

  // Rate limit - exponential backoff
  if (res.status === 429) {
    if (retries >= CONFIG.maxRetries) {
      throw new Error(`Rate limited after ${CONFIG.maxRetries} retries: ${url}`);
    }
    const delay = Math.pow(2, retries) * 1000 + Math.random() * 500;
    console.log(`  [rate-limit] 429 received, waiting ${Math.round(delay)}ms (retry ${retries + 1}/${CONFIG.maxRetries})`);
    await sleep(delay);
    return biginGet(endpoint, retries + 1);
  }

  // Token expired - refresh and retry
  if (res.status === 401) {
    console.log("  [auth] Token expired, refreshing...");
    await refreshAccessToken();
    return biginGet(endpoint, retries);
  }

  // No data (empty module or past last page)
  if (res.status === 204) {
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Download Module ──────────────────────────────────────────────
interface DownloadResult {
  module: string;
  totalRecords: number;
  totalPages: number;
  pipelines: Record<string, number>;
  stages: Record<string, number>;
  durationSecs: number;
}

async function getModuleFields(moduleName: string): Promise<string[]> {
  const result = await biginGet(`settings/fields?module=${moduleName}`);
  if (!result || !result.data) {
    // fields endpoint returns { fields: [...] } not { data: [...] }
    const url = `${CONFIG.apiDomain}/bigin/v2/settings/fields?module=${moduleName}`;
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    const json = await res.json();
    if (json.fields) {
      return json.fields.map((f: any) => f.api_name);
    }
    return [];
  }
  return result.data.map((f: any) => f.api_name);
}

async function downloadModule(
  moduleName: string,
  fields: string[]
): Promise<DownloadResult> {
  const startTime = Date.now();
  const allRecords: any[] = [];
  let page = 1;
  let hasMore = true;
  let pageToken: string | null = null;

  // If no fields specified, fetch them dynamically
  if (fields.length === 0) {
    console.log(`  [fields] Fetching field list for ${moduleName}...`);
    fields = await getModuleFields(moduleName);
    console.log(`  [fields] Found ${fields.length} fields: ${fields.join(", ")}`);
  }

  const fieldsParam = fields.join(",");

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Downloading: ${moduleName}`);
  console.log(`Fields: ${fields.length}`);
  console.log(`${"=".repeat(60)}`);

  while (hasMore) {
    let endpoint = `${moduleName}?per_page=${CONFIG.perPage}&fields=${fieldsParam}`;
    if (pageToken) {
      endpoint += `&page_token=${pageToken}`;
    } else {
      endpoint += `&page=${page}`;
    }

    const result = await biginGet(endpoint);

    if (!result || !result.data || result.data.length === 0) {
      hasMore = false;
      break;
    }

    allRecords.push(...result.data);

    const info = result.info;
    hasMore = info.more_records === true;
    pageToken = info.next_page_token || null;

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = allRecords.length / elapsed;
    const estimatedTotal = hasMore ? "..." : allRecords.length;
    process.stdout.write(
      `\r  Page ${page} | ${allRecords.length} records | ${rate.toFixed(0)} rec/s | elapsed ${elapsed.toFixed(0)}s | total ~${estimatedTotal}`
    );

    page++;

    // Rate limit delay
    if (hasMore) {
      await sleep(CONFIG.rateLimitDelay);
    }
  }

  console.log(""); // newline after progress

  const duration = (Date.now() - startTime) / 1000;

  // Save raw data
  const outputPath = path.join(CONFIG.dataDir, `${moduleName.toLowerCase()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allRecords, null, 2));
  console.log(`  Saved: ${outputPath} (${allRecords.length} records)`);

  // Compute stats
  const pipelines: Record<string, number> = {};
  const stages: Record<string, number> = {};

  for (const rec of allRecords) {
    if (rec.Pipeline?.name) {
      pipelines[rec.Pipeline.name] = (pipelines[rec.Pipeline.name] || 0) + 1;
    }
    if (rec.Stage) {
      stages[rec.Stage] = (stages[rec.Stage] || 0) + 1;
    }
  }

  return {
    module: moduleName,
    totalRecords: allRecords.length,
    totalPages: page - 1,
    pipelines,
    stages,
    durationSecs: Math.round(duration),
  };
}

// ─── Summary ──────────────────────────────────────────────────────
function printSummary(results: DownloadResult[]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log("DOWNLOAD SUMMARY");
  console.log(`${"=".repeat(60)}`);

  let grandTotal = 0;

  for (const r of results) {
    grandTotal += r.totalRecords;
    console.log(`\n📦 ${r.module}`);
    console.log(`   Records: ${r.totalRecords.toLocaleString()}`);
    console.log(`   Pages: ${r.totalPages}`);
    console.log(`   Duration: ${r.durationSecs}s`);

    if (Object.keys(r.pipelines).length > 0) {
      console.log(`   Pipelines:`);
      for (const [name, count] of Object.entries(r.pipelines).sort(
        (a, b) => b[1] - a[1]
      )) {
        console.log(`     - ${name}: ${count.toLocaleString()}`);
      }
    }

    if (Object.keys(r.stages).length > 0) {
      console.log(`   Stages (top 15):`);
      const sorted = Object.entries(r.stages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
      for (const [name, count] of sorted) {
        console.log(`     - ${name}: ${count.toLocaleString()}`);
      }
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`GRAND TOTAL: ${grandTotal.toLocaleString()} records`);
  console.log(`${"─".repeat(60)}\n`);

  // Save summary
  const summaryPath = path.join(CONFIG.dataDir, "_summary.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        downloadedAt: new Date().toISOString(),
        results,
        grandTotal,
      },
      null,
      2
    )
  );
  console.log(`Summary saved: ${summaryPath}`);
}

// ─── Helpers ──────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateConfig() {
  const required = ["clientId", "clientSecret", "refreshToken"] as const;
  for (const key of required) {
    if (!CONFIG[key]) {
      console.error(`Missing config: ${key}. Check your .env file.`);
      process.exit(1);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log("Bigin → MorfX Migration: Download Phase");
  console.log(`${"─".repeat(60)}`);

  validateConfig();

  // Ensure data dir exists
  fs.mkdirSync(CONFIG.dataDir, { recursive: true });

  // Get initial access token
  await refreshAccessToken();

  // Download each module
  const results: DownloadResult[] = [];

  for (const mod of MODULES_TO_DOWNLOAD) {
    try {
      const result = await downloadModule(mod.name, mod.fields);
      results.push(result);
    } catch (err) {
      console.error(`\nFailed to download ${mod.name}:`, err);
      results.push({
        module: mod.name,
        totalRecords: 0,
        totalPages: 0,
        pipelines: {},
        stages: {},
        durationSecs: 0,
      });
    }
  }

  printSummary(results);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
