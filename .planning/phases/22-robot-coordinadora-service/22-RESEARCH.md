# Phase 22: Robot Coordinadora Service - Research

**Researched:** 2026-02-20
**Domain:** Express + Playwright browser automation microservice (Docker/Railway)
**Confidence:** HIGH

## Summary

This phase ports an existing, proven robot-coordinadora service from Hostinger/n8n to Docker/Railway with MorfX integration. The source code has been fully retrieved and analyzed -- it consists of a CoordinadoraAdapter class (Playwright automation with proven CSS selectors for ff.coordinadora.com), an Express server with health/validation/batch endpoints, and TypeScript type definitions.

The porting work is well-scoped: the core Playwright automation (form filling, city autocomplete, SweetAlert2 result detection, cookie session management) remains unchanged. What changes is the orchestration layer (n8n replaced by MorfX HTTP calls from Phase 23's Inngest orchestrator), CRM integration (Bigin types replaced by MorfX's PedidoInput from `src/lib/logistics/constants.ts`), deployment (Hostinger VPS replaced by Docker on Railway), and city validation (local text files replaced by Phase 21's DB tables accessed via an HTTP call back to MorfX or embedded in the robot).

**Primary recommendation:** Port the existing CoordinadoraAdapter almost verbatim, adapt the Express server to use MorfX types (PedidoInput already defined), implement workspace/order locking as in-memory Maps (single-instance service), persist session cookies via Playwright's storageState API to a local file, and deploy with the official Playwright Docker base image (`mcr.microsoft.com/playwright:v1.58.2-noble`).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | 1.58.2 | Browser automation (Chromium headless) | Official Playwright; proven selectors from existing robot |
| Express | 4.x | HTTP API server | Same as existing robot; lightweight, zero overhead |
| TypeScript | 5.x | Type safety | Same as existing robot; matches MorfX stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | 16.x | Environment variable loading | Local dev only; Railway injects env vars |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Express | Fastify | Not worth changing -- existing robot uses Express, minimal benefit |
| Playwright | Puppeteer | Playwright has proven selectors; switching adds risk for zero benefit |
| In-memory locks | Redis | Single-instance service, Redis is overkill; defer to v4.0+ multi-instance |

### Dependencies NOT Needed (removed from original)
| Original Dep | Why Removed |
|-------------|-------------|
| nanoid | Not needed -- UUIDs come from MorfX domain layer |
| dotenv | Railway injects env vars; only needed for local dev |

**Installation:**
```bash
npm install playwright express
npm install -D typescript @types/node @types/express tsx
npx playwright install chromium --with-deps
```

## Architecture Patterns

### Recommended Project Structure
```
robot-coordinadora/
├── src/
│   ├── adapters/
│   │   └── coordinadora-adapter.ts    # Core Playwright automation (ported)
│   ├── api/
│   │   └── server.ts                  # Express endpoints
│   ├── middleware/
│   │   └── locks.ts                   # Workspace + order locking
│   ├── types/
│   │   └── index.ts                   # MorfX-adapted types
│   └── index.ts                       # Entry point (starts Express)
├── storage/
│   └── sessions/                      # Cookie persistence (gitignored)
├── Dockerfile
├── .dockerignore
├── package.json
├── tsconfig.json
└── README.md
```

### Pattern 1: Adapter Isolation
**What:** The CoordinadoraAdapter class encapsulates ALL Playwright interaction. The Express layer never touches Playwright directly.
**When to use:** Always -- this is the existing pattern and it works.
**Example:**
```typescript
// Source: Existing robot code (GitHub)
// Express endpoint creates adapter, calls method, closes adapter
const adapter = new CoordinadoraAdapter(credentials);
await adapter.init();
const loginOk = await adapter.login();
const result = await adapter.createGuiaConDatosCompletos(pedidoInput);
await adapter.close();
```

### Pattern 2: Workspace Lock (In-Memory Mutex)
**What:** Only one batch job per workspace can run at a time. Implemented as a `Map<workspaceId, Promise>` that serializes access.
**When to use:** Every batch request checks the lock before proceeding.
**Example:**
```typescript
// Source: Standard Node.js mutex pattern
const workspaceLocks = new Map<string, Promise<void>>();

async function withWorkspaceLock<T>(
  workspaceId: string,
  fn: () => Promise<T>
): Promise<T> {
  // Wait for any existing lock to complete
  while (workspaceLocks.has(workspaceId)) {
    await workspaceLocks.get(workspaceId);
  }

  let resolve: () => void;
  const lockPromise = new Promise<void>(r => { resolve = r; });
  workspaceLocks.set(workspaceId, lockPromise);

  try {
    return await fn();
  } finally {
    workspaceLocks.delete(workspaceId);
    resolve!();
  }
}
```

### Pattern 3: Per-Order Lock (Skip If Processing)
**What:** Orders already being processed are skipped rather than blocking. Implemented as a `Set<orderId>`.
**When to use:** Within a batch, each order checks the set before starting.
**Example:**
```typescript
const processingOrders = new Set<string>();

function tryLockOrder(orderId: string): boolean {
  if (processingOrders.has(orderId)) return false;
  processingOrders.add(orderId);
  return true;
}

function unlockOrder(orderId: string): void {
  processingOrders.delete(orderId);
}
```

### Pattern 4: Cookie Session Persistence
**What:** Save Playwright browser cookies to disk after login, load them before navigating. Avoids re-login on every batch.
**When to use:** On every adapter init (load cookies) and after successful login (save cookies).
**Example:**
```typescript
// Source: Existing robot + Playwright storageState docs
// Save after login:
const cookies = await this.context.cookies();
fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2));

// Load on init:
if (fs.existsSync(this.cookiesPath)) {
  const cookies = JSON.parse(fs.readFileSync(this.cookiesPath, 'utf-8'));
  await this.context.addCookies(cookies);
}
```

### Pattern 5: Credentials Per-Request
**What:** Robot receives portal credentials from MorfX in each request body (not from env vars). This supports multi-workspace.
**When to use:** Every order creation request must include credentials.
**Example:**
```typescript
// MorfX sends credentials per-request
interface BatchRequest {
  workspaceId: string;
  credentials: { username: string; password: string };
  callbackUrl: string;
  orders: PedidoInput[];
}
```

### Anti-Patterns to Avoid
- **Long-lived browser instances:** Close the browser after each batch to prevent memory leaks and zombie processes. The existing robot already does this correctly.
- **Parallel order submission:** The portal uses React + MUI forms with sequential SweetAlert2 confirmations. Orders MUST be submitted sequentially with delays. The existing robot's 2-second delay between orders is correct.
- **Storing cookies per-workspace in env vars:** Cookie files should be scoped per workspace to avoid session cross-contamination.
- **Fire-and-forget browser cleanup:** Always use try/finally to ensure browser.close() runs even on errors. The existing robot does this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser automation | Custom fetch/axios | Playwright chromium.launch() | Portal is React SPA with dynamic MUI components, JS-only interactions |
| City autocomplete | Direct input fill | Type + ArrowDown + Enter | MUI Autocomplete requires keyboard interaction, not just value setting |
| Result detection | Page content parsing | SweetAlert2 CSS selectors | Portal uses SweetAlert2 for success/error notifications |
| Session persistence | Custom cookie manager | Playwright context.cookies() / context.addCookies() | Built-in, handles all cookie attributes correctly |
| Docker image | Custom FROM node + apt-get | mcr.microsoft.com/playwright:v1.58.2-noble | Official image includes all Chromium system dependencies |

**Key insight:** The CoordinadoraAdapter is the most valuable piece -- its selectors and interaction patterns are proven in production. Rewriting any part of it is unnecessary risk.

## Common Pitfalls

### Pitfall 1: MUI Autocomplete City Selection Failure
**What goes wrong:** City field appears filled but the value is not actually selected in the React state.
**Why it happens:** MUI Autocomplete requires the dropdown to appear, an option to be highlighted, and Enter pressed. Just using `.fill()` doesn't trigger React's onChange.
**How to avoid:** Use the proven pattern: `click() -> fill(city) -> waitForTimeout(1000) -> ArrowDown -> waitForTimeout(300) -> Enter`.
**Warning signs:** Portal shows validation error on city field after submit.

### Pitfall 2: Zombie Chromium Processes
**What goes wrong:** Chromium processes accumulate, consuming all memory until the container OOMs.
**Why it happens:** `adapter.close()` not called on error paths, or browser launched but login fails and close is skipped.
**How to avoid:** Always wrap adapter lifecycle in try/finally. The existing robot's pattern in server.ts is correct.
**Warning signs:** Container memory steadily increases over time; Railway shows OOM restarts.

### Pitfall 3: SweetAlert2 Timing
**What goes wrong:** Success/error detection fails because the SweetAlert modal hasn't appeared yet.
**Why it happens:** The portal's server-side validation takes variable time. The existing robot waits 5 seconds.
**How to avoid:** Keep the 5-second `waitForTimeout` after clicking submit. Consider adding a `waitForSelector` with timeout as backup.
**Warning signs:** Orders appear to succeed (no error detected) but were actually rejected by the portal.

### Pitfall 4: Shared Memory (Docker /dev/shm)
**What goes wrong:** Chromium crashes inside Docker with "out of memory" errors.
**Why it happens:** Docker's default /dev/shm is 64MB; Chromium uses it heavily for rendering.
**How to avoid:** Use `--disable-dev-shm-usage` launch arg (makes Chromium use /tmp instead) OR set `shm_size: '2gb'` in Docker Compose / Railway config.
**Warning signs:** Browser crashes randomly, especially with larger pages.

### Pitfall 5: COD Validation Before Portal Submission
**What goes wrong:** Robot submits order with COD to a city that doesn't support it; portal shows error after wasting a browser session.
**Why it happens:** COD availability varies by city and must be checked BEFORE portal form submission.
**How to avoid:** Validate `esRecaudoContraentrega` against `supports_cod` from coverage data BEFORE calling the adapter. The existing robot checks this but uses local files; now use the MorfX API or the robot's own endpoint (Phase 21's `carrier_coverage.supports_cod`).
**Warning signs:** Batch has many portal errors for COD orders.

