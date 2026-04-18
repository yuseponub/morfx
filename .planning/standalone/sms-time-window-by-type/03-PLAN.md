---
phase: sms-time-window-by-type
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - .planning/standalone/sms-time-window-by-type/LEARNINGS.md
  - docs/analysis/04-estado-actual-plataforma.md
autonomous: false

must_haves:
  truths:
    - "Smoke test en producción: SMS transaccional (source='automation') enviado después de 21:00 Colombia se envía correctamente (status='sent')"
    - "sms_messages row correspondiente tiene source='automation' persistido y provider_state_raw no-error"
    - "LEARNINGS.md creado en .planning/standalone/sms-time-window-by-type/ documentando bugs, patterns, cost, decisiones"
    - "docs/analysis/04-estado-actual-plataforma.md actualizado si contiene entry 'SMS sobre-bloquea transaccionales' en deuda técnica"
    - "Deuda técnica relacionada al bloqueo nocturno de SMS transaccionales eliminada o marcada como resuelta"
  artifacts:
    - path: ".planning/standalone/sms-time-window-by-type/LEARNINGS.md"
      provides: "Documentación obligatoria de phase close (Regla 0 + Regla 4)"
      contains: "# LEARNINGS"
  key_links:
    - from: "smoke test en prod"
      to: "sms_messages row con source='automation' status='sent'"
      via: "automation dispatch > 21:00 Colombia > query Supabase"
      pattern: "SELECT source, status FROM sms_messages"
---

<objective>
Cerrar el standalone con smoke test en producción (dispara un SMS transaccional fuera de ventana y verifica que llega), actualizar docs de estado de plataforma si aplica, y escribir el LEARNINGS.md obligatorio por Regla 0 + Regla 4.

Propósito: Validar empíricamente que la refactorización resolvió el incidente 2026-04-17 21:18 y dejar trazabilidad para futuros ejecutores (bugs descubiertos, patterns, cost, decisiones).

Output: Confirmación de smoke test + LEARNINGS.md + docs actualizados.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-time-window-by-type/CONTEXT.md
@.planning/standalone/sms-time-window-by-type/RESEARCH.md
@.planning/standalone/sms-time-window-by-type/01-SUMMARY.md
@.planning/standalone/sms-time-window-by-type/02-SUMMARY.md
@docs/analysis/04-estado-actual-plataforma.md
@CLAUDE.md
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Smoke test en producción — SMS transaccional fuera de ventana</name>
  <files>N/A (validación funcional en prod)</files>
  <read_first>
    - .planning/standalone/sms-time-window-by-type/02-SUMMARY.md (confirmar que el deploy a Vercel fue exitoso)
    - .planning/standalone/sms-time-window-by-type/CONTEXT.md §domain (escenarios bloqueados originalmente)
    - CLAUDE.md §"Regla 0: Calidad sobre velocidad"
    - CLAUDE.md §"Regla 1: Push a Vercel" (ya cumplida en Plan 02)
  </read_first>
  <what-built>
Plan 01 aplicó `ALTER COLUMN source SET NOT NULL` a sms_messages en prod.
Plan 02 pusheó a Vercel la diferenciación transactional-vs-marketing en el guard de `src/lib/domain/sms.ts`, con warn en el fallback `'domain-call'`.

Ahora queda validar empíricamente que un SMS transaccional fuera de la ventana 8AM-9PM efectivamente se envía.
  </what-built>
  <how-to-verify>
**GUIDANCE CRÍTICA — Wall-clock del smoke test (W-4 checker feedback):**

El smoke test requiere ejecución fuera de la ventana 08:00–21:00 Colombia (es decir: hora Colombia ∈ [21:00, 23:59] ∨ [00:00, 07:59]).

Si la ejecución del Plan 03 cae DENTRO de la ventana (hora Colombia ∈ [08:00, 21:00]):
- **NO cerrar el phase todavía.** Posponer smoke test hasta después de las 21:00 Colombia mismo día (o a la próxima ventana nocturna).
- Marcar en el summary provisional del task: `[PENDING smoke test — ejecutar después de 21:00 COT del {fecha}]`.
- Calidad sobre velocidad (Regla 0): no cerrar el phase sin smoke test verificado.
- Opcional: el usuario puede disparar una automation de prueba pasadas las 21:00 Colombia y pegar el resultado en el chat cuando esté disponible — entonces el task se cierra.

