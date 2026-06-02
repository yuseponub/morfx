---
phase: quick-035
plan: 035
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/engine/v3-production-runner.ts
autonomous: true

must_haves:
  truths:
    - "Cuando el agente godentist ejecuta la accion 'pedir_fecha' por primera vez en una sesion (transicion capturing_data -> capturing_fecha), el contacto recibe el tag VAL"
    - "Aplicar el tag VAL en el mismo contacto multiples veces NO genera duplicados ni errores (idempotente)"
    - "Si el tag VAL no existe en el workspace, el flujo conversacional del agente NO falla — solo se loggea el warning"
    - "El tagging se aplica a TODOS los workspaces que usen el agente godentist (no esta restringido a 'GoDentist Valoraciones'), porque el tag VAL es propio del flujo de valoraciones"
    - "El sistema de metricas (que ya escucha tag.assigned en contactos) recibe el evento y puede contar valoraciones agendadas"
  artifacts:
    - path: "src/lib/agents/engine/v3-production-runner.ts"
      provides: "Side-effect de tagging VAL despues de processMessage cuando agentModule==='godentist' y pedir_fecha es accion nueva"
      contains: "assignTag"
  key_links:
    - from: "src/lib/agents/engine/v3-production-runner.ts (post-processMessage)"
      to: "src/lib/domain/tags.ts::assignTag"
      via: "import dinamico de @/lib/domain/tags, llamada con entityType='contact', entityId=input.contactId, tagName='VAL'"
      pattern: "assignTag\\(.*tagName.*VAL"
---

<objective>
Agregar el tag "VAL" al contacto en el momento exacto en que el agente GoDentist Valoraciones transiciona de capturar el nombre del paciente a pedir la fecha de la valoracion (accion `pedir_fecha`, que produce el template "¡Perfecto {nombre}! ¿Para que dia te gustaria agendar tu valoracion?").

Purpose: Alimentar el sistema de metricas (standalone "Conversation Tags to Contact" ya completado) que cuenta valoraciones agendadas por dia escuchando el evento `tag.assigned` en contactos.

Output: Side-effect aditivo en el v3-production-runner que llama `assignTag` del domain layer cuando detecta una transicion nueva a `pedir_fecha` en sesiones del agente godentist. Cero impacto en el comportamiento conversacional.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Punto de inyeccion (codigo existente)
@src/lib/agents/engine/v3-production-runner.ts

# Domain function a usar (idempotente, no auto-crea tag)
@src/lib/domain/tags.ts

# Agente godentist (referencia — NO se modifica)
@src/lib/agents/godentist/godentist-agent.ts
@src/lib/agents/godentist/types.ts
</context>

<decisions>
**1. Punto de inyeccion: v3-production-runner.ts, NO godentist-agent.ts**
   - Razon: el agente godentist (`processMessage`) es puro/stateless respecto a side-effects de DB. No recibe `contactId` en su `V3AgentInput`. Mover la inyeccion al runner mantiene la separacion de responsabilidades (agente = decision, runner = I/O).
   - El runner ya tiene `input.contactId` y `this.config.workspaceId` disponibles.

**2. Trigger: deteccion de accion NUEVA `pedir_fecha`**
   - Comparar `output.accionesEjecutadas` vs `accionesEjecutadas` (input). Si `pedir_fecha` aparece en output pero NO estaba en input -> es transicion nueva -> aplicar tag.
   - Esto garantiza que el tag se aplica UNA VEZ por sesion (en la primera vez que el agente decide pedir la fecha), aunque la idempotencia de `assignTag` (codigo 23505 = success) tambien lo cubre como segunda barrera.

**3. Scope multi-workspace: aplicar a TODOS los workspaces con `agentModule === 'godentist'`**
   - El tag VAL es semanticamente propio del flujo de valoraciones godentist. Si en el futuro el agente sirve a multiples workspaces, todos deben taggear.
   - Filtro: `if (this.config.agentModule === 'godentist')` — no se hace whitelist por workspace_id.

