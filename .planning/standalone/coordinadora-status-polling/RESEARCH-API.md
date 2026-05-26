# Research: Coordinadora Mercantil Tracking API

> **STATUS: SUPERSEDED 2026-05-26** by `.planning/standalone/coordinadora-api-integration/`.
>
> Este research investigó SOAP polling (AGS v1.4 / AGW v1.6) como approach para tracking.
> Coordinadora oficialmente ofrece **webhook push REST** (no SOAP polling) — confirmado por Jenny (Coordinadora) en respuesta del 2026-05-20 + PDF `Notificación push Tracking v3`.
>
> El nuevo approach: receptor HTTPS sin auth en `morfx.app/api/webhooks/coordinadora/[env]` que recibe envelope Google Pub/Sub. Ver `coordinadora-api-integration/CONTEXT.md` D-32.
>
> No borrar este archivo: queda como referencia histórica del SOAP API (puede ser útil si en V2 quisiéramos consultar estados puntualmente fuera del flujo webhook).

---

**Researched:** 2026-04-10
**Overall confidence:** HIGH
**Verdict:** Coordinadora HAS a SOAP web service for tracking. TWO API versions exist.

---

## Executive Summary

Coordinadora Mercantil exposes SOAP web services for shipment tracking. There are **two distinct API versions** with different method names, both confirmed via WSDL inspection:

1. **AGS v1.4** (older) — Methods: `Seguimiento_simple`, `Seguimiento_detallado`
2. **AGW v1.6** (newer) — Methods: `Guias_rastreoSimple`, `Guias_rastreoExtendido`

Both are SOAP/WSDL, NOT REST. However, they can be called from Node.js using the `soap` npm package or raw XML POST requests. The newer v1.6 API is simpler (only requires `usuario` + `clave` + `codigos_remision` array), while the older v1.4 requires more params (apikey, clave, nit, div, referencia).

**Critical finding:** The v1.6 methods accept an **array** of guide codes (`codigos_remision`), meaning we can batch-query multiple guides in a single SOAP call — much more efficient than Envia's one-at-a-time REST API.

---

## API Endpoints (Verified via WSDL)

### Production

| Version | Endpoint | WSDL |
|---------|----------|------|
| AGS v1.4 | `https://ws.coordinadora.com/ags/1.4/server.php` | `?wsdl` |
| AGW v1.6 | `https://ws.coordinadora.com/agw/ws/guias/1.6/server.php` | `?wsdl=` |

### Sandbox

| Version | Endpoint | WSDL |
|---------|----------|------|
| AGS v1.4 | `https://sandbox.coordinadora.com/ags/1.4/server.php` | `?doc=` for docs, `?wsdl` for WSDL |
| AGW v1.6 | `https://sandbox.coordinadora.com/agw/ws/guias/1.6/server.php` | `?wsdl=` |

**Source:** WSDL files fetched directly, GitHub repo `matisses/CoordinadoraWSClientPDN` for production endpoint confirmation.

---

## Method Details

### Option A: AGW v1.6 — `Guias_rastreoSimple` (RECOMMENDED)

**Input:**
```
Agw_typeRastreoSimpleIn:
  codigos_remision: string[]   // Array of guide codes (11 digits each)
  usuario: string              // Portal username
  clave: string                // Portal password
```

**Output (per guide):**
```
Agw_typeRastreoSimpleOut:
  codigo_remision: string          // Guide code
  codigo_estado: int               // Numeric status code
  descripcion_estado: string       // Human-readable status
  fecha_entrega: string            // Delivery date (if delivered)
  hora_entrega: string             // Delivery time (if delivered)
  guia_vinculadas: string[]        // Linked guides
```

### Option B: AGW v1.6 — `Guias_rastreoExtendido`

**Input:** Same as `Guias_rastreoSimple` (usuario, clave, codigos_remision[])

**Output (per guide) — richer data:**
```
Agw_typeRastreoExtendidoOut:
  codigo_remision: string
  codigo_estado: int
  descripcion_estado: string
  fecha_recogida: string           // Pickup date
  fecha_entrega: string            // Delivery date
  hora_entrega: string
  nombre_origen: string            // Origin city
  nombre_destino: string           // Destination city
  referencia: string               // Reference
  detalle_estados: array           // Full status history with dates
  detalle_novedades: array         // All incidents with dates
  guias_vinculadas: string[]       // Linked guides
```