### Pitfall 6: Pedido Number Tracking
**What goes wrong:** Duplicate pedido numbers cause portal rejection.
**Why it happens:** The existing robot tracks pedido numbers via a local file (`.ultimo-pedido.txt`) and DataGrid scraping, which can get out of sync.
**How to avoid:** In the MorfX version, use the order name or a combination of job_item_id + sequence as the pedido reference, rather than scraping the DataGrid. Alternatively, let the portal auto-assign numbers if the form supports it. The `numeroPedido` field in the form is the key -- investigate if it can be omitted or if the portal assigns it automatically.
**Warning signs:** Portal returns errors about duplicate pedido numbers.

### Pitfall 7: Stale Session Cookies
**What goes wrong:** Loaded cookies have expired, but the adapter assumes it's logged in.
**Why it happens:** Coordinadora session timeout (unknown duration) invalidates cookies between batches.
**How to avoid:** After loading cookies, navigate to the portal and check if the URL redirects to login. The existing robot already does this: `if (this.page.url().includes('/panel'))` means session is active.
**Warning signs:** First order in batch fails because the form page shows login instead.

## Code Examples

### Complete Adapted PedidoInput (MorfX version)
```typescript
// Source: src/lib/logistics/constants.ts (already defined in Phase 21)
export interface PedidoInput {
  identificacion: string;      // Contact phone (10 digits, used as ID)
  nombres: string;             // Contact first name
  apellidos: string;           // Contact last name
  direccion: string;           // Order shipping_address
  ciudad: string;              // Coordinadora city format "CITY (DEPT)"
  departamento: string;        // Department abbreviation
  celular: string;             // Contact phone
  email: string;               // Contact email
  referencia: string;          // Order name/reference
  unidades: number;            // Product quantity
  totalConIva: number;         // Order total_value
  valorDeclarado: number;      // Declared value
  esRecaudoContraentrega: boolean; // COD flag
  peso: number;                // Package weight
  alto: number;                // Package height
  largo: number;               // Package length
  ancho: number;               // Package width
}
```

