---
phase: template-builder-suggested-actions
plan: 03
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - .claude/rules/agent-scope.md
  - docs/analysis/04-estado-actual-plataforma.md
autonomous: false
requirements: [D-02, D-07, D-10]
must_haves:
  truths:
    - "agent-scope.md §Config Builder documenta la tool 8 suggestActions como echo puro y corrige stepCountIs(6)→stepCountIs(15)"
    - "Todo el código del standalone está pusheado a Vercel ANTES de pedir QA al usuario (Regla 1)"
    - "El usuario verificó en browser el flujo completo de chips (QA checklist D-04..D-10)"
  artifacts:
    - path: ".claude/rules/agent-scope.md"
      provides: "Scope actualizado del config-builder (8 tools, suggestActions echo)"
      contains: "suggestActions"
  key_links:
    - from: ".claude/rules/agent-scope.md"
      to: "src/lib/config-builder/templates/tools.ts"
      via: "documentación del scope sincronizada con el código (Regla 4)"
      pattern: "suggestActions"
---

<objective>
Cerrar el standalone: sincronizar documentación de scope (Regla 4), pushear a Vercel (Regla 1) y verificar con el usuario el flujo completo de chips en browser (QA manual — la única validación posible de D-04/D-05/D-06/D-08/D-09/D-10 porque requiere LLM en vivo, según RESEARCH §Validation Architecture).

Purpose: código y documentación sincronizados + verificación humana del comportamiento end-to-end.
Output: docs actualizados, push a main, QA checklist aprobado por el usuario.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/template-builder-suggested-actions/CONTEXT.md
@.planning/standalone/template-builder-suggested-actions/RESEARCH.md
@.planning/standalone/template-builder-suggested-actions/01-SUMMARY.md
@.planning/standalone/template-builder-suggested-actions/02-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Actualizar agent-scope.md §Config Builder + docs de estado (Regla 4)</name>
  <files>.claude/rules/agent-scope.md, docs/analysis/04-estado-actual-plataforma.md</files>
  <read_first>
    - .claude/rules/agent-scope.md (sección "### Config Builder: WhatsApp Templates" completa — PUEDE/NO PUEDE/Validacion)
    - src/lib/config-builder/templates/tools.ts (estado final post-Plan 01 — confirmar que suggestActions existe)
    - docs/analysis/04-estado-actual-plataforma.md (grep "Template Builder\|config-builder" para localizar la sección del módulo, si existe)
  </read_first>
  <action>
**`.claude/rules/agent-scope.md` — sección "### Config Builder: WhatsApp Templates"**, tres ediciones:

(a) En **PUEDE**, agregar bullet:
```
  - Sugerir hasta 3 acciones rapidas contextuales via tool `suggestActions` (echo puro: devuelve `{label, message}` que la UI renderiza como chips — cero DB, cero mutacion; la UI capea el total en 4 con prioridad determinista)
```

(b) En **Validacion**, corregir la línea del ciclo (discrepancia preexistente notada en CONTEXT/RESEARCH):
- ANTES: `stopWhen: \`stepCountIs(6)\` — ciclo maximo list -> draft -> preview -> validate -> upload -> submit`
- DESPUÉS: `stopWhen: \`stepCountIs(15)\` — holgura para el ciclo list -> draft -> preview -> validate -> upload -> submit + suggestActions al final del turno`

(c) En **Validacion**, agregar bullets:
```
  - `suggestActions` es echo puro: `git log -p src/lib/config-builder/templates/tools.ts` no muestra imports de supabase/domain en la tool; excluida de `activeTools` en el step 0 del route (REGLA CERO intacta)
  - Standalone: `.planning/standalone/template-builder-suggested-actions/` (chips de accion sugerida en el chat del builder)
```