---

PASO 1 — Confirmar hora Colombia ACTUAL antes de proceder:

```bash
TZ='America/Bogota' date +"%Y-%m-%d %H:%M %Z"
```

- Si hora ∈ [21:00, 07:59] → proceder al Paso 2 (estamos fuera de ventana, se puede smoke test AHORA).
- Si hora ∈ [08:00, 20:59] → pausar. Documentar `[PENDING smoke test]` y reanudar después de 21:00 COT.

PASO 2 — Disparar una automatización que incluya un action `send_sms` hacia un número de prueba propio (del usuario, no de cliente real).

Opciones:
- Opción A (natural): esperar a que un trigger real dispare send_sms en ventana nocturna.
- Opción B (manual): crear automation con trigger manual y ejecutarla.

PASO 3 — Verificar en Supabase Studio que el SMS se insertó con success:

```sql
-- Última fila enviada por la automation
SELECT id, created_at, to_number, source, status, provider_state_raw, segments, cost_cop
FROM sms_messages
ORDER BY created_at DESC
LIMIT 3;
```

Esperado (para la fila generada por el smoke test):
- `source = 'automation'`
- `status IN ('sent', 'delivered', 'pending')` — NO 'failed' con razón de horario
- `provider_state_raw` sin mensaje tipo "fuera de horario"
- `created_at` con hora Colombia fuera de 8-21

PASO 4 — Verificar recepción del SMS en el teléfono del usuario.

PASO 5 — (Opcional) Verificar en logs de Vercel que NO apareció el log `'[SMS] source not set, falling back to domain-call'` (señal de que la automation está pasando source explícitamente como esperado).

PASO 6 — Pegar en el chat:
- El output de la query SQL del paso 3.
- Confirmación "SMS recibido en el teléfono".
- Hora Colombia del envío (para confirmar que fue fuera de ventana).
  </how-to-verify>
  <acceptance_criteria>
    - Output de la query SQL del paso 3 pegado en el chat mostrando la fila del smoke test
    - `source = 'automation'` en la fila del smoke test
    - `status` ∈ {'sent', 'delivered', 'pending'} — NO 'failed' con error de horario
    - Confirmación explícita del usuario: "SMS recibido en teléfono a las HH:MM Colombia" donde HH está fuera del rango [8, 21)
    - Logs de Vercel (si se consultan) NO muestran bloqueo con mensaje "SMS no enviado: fuera de horario permitido"
    - Usuario autoriza proceder a cerrar el phase
    - Si el Plan 03 se ejecuta dentro de ventana (08:00–21:00 COT): el task NO se cierra prematuramente; se marca PENDING y se reanuda después de 21:00
  </acceptance_criteria>
  <resume-signal>
Responder "smoke test OK, SMS recibido a las HH:MM" (o pegar evidencia). Si el SMS fue bloqueado o falló por razones distintas a horario (p.ej. Onurix Error:1081 carrier), documentar la falla observada y decidir si se cierra o se revisa el Plan 02. Si la hora actual cae en ventana diurna, responder "PENDING — reanudar después de 21:00 COT del {fecha}".
  </resume-signal>
  <done>Smoke test pasó en producción: SMS transaccional enviado fuera de ventana llegó al teléfono, row en sms_messages con source='automation' y status no-'failed'.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Actualizar docs/analysis/04-estado-actual-plataforma.md (eliminar deuda técnica resuelta)</name>
  <files>docs/analysis/04-estado-actual-plataforma.md</files>
  <read_first>
    - docs/analysis/04-estado-actual-plataforma.md (completo — buscar sección SMS y deuda técnica relacionada al over-blocking nocturno)
    - CLAUDE.md §"Regla 4: Documentación Siempre Actualizada"
    - .planning/standalone/sms-time-window-by-type/02-SUMMARY.md
  </read_first>
  <action>
1. Abrir `docs/analysis/04-estado-actual-plataforma.md` y buscar con grep los siguientes patrones para localizar secciones potencialmente afectadas:

```bash
grep -n "SMS" docs/analysis/04-estado-actual-plataforma.md
grep -n "isWithinSMSWindow\|8 AM - 9 PM\|horario permitido" docs/analysis/04-estado-actual-plataforma.md
grep -n "transaccional\|marketing" docs/analysis/04-estado-actual-plataforma.md
grep -n "sobre-bloquea\|over-block\|bloqueo nocturno" docs/analysis/04-estado-actual-plataforma.md
```

