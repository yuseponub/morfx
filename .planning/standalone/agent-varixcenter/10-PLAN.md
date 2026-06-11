---
phase: agent-varixcenter
plan: 10
type: execute
wave: 5
depends_on: [01, 06]
files_modified:
  - supabase/migrations/<timestamp>_varixcenter_template_catalog.sql
autonomous: false
requirements: [VARIX-TEMPLATES]

must_haves:
  truths:
    - "Existe una migración SQL con los ~44 templates de PLANTILLAS.md bajo agent_id='varixcenter' en el workspace c6621640-..."
    - "El saludo insertado es el que el cliente escogió en Wave 0 (1 de 5)"
    - "La migración es idempotente (DELETE WHERE agent_id='varixcenter' antes del INSERT)"
    - "La migración fue APLICADA EN PROD ANTES de pushear el código (Regla 5)"
    - "El row count post-apply = ~44 templates"
  artifacts:
    - path: "supabase/migrations/<timestamp>_varixcenter_template_catalog.sql"
      provides: "catálogo de ~44 templates verbatim de PLANTILLAS.md"
      contains: "agent_id"
  key_links:
    - from: "migración templates"
      to: "response-track getTemplatesForIntents(VARIXCENTER_AGENT_ID)"
      via: "agent_id='varixcenter' en agent_templates"
      pattern: "varixcenter"
---

<objective>
Wave 5 — Crear y APLICAR EN PROD la migración del catálogo de ~44 templates (PLANTILLAS.md) bajo agent_id='varixcenter' en el workspace c6621640-ba67-43de-9f05-905f09a6dc8f. BLOCKING por Regla 5: la migración se aplica en prod ANTES de pushear el código que la consume (si no, getTemplatesForIntents retorna Map vacío -> templates_not_found_in_catalog, degradación silenciosa — Pitfall 7).