**`docs/analysis/04-estado-actual-plataforma.md`** (Regla 4): localizar con grep la sección del Template Builder / config-builder. Si existe, agregar una línea al estado del módulo: "Chips de acción sugerida en el chat (deterministas + IA vía suggestActions, máx 4) — shipped 2026-06-12". Si NO existe sección del módulo, omitir este archivo y quitar su path del commit (documentarlo en el SUMMARY como N/A).
  </action>
  <verify>
    <automated>grep -c "suggestActions" .claude/rules/agent-scope.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "suggestActions" .claude/rules/agent-scope.md` ≥ 2 (bullet PUEDE + bullet Validacion)
    - `grep -c "stepCountIs(6)" .claude/rules/agent-scope.md` retorna 0
    - `grep -c "stepCountIs(15)" .claude/rules/agent-scope.md` ≥ 1
    - `grep -c "template-builder-suggested-actions" .claude/rules/agent-scope.md` ≥ 1
    - La edición NO toca otras secciones de agent-scope.md (`git diff .claude/rules/agent-scope.md` acotado a §Config Builder)
  </acceptance_criteria>
  <done>Docs sincronizados con el código (Regla 4). Commit: `docs(template-builder-chips): agent-scope 7→8 tools + fix stepCountIs + estado plataforma (Regla 4)`.</done>
</task>

<task type="auto">
  <name>Task 2: Push a Vercel + smoke de build (Regla 1)</name>
  <files>(ninguno — operación git)</files>
  <read_first>
    - .claude/rules/code-changes.md (convención de push post-cambios)
  </read_first>
  <action>
Pre-flight y push (Regla 1 — SIEMPRE antes de pedir pruebas al usuario):

1. `npx tsc --noEmit` — debe salir 0 (predictor de build verde en Vercel, lección memory `build_subprojects_break_next_build`).
2. `npx vitest run src/lib/config-builder/templates/__tests__/` — suite completa del módulo verde.
3. Verificar que TODOS los commits de Planes 01/02/03 están en main local: `git log --oneline origin/main..HEAD` muestra los commits del standalone (≥6).
4. `git push origin main`.
5. Confirmar que el push llegó: `git log --oneline -1 origin/main` coincide con HEAD local.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/config-builder/templates/__tests__/ && git status --porcelain | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` exit 0
    - `npx vitest run src/lib/config-builder/templates/__tests__/` verde
    - `git log --oneline origin/main..HEAD | wc -l` retorna 0 después del push (todo pusheado)
    - `git status --porcelain` sin archivos de código sin commitear
  </acceptance_criteria>
  <done>Código en origin/main → Vercel desplegando. El QA del Task 3 se hace contra el deploy (o dev local 3020 si el usuario prefiere).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: QA manual del flujo de chips (D-04..D-10)</name>
  <what-built>Chips de acción sugerida en el chat del Template Builder: base determinista por etapa del draft + chips contextuales de la IA vía suggestActions, máx 4, con acciones locales y guard de confirmación. Todo pusheado a Vercel.</what-built>
  <how-to-verify>
En `/configuracion/whatsapp/templates/builder` (prod tras deploy, o `npm run dev` puerto 3020):

1. **Empty-state (D-08/D-09):** chat vacío muestra 4 chips: "Confirmación de pedido · Recordatorio de cita · Promoción · Código de verificación". Click en "Confirmación de pedido" → se envía como burbuja tuya el prompt completo pre-armado y la IA propone un borrador de una.
2. **Gating (D-06):** mientras la IA responde (streaming) NO hay chips visibles. Al terminar el turno aparecen debajo, entre los mensajes y el input.
3. **Etapa borrador (D-01/D-03):** con borrador propuesto sin variables → chips tipo "Agregar variables · Agregar imagen · Cambiar el texto · Continuar →" (máx 4 aunque la IA sugiera más).
4. **Acción local upload (D-05):** pide un template con imagen ("Quiero que tenga una imagen en el header") → chip "📷 Subir imagen" abre el file picker DIRECTO (sin enviar mensaje). "Mejor sin imagen" sí envía mensaje.
5. **Guard de confirmación (D-07):** click "Validar template" → si la validación pasa, aparece "✅ Confirmar y crear" (verde). Edita el body en el preview-pane → el chip verde DESAPARECE hasta re-validar. Click en el chip verde → envía "Confirmo, créalo" y la IA crea el template.
6. **Post-submit (D-05):** tras crear → "Crear otro template" (resetea chat y draft) · "Ver mis templates" (navega a /configuracion/whatsapp/templates).
7. **Persistencia (D-10):** a mitad de flujo, recarga la página y reabre la sesión desde el historial → los chips reaparecen acordes al estado del draft, incluidos los del último turno (persistence mode nuevo).
8. **Template CON variables (Pitfall 6 — caso de observación):** crea un template con {{1}}/{{2}} end-to-end y observa si la validación pasa y el chip verde llega a aparecer. Si la validación falla sistemáticamente por "Falta mapping", repórtalo (es la contradicción preexistente validation↔prompt, fuera de scope, pero hay que saber cómo se comporta).
9. **Sin ruido visual (Pitfall 3):** en ningún momento se ve "Ejecutando suggestActions..." ni un pill verde "suggestActions OK" en las burbujas.

**Expectativa conocida (Pitfall 8, NO es bug):** tras recargar un draft con imagen ya subida, el chip "📷 Subir imagen" reaparece — el storagePath no sobrevive la recarga (limitación preexistente del builder, consistente con el preview).
  </how-to-verify>
  <resume-signal>Escribe "aprobado" o describe los problemas encontrados (se abre gap-closure si hay fallos)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (sin código nuevo en este plan) | docs + push + QA — boundaries cubiertos en Planes 01/02 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-TBC-07 | Repudiation | docs desincronizados del código (scope no auditable) | mitigate | Task 1 sincroniza agent-scope.md en el mismo standalone (Regla 4) |
</threat_model>

<verification>
- agent-scope.md §Config Builder con 8 tools y stepCountIs(15)
- `git log --oneline origin/main..HEAD` vacío (todo pusheado — Regla 1)
- QA checklist 9 puntos aprobado por el usuario (o gaps documentados para gap-closure)
</verification>

<success_criteria>
- Docs sincronizados, código en Vercel, QA humano aprobado
- Si el QA falla en algún punto: documentar gaps y correr `/gsd-plan-phase template-builder-suggested-actions --gaps`
- Recordatorio post-fase (workflow GSD): LEARNINGS.md del standalone al cerrar
</success_criteria>

<output>
Al completar, crear `.planning/standalone/template-builder-suggested-actions/03-SUMMARY.md`
</output>