### Express Batch Endpoint (MorfX version)
```typescript
// Source: Adapted from existing server.ts
app.post('/api/crear-pedidos-batch', async (req, res) => {
  const { workspaceId, credentials, callbackUrl, orders, jobId } = req.body;

  // Workspace lock: reject if another batch is running
  if (workspaceLocks.has(workspaceId)) {
    return res.status(409).json({
      success: false,
      error: 'Ya hay un batch en proceso para este workspace',
    });
  }

  // Acknowledge immediately -- processing happens async
  res.json({ success: true, jobId, message: 'Batch accepted' });

  // Process in background with lock
  await withWorkspaceLock(workspaceId, async () => {
    const adapter = new CoordinadoraAdapter(credentials);
    try {
      await adapter.init();
      const loginOk = await adapter.login();
      if (!loginOk) throw new Error('Login failed');

      for (const order of orders) {
        if (!tryLockOrder(order.orderId)) {
          // Report skip via callback
          await reportResult(callbackUrl, {
            itemId: order.itemId,
            status: 'error',
            errorType: 'validation',
            errorMessage: 'Pedido ya en proceso',
          });
          continue;
        }

        try {
          const result = await adapter.createGuiaConDatosCompletos(order.pedidoInput);
          await reportResult(callbackUrl, {
            itemId: order.itemId,
            status: result.success ? 'success' : 'error',
            trackingNumber: result.numeroGuia,
            errorType: result.success ? undefined : 'portal',
            errorMessage: result.error,
          });
        } finally {
          unlockOrder(order.orderId);
        }

        // Delay between orders
        await sleep(2000);
      }
    } finally {
      await adapter.close();
    }
  });
});
```