2. Si existe una sección del módulo SMS en ese documento:
   - Si describe el comportamiento antiguo ("SMS bloqueados entre 9 PM y 8 AM") → actualizar a "SMS transaccional 24/7, marketing sujeto a ventana (futuro módulo de campañas)".
   - Si lista deuda técnica tipo "P1/P2/P3: SMS sobre-bloquea transaccionales" → ELIMINAR esa entry (resuelta por este standalone).
   - Si no existe sección SMS o no hay item relacionado → registrar "no-op, docs no tenían entry afectada" en el SUMMARY y cerrar el task sin modificar el archivo.

3. Si se realizó cambio, agregar al final del bloque editado una línea: `*Actualizado 2026-04-17 por standalone sms-time-window-by-type.*`

4. Commit atómico en español SOLO si hubo cambio:
```
docs(estado-plataforma): remover deuda SMS over-blocking resuelta

- Standalone sms-time-window-by-type implementó bypass source-aware
- Transaccionales 24/7; marketing sujeto a ventana hasta módulo campañas

Co-Authored-By: Claude <noreply@anthropic.com>
```

5. Push a origin main (Regla 1) si hubo cambio:
```bash
git push origin main
```

NO agregar documentación especulativa (p.ej. "próximamente módulo campañas") si no está ya en el documento.
NO crear secciones nuevas si no existen — limitarse a actualizar lo que ya refleja el estado anterior.
  </action>
  <verify>
    <automated>test -f docs/analysis/04-estado-actual-plataforma.md && ! grep -q "SMS sobre-bloquea transaccionales" docs/analysis/04-estado-actual-plataforma.md && ! grep -q "isWithinSMSWindow" docs/analysis/04-estado-actual-plataforma.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "SMS sobre-bloquea transaccionales" docs/analysis/04-estado-actual-plataforma.md` returns 0
    - `grep -c "isWithinSMSWindow" docs/analysis/04-estado-actual-plataforma.md` returns 0 (nombre viejo no debe aparecer en docs)
    - Si el archivo fue modificado: commit con prefijo `docs(estado-plataforma)` existe y fue pusheado
    - Si el archivo NO fue modificado (no existía entry afectada): el task se cierra como no-op, documentado en SUMMARY
  </acceptance_criteria>
  <done>Docs de estado de plataforma sincronizadas con el código nuevo — deuda técnica resuelta removida o confirmado no-op.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Crear LEARNINGS.md con bugs, patterns, decisiones, cost</name>
  <files>.planning/standalone/sms-time-window-by-type/LEARNINGS.md</files>
  <read_first>
    - .planning/standalone/sms-time-window-by-type/CONTEXT.md (decisiones D-01..D-05 + regulatory context)
    - .planning/standalone/sms-time-window-by-type/RESEARCH.md §Open Questions, §Pitfalls, §Risk Register
    - .planning/standalone/sms-time-window-by-type/01-SUMMARY.md (distribución source prod + migración aplicada)
    - .planning/standalone/sms-time-window-by-type/02-SUMMARY.md (diff + tsc + vercel status)
    - .planning/debug/sms-onurix-not-delivered.md (incidente que originó este standalone)
    - CLAUDE.md §"Regla 0: SIEMPRE GSD COMPLETO"
  </read_first>
  <action>
Crear `.planning/standalone/sms-time-window-by-type/LEARNINGS.md` con el siguiente esqueleto (rellenar con datos reales extraídos de los summaries y del smoke test):

```markdown
# LEARNINGS — sms-time-window-by-type

**Completado:** {fecha smoke test}
**Trigger:** Incidente 2026-04-17 21:18 — pipeline logística OFI INTER bloqueado por guard 8AM-9PM genérico.
**Resultado:** SMS transaccionales 24/7; marketing preservado para futuro módulo de campañas.

## Bugs encontrados durante implementación

{Listar cualquier bug descubierto durante Plans 01/02/03. Ejemplos posibles:
- Ninguno (happy path)
- Rename incompleto en X archivo olvidado por grep
- tsc emitió error por Y
- Query Q1 reveló source='XYZ' inesperado
- Smoke test falló por Z (describir cómo se resolvió)}

