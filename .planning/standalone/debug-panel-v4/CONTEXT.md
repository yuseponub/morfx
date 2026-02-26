# Debug Panel v4.0 (Standalone) - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Agregar visibilidad completa al debug panel del sandbox (/sandbox) para todos los features del agente Somnio v4.0. Esto incluye: 3 tabs nuevos (Pipeline, Classify, Bloques), mejoras a 2 tabs existentes (Ingest, Estado), mover timer controls a Config, y extender SandboxDebugAdapter + DebugTurn type para capturar los datos faltantes.

NO incluye: cambios al agente, cambios al engine, nuevos features del bot, ni cambios a producción.

</domain>

<decisions>
## Implementation Decisions

### Tab Organization (8 tabs total)
- **3 tabs NUEVOS:** Pipeline, Classify, Bloques
- **2 tabs MEJORADOS:** Ingest (sin timers), Estado (con intents/templates/pending legibles)
- **1 tab ELIMINADO:** Intent (absorbido por Classify)
- **3 tabs SIN CAMBIOS:** Tools, Tokens, Config (Config recibe timer controls de Ingest)
- Máximo 3 tabs visibles simultáneamente (existente, mantener)
- **Defaults visibles:** Pipeline, Classify, Bloques

### Pipeline Tab (NUEVO)
- Navegación por turnos: **chips horizontales** en fila superior con scroll horizontal
- Formato de chip: `[T5• 🟢 precio 94% ⚡]` — color categoría + intent + confidence + flags especiales
- Flags especiales: solo aparecen cuando aplican (⚡interrupt, 🔄repeated, 🏢ofi-inter, 💳order)
- Contenido: pipeline completo del turno seleccionado (11 pasos)
- Cada paso es **expandible** (click para detalle inline)
- Turnos silenciosos (early return): mostrar TODOS los 11 pasos, los que no corrieron como ░░ skipped
- Pipeline es **autosuficiente** con expandibles — no requiere abrir Classify/Bloques para info básica
- Footer del turno: total de Claude calls + tokens + tiempo estimado

### Classify Tab (NUEVO, reemplaza Intent)
- Combina: Intent detection + Message Category + Confidence Routing + Ofi Inter detection
- **Intent section:** nombre, confidence bar (colores por rango), alternativas, reasoning
- **Category section:** badge 🟢RESPONDIBLE/🟡SILENCIOSO/🔴HANDOFF + reason
- Muestra las 4 reglas checadas (Rule 1 HANDOFF_INTENTS, Rule 1.5 confidence<80%, Rule 2 acknowledgment, Rule 3 default)
- **Ofi Inter section:** Ruta 1 (mención directa) y Ruta 3 (municipio remoto) con detalle de match
- **Disambiguation log:** cuando HANDOFF por low confidence, expandible inline con top intents, templates sent, pending, history captured, status

### Bloques Tab (NUEVO)
- Combina: Template Selection + Block Composition + No-Repetition + Pre-Send Check + Paraphrasing
- **Template Selection section:** intent, visit type (primera_vez/siguientes), loaded count, already-sent count
- **Block Composition section:** new templates + pending previous, bloque final como tabla (template, prioridad CORE/COMP/OPC, status sent/dropped/pending)
- **No-Repetition section:** tabla por template con columnas L1/L2/L3/Result, detalle de cada nivel, feature flag status (ON/OFF)
- **Send Loop section:** por template: pre-check result + sent/interrupted + char delay duration
- **Paraphrasing section:** original vs paraphrased (solo cuando repeated intent)

### Ingest Tab (MEJORADO)
- Mantener existente: classification timeline, field progress, last classification
- **QUITAR:** timer controls (sliders L0-L4, presets) — se mueven a Config
- **AGREGAR:** data extraction details por turno (campos extraídos, confianza por campo, normalizaciones)
- **AGREGAR:** implicit yes detection (triggered? data found? mode transition?)
- **AGREGAR:** Ofi Inter Ruta 2 (ciudad sin dirección detectada en IngestManager)

### Estado Tab (MEJORADO)
- Mantener existente: JSON editable
- **AGREGAR:** templates_enviados como lista legible (nombre del template en vez de solo ID, con prioridad)
- **AGREGAR:** intents_vistos como timeline visual (saludo → precio → envio → ...)
- **AGREGAR:** pending_templates actual (con prioridad y origen)
- **NO incluir:** state diff (no seleccionado por usuario)

### Config Tab (MEJORADO)
- Mantener existente: bot name, response speed presets
- **AGREGAR:** timer controls migrados de Ingest (enable/disable toggle, 3 presets, 5 sliders L0-L4)

### Data Pipeline Extension
- **DebugTurn type:** extender con campos para classification, blockComposition, noRepetition, ofiInter, preSendCheck, timerSignals, templateSelection
- **SandboxDebugAdapter:** agregar métodos record para cada nuevo feature (recordClassification, recordBlockComposition, recordNoRepetition, etc.)
- **UnifiedEngine:** agregar calls a los nuevos record methods en los puntos correctos del pipeline

### Claude's Discretion
- Diseño visual exacto de los expandibles en Pipeline
- Colores y estilos de badges
- Cómo mostrar steps skipped vs activos (opacidad, color, ícono)
- Implementación interna del scroll horizontal de chips
- Orden exacto de secciones dentro de cada tab

</decisions>

<specifics>
## Specific Ideas

- Pipeline muestra los 11 pasos del agente en orden: Ingest → Implicit Yes → Ofi Inter → Intent → Category → Orchestrate → Block → No-Rep → Send → Timer → Order
- Chips horizontales con colores semáforo: 🟢 verde = RESPONDIBLE, 🟡 amarillo = SILENCIOSO, 🔴 rojo = HANDOFF
- No-Repetition tabla tipo spreadsheet con columnas L1/L2/L3/Result — visual más claro que texto narrativo
- El desarrollador quiere poder ver "¿por qué el bot no respondió?" sin abrir más de 1 tab (Pipeline autosuficiente)
- Timer controls en Config porque son configuración, no debug data

</specifics>

<deferred>
## Deferred Ideas

- Badges/chips en el chat panel junto a cada mensaje del bot (indicadores rápidos en el chat) — posible mejora futura
- State diff (antes vs después por turno) en Estado tab — descartado por el usuario, reconsiderar si surge necesidad
- Export de sesión de debug para análisis offline
- **Standalone phase: Docs Cleanup** — Mover ARCHITECTURE.md a `docs/architecture/` reemplazando la documentación vieja del agente. Hacer después de completar Debug Panel v4.0 cuando todo esté verificado.

</deferred>

---

*Phase: standalone/debug-panel-v4*
*Context gathered: 2026-02-25*
