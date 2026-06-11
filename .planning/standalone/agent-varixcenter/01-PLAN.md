---
phase: agent-varixcenter
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - .planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md
autonomous: false
requirements: [VARIX-REGISTER, VARIX-BOOK, VARIX-TEMPLATES, VARIX-CLONE]
user_setup:
  - service: varix-clinic Supabase (proyecto hermano)
    why: "El booking del bot crea patient+appointment en la DB de varix-clinic; se necesitan credenciales service_role + UUIDs de los 2 doctores"
    env_vars:
      - name: VARIX_CLINIC_SUPABASE_URL
        source: "varix-clinic/.env.local → NEXT_PUBLIC_SUPABASE_URL (https://<proyecto-varix>.supabase.co)"
      - name: VARIX_CLINIC_SERVICE_ROLE_KEY
        source: "varix-clinic/.env.local → SUPABASE_SERVICE_ROLE_KEY (service_role, bypasea RLS)"

must_haves:
  truths:
    - "El plan conoce los UUIDs reales de los 2 doctores (Dr. Ciro + Dra. Carolina) para el balanceo en booking.ts"
    - "El plan conoce el priority libre para la routing rule en el workspace c6621640-ba67-43de-9f05-905f09a6dc8f"
    - "Existe un snapshot baseline de los tests de los clones existentes (godentist + godentist-fb-ig) para detectar regresión"
    - "El cliente escogió 1 de los 5 saludos de PLANTILLAS.md (bloqueante de Wave 5)"
  artifacts:
    - path: ".planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md"
      provides: "Registro de UUIDs doctores, priority routing libre, baseline tests, saludo escogido, confirmación env vars en Vercel"
  key_links:
    - from: "Wave 0 audit"
      to: "booking.ts (Wave 2)"
      via: "DOCTOR_CIRO_UUID + DOCTOR_CAROLINA_UUID"
---

<objective>
Wave 0 — Auditoría y recolección de datos bloqueantes ANTES de escribir código del agente varixcenter.

Este es un agente clonado del motor v3 (patrón godentist-fb-ig) que introduce una pieza genuinamente nueva: escribir citas reales en el Supabase del proyecto hermano varix-clinic. Antes de clonar, hay 4 datos que SOLO se obtienen ahora y bloquean waves posteriores:
1. UUIDs reales de los 2 doctores (booking balanceo — Wave 2).
2. Priority libre para la routing rule en el workspace MorfX de Varixcenter (Wave 6).
3. Baseline de tests de los clones existentes (anti-regresión Regla 6).
4. Decisión del cliente: 1 de 5 saludos (bloquea la migración SQL — Wave 5).

Purpose: Evitar que Wave 2 (booking) y Wave 5 (templates) se bloqueen a mitad de ejecución por datos faltantes. Cumplir Regla 6 (verificar que godentist/godentist-fb-ig quedan intactos al final).
Output: `.planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md` con todos los datos recolectados.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/DISENO-COMPLETO.md
@.planning/standalone/agent-varixcenter/RESEARCH.md
@.planning/standalone/agent-varixcenter/PATTERNS.md
@.planning/standalone/agent-varixcenter/PLANTILLAS.md

