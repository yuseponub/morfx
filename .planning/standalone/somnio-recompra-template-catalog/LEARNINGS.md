---
phase: somnio-recompra-template-catalog
status: shipped
shipped: 2026-04-23
waves: 4 (0+1+2+3)
plans: 5
commits: 10 (5 feat + 5 docs)
---

# LEARNINGS — somnio-recompra-template-catalog

## Patterns aprendidos (reusables)

### 1. Audit empirico ANTES de ejecutar scope planeado
El plan original asumia que 3 templates especificos (saludo + preguntar_direccion_recompra + registro_sanitario) no existian bajo `agent_id='somnio-recompra-v1'`. El snapshot `01-SNAPSHOT.md` revelo que **los 3 ya existian con copy equivalente o mejor**, y en cambio **3 OTROS intents genuinamente faltaban** (contraindicaciones, tiempo_entrega_1_3_days, tiempo_entrega_2_4_days — este ultimo siendo la zona DEFAULT, afectando todas las ciudades desconocidas).

**Pattern:** El primer task de cualquier plan que toque datos de prod DEBE ser un audit empirico, NO un refactor directo. CONTEXT.md puede estar desactualizada o asumir estado incorrecto.

**Aplicacion:** Para cualquier fase que toque `agent_templates`, `automations`, `platform_config`, o cualquier tabla con data semilla, pedir al usuario un snapshot SQL del estado actual como Task 1 del Plan 01.

### 2. Scope redesign mid-plan (con copy approval via user)
Cuando el audit revelo la divergencia, se tomo decision colaborativa con el usuario (opciones A/B/C/D) y el scope se redefinio — **no pausar la fase**, sino re-apuntar a los gaps reales. El usuario aprobo "usar los originales" (copy sales-v3) y se avanzo.

**Pattern:** Cuando un blocker revela que el plan tiene supuestos falsos, ofrecer 3-4 opciones concretas (ampliar scope / pausar / rechazar / re-discutir) en lugar de pedir respuesta abierta.

### 3. Two-phase commit Regla 5 strict
Wave 0 escribe el archivo SQL y lo commitea en local. Waves 1-2 modifican codigo que depende del catalogo post-migracion, pero se commitean local sin push. Wave 3: usuario aplica SQL en prod, verifica con SELECT, **despues** Claude hace `git push origin main` (triggerea Vercel deploy automatico).

**Pattern:** Para fases que modifican schema + codigo que consume schema, mantener TODO local hasta verificar SQL aplicado en prod. `git push` es el punto de no retorno — solo se ejecuta post-verificacion.

### 4. `hasSaludoCombined` branch es selective, no destructive
Al eliminar la entry `saludo` del state machine (D-05), inicialmente preocupaba que la branch `hasSaludoCombined` de `response-track.ts` dropeara la imagen ELIXIR (orden=1). La verificacion: la branch solo activa cuando `allIntents.length > 1`. Con saludo solo (sin accion de sales-track), `length === 1` → branch inactiva → `composeBlock` emite ambos orden=0 + orden=1.

**Pattern:** Revisar dependencias entre state machine y response track cuando se elimina una entry — el response track tiene branches que dependen de la coexistencia con otros intents.

## Deuda tecnica documentada (Q#2 de research)

**Scope limitation en tests de `preguntar_direccion`:**
- `response-track.test.ts` solo cubre el happy path (datosCriticos=true con direccion+ciudad preloaded → extraContext.direccion_completa).
- El branch `!datosCriticos` (`campos_faltantes`) queda sin coverage de assertion fuerte — solo se valida defensivamente que no haya trailing comma o `, ,`.
- **Riesgo:** un refactor futuro de `camposFaltantes()` que rompa el labels map no seria capturado por los tests.

**Mitigacion futura:** cuando se toque `preguntar_direccion` de nuevo, extender tests con fixture `buildPreloadedStateIncomplete()` que tenga solo `nombre` y verifique que `campos_faltantes` tiene las labels correctas.

## Rollback plan

**Si el catalogo causa respuestas incorrectas en prod (edge case):**

1. **Rollback codigo (1 commit):**
   ```bash
   git revert b5ac990 a0cff80 56f3bad 44a323b 1ac5c0c 8881709 9088fc9 f22744b
   git push origin main
   ```

2. **Rollback SQL (solo si los nuevos templates dan problemas):**
   ```sql
   DELETE FROM agent_templates
   WHERE agent_id = 'somnio-recompra-v1'
     AND intent IN ('contraindicaciones', 'tiempo_entrega_1_3_days', 'tiempo_entrega_2_4_days')
     AND workspace_id IS NULL;
   ```
   Los 3 intents son aditivos — no afectan nada pre-existente al removerse. El snapshot completo en `01-SNAPSHOT.md` sirve como referencia si hay que reconstruir algo.

3. **Restaurar fix T2 (si rollback de codigo):** el commit `cdc06d9` (TEMPLATE_LOOKUP_AGENT_ID='somnio-sales-v3') volveria a estar activo — el agente recompra leeria el catalogo de sales-v3 como lo hacia antes de esta fase.

## Commits (Wave → Plan → hash)

| Wave | Plan | Hash | Descripcion |
|------|------|------|-------------|
| 0 | 01 | `9088fc9` | audit D-11 + snapshot + migration SQL |
| 0 | 01 | `f22744b` | Plan 01 SUMMARY + copy approval |
| 1 | 02 | `1ac5c0c` | response-track + constants (revert T2 + direccion + registro_sanitario) |
| 1 | 02 | `8881709` | Plan 02 SUMMARY |
| 1 | 03 | `56f3bad` | transitions (D-04 + D-05) |
| 1 | 03 | `44a323b` | Plan 03 SUMMARY |
| 2 | 04 | `b5ac990` | tests unitarios (15 nuevos, 32/32 green) |
| 2 | 04 | `a0cff80` | Plan 04 SUMMARY |
| 3 | 05 | pendiente | Plan 05 SUMMARY + LEARNINGS + docs update + debug resolved |

## Referencias

- CONTEXT.md: decisiones D-01..D-13
- RESEARCH.md: mapeo completo de intents + patterns SQL
- 01-SNAPSHOT.md: estado prod pre-migracion (34 rows) + analisis D-11
- Debug origen: `.planning/debug/resolved/recompra-greeting-bugs.md`
- Phase related: `.planning/standalone/somnio-recompra-crm-reader/` (enabler `{{direccion}}`)
