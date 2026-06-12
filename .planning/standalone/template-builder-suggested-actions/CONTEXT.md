# Standalone: template-builder-suggested-actions — Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Chips de acción sugerida (botones quick-reply) debajo de los mensajes del asistente en el chat del Template Builder (`/configuracion/whatsapp/templates/builder`). En cada etapa del flujo de creación de un template, el usuario ve 3-4 botones que sintetizan las rutas posibles (ej: "Agregar variables", "Subir imagen", "✅ Confirmar y crear") sin tener que adivinar qué escribir.

**En scope:** componente de chips en el chat, derivación determinista desde `TemplateDraft`, tool opcional para chips de la IA, chips de arranque en empty-state, acciones locales (file picker, navegación).

**Fuera de scope:** cambios al flujo del builder en sí (tools existentes, validación, submit), botones de WhatsApp en los templates (no soportados por el builder), el builder de automatizaciones (`/automatizaciones/builder` — si se quiere replicar ahí, es standalone follow-up).

</domain>

<decisions>
## Implementation Decisions

### Arquitectura de chips
- **D-01 (pre-locked):** Opción C híbrida — base determinista derivada del estado del `TemplateDraft` (función pura client-side) + la IA puede añadir chips contextuales vía una tool opcional nueva (ej: `suggestActions`). La base determinista garantiza que siempre haya chips aunque la IA no llame la tool.
- **D-02 (pre-locked):** Máximo 3-4 chips por ronda TOTAL (deterministas + IA combinados). Nunca más de 4 visibles.
- **D-03 (Merge):** Determinista manda — los chips deterministas de la etapa ocupan los primeros slots (garantizan el paso crítico: validar, confirmar, subir imagen) y los de la IA rellenan los slots restantes hasta el tope. Dedupe por similitud de label/intención (no mostrar un determinista y un IA-chip que digan lo mismo).

### Comportamiento del click
- **D-04:** Mensaje visible — el click envía el texto del chip como burbuja del usuario vía `sendMessage` normal. Transparencia total del historial; cero cambios al route/backend.
- **D-05:** Híbrido con acciones locales — chips que mapean a acciones de UI las ejecutan directo sin pasar por la IA: "📷 Subir imagen" dispara el `fileInputRef` existente en `chat-pane.tsx`; "Ver mis templates" navega a `/configuracion/whatsapp/templates`. El resto de chips envían mensaje.
- **D-06:** Chips deshabilitados/ocultos mientras `status` es `submitted`/`streaming` — solo se muestran cuando el turno terminó (`status === 'ready'`), debajo del último mensaje del asistente.

### Confirmación final (submitTemplate)
- **D-07:** El chip "✅ Confirmar y crear" SÍ cuenta como confirmación explícita — el click envía "Confirmo, créalo" como mensaje del usuario, que el system prompt recibe como confirmación textual válida (no se modifica la regla del prompt). Guard determinista: este chip SOLO aparece cuando el último `validateTemplateDraft` del turno fue success y el draft está completo. Nunca aparece antes de validar.

### Chips de arranque (empty-state)
- **D-08:** Set genérico de 4: "Confirmación de pedido" · "Recordatorio de cita" · "Promoción" · "Código de verificación". Cubre las 3 categorías Meta y los casos comunes de los workspaces actuales (Somnio, GoDentist, Varixcenter). No personalizados por workspace en V1.
- **D-09:** Click de arranque envía descripción completa pre-armada (ej: "Quiero un template para confirmar pedidos, que salude al cliente por su nombre y le diga la fecha de entrega") → la IA propone borrador de una, minimizando turnos. Los 4 prompts pre-armados se definen en el plan.

### Persistencia
- **D-10:** Recalcular todo al recargar — los chips deterministas se recomputan del draft al cargar la sesión; los chips de la IA se re-leen del tool-result de `suggestActions` ya persistido en los `messages` de la sesión (el session-store ya guarda los UIMessages completos). Cero storage nuevo.

### Claude's Discretion
- Estilo visual de los chips (pills/outline, iconos, orden) — seguir el design system existente del builder.
- Texto exacto de cada chip determinista por etapa y de los 4 prompts de arranque (proponer en plan, ajustable en QA).
- Detalle del schema de la tool `suggestActions` (labels + mensajes) y cómo instruirla en el system prompt sin romper la REGLA CERO existente.
- Lógica exacta de detección de etapa desde el draft (qué campos chequear en qué orden).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Builder backend
- `src/lib/config-builder/templates/system-prompt.ts` — system prompt actual; REGLA CERO (updateDraft obligatorio antes de texto); flujo guiado de 6 pasos; regla de confirmación explícita para submit. La tool nueva `suggestActions` se instruye aquí.
- `src/lib/config-builder/templates/tools.ts` — las 7 tools existentes (patrón a seguir para `suggestActions`); `updateDraft` es el patrón "echo tool" (devuelve patch que la UI consume del tool-result).
- `src/lib/config-builder/templates/types.ts` — `TemplateDraft` (fuente de la derivación determinista de etapa).
- `src/app/api/config-builder/templates/chat/route.ts` — route streaming; `stopWhen: stepCountIs(15)`; `prepareStep` fuerza tool call en step 0; `onFinish` persiste los UIMessages en session-store (clave para D-10 persistencia).

