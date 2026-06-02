# Research: InterRapidisimo Tracking API

**Researched:** 2026-04-10
**Domain:** InterRapidisimo (Inter) shipment status polling for MorfX
**Overall confidence:** MEDIUM

## Executive Summary

InterRapidisimo does NOT have a simple, unauthenticated public REST API like Envia Colvanes. Their B2B REST API requires authentication (token + API signature) and is gated behind a client onboarding process. However, research uncovered multiple potential approaches at different confidence levels.

The B2B API has a dedicated tracking endpoint (`POST api/ClientesCredito/ConsultarEstadosGuiasCliente`) that returns shipment states, but requires `x-app-signature` and `x-app-security_token` headers. There is also a public-facing Angular tracking app at `www3.interrapidisimo.com/SiguetuEnvio/` and an alternative service (`ApiServInter`) with endpoints like `ObtenerNovedadesTransporte` and `ObtenerRastreoGuiasClientePost` that may be accessible with the right auth.

**Bottom line:** Unlike Envia (zero auth, simple GET), Inter requires either (a) B2B API credentials from Inter, (b) reverse-engineering the SiguetuEnvio frontend's API calls, or (c) Playwright scraping of their tracking page.

---

## Finding 1: B2B REST API (Authenticated)

**Confidence:** HIGH (verified via official API documentation + live Help pages)

### Base URLs

| Environment | Base URL |
|-------------|----------|
| Staging | `https://stgwww3.interrapidisimo.com/ApiVentaCreditostg` |
| Production | `https://www3.interrapidisimo.com/ApiVentaCredito` |
| Production (services) | `https://www3.interrapidisimo.com/ApiServInter` |

### Authentication

Two custom headers required on ALL endpoints:

| Header | Type | Description |
|--------|------|-------------|
| `x-app-signature` | String(250) | Digital signature / API key assigned per integration client |
| `x-app-security_token` | String(250) | Bearer token from `POST /api/Tracking/ObtenerToken` |

Token flow:
1. `POST /api/Tracking/ObtenerToken` with Basic Auth credentials
2. Returns `{ access_token, token_type, ExpiresIn }`
3. Use `access_token` as `x-app-security_token` on subsequent calls

### Tracking-Relevant Endpoints (from live Help pages)

**ApiVentaCredito endpoints** (verified via WebFetch of `/Help` page):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `api/ClientesCredito/ConsultarEstadosGuiasCliente` | Query states for one or more guides (primary tracking endpoint) |
| GET | `api/Admision/ObtenerEstadosGuias` | Get list of all possible guide states (41 states -- verified, returns data without auth) |
| POST | `api/Tracking/ObtenerToken` | Get auth token |
| POST | `api/Tracking/HacerPush` | Push tracking notifications to client webhook |

**ApiServInter endpoints** (verified via WebFetch of `/Help` page):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `api/Mensajeria/ObtenerNovedadesTransporte?guias={guias}` | Get transport novelties by guide number(s) |
| POST | `api/Mensajeria/ObtenerRastreoGuiasClientePost` | Get tracking info for guides (client version) |
| POST | `api/Mensajeria/ObtenerRastreoGuiasPortalClientesPost` | Get tracking info (portal version) |
| POST | `api/Mensajeria/ObtenerRastreoGuiasClienteGenesysPost` | Get tracking info (Genesys chat version) |
| GET | `api/Mensajeria/ObtenerImagenDevolucion?NumeroGuia={NumeroGuia}` | Get return proof image |
| GET | `api/Mensajeria/DescargarPDFGuia?numeroGuia={numeroGuia}` | Download guide PDF |

### Auth Verification

- `GET api/Admision/ObtenerEstadosGuias` -- Returned 41 states WITHOUT auth (confirmed public)
- `GET api/Mensajeria/ObtenerNovedadesTransporte?guias=240000172994` -- Returned HTTP 401 (auth required)
- `POST api/ClientesCredito/ConsultarEstadosGuiasCliente` -- Returned HTTP 405 on GET (POST required, likely needs auth too)

### Known Guide States (41 total, from ObtenerEstadosGuias)

Key states relevant to tracking:
- **Admitida** -- Admitted/received
- **Digitalizada** -- Digitalized/scanned
- **Facturado** -- Invoiced
- **Reparto** -- Out for delivery
- **Entregada** -- Delivered
- **Devolucion ratificada** -- Confirmed return
- **Anulada** -- Cancelled
- Various transit states (national, regional, urban)

### How to Get B2B API Credentials

The documentation (Release 3.0, April 2022) describes an onboarding process:
1. Contact Inter comercial/technical team
2. Get assigned `x-app-signature` (API key per integration)
3. Receive credentials for token generation
4. Test in staging (`stgwww3.interrapidisimo.com`) before production

**This is the recommended path if Inter is willing to provide credentials.** The API is well-structured, covers tracking, and would give us the cleanest integration.

---

## Finding 2: SiguetuEnvio Tracking Frontend

