# Wave 0 Audit — agent-varixcenter

**Fecha:** 2026-06-11
**Estado:** Datos técnicos recolectados ✅ · Pendiente operador: env vars Vercel + saludo escogido ⏳

## Baseline tests (pre-varixcenter)

Comando exacto (re-correr en Wave 3/4/6 y comparar contra estos números — Regla 6):

```bash
npx vitest run src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/
```

- **Resultado baseline (2026-06-11):** `Test Files 9 passed (9)` · `Tests 103 passed (103)` · Duration ~26s
- **`npx tsc --noEmit`:** exit 0, **0 errores pre-existentes** (cualquier error futuro es atribuible al trabajo de varixcenter; tsc=0 predice deploy Vercel verde — MEMORY build_subprojects)
- Nota: en Wave 3 se modifica el VAL guard de `v3-production-runner.ts` (compartido) — esta suite DEBE seguir en 9/103 post-cambio.

## UUIDs de los 2 doctores (varix-clinic `doctors_view`)

Query corrida contra el Supabase prod de varix-clinic (REST, service_role, 2026-06-11):

```sql
SELECT id, nombre, apellido, email FROM doctors_view ORDER BY nombre;
```

| UUID | Email | Doctor |
|------|-------|--------|
| `fa3e2e8d-faf4-40b0-a3cb-a8d50780988d` | ciromario@gmail.com | Dr. Ciro Mario Romero |
| `aee08e40-5c60-481e-966f-51af351351e8` | caromerorincon@gmail.com | Dra. María Carolina Romero |

- Exactamente **2 filas** — no aplica la ambigüedad A3 del research (no hay médicos extra).
- ⚠️ Los campos `nombre`/`apellido` de la vista vienen del username del email (`ciromario`, `caromerorincon`, apellido vacío) — para mensajes al paciente usar los nombres reales del diseño, NO los de la vista.
- Constantes para `src/lib/domain/varix-clinic/constants.ts` (Plan 03 Task 2):
  - `DOCTOR_CIRO_UUID = 'fa3e2e8d-faf4-40b0-a3cb-a8d50780988d'`
  - `DOCTOR_CAROLINA_UUID = 'aee08e40-5c60-481e-966f-51af351351e8'`

## Routing en workspace MorfX Varixcenter

Workspace verificado: `c6621640-ba67-43de-9f05-905f09a6dc8f` → `name: "Varixcenter"` ✅

```sql
SELECT lifecycle_routing_enabled FROM workspace_agent_config WHERE workspace_id='c6621640-ba67-43de-9f05-905f09a6dc8f';
-- → 0 filas (NO existe row de config para este workspace)
SELECT priority, name FROM routing_rules WHERE workspace_id='c6621640-ba67-43de-9f05-905f09a6dc8f' AND active=true ORDER BY priority;
-- → 0 filas (cero rules activas)
```

- **Priority libre elegido: `100`** (no hay colisión posible — 0 rules activas; Pitfall 4 descartado).
- ⚠️ **`workspace_agent_config` NO tiene row para este workspace** → el SQL de activación de Wave 6 (Plan 11) debe hacer **INSERT** (no UPDATE) con `lifecycle_routing_enabled=true`, o el flujo de activación del lifecycle router no aplicará. Verificar en Plan 11 el shape de la tabla antes del INSERT.

## Env vars en Vercel (PENDIENTE OPERADOR)

- [ ] `VARIX_CLINIC_SUPABASE_URL` = `NEXT_PUBLIC_SUPABASE_URL` de varix-clinic/.env.local
- [ ] `VARIX_CLINIC_SERVICE_ROLE_KEY` = `SUPABASE_SERVICE_ROLE_KEY` de varix-clinic/.env.local
- Agregar en proyecto MorfX de Vercel, ambientes Production + Preview. NO pegar valores aquí.
- A1 (allowlist IP): la conexión REST desde esta máquina funcionó sin allowlist; Supabase no restringe IPs por defecto. Confirmar solo si varix-clinic tiene Network Restrictions activadas en el dashboard (improbable).
- Nota: el código (Waves 1-4) se puede escribir y testear con mocks SIN estas env vars; son bloqueantes solo para runtime prod (push Wave 6).

## Saludo escogido ✅ (decisión del usuario 2026-06-11 — AMENDA D-12)

El usuario escogió un saludo CUSTOM de **2 plantillas** (no una de las 5 opciones A-E):

| ID | Prioridad | Contenido verbatim |
|----|-----------|--------------------|
| `saludo` | CORE | `Hola ✨ Muchas gracias por comunicarte con VarixCenter, somos un Centro Médico especializado en venas varices ubicado en Bucaramanga con más de 28 años de experiencia` |
| `saludo_comp` | COMP | `¿Deseas agendar tu valoración?` |

**Implicaciones (D-12 amendada — el saludo YA NO hace doble triage):**
1. El triage (ciudad + tipo_venas) se difiere al template `triage` existente — se dispara cuando el cliente pregunta precio/tratamiento sin `tipo_venas` (flujo §9 del diseño, sin cambios).
2. **Comprehension (Plan 04):** una respuesta afirmativa ("sí", "claro", "me interesa") inmediatamente después del saludo DEBE clasificarse como `quiero_agendar` (no `confirmar` ni `acknowledgment`) — el saludo termina con "¿Deseas agendar tu valoración?". Incluir esta regla contextual en el prompt de comprehension.
3. **Response-track (Plan 06):** el saludo emite 2 mensajes (CORE + COMP), igual que el patrón CORE+COMP existente.
4. **Plan 10 (templates SQL):** insertar `saludo` + `saludo_comp` con el wording de esta tabla; NO insertar ninguna de las 5 opciones A-E de PLANTILLAS.md §1.
5. `es_foraneo`/ciudad: se captura cuando el cliente la mencione o vía template `triage`; sigue siendo no-bloqueante (D-15 sin cambios).