Purpose: Poblar el catálogo propio del agente. Sin esto el agente registrado responde vacío.
Output: 1 archivo de migración SQL + aplicación en prod confirmada.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/PLANTILLAS.md
@.planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md
@.planning/standalone/agent-varixcenter/PATTERNS.md
@supabase/migrations/20260505220000_godentist_fb_ig_template_catalog.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Generar la migración SQL de ~44 templates (verbatim PLANTILLAS.md + saludo escogido)</name>
  <read_first>
    - supabase/migrations/20260505220000_godentist_fb_ig_template_catalog.sql (analog — header, idempotencia DELETE, estructura INSERT, columnas de agent_templates)
    - .planning/standalone/agent-varixcenter/PLANTILLAS.md (TODO el contenido verbatim de los templates)
    - .planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md (saludo escogido por el cliente — letra A/B/C/D/E)
  </read_first>
  <files>supabase/migrations/<timestamp>_varixcenter_template_catalog.sql</files>
  <action>
    Crear `supabase/migrations/<timestamp>_varixcenter_template_catalog.sql` (timestamp en formato YYYYMMDDHHMMSS) clonando la estructura del analog godentist-fb-ig:

    **Header (copiar estilo analog líneas 1-48):** documentar workspace c6621640-ba67-43de-9f05-905f09a6dc8f, idempotencia, rollback, y la nota Regla 5 (apply en prod ANTES del push; si no, getTemplatesForIntents retorna Map vacío).

    **Idempotencia (analog líneas 50-53):** `DELETE FROM agent_templates WHERE agent_id='varixcenter';` antes de los INSERT.

    **INSERTs — los ~44 templates de PLANTILLAS.md verbatim**, con las columnas que use agent_templates (revisar el analog para las columnas exactas: agent_id, intent, priority [CORE/COMP/OPCIONAL], content, workspace_id si aplica, etc.):
    - **Saludo:** insertar SOLO la opción escogida por el cliente (de 00-WAVE0-AUDIT.md) como intent='saludo' priority=CORE, con el texto VERBATIM de PLANTILLAS.md §1 (la letra elegida). NO insertar las 5.
    - §2 Triage: `triage` CORE.
    - §3 Info por tipo: info_vasitos (CORE) + info_vasitos_comp (COMP), info_grandes (CORE) + info_grandes_comp (COMP), info_ambas (CORE) + info_ambas_comp (COMP).
    - §4 Precios/info: precio_valoracion, precio_tratamiento, precio_cirugia, info_laser, info_examen_doppler, info_medias, ubicacion, horarios, financiacion (CORE) + financiacion_opcional (OPCIONAL), seguros_eps, fuera_de_ciudad (COMP).
    - §5 Síntomas/médicas: no_diagnostico, preguntas_medicas, pedir_texto.
    - §6 Flujo agendamiento: pedir_datos, pedir_datos_parcial, pedir_fecha, mostrar_disponibilidad, mostrar_disponibilidad_jornada, sin_disponibilidad, confirmar_cita, cita_agendada, invitar_agendar.
    - §7 Escape/control: handoff, paciente_antiguo, reagendamiento, cancelar_cita, queja, no_interesa, despedida, english_response.
    - §8 Follow-ups: retoma_post_info, retoma_datos, retoma_fecha, retoma_horario, retoma_confirmacion.

    Copiar el contenido EXACTO (incluyendo emojis, {{variables}}, saltos de línea \n) de PLANTILLAS.md. Los precios verbatim: valoración $100.000, escleroterapia $95.000 (D-06).

    Al final, agregar un comentario con la query de verificación: `-- SELECT COUNT(*) FROM agent_templates WHERE agent_id='varixcenter'; -- esperado ~44`
  </action>
  <verify>
    <automated>test -f supabase/migrations/*varixcenter_template_catalog.sql && grep -c "agent_id" supabase/migrations/*varixcenter_template_catalog.sql; grep -c "DELETE FROM agent_templates WHERE agent_id" supabase/migrations/*varixcenter_template_catalog.sql</automated>
  </verify>
  <acceptance_criteria>
    - El archivo SQL existe en supabase/migrations/ con sufijo _varixcenter_template_catalog.sql
    - Contiene `DELETE FROM agent_templates WHERE agent_id='varixcenter'` (idempotencia)
    - Contiene un único saludo (el escogido en Wave 0), NO los 5
    - Contiene los ~44 templates de PLANTILLAS.md (todas las secciones §2-§8)
    - Los precios $100.000 y $95.000 presentes (D-06)
    - `grep -c "INSERT INTO agent_templates\|VALUES" ...` consistente con ~44 rows
  </acceptance_criteria>
  <done>Migración SQL generada con saludo escogido + ~44 templates verbatim.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: CHECKPOINT BLOCKING — Aplicar la migración en PROD (Regla 5)</name>
  <what-built>
    La migración SQL con los ~44 templates está lista. Por Regla 5, DEBE aplicarse en producción (Supabase de MorfX) ANTES de pushear el código del agente. El código del agente (Waves 1-4) NO se ha pusheado aún — Wave 6 lo hará DESPUÉS de este apply.
  </what-built>
  <how-to-verify>
    El operador debe:
    1. Aplicar el archivo `supabase/migrations/<timestamp>_varixcenter_template_catalog.sql` en el Supabase de PRODUCCIÓN de MorfX (SQL editor o supabase db push, según el flujo habitual del proyecto).
    2. Verificar el row count:
       ```sql
       SELECT COUNT(*) FROM agent_templates WHERE agent_id='varixcenter';
       -- esperado: ~44
       SELECT intent, priority FROM agent_templates WHERE agent_id='varixcenter' ORDER BY intent;
       -- verificar que el saludo escogido está presente y es el correcto
       ```
    3. Confirmar que el COUNT coincide con el número de templates insertados (~44) y que el saludo es la opción que el cliente escogió.
    ⚠️ NO pushear código todavía — Wave 6 hace el push DESPUÉS de confirmar este apply (Regla 5).
  </how-to-verify>
  <resume-signal>Responder "migración aplicada, count=N" (N≈44) y confirmar que el saludo es el correcto.</resume-signal>
</task>

</tasks>

<verification>
- Migración SQL existe con saludo escogido + ~44 templates
- Migración APLICADA en prod (count ≈44 confirmado por operador)
- Código del agente NO pusheado aún (Regla 5 — push en Wave 6)
</verification>

<success_criteria>
- Catálogo de ~44 templates bajo agent_id='varixcenter' en prod
- Saludo = opción escogida por el cliente (D-12)
- Regla 5 respetada (apply antes del push)
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/10-SUMMARY.md`
</output>
