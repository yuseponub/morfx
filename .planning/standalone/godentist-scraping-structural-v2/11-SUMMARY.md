---
phase: godentist-scraping-structural-v2
plan: 11
status: complete
completed: 2026-05-13
---

# Plan 11 — Summary

## Deliverables
- 5 smoke E2E JSONs en `.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_{1..5}.json` (iter 6, validador PASS 5/5)
- `LEARNINGS.md` con 8 patterns reusables + 7 bugs descubiertos durante iter loop
- 6 hotfix commits en main entre commit principal y SUMMARY

## Commits (iter loop)
- `f587100` — feat: rediseno desde 0 con paradigm F + dedupe + canary (commit principal / stragglers Plan 10)
- `395bed5` — fix iter 2: ExtJS button selector + combo trigger pattern
- `ac63dde` — debug iter 3: diagnostic instrumentation embedded in error
- `fd9d285` — fix iter 3: Enter-on-#df_fecha fallback (Buscar no existe en listcitassimple)
- `c2ccafc` — fix iter 4: heuristic extraction + tolerant pagination (12s + 2 retries)
- `c952d98` — fix iter 5: fingerprint-guard elimina cross-sede leak
- `07c02e2` — fix iter 6: dedupe robot-level por (sucursal|telefono|hora)

## Smoke validator output (iter 6)
```
PASS smoke_1.json  ratio=1.0, overlap=0, no cross-sede
PASS smoke_2.json  ratio=1.0, overlap=0, no cross-sede
PASS smoke_3.json  ratio=1.0, overlap=0, no cross-sede
PASS smoke_4.json  ratio=1.0, overlap=0, no cross-sede
PASS smoke_5.json  ratio=1.0, overlap=0, no cross-sede

SMOKE PASS — 5/5 files clean (3 invariants: ratio=1.0, overlap=0, no cross-sede)
validator exit: 0
```

Per smoke (deterministic):
- totalAppointments: 97
- totalCitas: 97 (matches portal toolbar exactly)
- Per sede: CABECERA=69, FLORIDABLANCA=4, JUMBO EL BOSQUE=3, MEJORAS PUBLICAS=21

## Production deploy timeline
- Push #1 (commit `f587100`): 20:51 UTC — paradigm F initial deploy
- Iter 2-6 hotfixes: 20:53 → 20:51 UTC (rolling fixes)
- Final deploy `07c02e2`: ~21:00 UTC
- Smoke iter 6 ran 21:12 → 21:21 UTC
- platform_config flag flipped to `true` (paradigm F live) after smoke PASS

## Acceptance criteria
- [x] Robot Railway deployed con paradigm F (HEAD `07c02e2`)
- [x] Vercel deployed con server-action defenses + UI rediseñado
- [x] 5 smokes consecutivos contra Railway retornan JSON exitoso
- [x] `node validate.cjs` retorna exit 0 con "SMOKE PASS 5/5 files clean"
- [x] `platform_config.use_new_godentist_scraping = true` en prod
- [x] LEARNINGS.md presente con bugs/patterns/pitfalls
- [x] Standalone commiteado en main con mensaje descriptivo
- [x] D-02 (empirical validation) honored — smokes son comprobantes reales
- [x] D-09 (sin cleanup retrospectivo) honored — cero INSERT/UPDATE sobre data histórica
- [x] D-13 (research-phase + empirical evidence) honored + EXTENDED — iter loop expuso gap de research (`headless:false` local vs `headless:true` prod) documentado en LEARNINGS

## Self-Check: PASSED