**4. Manejo de error: fail-open (loggear y continuar)**
   - Si `assignTag` retorna `success: false` (tag no existe, error de DB, etc.), se loggea con `console.warn` y el flujo conversacional continua normalmente.
   - Razon: el tagging es un side-effect de observabilidad, no es parte del contrato funcional del agente. Un fallo aqui NUNCA debe romper la conversacion con el cliente real.

**5. Sin feature flag (Regla 6 evaluada y descartada)**
   - El cambio es ESTRICTAMENTE aditivo: agrega un side-effect de DB despues de que el agente ya tomo su decision. NO modifica:
     - Templates enviados
     - Logica conversacional
     - State machine del agente
     - Decisiones del sales-track o response-track
   - Riesgo de afectar al cliente real: cero (el unico efecto observable es un tag adicional en su perfil + un evento `tag.assigned` adicional en automations).
   - Decision: NO requiere feature flag, pero el commit y el SUMMARY deben documentar esta evaluacion explicita.

**6. Idempotencia confirmada**
   - `src/lib/domain/tags.ts::assignTag` ya maneja `error.code === '23505'` (unique violation) como success (linea 92). Aplicar el tag dos veces es seguro a nivel de domain.

**7. NO se toca el robot Railway (`godentist/robot-godentist/`)**
   - El robot solo gestiona Playwright contra dentos.co. El tagging es responsabilidad del agente conversacional, NO del robot de scraping/agendamiento.

**8. NO se toca `src/lib/agents/godentist/`**
   - Mantener el agente puro. El runner es el lugar correcto para side-effects de I/O.
</decisions>

<tasks>

<task type="auto">
  <name>Task 1: Agregar side-effect de tagging VAL post-processMessage en v3-production-runner</name>
  <files>src/lib/agents/engine/v3-production-runner.ts</files>
  <action>
En `src/lib/agents/engine/v3-production-runner.ts`, justo despues del bloque `if (this.config.agentModule === 'godentist') { ... } else if ...` que invoca `processMessage` (linea ~148, despues de obtener `output: V3AgentOutput`), agregar un side-effect de tagging:

1. Crear un helper privado en la clase (o como funcion local) llamado `applyGodentistValTag(input, output, previousAcciones)`:

```ts
// Side-effect: GoDentist VAL tag tracking
// When agent transitions to 'pedir_fecha' (asking for appointment date) for the
// first time in a session, tag the contact with 'VAL' to feed the metrics
// system (Conversation Tags to Contact standalone — listens to tag.assigned).
//
// Decisions:
// - Injection point: runner (not agent) — keeps godentist agent pure/stateless
// - Trigger: NEW pedir_fecha action (not present in previous accionesEjecutadas)
// - Scope: ALL workspaces using agentModule === 'godentist'
// - Idempotency: assignTag handles 23505 (already assigned) as success
// - Fail-open: log warn and continue if tag missing or DB error
// - No feature flag: purely additive side-effect, zero conversational impact
private async applyGodentistValTagIfNeeded(
  input: EngineInput,
  output: V3AgentOutput,
  previousAcciones: AccionRegistrada[],
): Promise<void> {
  if (this.config.agentModule !== 'godentist') return
  if (!input.contactId) return

  const wasAlreadyPresent = previousAcciones.some(a => a.tipo === 'pedir_fecha')
  const isNowPresent = output.accionesEjecutadas.some(a => a.tipo === 'pedir_fecha')
  if (wasAlreadyPresent || !isNowPresent) return

  try {
    const { assignTag } = await import('@/lib/domain/tags')
    const result = await assignTag(
      { workspaceId: this.config.workspaceId, cascadeDepth: 0 },
      { entityType: 'contact', entityId: input.contactId, tagName: 'VAL' },
    )
    if (!result.success) {
      console.warn(
        `[V3-RUNNER][godentist] Could not assign VAL tag (fail-open): ${result.error} ` +
        `(workspace=${this.config.workspaceId}, contact=${input.contactId})`,
      )
    } else {
      console.log(
        `[V3-RUNNER][godentist] Assigned VAL tag to contact ${input.contactId} ` +
        `on first pedir_fecha transition`,
      )
    }
  } catch (err) {
    console.warn(
      `[V3-RUNNER][godentist] Exception applying VAL tag (fail-open):`,
      err,
    )
  }
}
```

