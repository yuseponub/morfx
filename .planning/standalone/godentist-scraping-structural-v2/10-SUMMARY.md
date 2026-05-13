---
phase: godentist-scraping-structural-v2
plan: 10
subsystem: smoke-validator
tags: [smoke-e2e, validator, invariants, cjs]
requires: [05]
provides:
  - "Smoke E2E validator con 3 invariantes (D-15) defaulting a N=5 files (D-14) listo para que Plan 11 lo invoque tras 5 scrapes consecutivos."
affects:
  - ".planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs"
tech-stack:
  added:
    - "Node.js CommonJS validator (.cjs) — sin transpilación, ejecutable directo via node."
  patterns:
    - "Extension del validator viejo (godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs) con invariante adicional (c) + N=5 default."
key-files:
  created:
    - path: ".planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs"
      purpose: "3-invariant validator (ratio, overlap, cross-sede) para 5 smoke JSONs (D-14, D-15)."
  modified: []
decisions:
  - "Snippet del validator copiado verbatim del Plan 10 <action> + PATTERNS.md §9 (idénticos por diseño)."
  - "Sin commit del .cjs en Plan 10 — Plan 11 lo agrupará en su commit unificado tras correr los 5 smokes."
metrics:
  duration: "~5 min"
  completed: "2026-05-13T19:11:00Z"
  tasks: "1/1"
  files: 1
---

# Phase godentist-scraping-structural-v2 Plan 10: Smoke E2E Validator Summary

One-liner: Validator `.cjs` nuevo con 3 invariantes (a-ratio, b-overlap, c-cross-sede) y N=5 default, ejecutable, listo para Plan 11.

## What was built

Un único archivo:
`/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs`

- Shebang `#!/usr/bin/env node`
- Node CommonJS (`require('fs')`, `require('path')`).
- Default: lee `smoke_1.json ... smoke_5.json` del mismo directorio (D-14 mandates N=5).
- Override: pasa paths como args.
- Implementa 3 invariantes (CONTEXT.md D-15):
  - (a) `ratio per sede` = total / unique by (phone+hora) === 1.0
  - (b) `overlap pairwise` = phone+hora intersection === 0 entre cada par de sedes
  - (c) **NUEVO** `cross-sede`: ningún (phone, fecha) aparece en >1 sede globalmente — detecta el caso JOHANNA/YARINETH/EDDY del 2026-05-13 que el validator viejo NO atrapaba (cada sede individualmente parecía consistente).
- Verdict combinado: `pass = ratiosBad.length === 0 && overlapsBad.length === 0 && crossSedeViolations.length === 0`.
- Exit 0 si pasa, exit 1 si falla.
- Output legible: `PASS|FAIL <file>` + métricas + `SMOKE PASS — N/N files clean (3 invariants...)` / `SMOKE FAIL — review JSON files above`.

## Tests ejecutados (verificación funcional)

### Test 1 — Sin args, sin smoke files presentes (esperado: 5 FAIL + SMOKE FAIL, exit 1)

```
$ node .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs
FAIL .../smoke-e2e/smoke_1.json: file not found
FAIL .../smoke-e2e/smoke_2.json: file not found
FAIL .../smoke-e2e/smoke_3.json: file not found
FAIL .../smoke-e2e/smoke_4.json: file not found
FAIL .../smoke-e2e/smoke_5.json: file not found

SMOKE FAIL — review JSON files above
$ echo $?
1
```

✅ Exit 1 confirmado + 5 FAILs (N=5 default cumplido).

### Test 2 — Sample JSON pasante 1-fila 1-sede (esperado: PASS + SMOKE PASS, exit 0)

```
$ echo '{"success":true,"date":"2026-05-14","appointments":[{"telefono":"57316","hora":"10:00 AM","sucursal":"CABECERA"}]}' > /tmp/sample.json
$ node .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs /tmp/sample.json
PASS sample.json
  date: 2026-05-14, totalAppointments: 1, sedes: CABECERA
  ratios: {"CABECERA":{"total":1,"unique":1,"ratio":1}}

SMOKE PASS — 1/1 files clean (3 invariants: ratio=1.0, overlap=0, no cross-sede)
$ echo $?
0
```

✅ Exit 0 confirmado.

### Test 3 — Cross-sede sample (esperado: FAIL invariante c, exit 1)

