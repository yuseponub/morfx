---
plan: 05
phase: somnio-recompra-template-catalog
status: awaiting-smoke-test
started: 2026-04-23
wave: 3
---

# Plan 05 SUMMARY — apply prod + push + close-out (in progress)

## Outcome (parcial — pendiente smoke test)

Migracion aplicada en Supabase production 2026-04-23 (Regla 5: antes del push).
4 filas verificadas bajo `agent_id='somnio-recompra-v1'` (contraindicaciones x2 +
tiempo_entrega_1_3_days + tiempo_entrega_2_4_days). `git push origin main` ejecutado
exitosamente — Vercel auto-deploy triggered (commit range `a65a8d4..a0cff80`).

## Verificacion SQL post-apply

| intent | orden | content_type | priority | OK |
|--------|-------|-------------|----------|-----|
| contraindicaciones | 0 | texto | CORE | ✅ |
| contraindicaciones | 1 | texto | COMPLEMENTARIA | ✅ |
| tiempo_entrega_1_3_days | 0 | texto | CORE | ✅ |
| tiempo_entrega_2_4_days | 0 | texto | CORE | ✅ |

## Close-out tasks completados

- ✅ `.planning/debug/recompra-greeting-bugs.md` → movido a `.planning/debug/resolved/` con `status: resolved`, `resolved: 2026-04-23`, `resolved_by:` apuntando a esta fase.
- ✅ `.claude/rules/agent-scope.md` — nueva seccion "Somnio Recompra Agent" con PUEDE/NO PUEDE + catalogo independiente + referencias a tests (Regla 4).
- ✅ `docs/analysis/04-estado-actual-plataforma.md` — nueva subseccion "Agente Somnio Recompra" bajo Agentes IA + linea de "Actualizado: 23 abril 2026" al final (Regla 4).
- ✅ `LEARNINGS.md` creado — 4 patterns reusables + Q#2 deuda tecnica + rollback plan documentado.

## Pending — smoke test end-to-end

Pendiente: smoke test con contacto Jose Romero (285d6f19...) o equivalente via WhatsApp real.

**Flow esperado post-deploy:**
1. Cliente Somnio con previous order saluda → bot emite `{{nombre_saludo}} 😊` (texto) + imagen ELIXIR (sin promos directas — D-05).
2. Cliente dice "sí" / "quiero comprar" → bot emite `preguntar_direccion_recompra` con `{{direccion_completa}}` incluyendo departamento (D-12).
3. Cliente confirma direccion → bot emite promociones.
4. Cliente elige pack → bot emite `resumen_Nx`.
5. Cliente confirma → bot crea orden en CRM.

**Queries verificacion post-smoke:**
```sql
-- Ultimas sesiones recompra (deberian usar templates de recompra-v1)
SELECT id, contact_id, created_at, datos_capturados->>'_v3:preloaded' AS preloaded
FROM agent_sessions
WHERE agent_id = 'somnio-recompra-v1'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC LIMIT 10;
```

## Commits

- Push: commit range `a65a8d4..a0cff80` → 9 commits (incluye 2 commits pre-existentes).
- Final commit post-smoke: pendiente (SUMMARY.md + LEARNINGS.md + docs updates + debug resolved).

## Next

- Jose valida smoke test via WhatsApp real con agente prod.
- Claude hace commit final con close-out artifacts.
- Fase cierra formalmente.
