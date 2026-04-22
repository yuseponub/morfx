---
status: open
created: 2026-04-22
reporter: Jose
affected_agent: somnio-recompra-v1
workspace: a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
related_phase: somnio-recompra-crm-reader (closed — enabler for turn 1+ context, NOT the cause of these bugs)
---

# Debug — Recompra agent greeting bugs

## Síntoma observado

El bot de recompra saluda así:

```
"Buenas noches 😊"
[promos genéricas]
```

Debería saludar así:

```
"Buenas tardes Jose 😊"
"Deseas adquirir tu ELIXIR DEL SUEÑO?" + IMAGEN
```

Smoke test context:
- Session: `4639c20c-eeea-4e37-aba3-5ff3bcf86077`
- Contact: `285d6f19-87df-447d-a2dd-51c38bb0ff03` (is_client=true, name='Jose Romero', city='Bucaramanga', address='Cra 38#42-17 Apto 1601B, Barrio Cabecera')

## Bugs catalogados

### Bug 1 — `loadLastOrderData` no pobla `nombre/apellido/ciudad` en datos_capturados

**Evidencia:**
```json
// datos_capturados post-turn-0 (dumped from session_state)
{
  "_v3:ofiInter": "false",
  "_v3:turnCount": "1",
  "_v3:crm_context": "...",          // ← del reader, OK
  "_v3:crm_context_status": "ok",
  "_v3:direccionConfirmada": "false"
  // NO nombre, NO apellido, NO ciudad, NO telefono, NO direccion
}
```

**Código esperado:** `src/lib/agents/production/webhook-processor.ts:750+` función `loadLastOrderData`:
```typescript
const { data: contact } = await supabase.from('contacts').select('name, phone, address, city')...
if (contact.name) {
  result.nombre = parts[0]       // 'Jose'
  result.apellido = parts.slice(1).join(' ')  // 'Romero'
}
if (contact.city) result.ciudad = contact.city  // 'Bucaramanga'
```

Y `src/lib/agents/engine/v3-production-runner.ts:121`:
```typescript
if (preloadedData && Object.keys(preloadedData).length > 0 && session.version === 0) {
  await adapters.storage.saveState(session.id, {
    datos_capturados: { ...preloadedData },
  })
}
```

**Hipótesis:**
- H1 (más probable): `loadLastOrderData` retorna vacío `{}` — probablemente el query `.eq('workspace_id', workspaceId)` no matchea. Verificar: contact `285d6f19` pertenece a Somnio workspace `a3843b3f-...`?
- H2: `preloadedData` se pasa bien, pero algo sobrescribe `datos_capturados` DESPUÉS del preload. Candidatos: el propio agente recompra al hacer el merge final de state, o el CRM reader con `updateCapturedData` (aunque es merge-safe por código — verificar).
- H3: `session.version !== 0` en el path de primer turn (shouldn't happen tras `getOrCreateSession` que crea nuevo).

**SQLs de diagnóstico:**
```sql
-- ¿El contacto tiene workspace_id correcto?
SELECT id, workspace_id, name, city, address, phone FROM contacts WHERE id = '285d6f19-87df-447d-a2dd-51c38bb0ff03';

-- ¿datos_capturados cambia a lo largo del turn? (necesita logs Vercel)
```

### Bug 2 — Template del saludo incorrecto

**Síntoma:** El bot dispara "Buenas noches 😊" + promos genéricas, pero el usuario espera ver el template #2 de saludo con "Deseas adquirir tu ELIXIR DEL SUEÑO?" + IMAGEN.

**Data clave aportada por usuario:** El template esperado existe en `agent_templates` bajo `agent_id='somnio-sales-v3'`, `intent='saludo'`, `orden=1` (2do template, 0-indexed).

**Hipótesis fuerte:** El recompra agent busca templates con `agent_id='somnio-recompra'` o `'somnio-recompra-v1'`, pero el template esperado vive bajo `agent_id='somnio-sales-v3'`. **Naming mismatch de config.**

**SQL de diagnóstico:**
```sql
-- ¿Qué templates de saludo existen por agent_id en Somnio?
SELECT id, agent_id, intent, visit_type, orden, content_type, LEFT(content, 80) AS preview
FROM agent_templates
WHERE (workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490' OR workspace_id IS NULL)
  AND intent = 'saludo'
ORDER BY agent_id, visit_type, orden;
```

**Código a investigar:**
- `src/lib/agents/somnio-recompra/response-track.ts` líneas 170-181 (`saludoTemplates = byIntent.get('saludo')`) — de dónde viene `byIntent`? Cuál es el `agent_id` usado en el lookup?
- Template resolver / loader — qué `agent_id` pide?

### Bug 3 — Time-of-day incorrecto ("noches" en vez de "tardes")

**Síntoma:** Dice "Buenas noches" cuando el test fue ~17:35 local Bogotá (5:35 PM → debería ser "tardes", no "noches").

**Código:** `src/lib/agents/somnio-recompra/response-track.ts:229-247`:
```typescript
if (hour < 12) greeting = 'Buenos dias'
else if (hour < 18) greeting = 'Buenas tardes'
else greeting = 'Buenas noches'
```

**Cross-check:** 17:35 Bogotá < 18:00 → debería dar 'Buenas tardes'. Pero el cálculo usa:
```typescript
const colombiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
```

**Hipótesis:** Si el smoke test corrió cuando reload del turn ya era post-18:00 Bogotá (19:35 local = 00:35 UTC), hour=19 → "noches". Verificar timestamp exacto y timezone handling del `Date(now.toLocaleString(...))` — hay un pitfall conocido cuando el server runtime usa UTC vs local.

### Relación con el phase cerrado

El phase `somnio-recompra-crm-reader` es el **enabler** para usar contexto enriquecido del CRM en turn 1+, pero NO afecta turn 0. Los 3 bugs arriba son **preexistentes** al phase — sucedían antes también. El CRM context ahora da material extra (nombre, pedidos, etc.) para que el agente pueda personalizar, PERO el bug es que la ruta de saludo en turn 0 no usa ni siquiera lo que está en `preloadedData` del contacto.

## Plan de investigación sugerido

1. **SQL inmediato:** verificar workspace_id del contacto + contenido de agent_templates para intent='saludo'
2. **Leer código:** webhook-processor loadLastOrderData + v3-production-runner preload + somnio-recompra response-track
3. **Logs Vercel:** buscar línea `[V3-RUNNER] Preloaded data injected into new session: ...` — si NO aparece, confirm H1 (preloadedData vacío) o H3 (version != 0)
4. **Identificar fix:** probablemente 2 fixes distintos — uno para `loadLastOrderData`/preload (bug 1) y uno para template resolver (bug 2)

## Artifacts a actualizar cuando cierre

- `.claude/rules/agent-scope.md` (sección somnio-recompra) si el fix cambia el scope
- `docs/analysis/04-estado-actual-plataforma.md` (sección recompra agent)
- LEARNINGS en el standalone/quick del fix
- Este archivo → mover a `.planning/debug/resolved/` con status: resolved
