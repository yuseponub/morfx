# Phase 22: Robot Coordinadora Service - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Standalone Express + Playwright microservice that automates shipping order creation on Coordinadora's portal via browser automation. Handles batches, sessions, and failures. Communicates results back to MorfX via HTTP callbacks.

This is a PORT of the existing robot (GitHub: yuseponub/AGENTES-IA-FUNCIONALES-v3/Agentes Logistica/robot-coordinadora) from Hostinger/n8n to Docker/Railway with MorfX integration replacing Bigin/n8n.

</domain>

<decisions>
## Implementation Decisions

### Scope & Philosophy
- The robot is infrastructure — it does its job, reports results/failures, and that's it
- No complex configurable module needed — if fixes are needed, they're done via Claude Code
- The only user-facing configuration is pipeline stage triggering (Phase 25, not this phase)
- Keep it simple: process orders, report success/error per order

### Existing Robot as Reference
- Complete working robot exists at: https://github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/tree/master/Agentes%20Logistica/robot-coordinadora
- Architecture: Express (port 3001) + Playwright + cookie-based session
- Portal URLs: login at ff.coordinadora.com, form at /panel/agregar_pedidos/coordinadora
- Form uses React + Material-UI (MUI Autocomplete for city, SweetAlert2 for results)
- All CSS selectors, form fields, and portal flow are documented in the existing code
- Key endpoints to replicate: /api/health, /api/validar-ciudad, /api/crear-pedido, /api/crear-pedidos-batch
- City validation: 1,488 cities total, 1,181 with COD support (already seeded in Phase 21 DB)

### What Changes from Existing Robot
- **Replaces:** n8n orchestration → Inngest events (Phase 23)
- **Replaces:** Bigin CRM integration → MorfX domain layer callbacks
- **Replaces:** Hostinger VPS → Docker container on Railway
- **Replaces:** Local file-based city lists → Phase 21 DB tables (dane_municipalities, coordinadora_coverage)
- **Replaces:** .ultimo-pedido.txt file → DB tracking via robot_jobs/robot_job_items
- **Replaces:** Bigin types (BiginOrder, BiginConfig) → MorfX order types
- **Keeps:** CoordinadoraAdapter core (Playwright automation, selectors, form flow)
- **Keeps:** Cookie-based session management
- **Keeps:** Sequential batch processing with delays
- **Adds:** Workspace lock + per-order lock + batch idempotency (from roadmap)
- **Adds:** Health check endpoint for Railway
- **Adds:** Callback URL to report results to MorfX

### Credentials
- Stored in carrier_configs table (Phase 21) per workspace
- Robot receives credentials per-request from MorfX (not env vars)
- Portal password stored plaintext (v3.0 decision — not payment data)

### Claude's Discretion
- Docker configuration and Railway deployment setup
- Internal error retry logic and timeouts
- Logging format and verbosity
- Screenshot-on-error behavior
- Exact workspace/order lock implementation (mutex, semaphore, etc.)

</decisions>

<specifics>
## Specific Ideas

- The existing robot code is the blueprint — port it, don't rewrite from scratch
- The `CoordinadoraAdapter` class with all selectors and form filling logic is proven and working
- `createGuiaConDatosCompletos()` is the primary method to use (clean data input)
- City autocomplete interaction pattern: type → wait → ArrowDown → Enter
- SweetAlert2 detection for success/error is the confirmation mechanism
- Sequential batch processing with 2-second delays prevents portal overload

## Existing Robot Source Reference

Key files to port:
- `src/adapters/coordinadora-adapter.ts` — Core Playwright automation (login, form fill, submit, session)
- `src/api/server.ts` — Express endpoints, city validation, batch processing
- `src/types/index.ts` — Type definitions (adapt BiginOrder → MorfX order)

Portal selectors (proven working):
- Login: `input[name="usuario"]`, `input[name="clave"]`, `button:has-text("Ingresar")`
- Form: `input[name="identificacion_destinatario"]`, `input[id^="mui-"]` (city)
- Submit: `button[type="submit"]:has-text("Enviar Pedido")`
- Result: `.swal2-success`, `.swal2-error`, `.swal2-confirm`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-robot-coordinadora-service*
*Context gathered: 2026-02-20*