### Builder UI
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx` — punto de integración principal: `sendMessage`, `status`, `fileInputRef` (acción local D-05), scan de tool-results con `processedPartsRef` (patrón para leer outputs de `suggestActions`), empty-state actual (donde van los chips de arranque D-08).
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx` — renderer de parts AI SDK v6 (`tool-{name}` / `dynamic-tool`); referencia para detectar el output de `suggestActions` en mensajes persistidos.
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx` — reducer del draft; los chips deterministas se derivan de este estado.

### Reglas del proyecto
- `.claude/rules/agent-scope.md` §Config Builder: WhatsApp Templates — scope del agente; nota: el ciclo documentado dice `stepCountIs(6)` pero el route real usa `stepCountIs(15)`; la tool nueva NO amplía el scope de mutación (suggestActions es pure-echo, sin DB).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Patrón "echo tool"** (`updateDraft` en tools.ts): tool sin side-effects cuyo output la UI consume del tool-result part. `suggestActions` es exactamente este patrón — devuelve `{ actions: [{label, message}] }` y la UI lo renderiza.
- **`processedPartsRef` scan** en chat-pane.tsx: dedupe de tool-results ya procesados; reutilizable para extraer los chips de IA del último mensaje del asistente.
- **`fileInputRef` + `handleChatImageUpload`** en chat-pane.tsx: la acción local "📷 Subir imagen" solo necesita `fileInputRef.current?.click()`.
- **Session-store** persiste UIMessages completos (incluidos tool-results) → D-10 sin storage nuevo.

### Established Patterns
- AI SDK v6 `useChat` + `DefaultChatTransport`; parts tipados `tool-{toolName}` con `state: 'output-available'`.
- Tools con Zod schemas + retornos discriminados `{ success: true, ... } | { error }`.
- El builder de automatizaciones es el "hermano" original — cualquier componente nuevo debe poder portarse después.

### Integration Points
- `ChatPane` render: chips van entre el área de mensajes y el input, visibles solo con `status === 'ready'`.
- Empty-state actual en chat-pane.tsx:223-236 — los 4 chips de arranque reemplazan/complementan el texto de ejemplo.
- System prompt: nueva sección instruyendo a la IA llamar `suggestActions` al final del turno cuando tenga sugerencias contextuales (opcional, sin `toolChoice: required` — la base determinista cubre los turnos donde no la llame).

### Riesgos conocidos
- **Compliance de la IA con tools "al final del turno" es frágil** (lección REGLA CERO/updateDraft) — por eso D-01 hace la base determinista obligatoria y la tool opcional. NO depender de `suggestActions` para los chips críticos.
- **Doble-procesamiento de tool-results**: chat-pane ya tiene scan parent-level + effect per-component (fallback doble documentado); los chips deben leer de UNA sola fuente para no duplicar.
- El chip "✅ Confirmar y crear" con guard determinista (D-07) debe re-evaluarse si el draft cambia después de validar (editar body tras validar → el chip desaparece hasta re-validar).

</code_context>

<specifics>
## Specific Ideas

- Tabla etapa→chips propuesta en la conversación de discovery (ajustable en plan):
  | Etapa | Chips |
  |---|---|
  | Chat vacío | Confirmación de pedido · Recordatorio de cita · Promoción · Código de verificación |
  | Borrador propuesto, sin variables | Agregar variables · Agregar imagen · Cambiar el texto · Continuar → |
  | Variables sin ejemplos | Usar ejemplos sugeridos · Escribir mis ejemplos |
  | headerFormat=IMAGE sin imagen | 📷 Subir imagen (acción local) · Mejor sin imagen |
  | Draft completo sin validar | Validar template · Cambiar algo |
  | Validación falló | Corregir automáticamente · Editar yo mismo |
  | Validación OK | ✅ Confirmar y crear · Revisar de nuevo |
  | Post-submit exitoso | Crear otro template · Ver mis templates (acción local: navegar) |
  | Pidió botones WA (no soportado) | Continuar sin botones · Cancelar |

</specifics>

<deferred>
## Deferred Ideas

- Portar los chips al builder de automatizaciones (`/automatizaciones/builder`) — standalone follow-up si este funciona bien.
- Chips de arranque personalizados por workspace/vertical — V2.
- Telemetría de uso de chips (qué chips se clickean) — V2.

</deferred>

---

*Standalone: template-builder-suggested-actions*
*Context gathered: 2026-06-12*
