# Standalone: whatsapp-crm-read-latency — Discussion Log

> **Audit trail only.** Do not use as input to planning/research/execution agents.
> Decisions are in CONTEXT.md — this log preserves alternatives considered.

**Date:** 2026-06-02
**Standalone:** whatsapp-crm-read-latency
**Areas discussed:** JWT keys gate, Alcance, Caché de cliente, Rollout

---

## JWT keys gate (Q1)

| Option | Description | Selected |
|--------|-------------|----------|
| Verifico el Dashboard ahora | Usuario revisa Supabase Dashboard | |
| Asumir legacy + migrar primero | Migrar a asimétricas antes | |
| Investígalo tú | Claude detecta el tipo de llave | ✓ |

**User's choice:** "como reviso?" → Claude verificó vía JWKS endpoint público (`curl /auth/v1/.well-known/jwks.json`).
**Resultado:** Proyecto `expslvzsszymljafhppi` usa llave ASIMÉTRICA ES256 (EC P-256). `getClaims()` es local. Gate DESPEJADO, sin migración. → D-05.

---

## Alcance (Q2)

| Option | Description | Selected |
|--------|-------------|----------|
| Hot-path primero, luego barrer | conversations+orders+ojito, verificar, luego resto en olas | ✓ |
| Migrar los 190 de una | Barrido completo de 41 archivos de una vez | |
| Solo hot-path, resto = follow-up separado | Acotar a inbox+ojito únicamente | |

**User's choice:** "que son estos 190? luego no se rompe algo?" → Claude explicó: son los `auth.getUser()` redundantes (guard de auth) en 41 archivos; el reemplazo es drop-in, TypeScript atrapa mismatches en compile-time, middleware intacto, RLS sin cambios, incremental atómico aísla errores. Recomendación hot-path-primero confirmada como la opción más cauta. → D-09, scope hot-path.

---

## Caché de cliente (Q3)

| Option | Description | Selected |
|--------|-------------|----------|
| TanStack React Query | Estándar, SWR-pattern, devtools, coexiste con Realtime | ✓ |
| SWR | Más liviano, menos features | |
| Sin librería (caché propia) | Map/Context propio | |

**User's choice:** "la mejor en rendimiento elije tu" → Claude eligió TanStack React Query. → D-08.

---

## Rollout (Q4)

| Option | Description | Selected |
|--------|-------------|----------|
| Migración incremental verificable | Sin flag, typecheck por commit, middleware intacto | ✓ |
| Feature flag para el helper | Doble-vía con flag de rollback | |
| Primero lecturas, mutaciones después | Migrar reads primero | |

**User's choice:** "Migración incremental verificable" → D-09.

## Claude's Discretion
- Estructura interna del helper, forma del route handler del ojito, TTL/tags del Next Data Cache, integración fina React Query + Realtime.

## Deferred Ideas
- Barrido de ~39 archivos restantes (olas follow-up dentro del standalone).
- Redis cross-instance (descartado para este caso).
- Optimización LLM del agente (problema separado).