### Dockerfile
```dockerfile
# Source: Playwright official Docker docs
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s \
  CMD curl -f http://localhost:3001/api/health || exit 1

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

### Cookie Session Per-Workspace
```typescript
// Cookies scoped per workspace to prevent cross-contamination
private getCookiesPath(workspaceId: string): string {
  return path.join(process.cwd(), 'storage/sessions', `${workspaceId}-cookies.json`);
}
```

## State of the Art

| Old Approach (existing robot) | New Approach (MorfX Phase 22) | Why Changed |
|-------------------------------|-------------------------------|-------------|
| Env-var credentials | Per-request credentials from MorfX | Multi-workspace support |
| Local .txt city files | Phase 21 DB tables (or MorfX API) | Single source of truth |
| n8n orchestration | MorfX Inngest (Phase 23) | Integrated pipeline |
| Bigin CRM types | MorfX PedidoInput type | Already defined |
| .ultimo-pedido.txt tracking | DB-based tracking via robot_job_items | Reliable, queryable |
| Hostinger VPS + PM2 | Docker on Railway | Managed infra, auto-restarts |
| Single-workspace | Multi-workspace via per-request credentials | MorfX is multi-tenant |

**No deprecated patterns in the new version.** All Playwright APIs used (chromium.launch, context.cookies, addCookies, fill, click, keyboard.press) are current and stable.

## Integration Points with MorfX

### Data Flow: MorfX -> Robot
1. Phase 23 Inngest orchestrator calls robot's `/api/crear-pedidos-batch`
2. Request body contains: `workspaceId`, `credentials`, `callbackUrl`, `jobId`, `orders[]`
3. Each order has `itemId` (robot_job_item.id), `orderId`, and `pedidoInput` (PedidoInput)

### Data Flow: Robot -> MorfX
1. Robot processes each order sequentially
2. After each order, robot POSTs result to `callbackUrl` (MorfX API route)
3. Callback payload: `{ itemId, status, trackingNumber?, errorType?, errorMessage? }`
4. MorfX callback API calls `updateJobItemResult` domain function
5. Domain function updates order.tracking_number on success (triggers `field.changed` automation)

### Existing Foundation (Phase 21)
- `PedidoInput` type: Already defined in `src/lib/logistics/constants.ts`
- `robot_jobs` + `robot_job_items` tables: Created with all needed columns
- `carrier_configs`: Stores portal credentials per workspace
- `carrier_coverage`: City validation with COD support flags
- `RobotEvents` Inngest events: `robot/job.submitted`, `robot/item.completed`, `robot/job.completed`
- Domain functions: `createRobotJob`, `updateJobItemResult`, `updateJobStatus`, `getJobWithItems`, `retryFailedItems`

### City Validation Strategy
The robot needs to validate cities before portal submission. Two approaches:
1. **Robot calls MorfX API** -- Robot has a `/api/validar-ciudad` endpoint that calls back to MorfX's carrier-coverage domain
2. **MorfX validates before dispatch** -- Phase 23 orchestrator validates all cities using `validateCities()` domain function BEFORE sending to robot

**Recommendation:** Option 2 is better. MorfX validates cities during the `robot/job.submitted` handler (Phase 23), rejecting invalid cities as `error` items BEFORE calling the robot. The robot then only receives pre-validated orders with `coordinadoraCity` already resolved. This reduces round-trips and keeps validation logic in the domain layer where it belongs.

## Resource Requirements (Railway)

| Resource | Minimum | Recommended | Notes |
|----------|---------|-------------|-------|
| RAM | 512 MB | 1 GB | Chromium headless ~700MB peak |
| CPU | 0.5 vCPU | 1 vCPU | Single browser instance |
| Disk | 100 MB | 250 MB | For cookies + screenshots |
| Start time | ~10s | ~15s | Chromium install in image |

**Railway configuration:**
- Use Docker deployment (not Nixpacks)
- Set health check path: `/api/health`
- Port: 3001
- No persistent volume needed (cookies recreated on login)

## Open Questions

### 1. Pedido Number Strategy
- **What we know:** The existing robot scrapes the DataGrid for the last pedido number and increments. This is fragile.
- **What's unclear:** Can the `numeroPedido` form field be left empty for auto-assignment? Or does Coordinadora require it?
- **Recommendation:** Keep the existing pattern initially (scrape + increment). If it proves unreliable, investigate portal auto-assignment. The `referencia` field can use the MorfX order name.

### 2. Session Cookie Expiration Duration
- **What we know:** Coordinadora uses cookie-based sessions. The existing robot loads/saves cookies.
- **What's unclear:** How long do Coordinadora sessions last? Hours? Days?
- **Recommendation:** Always check session validity by navigating and checking URL. If expired, re-login. This is already implemented in the existing robot.

### 3. Portal Rate Limiting
- **What we know:** The existing robot uses 2-second delays between orders.
- **What's unclear:** Does Coordinadora have explicit rate limits or will they block automated access?
- **Recommendation:** Keep 2-second delays. Add exponential backoff if portal errors increase. Monitor for 429 or blocking responses.

### 4. Screenshot Storage
- **What we know:** The existing robot saves screenshots to `storage/artifacts/` on error.
- **What's unclear:** Should screenshots be persisted across container restarts? Uploaded to Supabase Storage?
- **Recommendation:** Save to local temp directory for immediate debugging. Container restarts will lose them, which is acceptable for v3.0. If needed later, upload to Supabase Storage via callback.

## Sources

### Primary (HIGH confidence)
- **Existing robot source code** (GitHub: yuseponub/AGENTES-IA-FUNCIONALES-v3/Agentes Logistica/robot-coordinadora) -- Complete adapter, server, types retrieved and analyzed
- **Playwright official Docker docs** (https://playwright.dev/docs/docker) -- Docker image v1.58.2, Dockerfile patterns, `--disable-dev-shm-usage`
- **Playwright official Auth docs** (https://playwright.dev/docs/auth) -- storageState API for cookie persistence
- **MorfX codebase** -- Phase 21 domain layer (robot-jobs.ts, carrier-configs.ts, carrier-coverage.ts), Inngest events (RobotEvents), PedidoInput type (constants.ts)

### Secondary (MEDIUM confidence)
- **Railway Playwright template** (https://railway.com/deploy/playwright-ts-puppet) -- Docker deployment pattern confirmed
- **Playwright browser footprint blog** (https://datawookie.dev/blog/2025/06/playwright-browser-footprint/) -- Chromium headless ~700MB peak memory

### Tertiary (LOW confidence)
- **Medium articles on Playwright production** -- 3-4 concurrent workers per 8GB RAM (not directly applicable since we run 1 at a time)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Existing robot code is the blueprint; Playwright and Express are proven
- Architecture: HIGH -- Direct port with well-defined changes; all integration points (domain layer, Inngest events, PedidoInput type) already exist in MorfX
- Pitfalls: HIGH -- Existing robot code reveals all known gotchas; Docker/Playwright issues are well-documented

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable domain, Playwright releases monthly but API is stable)
