---
phase: godentist-blast-sms-experiment
plan: 01
status: complete
completed: 2026-04-28
wave: 0
---

# Plan 01 — Parser xlsx 2019-2022 + Pre-flight Manual

## What was built

- **`scripts/parse-godentist-xlsx-2019-2022.ts`** — Parser idempotente xlsx → JSON único deduped.
  - Lee `~/Downloads/PACIENTES ENERO 2019 A DICIEMBRE 2022.xlsx`
  - Aplica dedup intra-lista por `normalizePhone(celular)` (clone verbatim de `godentist-send-scheduled.ts:47-53`)
  - Clasifica skipped en 4 razones taxonómicas: `phone_invalid`, `phone_foreign`, `phone_multiple`, `phone_duplicate`
  - Escribe JSON shape `{nombre, apellido, celular, email, fecha_creacion}` (raw celular preservado, blast script normaliza on-the-fly)
  - Idempotente: si el JSON destino existe, exit 0 sin re-parsear
  - Sanity gate: exit 2 si `<8.000` únicos (no fatal, alerta para investigación manual)
- **`godentist/pacientes-data/pacientes-2019-2022.json`** — 8.291 pacientes únicos (no commiteado, PII)
- **`godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv`** — 541 rows descartadas (no commiteado, PII)
- **`.gitignore`** — Added `godentist/pacientes-data/` (PII protection)

## Resultados parser

| Métrica | Valor |
|---------|-------|
| Total rows xlsx | 8.832 |
| **Únicos válidos** | **8.291** |
| Descartados | 541 |
| └── phone_duplicate | 414 |
| └── phone_foreign | 90 |
| └── phone_multiple | 35 |
| └── phone_invalid | 2 |

Vs estimado RESEARCH.md (8.284): +7 unidades, dentro de variación normal. El gate ≥8.000 pasa con margen 291.

## Recalculo split A/B (post-parser real)

- **Días 1-4:** 1.800/día = 7.200 contactos (900 A + 900 B)
- **Día 5 parcial:** 1.091 contactos (545 A + 546 B)
- **Total:** 4.145 grupo A + 4.146 grupo B
- **Costo SMS interno:** 4.146 × $97 = **$402.162 COP** → entra en $450k Plan 02 (margen 12%)
- **Costo Onurix wholesale:** 4.146 × $18.75 = **$77.738 COP** → entra en $83k pre-flight (margen ~7%)

## Pre-flight manual confirmado

| Check | Resultado |
|-------|-----------|
| **D-13.5 Template `nuevo_numerov2`** | **APPROVED** ✓ — categoría UTILITY |
| **D-13.1 Saldo Onurix wholesale** | OK ✓ (confirmado por usuario) |

**Correcciones aplicadas a planning docs (post-pre-flight):**
- Template name `nuevo_numero` → `nuevo_numerov2` en `01-PLAN.md`, `04-PLAN.md`, `05-PLAN.md`, `CONTEXT.md`
- Categoría UTILITY (no MARKETING) — levanta restricciones 24h de WA, pero SMS sigue como `source='campaign'` (D-12 compliance CRC 8AM-9PM)
- RESEARCH.md preservado como registro histórico

## Decisiones LOCKED ejecutadas

- **D-01** Re-enviar a todos sin dedup vs campaña anterior — ✓ JSON contiene 8.291 sin filtro adicional
- **D-02** Sin filtro de calidad adicional — ✓ todos los Colombian mobile válidamente normalizables
- **D-03** Parser xlsx con `xlsx@0.18.5` (ya en node_modules) — ✓ no `npm i`
- **D-13.5** Template APPROVED — ✓ confirmado `nuevo_numerov2`
- **D-13.1** Saldo Onurix ≥ $83k — ✓ confirmado

## Verificaciones automatizadas pasadas

```bash
test -f scripts/parse-godentist-xlsx-2019-2022.ts                                              # ✓
grep -c "normalizePhone" scripts/parse-godentist-xlsx-2019-2022.ts                             # 3 (≥2)
grep -c "XLSX.readFile" scripts/parse-godentist-xlsx-2019-2022.ts                              # 1 (≥1)
grep -c "phone_duplicate" scripts/parse-godentist-xlsx-2019-2022.ts                            # 2 (≥1)
test -f godentist/pacientes-data/pacientes-2019-2022.json                                      # ✓
node -e "const d=require('.../pacientes-2019-2022.json'); d.length"                            # 8291 (≥8000)
head -1 godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv                       # numero,nombre,razon_skip
wc -l godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv                         # 542 (≥100)
```

## Fecha esperada del primer cron run

**Mié 29 abril 2026, 10:30 Bogotá** (asumiendo Plan 05 swap del crontab cierra hoy mar 28 abril).

## Next

→ Plan 02: Crear SQL `sms_workspace_config` para GoDentist con `balance_cop=450000`. Pausar para que el usuario lo aplique en prod (Regla 5).