### Option C: AGS v1.4 — `Seguimiento_simple` / `Seguimiento_detallado`

**Input:**
```
Seguimiento_simpleIn:
  codigo_remision: string     // Single guide (11 digits, zero-padded)
  nit: string                 // Client NIT
  div: string                 // Division code
  referencia: string          // Reference
  imagen: integer             // 0 or 1
  anexo: integer              // 0 or 1
  apikey: string              // API key from Coordinadora
  clave: string               // Password
```

**Output:**
```
Seguimiento_simpleOut:
  codigo_remision: string
  estado: Seguimiento_detalle      // Most recent status
  novedad: Seguimiento_novedades   // Latest incident
  tiene_anexo: integer
  imagen: string (base64)
  referencia: string
  nombre_origen: string
  nombre_destino: string
  producto: integer
  guias_vinculadas: array
  dias_promesa_servicio: integer
```

---

## Recommendation: Use AGW v1.6 `Guias_rastreoExtendido`

**Why v1.6 over v1.4:**

| Criterion | AGS v1.4 | AGW v1.6 |
|-----------|----------|----------|
| Auth params | apikey + clave + nit + div | usuario + clave only |
| Batch support | Single guide per call | Array of guides per call |
| Auth type | API key (may need separate onboarding) | Portal credentials (we already have!) |
| Status history | Only latest status | Full `detalle_estados` array |
| Novedades | Only latest novedad | Full `detalle_novedades` array |

**Why `rastreoExtendido` over `rastreoSimple`:**
- `rastreoExtendido` returns `detalle_estados` (full history) and `detalle_novedades` (all incidents)
- These map directly to what we store in `order_carrier_events`
- Minimal extra payload cost — the data is small text

---

## Authentication

### v1.6 credentials: `usuario` + `clave`

These appear to be the same portal login credentials we already store in `carrier_configs.portal_username` and `carrier_configs.portal_password`. This is a HUGE advantage — no separate API onboarding needed.

**Confidence:** MEDIUM — Based on the WSDL field names (`usuario`/`clave`) matching portal login terminology, and the PHP library using the same credentials for both portal operations and tracking. Needs validation with a real call.

### v1.4 credentials: `apikey` + `clave` + `nit` + `div`

This requires a dedicated API key from Coordinadora, which may require separate B2B onboarding. The `nit` (tax ID) and `div` (division) suggest a more formal commercial account setup.

**Confidence:** HIGH — WSDL explicitly names these required fields.

---

## Comparison with Envia Status Polling

| Aspect | Envia (current) | Coordinadora (proposed) |
|--------|-----------------|------------------------|
| Protocol | REST (GET, JSON) | SOAP (POST, XML) |
| Auth | None (public) | usuario + clave |
| Batch | 1 guide per request | Array in single request |
| Status codes | `cod_estadog` (numeric) | `codigo_estado` (numeric) |
| Status text | `estado` | `descripcion_estado` |
| History | Not in API (only latest + novedades) | `detalle_estados` (full timeline) |
| Incidents | `novedades[]` array | `detalle_novedades[]` array |
| NPM deps | None (native fetch) | `soap` package needed |
| Endpoint | `hub.envia.co/.../{guia}` | `ws.coordinadora.com/agw/ws/guias/1.6/server.php` |

---

## Implementation Approach

### Option 1: `soap` npm package (RECOMMENDED)

```typescript
// Pseudocode — NOT verified against actual API
import * as soap from 'soap';

const WSDL_URL = 'https://ws.coordinadora.com/agw/ws/guias/1.6/server.php?wsdl=';

async function fetchCoordinadoraStatus(guias: string[], usuario: string, clave: string) {
  const client = await soap.createClientAsync(WSDL_URL);
  const [result] = await client.Guias_rastreoExtendidoAsync({
    codigos_remision: guias,
    usuario,
    clave,
  });
  return result; // ArrayOfAgw_typeRastreoExtendidoOut
}
```

**Pros:** Clean, typed, handles WSDL parsing automatically
**Cons:** New npm dependency (`soap` ~350KB)

### Option 2: Raw XML POST (no new deps)