<interfaces>
Workspace MorfX de Varixcenter: c6621640-ba67-43de-9f05-905f09a6dc8f
varix-clinic vista de doctores: doctors_view (SELECT user_id AS id, email, nombre, apellido FROM user_roles JOIN auth.users WHERE role='medico')
varix-clinic tablas write: patients (cedula, nombre NOT NULL, apellido NOT NULL, celular VARCHAR(10), ciudad), appointments (patient_id, doctor_id NULL, fecha_hora_inicio TIMESTAMPTZ, fecha_hora_fin TIMESTAMPTZ, estado, motivo_consulta)
Constraint anti-solapamiento: no_overlapping_appointments EXCLUDE gist (doctor_id WITH =, tstzrange &&) WHERE estado NOT IN ('cancelada','no_asistio') → error.code '23P01'
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Snapshot baseline de tests de clones existentes (anti-regresión Regla 6)</name>
  <read_first>
    - .planning/standalone/agent-varixcenter/PATTERNS.md (sección "Tests" + "Shared Patterns / VAL tag side-effect")
    - src/lib/agents/godentist-fb-ig/__tests__/ (listar suites existentes)
  </read_first>
  <files>.planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md</files>
  <action>
    Correr la suite de los dos agentes que comparten archivos de registro con varixcenter, para tener un baseline ANTES de tocar webhook-processor.ts y v3-production-runner.ts (Regla 6 — cero regresión):

    ```bash
    npx vitest run src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/ 2>&1 | tail -20
    ```

    Registrar en 00-WAVE0-AUDIT.md sección "Baseline tests (pre-varixcenter)":
    - Número exacto de suites y tests pasados (referencia esperada: godentist-fb-ig 6-7 suites / ~93 tests).
    - El comando exacto para re-correr en Wave 4/6 y comparar.
    - Nota: en Wave 3 se modifica el VAL guard de v3-production-runner.ts (compartido) — esta suite DEBE seguir verde post-cambio.

    También correr `npx tsc --noEmit 2>&1 | tail -5` y registrar el estado (MEMORY: tsc=0 predice deploy verde). Si hay errores pre-existentes, anotarlos para no atribuirlos a varixcenter después.
  </action>
  <verify>
    <automated>test -f .planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md && grep -q "Baseline tests" .planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md</automated>
  </verify>
  <acceptance_criteria>
    - 00-WAVE0-AUDIT.md contiene sección "Baseline tests (pre-varixcenter)" con número exacto de suites/tests pasados de godentist + godentist-fb-ig
    - Contiene el estado de `tsc --noEmit` (count de errores; 0 esperado o lista de pre-existentes)
    - Contiene el comando exacto para re-correr la comparación en Wave 4/6
  </acceptance_criteria>
  <done>Baseline registrado; cualquier regresión futura en godentist/godentist-fb-ig será detectable por diff contra este número.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: CHECKPOINT — Operador provee UUIDs de doctores, priority routing, env vars en Vercel, y escoge saludo</name>
  <what-built>
    Recolección de los 4 datos que SOLO el operador puede proveer (acceso a varix-clinic DB, a Vercel, y decisión del cliente sobre el saludo). Estos datos se ESCRIBEN en 00-WAVE0-AUDIT.md por el operador o se le piden y Claude los registra.
  </what-built>
  <how-to-verify>
    El operador debe completar las 4 acciones siguientes y proveer los resultados:

    1. **UUIDs de los 2 doctores** (bloquea booking.ts Wave 2):
       Correr contra el Supabase de varix-clinic (SQL editor del proyecto varix-clinic):
       ```sql
       SELECT id, nombre, apellido, email FROM doctors_view ORDER BY nombre;
       ```
       Esperado: 2 filas (Dr. Ciro Mario Romero, Dra. María Carolina Romero). Pegar los 2 UUIDs.
       ⚠️ Si aparecen MÁS de 2 médicos (A3 del research), confirmar cuáles 2 son los que atienden valoraciones — el balanceo se hace solo entre esos.

    2. **Priority libre para routing rule** (bloquea Wave 6 SQL):
       Correr contra el Supabase de MorfX:
       ```sql
       SELECT lifecycle_routing_enabled FROM workspace_agent_config
       WHERE workspace_id='c6621640-ba67-43de-9f05-905f09a6dc8f';
       SELECT priority, name FROM routing_rules
       WHERE workspace_id='c6621640-ba67-43de-9f05-905f09a6dc8f' AND active=true ORDER BY priority;
       ```
       Anotar: ¿lifecycle_routing_enabled = true? ¿qué priorities están ocupados? (se usará uno libre, ej. 100).

    3. **Env vars en Vercel** (bloquea booking/availability en runtime — Pitfall 8):
       Agregar en Vercel (proyecto MorfX, Production + Preview):
       - `VARIX_CLINIC_SUPABASE_URL` = el `NEXT_PUBLIC_SUPABASE_URL` de varix-clinic
       - `VARIX_CLINIC_SERVICE_ROLE_KEY` = el `SUPABASE_SERVICE_ROLE_KEY` de varix-clinic
       Confirmar que quedaron agregadas (NO pegar los valores en el audit — solo confirmar "agregadas").
       ⚠️ Confirmar también (A1 research) que el Supabase de varix-clinic NO tiene allowlist de IP que bloquee a Vercel.

    4. **Saludo escogido** (bloquea Wave 5 SQL templates — D-12):
       Mostrar al cliente las 5 opciones de PLANTILLAS.md §1 (A/B/C/D/E). El cliente escoge 1. Anotar cuál (letra + texto verbatim).
  </how-to-verify>
  <resume-signal>
    Escribir en 00-WAVE0-AUDIT.md: (1) los 2 UUIDs de doctores con su nombre, (2) lifecycle_routing_enabled + priorities ocupados + priority libre elegido, (3) "env vars VARIX_CLINIC_* agregadas en Vercel: sí/no" + "allowlist IP: no bloquea", (4) saludo escogido (letra + texto). Luego responder "wave0 completo".
  </resume-signal>
</task>

</tasks>

<verification>
- 00-WAVE0-AUDIT.md existe y contiene las 4 secciones: baseline tests, UUIDs doctores, routing priority, env vars confirmadas, saludo escogido
- Los datos bloqueantes para Wave 2 (UUIDs) y Wave 5 (saludo) están registrados
</verification>

<success_criteria>
- Baseline de tests de godentist/godentist-fb-ig registrado (anti-regresión)
- UUIDs de los 2 doctores obtenidos
- Priority libre identificado + lifecycle_routing_enabled verificado
- Env vars VARIX_CLINIC_* confirmadas en Vercel + allowlist IP descartado
- 1 de 5 saludos escogido por el cliente
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/01-SUMMARY.md`
</output>