2. Llamar al helper INMEDIATAMENTE despues del bloque que asigna `output` (justo despues de la linea ~148, antes del paso "5. Route output to adapters"):

```ts
// Side-effect: tag VAL on first pedir_fecha transition (godentist only)
await this.applyGodentistValTagIfNeeded(input, output, accionesEjecutadas)
```

3. Asegurar que el import de `AccionRegistrada` esta disponible (ya viene de `../godentist/types` o `../somnio-v3/types` — verificar y agregar si falta). Si la firma del helper causa import circular, usar `any[]` con un comentario `// eslint-disable-next-line @typescript-eslint/no-explicit-any` y narrowing local con `(a: { tipo: string }) => a.tipo === 'pedir_fecha'`.

4. NO modificar nada mas en el archivo. NO modificar el agente godentist. NO modificar `src/lib/domain/tags.ts`. NO tocar `godentist/robot-godentist/`.

CRITICO:
- El `await` debe estar dentro del try interno del helper, NO bloquear el flujo principal con un try/catch externo.
- El helper debe ser COMPLETAMENTE silencioso ante errores (solo `console.warn`), NUNCA throw.
- NO usar feature flag — esta decision esta documentada en `<decisions>` punto 5.
- Verificar con grep que `pedir_fecha` es exactamente el string usado en `accionesEjecutadas[].tipo` para el agente godentist (ver `src/lib/agents/godentist/godentist-agent.ts:464` que usa `hasAction(state.accionesEjecutadas, 'pedir_fecha')`).
  </action>
  <verify>
1. `npm run build` (o `npx tsc --noEmit`) compila sin errores nuevos
2. `npx eslint src/lib/agents/engine/v3-production-runner.ts` sin errores
3. Grep manual: `grep -n "applyGodentistValTagIfNeeded\|VAL" src/lib/agents/engine/v3-production-runner.ts` muestra el helper y la llamada
4. Confirmar que el agente godentist (`src/lib/agents/godentist/`) NO tiene cambios: `git diff --stat src/lib/agents/godentist/` debe estar vacio
5. Confirmar que `src/lib/domain/tags.ts` NO tiene cambios: `git diff --stat src/lib/domain/tags.ts` debe estar vacio
6. Confirmar que `godentist/robot-godentist/` NO tiene cambios: `git diff --stat godentist/robot-godentist/` debe estar vacio
  </verify>
  <done>
- Helper `applyGodentistValTagIfNeeded` existe en `v3-production-runner.ts`
- Helper se invoca con `await` despues de `processMessage` y antes de "Route output to adapters"
- Helper detecta correctamente la transicion nueva a `pedir_fecha` (no estaba antes, esta ahora)
- Helper llama `assignTag` con `entityType='contact'`, `tagName='VAL'`, `workspaceId=this.config.workspaceId`, `entityId=input.contactId`
- Helper es fail-open: errores solo loggean, nunca throw
- Helper solo se activa cuando `agentModule === 'godentist'`
- Build y lint pasan sin errores nuevos
- Cero cambios en el agente godentist, en domain/tags.ts, o en el robot Railway
  </done>
</task>

<task type="auto">
  <name>Task 2: Commit + push a Vercel</name>
  <files>(git operation)</files>
  <action>
Crear commit atomico y pushear a Vercel (Regla 1 del proyecto):