## Patterns aprendidos / confirmados

- **Defensa por contrato + helper permisivo:** NOT NULL en DB + `isTransactionalSource` con default `true` para NULL combina compliance con robustez. El guard no bloquea por datos faltantes, la DB rechaza inserts inválidos.
- **Two source vocabularies, un solo nombre de campo:** `DomainContext.source` (taxonomía operacional: webhook/adapter/server-action) vs `SendSMSParams.source` (taxonomía regulatoria: automation/campaign). NO unificar.
- **Rename atómico cross-file:** helper renombrado en utils + import actualizado en domain en el MISMO commit (Pitfall 3 de RESEARCH). NO commitear parcial; el repo nunca queda en estado build-roto entre commits.
- **Regla 5 en práctica:** migración NOT NULL ANTES que código que depende. Distribution query ejecutada por usuario antes de decidir backfill condicional.
- **Observabilidad del fallback:** `console.warn` en `params.source || 'domain-call'` convierte un silencio defensivo en señal grepeable en logs de Vercel.

## Decisiones key (de CONTEXT.md, preservadas)

- D-01: source-derived type (sin nuevo param `smsType`)
- D-02: NULL → permissive, defendido por NOT NULL en DB
- D-03: sin checkbox en builder (YAGNI hasta módulo campañas)
- D-04: rename sin ajustar lógica (8AM-9PM preserved)
- D-05: backfill condicional

## Scope que NO se tocó (justificación futura)

- Ajuste de `isWithinMarketingSMSWindow` a norma CRC real (L-V 7-9, Sáb 8-8, Dom prohibido) → deferido hasta que exista módulo campañas consumiendo.
- CHECK constraint en `sms_messages.source` → Q2 defer hasta que la taxonomía sea mayor.
- Test runner + unit tests de `isTransactionalSource` → Q4 defer (no existe framework instalado en repo).
- UI builder checkbox "es marketing" → D-03 YAGNI.

## Cost / context (estimación)

- Plan 01: ~X% context — 1 archivo SQL + checkpoint
- Plan 02: ~Y% context — 3 archivos TS + 2 commits atómicos
- Plan 03: ~Z% context — smoke + docs + LEARNINGS
- Total GSD (discuss + research + plan + execute + verify): aprox N horas reloj con checkpoints humanos

## Archivos modificados

- `supabase/migrations/20260418040000_sms_source_not_null.sql` (nuevo)
- `src/lib/sms/constants.ts` (taxonomía + types)
- `src/lib/sms/utils.ts` (helper + rename)
- `src/lib/domain/sms.ts` (import + guard + warn)
- `docs/analysis/04-estado-actual-plataforma.md` (modificado o no-op)
- `.planning/standalone/sms-time-window-by-type/LEARNINGS.md` (este archivo)

## Follow-ups identificados (NO en scope)

- Auditoría de 12 archivos Twilio pendientes → `.planning/standalone/twilio-to-onurix-migration/AUDIT-MANDATE.md`
- Billing refund en fallos SMS → standalone `sms-refund-on-failure` (P2)
- Task C test Onurix Error:1081 transitory vs persistent → standalone aparte, P3
- Row huérfano `sms_messages.id = a5a7ce83-ef45-4c33-a511-d68b6de86c2e` con `provider_state_raw=NULL` — backfill opcional documentado en debug origen

## Referencias

- Debug que originó el standalone: `.planning/debug/sms-onurix-not-delivered.md`
- CONTEXT: `.planning/standalone/sms-time-window-by-type/CONTEXT.md`
- RESEARCH: `.planning/standalone/sms-time-window-by-type/RESEARCH.md`
- Plan summaries: 01-SUMMARY.md, 02-SUMMARY.md
- Commits en rama main: SHAs de los commits principales (migración NOT NULL, taxonomía, rename+guard, docs)
```

**CRÍTICO — Reemplazo de placeholders:**

El template contiene los siguientes placeholders específicos que DEBEN ser reemplazados con datos reales extraídos de los SUMMARYs y del smoke test:

- `{fecha smoke test}` → fecha real (YYYY-MM-DD) en que pasó el smoke test
- `~X% context`, `~Y% context`, `~Z% context` → números reales (o "no medido" si no se capturó)
- `aprox N horas` → estimación real de horas reloj
- `modificado o no-op` → escoger uno literal según el resultado del Task 2
- `SHAs de los commits principales` → SHAs reales de los 4-5 commits creados durante el standalone

Si algún dato no es aplicable (e.g. no hubo bugs), escribir "Ninguno" explícitamente en esa sección.

Commit atómico en español:
```
docs(sms-time-window-by-type): LEARNINGS.md al cierre del standalone