```
$ echo '{"success":true,"date":"2026-05-14","appointments":[{"telefono":"57316","hora":"10:00 AM","sucursal":"CABECERA"},{"telefono":"57316","hora":"3:00 PM","sucursal":"FLORIDABLANCA"}]}' > /tmp/sample_cross.json
$ node .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs /tmp/sample_cross.json
FAIL sample_cross.json
  date: 2026-05-14, totalAppointments: 2, sedes: CABECERA, FLORIDABLANCA
  ratios: {"CABECERA":{"total":1,"unique":1,"ratio":1},"FLORIDABLANCA":{"total":1,"unique":1,"ratio":1}}
  cross_sede_violations: [{"key":"57316|2026-05-14","sedes":["CABECERA","FLORIDABLANCA"]}]

SMOKE FAIL — review JSON files above
$ echo $?
1
```

✅ Invariante (c) D-15 funciona: detecta cross-sede que (a) y (b) por sí solas NO hubieran detectado (cada sede individual era consistente).

## Acceptance criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `test -f .../smoke-e2e/validate.cjs` retorna 0 | ✅ PASS | `ls -l` muestra 4213 bytes |
| `head -1` muestra `#!/usr/bin/env node` | ✅ PASS | Verificado |
| `grep -c "crossSedeViolations"` retorna al menos `4` | ⚠️ minor mismatch — ver nota | `grep -c` retorna **3 líneas**; `grep -o ... \| wc -l` retorna **4 ocurrencias**. Código verbatim del snippet `<action>` del plan. |
| Default N=5: `grep -c "\[1, 2, 3, 4, 5\]\.map"` retorna 1 | ✅ PASS | Verificado |
| Verdict combina 3 invariantes (grep retorna 1) | ✅ PASS | Verificado |
| Sin args sin files presentes → exit 1 | ✅ PASS | Test 1 |
| Sample pasante → exit 0 + "SMOKE PASS" | ✅ PASS | Test 2 |
| Executable bit (`ls -l \| grep -c "x"` >=1) | ✅ PASS | `-rwxrwxrwx` |

## Deviations from Plan

### Auto-fixed Issues

Ninguna. Plan ejecutado exactamente como escrito — código copiado verbatim del snippet `<action>` del Plan 10.

### Acceptance criterion ambiguity (no es deviation de implementación)

El criterion `grep -c "crossSedeViolations" >= 4` cuenta **líneas**, no ocurrencias. El snippet verbatim entregado por el plan en su `<action>` tiene `crossSedeViolations` en **3 líneas** pero **4 ocurrencias** (una línea contiene 2 menciones del identificador: `if (crossSedeViolations.length > 0) console.log(\`...${JSON.stringify(crossSedeViolations)}\`)`).

- **Resolución:** mantener el código verbatim del plan. La intención del criterion (declaración + verdict + output check + output JSON-stringify) se cumple con las 4 ocurrencias reales. Si se quisiera bumpear `grep -c` a ≥4 sin cambiar el código, se debería usar `grep -o ... | wc -l` en el criterion.
- **No requiere acción correctiva** — el código entregado coincide byte-a-byte con el snippet del plan (también idéntico a PATTERNS.md §9).

## Sin commit del validate.cjs en Plan 10

Per success criteria del plan: `[ ] Sin commit todavia.`

El archivo `.cjs` queda en working tree untracked. Plan 11 (Wave 5 — smoke E2E run) hará:
1. Generar `smoke_1.json` ... `smoke_5.json` corriendo 5 scrapes consecutivos contra Railway endpoint paradigm F.
2. Ejecutar `node validate.cjs` (sin args, lee los 5 smokes default).
3. Si pasa → commit unificado de `validate.cjs` + los 5 smokes en `smoke-e2e/`.
4. Si falla → abortar, re-research o re-plan.

Este SUMMARY.md sí se commitea (sigue el pattern de los SUMMARYs 01-09 ya tracked).

## Note para Plan 11

> Plan 11 corre 5 smokes consecutivos contra Railway endpoint paradigm F + valida con este script.

El validator está listo. Llamar con:
```bash
cd .planning/standalone/godentist-scraping-structural-v2/smoke-e2e
node validate.cjs   # lee smoke_1..smoke_5 default
```

## Self-Check: PASSED

- ✅ `test -f /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` → existe (4213 bytes, executable).
- ✅ Smoke tests funcionales (Tests 1-3) ejecutados — todos cumplieron exit codes esperados.
- ⚠️ Single deviation documented: acceptance criterion `grep -c "crossSedeViolations" >= 4` mid-cumplido por discrepancia líneas/ocurrencias (3 líneas, 4 ocurrencias). Código entregado verbatim del plan. No requiere fix.
- N/A — Plan 10 no produjo commits del .cjs (per design — Plan 11 commit unificado).