```typescript
// Build SOAP envelope manually, POST with native fetch
const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <Guias_rastreoExtendido>
      <codigos_remision>
        <item>${guia}</item>
      </codigos_remision>
      <usuario>${usuario}</usuario>
      <clave>${clave}</clave>
    </Guias_rastreoExtendido>
  </soapenv:Body>
</soapenv:Envelope>`;
```

**Pros:** Zero new deps
**Cons:** Manual XML parsing, fragile, hard to maintain

### Recommendation: Use `soap` npm package

The SOAP protocol is complex enough that raw XML is error-prone. The `soap` package is mature (8+ years, widely used), and the dependency cost is worth the DX improvement.

---

## Integration with Existing Cron Pattern

The existing `envia-status-polling.ts` pattern maps perfectly:

1. **Step 1 (get-active-guides):** Query orders with `carrier ILIKE '%coordinadora%'` + tracking_number + configured stage_ids
2. **Step 2 (poll-batch-N):** Call `Guias_rastreoExtendido` with batch of guide codes (v1.6 supports arrays natively — could send all in ONE call)
3. **Step 3 (process-changes):** Compare `codigo_estado` against last `order_carrier_events` entry, insert on change

**Key difference from Envia:** Coordinadora's batch support means we might need only ONE SOAP call per cron run instead of N REST calls. This is far more efficient.

---

## Carrier Config Reuse

The existing `carrier_configs` table already has:
- `status_polling_pipeline_id` + `status_polling_stage_ids` — reusable as-is
- `portal_username` + `portal_password` — likely the `usuario`/`clave` for v1.6

We need a separate `carrier_configs` row with `carrier = 'coordinadora'` (or reuse the existing one) that has `status_polling_pipeline_id` and `status_polling_stage_ids` populated.

**No schema migration needed** — the existing carrier_configs columns are sufficient.

---

## Risks and Unknowns

### 1. Credential Validation (MEDIUM risk)
The v1.6 `usuario`/`clave` fields MIGHT not be the same as portal credentials. Need to test with a real call.

**Mitigation:** First task should be a standalone script that creates a SOAP client and calls `Guias_rastreoSimple` with one known guide + portal creds.

### 2. Rate Limiting (LOW risk)
No documented rate limits found. Colombian carriers typically don't rate-limit B2B API calls.

**Mitigation:** Keep batch calls reasonable (all guides in one call, cron every 2h).

### 3. SOAP Client in Vercel Serverless (LOW risk)
The `soap` package uses Node.js `http` module which works fine in Vercel serverless. No browser-only APIs.

### 4. Guide Number Format (LOW risk)
Guides are 11 digits, zero-padded left. We already store these in `tracking_number` from the robot.

### 5. Status Code Mapping (UNKNOWN)
We don't know Coordinadora's numeric status codes yet. Envia uses codes like 1=Recoleccion, 7=Entregado, etc. Coordinadora's codes need to be discovered.

**Mitigation:** First polling run in observation mode (record all codes), then map them.

---

## Sources

- Sandbox API docs: https://sandbox.coordinadora.com/ags/1.4/server.php?doc= (HIGH confidence — direct official source)
- WSDL v1.6: https://sandbox.coordinadora.com/agw/ws/guias/1.6/server.php?wsdl= (HIGH confidence — official WSDL)
- Production endpoint: https://ws.coordinadora.com/ags/1.4/server.php (HIGH confidence — confirmed via GitHub WSDL cache)
- PHP client library: https://github.com/saulmoralespa/coordinadora-webservice-php (MEDIUM confidence — third-party but matches WSDL)
- Production WSDL v1.4 cache: https://github.com/matisses/CoordinadoraWSClientPDN (MEDIUM confidence — third-party reference)
- Coordinadora tracking page: https://coordinadora.com/rastreo/ (HIGH confidence — official)
- Shopify integration app: https://apps.shopify.com/coordinadora-1 (LOW confidence — third-party, confirms API exists)

---

## Summary for Roadmap

**YES, Coordinadora has a tracking API.** It's SOAP, not REST, but fully functional.

**Recommended approach:**
1. Add `soap` npm package
2. Create `src/lib/carriers/coordinadora-api.ts` (thin wrapper like `envia-api.ts`)
3. Create `coordinadora-status-polling.ts` Inngest cron (clone of envia pattern)
4. Reuse `carrier_configs` columns (no migration needed)
5. First: validate that portal_username/portal_password work as API creds
6. Use `Guias_rastreoExtendido` via AGW v1.6 for rich status data with batch support

**Estimated complexity:** LOW-MEDIUM. The pattern is identical to Envia polling. The only new element is SOAP client setup.