- Bugs descubiertos, patterns, decisiones, follow-ups
- Cumple Regla 0 (GSD completo) + Regla 4 (docs siempre actualizados)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Push a origin main (Regla 1 — aunque sea solo docs, mantener historial sincronizado):
```bash
git push origin main
```
  </action>
  <verify>
    <automated>test -f .planning/standalone/sms-time-window-by-type/LEARNINGS.md && grep -q "# LEARNINGS" .planning/standalone/sms-time-window-by-type/LEARNINGS.md && grep -q "D-01" .planning/standalone/sms-time-window-by-type/LEARNINGS.md && grep -q "Follow-ups" .planning/standalone/sms-time-window-by-type/LEARNINGS.md && grep -q "isTransactionalSource" .planning/standalone/sms-time-window-by-type/LEARNINGS.md && [ "$(grep -cE '\{(X|Y|Z|N|fecha smoke test|modificado\|no-op|SHAs[^}]*)\}' .planning/standalone/sms-time-window-by-type/LEARNINGS.md)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .planning/standalone/sms-time-window-by-type/LEARNINGS.md` exits 0
    - `grep -c "# LEARNINGS" .planning/standalone/sms-time-window-by-type/LEARNINGS.md` returns ≥ 1
    - `grep -c "D-01" .planning/standalone/sms-time-window-by-type/LEARNINGS.md` returns ≥ 1 (decisiones referenciadas)
    - `grep -c "Follow-ups" .planning/standalone/sms-time-window-by-type/LEARNINGS.md` returns ≥ 1
    - `grep -c "isTransactionalSource" .planning/standalone/sms-time-window-by-type/LEARNINGS.md` returns ≥ 1
    - Placeholders específicos del template reemplazados con datos reales, verificable con:
      `grep -cE '\{(X|Y|Z|N|fecha smoke test|modificado\|no-op|SHAs[^}]*)\}' .planning/standalone/sms-time-window-by-type/LEARNINGS.md` returns 0
      (este pattern matchea SOLO los placeholders conocidos del template, no llaves legítimas en bloques de código)
    - Commit con prefijo `docs(sms-time-window-by-type)` existe y fue pusheado a origin/main
  </acceptance_criteria>
  <done>LEARNINGS.md creado con datos reales del phase, bugs/patterns/decisiones/follow-ups documentados, placeholders específicos rellenados, commiteado y pusheado.</done>
</task>

</tasks>

<verification>
- Smoke test en prod confirmado por el usuario (SMS transaccional fuera de ventana llegó)
- `sms_messages` row del smoke test: source='automation', status no-'failed'
- `docs/analysis/04-estado-actual-plataforma.md` sin referencias a `isWithinSMSWindow` ni a "SMS sobre-bloquea transaccionales" (o no-op si no existían)
- `.planning/standalone/sms-time-window-by-type/LEARNINGS.md` existe con secciones mínimas: bugs, patterns, decisiones, follow-ups, referencias
- Placeholders específicos del template reemplazados con datos reales (grep dirigido retorna 0)
- Commits del Plan 03 pusheados a origin/main
</verification>

<success_criteria>
- Smoke test: OK, SMS llega fuera de ventana, fila en sms_messages correcta
- Docs de estado de plataforma sincronizadas con el código (Regla 4)
- LEARNINGS.md completo (Regla 0)
- Standalone `sms-time-window-by-type` cerrado — incidente 2026-04-17 21:18 resuelto por comportamiento observable
- Ningún follow-up de scope de este standalone pendiente (los identificados son trabajo de otros standalones)
</success_criteria>

<output>
Después de completar, crear `.planning/standalone/sms-time-window-by-type/03-SUMMARY.md` con:
- Resumen del smoke test (query result + hora Colombia + confirmación usuario)
- Si docs/analysis/04 fue modificado o no (con SHA del commit si aplica)
- Ruta y commit de LEARNINGS.md
- Cualquier sorpresa o follow-up nuevo descubierto durante el smoke
</output>
</output>