```bash
git add src/lib/agents/engine/v3-production-runner.ts
git commit -m "$(cat <<'EOF'
feat(godentist): tag contacto con VAL al transicionar a pedir_fecha

Side-effect aditivo en v3-production-runner: cuando el agente godentist
ejecuta la accion 'pedir_fecha' por primera vez en una sesion (justo
antes del template "¡Perfecto {nombre}! ¿Para que dia..."), se aplica
el tag VAL al contacto via domain layer (assignTag).

Alimenta el sistema de metricas (Conversation Tags to Contact) que
escucha tag.assigned en contactos para contar valoraciones agendadas
por dia.

Decisiones clave:
- Inyeccion en runner, no en agente (mantiene agente puro)
- Trigger: deteccion de accion NUEVA pedir_fecha (idempotente por sesion)
- Scope: TODOS los workspaces con agentModule === 'godentist'
- Fail-open: si tag no existe o DB falla, solo log warn (no rompe flujo)
- Idempotencia: assignTag ya maneja 23505 como success
- SIN feature flag: cambio puramente aditivo, cero impacto conversacional
  (Regla 6 evaluada explicitamente — no requiere flag)
- NO se toca el agente godentist ni el robot Railway

Quick task: 035-agregar-tag-val-godentist-valoraciones

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

Verificar que el push fue exitoso y que Vercel inicio el deploy.
  </action>
  <verify>
1. `git log -1 --oneline` muestra el nuevo commit
2. `git status` esta limpio (o solo con archivos no relacionados al task)
3. `git push` retorna exito
  </verify>
  <done>
- Commit creado con mensaje descriptivo en espanol y co-author
- Push a `origin main` exitoso
- Vercel iniciara deploy automatico
  </done>
</task>

</tasks>

<verification>
**Verificacion en produccion (post-deploy, manual por el usuario):**

1. Esperar que Vercel complete el deploy
2. Enviar mensaje al bot godentist en el workspace "GoDentist Valoraciones" simulando el flujo:
   - "Hola, quiero agendar una valoracion"
   - Responder con todos los datos: nombre completo, cedula, telefono, sede
   - Esperar a que el bot responda "¡Perfecto {nombre}! ¿Para que dia te gustaria agendar tu valoracion?"
3. Verificar en el CRM que el contacto AHORA tiene el tag VAL aplicado
4. Verificar en logs de Vercel: buscar `[V3-RUNNER][godentist] Assigned VAL tag to contact`
5. Verificar idempotencia: si el bot vuelve a transicionar a `pedir_fecha` en la misma sesion (no deberia, pero como proteccion), el tag NO se aplica de nuevo (el helper detecta `wasAlreadyPresent`)
6. Verificar fail-open: en un workspace de prueba SIN el tag VAL creado, simular el flujo y confirmar que el bot responde normalmente y solo aparece `[V3-RUNNER][godentist] Could not assign VAL tag (fail-open)` en logs
7. Verificar que el sistema de metricas registra el evento (tag.assigned -> contador de valoraciones del dia incrementa)
</verification>

<success_criteria>
- Cliente real envia "quiero agendar valoracion" + sus datos -> bot responde "¡Perfecto X! ¿Para que dia..." -> contacto recibe tag VAL automaticamente
- Tag VAL aplicado UNA SOLA VEZ por sesion (no se duplica si la conversacion vuelve al estado pedir_fecha)
- Si el tag VAL no existe en algun workspace que use el agente godentist, el bot sigue funcionando normalmente y solo aparece warning en logs
- Cero regresion en el comportamiento conversacional del bot godentist (mismas respuestas, mismos tiempos, mismo flujo)
- Sistema de metricas de valoraciones (ya existente) empieza a contar correctamente
- Fase 2 (futura, NO en este quick task): mover el tag para que se aplique al COMPLETAR el agendamiento, no al pedir la fecha — documentar como TODO en el SUMMARY
</success_criteria>

<output>
Despues de completar, crear `.planning/quick/035-agregar-tag-val-godentist-valoraciones/035-SUMMARY.md` con:
- Cambios realizados (linea exacta del helper en v3-production-runner.ts)
- Decisiones tomadas (especialmente: por que NO se uso feature flag, por que la inyeccion va en runner y no en agente, por que el scope es todos los workspaces godentist)
- TODO Fase 2: mover tag VAL al final del agendamiento (cuando se confirma la cita), no al pedir la fecha
- Verificacion en produccion pendiente del usuario
</output>
