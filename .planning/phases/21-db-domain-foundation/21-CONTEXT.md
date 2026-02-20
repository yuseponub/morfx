# Phase 21: DB + Domain Foundation - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Data infrastructure for all carrier integrations: Colombian municipalities with DANE codes, Coordinadora coverage/COD tables, workspace carrier credentials, and robot job tracking with per-order status. Domain functions handle all robot-related mutations (triggering automations). No UI in this phase — data and domain layer only.

</domain>

<decisions>
## Implementation Decisions

### City Name Matching
- Cities must be mapped TO Coordinadora's exact format: `NOMBRE (DEPTO_ABREV)` — all uppercase
- 1,489 cities total from Coordinadora's platform (file provided by user: ciudades-coordinadora.txt)
- Separate list for cities that accept COD (recaudo contraentrega): ~1,181 cities
- Matching strategy: normalize input (uppercase, remove accents, trim) → build `CIUDAD (DEPTO_ABREV)` → exact match against Coordinadora list
- Department mapping required: full name → abbreviation (e.g., ANTIOQUIA → ANT, CUNDINAMARCA → C/MARCA, BOGOTA D.C. → C/MARCA)
- Use department from order to disambiguate duplicate city names (e.g., ALBANIA exists in ANT, CAQ, GUAJ)
- **If no match: order is rejected** — does not get submitted to robot, returned to operator with error
- Validation happens in two places: standalone `validar ciudades` command AND automatically at `subir ordenes` time

### Robot Job Lifecycle
- **Job-level states:** pending → processing → completed/failed (simple — 'completed' includes partial successes)
- **Item-level states:** pending → processing → success/error (4 states)
- Individual order retry supported — operator can retry only failed orders without resubmitting the whole batch
- On success: save # pedido Coordinadora to order's `tracking_number` field in CRM + trigger automations (stage change, WhatsApp, etc.)
- Result from Coordinadora is "número de pedido" (NOT "número de guía")

### Carrier Configuration
- Per-workspace: only user + password for ff.coordinadora.com portal
- No sender/remitente data needed — sender is already configured in the Coordinadora portal account
- Only Coordinadora for v3.0 — table can be generic but only Coordinadora is used
- Configuration lives in existing Settings page under a new "Logística/Transportadoras" section

### Tracking per Order (robot_job_items)
- Detailed tracking: status, # pedido Coordinadora, error message, validated city, value sent, timestamps per state transition
- Error categorization: type (validation, portal, timeout, unknown) + detailed message — enables filtering and reporting by error type
- Job history visible in Chat de Comandos (Phase 24) — not a separate UI

### Claude's Discretion
- Exact DB schema design (column types, indexes, constraints)
- DANE code data source and seeding strategy
- Coverage table structure (how to link municipalities to carriers)
- Domain function signatures and internal patterns
- Whether carrier_configs uses JSONB for credentials or separate columns

</decisions>

<specifics>
## Specific Ideas

- User provided actual Coordinadora city list file (1,489 entries) — this IS the source of truth for the coverage table
- Current robot repo: github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/tree/master/Agentes%20Logistica/robot-coordinadora
- Current robot's `PedidoInput` interface: identificacion, nombres, apellidos, direccion, ciudad, departamento, celular, email, referencia, unidades, totalConIva, valorDeclarado, esRecaudoContraentrega, peso/alto/largo/ancho
- Current `MAPEO_DEPARTAMENTOS` maps 35+ department name variants → Coordinadora abbreviations (BOGOTA D.C. → C/MARCA, VALLE DEL CAUCA → VALLE, etc.)
- Current robot normalizes with: `toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()`
- Matching logic: try exact `CITY (DEPT)` → fallback to city-only if single match → try with dept abbreviation
- Browser opens per-request, closes after — no persistent browser

</specifics>

<deferred>
## Deferred Ideas

- Multi-carrier support (Inter, Envia, Bogota) — v4.0 (FROBOT-01 to FROBOT-03)
- AI-powered command parsing — v4.0 (FADV-01)
- Carrier-aware city autocomplete in order forms — v4.0 (FADV-02)
- Delivery failure workflow (novedad → WhatsApp + task) — v4.0 (FADV-04)

</deferred>

---

*Phase: 21-db-domain-foundation*
*Context gathered: 2026-02-20*