**Confidence:** MEDIUM (observed behavior, couldn't extract internal API calls)

### URLs

| URL | Notes |
|-----|-------|
| `https://interrapidisimo.com/sigue-tu-envio/` | WordPress landing page with tracking form |
| `https://siguetuenvio.interrapidisimo.com/` | Redirects (302) to www3 |
| `https://www3.interrapidisimo.com/SiguetuEnvio/shipment` | Angular SPA (actual tracking app) |
| `https://www3.interrapidisimo.com:8082/SiguetuEnvio/shipment/{encrypted}` | Legacy port, encrypted guide |

### How It Works

1. User enters guide number on `interrapidisimo.com/sigue-tu-envio/`
2. The WordPress page encrypts the guide number client-side using **CryptoJS AES with PBKDF2 key derivation**
3. Redirects to `www3.interrapidisimo.com/SiguetuEnvio/shipment/{encrypted_guide}`
4. The Angular SPA decrypts and calls internal APIs to display tracking info

The encryption step is a deliberate anti-scraping measure. The guide number in the URL is AES-encrypted, not plaintext.

### Could We Reverse-Engineer It?

Theoretically yes, but:
- Would need to extract the CryptoJS key/IV from the WordPress page's JavaScript
- Would need to identify what internal API the Angular app calls (couldn't extract from WebFetch -- the app loads dynamically)
- Fragile: any key rotation or app update breaks the integration
- NOT recommended as primary approach

---

## Finding 3: Third-Party Aggregators

**Confidence:** MEDIUM

Multiple third-party tracking aggregators support Inter:

| Service | Type | Notes |
|---------|------|-------|
| Track123 | API + Webhook | Client libraries for Node.js, Python, etc. Paid service. |
| 17TRACK | Tracking aggregator | Consumer-facing, may have API |
| Parcel Monitor | Tracking API | Enterprise tracking aggregation |
| envia.com | Shipping platform | Quote + ship via Inter, has own API |
| mipaquete.com | Shipping aggregator | Colombian shipping API aggregator |

These services likely scrape Inter's tracking page or have their own B2B agreements. Using a third-party adds a dependency and cost, but removes the auth credential problem.

---

## Finding 4: ApiController (Partially Public)

**Confidence:** LOW (single endpoint verified)

There's an `ApiController` service at `www3.interrapidisimo.com/ApiController/` that exposes some endpoints publicly:

- `GET /api/ConsultaCajas/ObtenerBancosController` -- Returns 41 banks (verified, no auth)

This controller appears to serve internal/portal needs. It's unclear if tracking endpoints exist here, but the pattern suggests some Inter APIs are partially open.

---

## Finding 5: Push Notification System

**Confidence:** MEDIUM (from API documentation)

Inter's API documentation describes a PUSH notification system:

- Inter can push state changes to a client-provided REST endpoint
- Client must provide: REST API URL (POST), username, password
- Inter calls the client endpoint with security TOKEN auth
- This is the INVERSE of polling -- Inter pushes to us

**If we get B2B credentials, this is the ideal approach:** Zero polling, real-time state updates, no rate limiting concerns.

Requirements:
1. MorfX exposes a webhook endpoint (e.g., `/api/webhooks/inter-tracking`)
2. Endpoint accepts POST with auth header
3. Inter configures push notifications to our URL

---

## Comparison: Approaches for MorfX

| Approach | Auth Required | Reliability | Effort | Real-time | Recommendation |
|----------|--------------|-------------|--------|-----------|----------------|
| B2B API (polling) | YES - credentials from Inter | HIGH | LOW (same pattern as Envia) | Every 2h (cron) | **Best if credentials obtainable** |
| B2B API (push) | YES - credentials + webhook | HIGH | MEDIUM (need webhook endpoint) | Real-time | **Ideal long-term** |
| Reverse-engineer SiguetuEnvio | NO (extract encryption keys) | LOW (fragile) | HIGH | Polling only | NOT recommended |
| Playwright scraping | NO | MEDIUM (fragile to UI changes) | HIGH (need microservice) | Polling only | Fallback only |
| Third-party aggregator | NO (pay for service) | MEDIUM (depends on 3rd party) | LOW | Depends on service | If Inter won't give credentials |

### Recommendation

**Step 1 (immediate):** Contact InterRapidisimo to request B2B API credentials (`x-app-signature` + token credentials). This is the cleanest path. The API is well-documented, has dedicated tracking endpoints, and follows standard REST patterns.

**Step 2 (if credentials obtained):** Implement polling via `POST api/ClientesCredito/ConsultarEstadosGuiasCliente` using the exact same Inngest cron pattern as Envia. The `order_carrier_events` table is already carrier-agnostic (`carrier text NOT NULL`), so Inter events fit naturally.

**Step 3 (if push available):** Set up webhook endpoint for Inter push notifications. This eliminates polling entirely for Inter.

**Fallback (if credentials denied):** Consider mipaquete.com or envia.com aggregator APIs, which may proxy Inter tracking without direct Inter credentials.

---

## Implementation Notes (if B2B API is obtained)

### Differences from Envia Pattern

| Aspect | Envia | Inter |
|--------|-------|-------|
| Auth | None | Token + signature headers |
| HTTP method | GET | POST |
| Endpoint | Simple path param (`/{guia}`) | POST body with guide list |
| Response | Single guide per call | Possibly batch (multiple guides per call) |
| State codes | `cod_estadog` numeric | 41 named states (text-based) |

### Token Management

The Inter API requires a token that expires. Implementation needs:
1. Token cache (in-memory or Inngest step return value)
2. Token refresh on 401 response
3. `x-app-signature` stored in environment variable or `carrier_configs` table

### Suggested carrier_configs Extension

```sql
-- Add Inter-specific fields
ALTER TABLE carrier_configs
  ADD COLUMN api_base_url text,
  ADD COLUMN api_key text,  -- x-app-signature
  ADD COLUMN api_username text,
  ADD COLUMN api_password text;
```

Or store credentials in environment variables if preferred for security:
```
INTER_API_BASE_URL=https://www3.interrapidisimo.com/ApiVentaCredito
INTER_API_SIGNATURE=<assigned key>
INTER_API_USERNAME=<username>
INTER_API_PASSWORD=<password>
```

### API Client Structure

```typescript
// src/lib/carriers/inter-api.ts
export class InterApiClient {
  private token: string | null = null
  private tokenExpiry: number = 0

  constructor(
    private baseUrl: string,
    private signature: string,
    private username: string,
    private password: string
  ) {}

  private async getToken(): Promise<string> { /* ... */ }

  async consultarEstadosGuias(guias: string[]): Promise<InterStatusResponse[]> {
    const token = await this.getToken()
    const res = await fetch(`${this.baseUrl}/api/ClientesCredito/ConsultarEstadosGuiasCliente`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-signature': this.signature,
        'x-app-security_token': token,
      },
      body: JSON.stringify({ guias }), // Request body format TBD
      signal: AbortSignal.timeout(15_000),
    })
    // ...
  }
}
```

---

## All Discovered Inter Subdomains/Services

| URL | Purpose |
|-----|---------|
| `www3.interrapidisimo.com/ApiVentaCredito` | B2B API: admissions, tracking, clients |
| `www3.interrapidisimo.com/ApiServInter` | Service API: quotation, messaging, tracking |
| `www3.interrapidisimo.com/ApiOperaciones` | Operations API: distribution changes |
| `www3.interrapidisimo.com/ApiController` | Controller API: banks, misc |
| `www3.interrapidisimo.com/SiguetuEnvio` | Angular tracking frontend |
| `www3.interrapidisimo.com/Portalconsulta` | Corporate portal (login required) |
| `www3.interrapidisimo.com/SitioOficinaMasCercana` | Nearest office locator |
| `wwwrapsprod.interrapidisimo.com/glpi` | GLPI internal IT system |
| `wwwrapsprod.interrapidisimo.com/PQR` | Customer complaints portal |
| `wwwportalautogestion.interrapidisimo.com` | Client self-service portal |
| `stgwww3.interrapidisimo.com` | Staging environment |
| `siguetuenvio.interrapidisimo.com` | Tracking redirect (302 -> www3) |

---

## Sources

### HIGH confidence (verified with live requests)
- `https://www3.interrapidisimo.com/ApiVentaCredito/Help` -- Full endpoint listing, 25+ endpoints verified
- `https://www3.interrapidisimo.com/ApiServInter/Help` -- Full endpoint listing, 40+ endpoints verified
- `https://www3.interrapidisimo.com/ApiOperaciones/Help` -- Operations endpoint verified
- `https://www3.interrapidisimo.com/ApiVentaCredito/api/Admision/ObtenerEstadosGuias` -- 41 states returned (no auth)
- `https://www3.interrapidisimo.com/ApiController/api/ConsultaCajas/ObtenerBancosController` -- Banks returned (no auth)
- HTTP 401 on `ApiServInter/api/Mensajeria/ObtenerNovedadesTransporte` -- confirmed auth required

### MEDIUM confidence (from leaked/uploaded documentation)
- [Documentacion API INTERRAPIDISIMO (pdfcoffee.com)](https://pdfcoffee.com/documentacion-api-interrapidisimo-4-pdf-free.html) -- B2B REST API Release 3.0 documentation, April 2022
- [WordPress.org discussion on Inter URL update](https://wordpress.org/support/topic/update-interrapidisimo-carrier-of-colombia/) -- Tracking URL change history

### LOW confidence (third-party/indirect)
- [Track123 Inter Rapidisimo tracking API](https://www.track123.com/carriers/inter-rapidisimo-inter-rapidsimo/api)
- [Parcel Monitor Inter Rapidisimo](https://www.parcelmonitor.com/tracking-inter-rapidisimo-tracking-api/)
- [envia.com Inter Rapidisimo carrier page](https://envia.com/en-US/carriers/interRapidisimo-CO)
