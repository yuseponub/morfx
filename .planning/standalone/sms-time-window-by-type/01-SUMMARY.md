# 01-SUMMARY — Migración `sms_messages.source` NOT NULL

**Completado:** 2026-04-17 22:20 COT
**Commit:** `fb2df5a` — feat(sms-source-not-null): migración NOT NULL en sms_messages.source

## Queries de distribución (pre-apply)

**Q1 — Distribución de source values:**
```json
[
  { "source": "automation",  "n": 1148 },
  { "source": "domain-call", "n": 1 }
]
```
Universo 100% transaccional. Zero rows marketing. Taxonomía canónica respetada — no hay sources inesperados.

**Q2 — NULL count:**
```json
[{ "null_count": 0 }]
```
Zero rows NULL. El DEFAULT `'automation'` de la migración foundation (`20260316100000_sms_onurix_foundation.sql:94`) backfilleó todo al momento del `ADD COLUMN`. El backfill condicional del Plan 01 fue no-op (safe idempotente).

**Q3 — Sources inesperados:** Success. No rows returned. Lista canónica exhaustiva confirmada.

## Migración aplicada

Archivo `supabase/migrations/20260418040000_sms_source_not_null.sql` ejecutado en Supabase Studio (prod) por el usuario sin errores.

Pasos:
1. `UPDATE sms_messages SET source='automation' WHERE source IS NULL;` → 0 rows afectados (no-op, Q2 ya era 0).
2. `ALTER TABLE sms_messages ALTER COLUMN source SET NOT NULL;` → aplicado.

## Verificación post-apply

```json
[{
  "column_name":    "source",
  "is_nullable":    "NO",
  "column_default": "'automation'::text"
}]
```

- `is_nullable = NO` ✓
- `column_default = 'automation'::text` (preservado) ✓
- `null_count = 0` ✓ (post-apply implícito — la columna ahora no permite NULL)

## Truths verificados

- Query de distribución ejecutada y documentada ✓
- Archivo `supabase/migrations/20260418040000_sms_source_not_null.sql` existe con UPDATE condicional + ALTER NOT NULL ✓
- Migración aplicada en prod por el usuario vía Supabase Studio ✓
- Post-apply `null_count = 0` ✓
- `sms_messages.source` es NOT NULL en schema prod ✓

## Sorpresas

Ninguna. La distribución confirmó que 100% del tráfico SMS es transaccional hoy — no existe módulo de campañas. El único `source='domain-call'` (1 row) probablemente es un test manual reciente. No hay rows NULL (el default `'automation'` del foundation ya garantizaba no-nulls), por lo que el backfill del Plan 01 fue redundante pero inofensivo — justificado por D-05 como guardia ante caso contrario.

## Precondición para Plan 02

Regla 5 respetada: la columna NOT NULL vive en prod ANTES de que cualquier código TS que dependa del contrato (Plan 02) sea pusheado a Vercel. Listo para proceder con Plan 02 (refactor de guard source-aware).
