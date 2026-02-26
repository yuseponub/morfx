# Somnio Agent + Debug Panel — Architecture Reference

> Documento de referencia permanente. Cubre la arquitectura completa del agente Somnio,
> el flujo de procesamiento por turno, todos los nodos Claude, el estado/memoria del agente,
> y cómo el debug panel captura y muestra estos datos.
>
> Última actualización: 2026-02-25

---

## 1. Flujo Completo del Agente (por turno)

Cuando un mensaje del cliente llega, el agente ejecuta este pipeline secuencial:

```
╔══════════════════════════════════════════════════════════════════╗
║                    MENSAJE DEL CLIENTE                          ║
╚══════════════════════════════════╦═══════════════════════════════╝
                                   ▼
┌─────────────────── FASE A: ENTENDER ───────────────────────────┐
│                                                                 │
│  [GATE 1] ¿Está en collecting_data mode?                       │
│     ├─ SÍ → handleIngestMode()                                 │
│     │   ├─ 🤖 Claude #1: MessageClassifier (Sonnet)            │
│     │   │   └─ datos / pregunta / mixto / irrelevante          │
│     │   ├─ 🤖 Claude #2: DataExtractor (Sonnet)                │
│     │   │   └─ campos extraídos + normalizados                 │
│     │   ├─ action='silent' → ⚡ EARLY RETURN (sin respuesta)   │
│     │   ├─ action='complete' → mode→ofrecer_promos, continuar  │
│     │   ├─ action='ask_ofi_inter' → preguntar envío, continuar │
│     │   └─ action='respond' → continuar ▼                      │
│     └─ NO → continuar ▼                                        │
│                                                                 │
│  [GATE 2] ¿NO está en collecting_data NI ofrecer_promos?       │
│     ├─ SÍ → checkImplicitYes()                                 │
│     │   ├─ 🤖 Claude #1: MessageClassifier (Sonnet)            │
│     │   ├─ Si datos/mixto → 🤖 Claude #2: DataExtractor        │
│     │   ├─ Todos los campos → mode→ofrecer_promos              │
│     │   ├─ Parcial → mode→collecting_data                      │
│     │   └─ Sin datos → fall through ▼                          │
│     └─ NO → continuar ▼                                        │
│                                                                 │
│  [GATE 3] Detección Ofi Inter (Rutas 1 y 3)                   │
│     ├─ Ruta 1: mención directa ("ofi inter", "oficina")        │
│     │   └─ mode→collecting_data_inter, confirmar               │
│     ├─ Ruta 3: ciudad detectada + isRemoteMunicipality()       │
│     │   └─ preguntar preferencia envío, guardar ciudad         │
│     └─ Sin match → continuar ▼                                 │
│                                                                 │
│  🤖 Claude #3: IntentDetector (Sonnet)                         │
│     └─ intent + confidence% + alternativas + reasoning         │
│                                                                 │
│  [GATE 4] Clasificación de Categoría (TypeScript puro, NO LLM) │
│     ├─ Rule 1: intent ∈ HANDOFF_INTENTS → 🔴 HANDOFF          │
│     ├─ Rule 1.5: confidence < 80% → 🔴 HANDOFF + disambig log │
│     ├─ Rule 2: acknowledgment + non-confirmatory → 🟡 SILENCIOSO│
│     └─ Rule 3: todo lo demás → 🟢 RESPONDIBLE                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
     🔴 HANDOFF          🟡 SILENCIOSO        🟢 RESPONDIBLE
     Bot OFF              Sin respuesta            │
     "Regalame 1 min"     Timer retake 90s         ▼
     Log disambiguation

┌─────────────────── FASE B: DECIDIR ────────────────────────────┐
│                                                                 │
│  Validar Transición                                            │
│     └─ TransitionValidator.validate(intent, mode, intentsVistos)│
│     └─ ¿Intent permitido dado el estado actual?                │
│                                                                 │
│  Auto-Trigger Check                                            │
│     └─ checkAutoTriggersForMode()                              │
│     └─ ¿8 campos (normal) o 6 campos (inter) = auto promos?   │
│                                                                 │
│  Selección de Templates                                        │
│     ├─ TemplateManager.getTemplates(intent)                    │
│     ├─ primera_vez vs siguientes (basado en intents_vistos)    │
│     ├─ Filtrar ya enviados (templates_enviados)                │
│     └─ Si repeated + USE_NO_REPETITION → cap 2 templates      │
│                                                                 │
│  Orquestar Respuesta                                           │
│     └─ SomnioOrchestrator.orchestrate()                        │
│     └─ Returns: response + templates[] + nextMode + shouldCreateOrder │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────── FASE C: ENTREGAR ───────────────────────────┐
│                                                                 │
│  Block Composition                                             │
│     ├─ Obtener pending templates del ciclo anterior            │
│     ├─ composeBlock(new + pending)                             │
│     │   ├─ CORE (nunca se descarta)                            │
│     │   ├─ COMPLEMENTARIA (overflow → pending next cycle)      │
│     │   └─ OPCIONAL (overflow → dropped permanente)            │
│     └─ Cap: máx 3 templates por bloque                         │
│                                                                 │
│  No-Repetition Filter (si USE_NO_REPETITION=true)              │
│     ├─ Build outbound registry (plantillas + humano + IA)      │
│     ├─ 🤖 Claude #4: MinifraseGenerator (Sonnet) × N entries  │
│     ├─ Por cada template en bloque:                            │
│     │   ├─ Level 1: ID en templates_enviados? (instant, $0)   │
│     │   ├─ 🤖 Claude #5: Level 2 minifrase (Sonnet)           │
│     │   │   └─ ENVIAR / NO_ENVIAR / PARCIAL                   │
│     │   └─ 🤖 Claude #6: Level 3 full context (Sonnet)        │
│     │       └─ solo si PARCIAL → ENVIAR / NO_ENVIAR           │
│     └─ Si repeated intent:                                     │
│         └─ 🤖 Claude #7: TemplateParaphraser (Sonnet) × N     │
│                                                                 │
│  Send Loop (por cada template en bloque filtrado)              │
│     ├─ Pre-send check: ¿nuevo mensaje inbound en DB?          │
│     │   ├─ SÍ → 🛑 INTERRUMPIR, guardar restantes como pending│
│     │   └─ NO → enviar template                               │
│     ├─ Char delay (2s-12s logarítmico por largo del texto)     │
│     └─ Repetir para siguiente template                         │
│                                                                 │
│  Post-Send                                                     │
│     ├─ Append sent IDs a templates_enviados (two-phase save)   │
│     ├─ Guardar overflow como pending_templates                 │
│     └─ Timer signals (start/reevaluate/cancel + reason)        │
│                                                                 │
│  Order Creation (si shouldCreateOrder=true)                    │
│     └─ OrderCreator.create(datos, pack)                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Nodos Claude (LLM Calls)

El agente tiene **7 puntos de llamada a Claude** distintos. No todos se ejecutan en cada turno.

### Inventario Completo

| # | Nombre | Archivo | Modelo | Cuándo se ejecuta | Costo/Tiempo |
|---|--------|---------|--------|-------------------|--------------|
| 1 | MessageClassifier | `somnio/message-classifier.ts` | Sonnet 4 | Solo en collecting_data modes + checkImplicitYes | ~$0.0001, 200ms |
| 2 | DataExtractor | `somnio/data-extractor.ts` | Sonnet 4 | Solo en collecting_data modes + implicit yes con datos | ~$0.0008, 800ms |
| 3 | IntentDetector | `agents/claude-client.ts` | Sonnet 4 | **SIEMPRE** (cada turno) | ~$0.0005, 500ms |
| 4 | MinifraseGenerator | `somnio/minifrase-generator.ts` | Sonnet 4 | Solo con no-rep ON + entries sin minifrase | ~$0.0003, 200ms × N |
| 5 | NoRepFilter L2 | `somnio/no-repetition-filter.ts` | Sonnet 4 | Solo con no-rep ON + template no filtrado por L1 | ~$0.0003, 200ms × N |
| 6 | NoRepFilter L3 | `somnio/no-repetition-filter.ts` | Sonnet 4 | Solo si L2 devuelve PARCIAL | ~$0.001, 2s × N |
| 7 | TemplateParaphraser | `somnio/template-paraphraser.ts` | Sonnet 4 | Solo con no-rep ON + repeated intent | ~$0.001, 1s × N |

> **Nota:** Todos usan Sonnet 4 (claude-sonnet-4-20250514). El diseño original era Haiku para 1,4,5,6,7 pero Haiku 4 no está disponible aún.

### Calls por Escenario

| Escenario | Claude Calls | Cuáles |
|-----------|-------------|--------|
| Saludo simple (bienvenida) | 1 | #3 IntentDetector |
| Pregunta en conversación | 1 | #3 IntentDetector |
| "ok" / "jaja" / emoji (SILENCIOSO) | 1 | #3 IntentDetector |
| "quiero hablar con asesor" (HANDOFF) | 1 | #3 IntentDetector |
| Dato en collecting_data (silencioso) | 3 | #1 Classifier + #2 Extractor + #3 Intent |
| Dato + pregunta (mixto) | 3 | #1 Classifier + #2 Extractor + #3 Intent |
| Dato fuera de collecting (implicit yes) | 2-3 | #1 Classifier + (#2 Extractor) + #3 Intent |
| Repeated intent + no-rep ON | 3-7+ | #3 Intent + #4 Minifrase×N + #5 L2×N + (#6 L3×N) + (#7 Paraphrase×N) |

---

## 3. Estado y Memoria del Agente

### Persistente (Session-Based, guardado en DB)

| Campo | Tipo | Propósito | Quién lee | Quién escribe |
|-------|------|-----------|-----------|---------------|
| `current_mode` | string enum | Fase de la conversación (bienvenida, collecting_data, ofrecer_promos, resumen, confirmado, handoff, collecting_data_inter) | Todos los componentes | SomnioAgent → UnifiedEngine → storage |
| `datos_capturados` | Record<string, string> | Datos del cliente acumulados (nombre, telefono, ciudad, etc.) | IngestManager, OrderCreator, DataExtractor | IngestManager, checkImplicitYes → UnifiedEngine → storage |
| `intents_vistos` | Array<{intent, orden, timestamp}> | Historial de intents detectados (para primera_vez vs siguientes) | TemplateManager, TransitionValidator | SomnioAgent Step 9 → UnifiedEngine → storage |
| `templates_enviados` | string[] (template IDs) | Templates ya enviados (para no-rep Level 1) | NoRepetitionFilter, OutboundRegistry | UnifiedEngine post-send (two-phase save) |
| `pack_seleccionado` | '1x'\|'2x'\|'3x'\|null | Pack elegido por el cliente | SomnioOrchestrator, OrderCreator | SomnioOrchestrator |
| `pending_templates` | PrioritizedTemplate[] | Templates no enviados por interrupción (overflow) | UnifiedEngine → composeBlock() | UnifiedEngine post-send |

### Transiente (Per-Turn, solo durante procesamiento)

| Campo | Tipo | Propósito | Cuándo existe |
|-------|------|-----------|---------------|
| Classification (datos/pregunta/mixto) | ClassificationResult | Tipo de mensaje en collecting_data mode | Solo en Gates 1-2 |
| Intent detection result | IntentResult | Intent + confidence + alternativas | Cada turno |
| Message category | RESPONDIBLE/SILENCIOSO/HANDOFF | Categoría post-intent | Cada turno |
| Extracted data | ExtractionResult | Campos extraídos del mensaje actual | Solo en collecting_data + implicit yes |
| Timer signals | TimerSignal[] | Señales para el sistema de timers | Cada turno (puede estar vacío) |
| Block composition result | BlockCompositionResult | Bloque compuesto + pending + dropped | Solo cuando hay templates |
| No-rep filter result | NoRepFilterResult | Templates filtrados + surviving | Solo con USE_NO_REPETITION=true |

### Reconstructed (On-Demand, no almacenado directamente)

| Campo | Fuentes | Propósito |
|-------|---------|-----------|
| Conversation history | messages table + agent_turns | Contexto para IntentDetector y DataExtractor |
| Outbound registry | templates_enviados + messages (outbound) + agent_turns (assistant) | No-rep Levels 2-3 |
| Template minifrases | agent_templates.minifrase + MinifraseGenerator | No-rep Level 2 comparison |

---

## 4. Componentes Clave del Agente

### 4.1 SomnioAgent (`src/lib/agents/somnio/somnio-agent.ts`)
- **Responsabilidad:** Orquestador principal del turno. Ejecuta los Gates 1-4, coordina clasificación, detección, y construye el output.
- **Input:** ProcessMessageInput (message, history, state, forceIntent?, turnNumber?)
- **Output:** SomnioAgentOutput (messages[], stateUpdates, timerSignals[], intentInfo, tools[], totalTokens, tokenDetails[])

### 4.2 MessageClassifier (`src/lib/agents/somnio/message-classifier.ts`)
- **Responsabilidad:** Clasificar mensaje durante data collection (datos/pregunta/mixto/irrelevante)
- **Claude call:** Sonnet, max_tokens=256, solo mensaje (no history)
- **Output:** ClassificationResult {classification, confidence, reasoning, extractedDataHint}

### 4.3 DataExtractor (`src/lib/agents/somnio/data-extractor.ts`)
- **Responsabilidad:** Extraer 10 campos del mensaje del cliente
- **Campos:** nombre, telefono, direccion, ciudad, departamento, apellido, barrio, correo, cedula_recoge, indicaciones_extra
- **Post-processing:** normalizePhone(), normalizeCity(), normalizeAddress(), infer departamento from ciudad
- **Completion checks:**
  - `hasCriticalData()`: 5 campos críticos presentes (mode-aware: 4 para inter)
  - `isDataComplete()`: 8 campos (5 critical + 3 additional)
  - `hasCriticalDataInter()`: 4 critical + 2 additional = 6 minimum

### 4.4 IntentDetector (`src/lib/agents/intent-detector.ts`)
- **Responsabilidad:** Detectar intent del cliente usando Claude
- **Input:** message + full conversation history + system prompt con definiciones de intents
- **Output:** IntentResult {intent, confidence, alternatives[], reasoning}
- **Se ejecuta SIEMPRE** (cada turno)

### 4.5 Message Category Classifier (`src/lib/agents/somnio/message-category-classifier.ts`)
- **Responsabilidad:** Clasificar en RESPONDIBLE/SILENCIOSO/HANDOFF (TypeScript puro, NO LLM)
- **4 Reglas secuenciales:**
  1. Rule 1: intent ∈ HANDOFF_INTENTS → HANDOFF
  2. Rule 1.5: confidence < 80% → HANDOFF (low confidence routing)
  3. Rule 2: acknowledgment pattern + non-confirmatory mode → SILENCIOSO
  4. Rule 3: default → RESPONDIBLE
- **Confirmatory modes** (siempre RESPONDIBLE): resumen, collecting_data, collecting_data_inter, confirmado
- **Acknowledgment patterns:** ok, okey, vale, listo, jaja, si, sí, bueno, dale, gracias, 👍👌🤣😂😊🙏

### 4.6 IngestManager (`src/lib/agents/somnio/ingest-manager.ts`)
- **Responsabilidad:** Coordinar clasificación + extracción + timer logic durante data collection
- **Output:** IngestResult {action: silent|respond|complete|ask_ofi_inter, classification, extractedData, timerDuration, mergedData}
- **Ofi Inter Ruta 2:** Detecta municipio sin dirección → ask_ofi_inter action

### 4.7 SomnioOrchestrator (`src/lib/agents/somnio/somnio-orchestrator.ts`)
- **Responsabilidad:** Decidir respuesta, templates, siguiente modo, order creation
- **Steps:** auto-trigger check → transition validation → template selection → response generation
- **Output:** SomnioOrchestratorResult {intent, response, templates[], nextMode, stateUpdates, shouldCreateOrder, tokensUsed}

### 4.8 TransitionValidator (`src/lib/agents/somnio/transition-validator.ts`)
- **Responsabilidad:** Validar si intent es permitido en el modo actual
- **Reglas:** resumen requiere ofrecer_promos visto, compra_confirmada requiere resumen visto
- **Auto-triggers:** 8 campos (normal) o 6 campos (inter) → auto ofrecer_promos

### 4.9 TemplateManager (`src/lib/agents/somnio/template-manager.ts`)
- **Responsabilidad:** Cargar y seleccionar templates de DB para un intent
- **Visit type:** primera_vez (intent nunca visto) vs siguientes (ya visto en intents_vistos)
- **Filtering:** Quitar ya enviados (de templates_enviados), sort by orden
- **Repeated intent cap:** Si USE_NO_REPETITION + siguientes → max 2 templates por prioridad

### 4.10 BlockComposer (`src/lib/agents/somnio/block-composer.ts`)
- **Responsabilidad:** Merge new templates + pending overflow, aplicar priority rules
- **Algorithm:** Extract CORE per intent → fill block → pool remaining + pending → sort by priority → cap at 3
- **Prioridades:** CORE (0, nunca dropped) > COMPLEMENTARIA (1, overflow→pending) > OPCIONAL (2, overflow→dropped)
- **Limits:** BLOCK_MAX_TEMPLATES=3, BLOCK_MAX_INTENTS=3
- **Output:** BlockCompositionResult {block[], pending[], dropped[]}

### 4.11 NoRepetitionFilter (`src/lib/agents/somnio/no-repetition-filter.ts`)
- **Feature flag:** USE_NO_REPETITION (default false)
- **Strategy:** FAIL-OPEN (prefer occasional repetition over suppression)
- **3 Levels:**
  - L1: ID exact match in templates_enviados (instant, $0)
  - L2: Minifrase comparison via Sonnet (~200ms, ~$0.0003)
  - L3: Full content comparison via Sonnet (solo si L2=PARCIAL, ~2s, ~$0.001)
- **Output:** NoRepFilterResult {surviving[], filtered[{templateId, level, reason}]}

### 4.12 OutboundRegistry (`src/lib/agents/somnio/outbound-registry.ts`)
- **Responsabilidad:** Reconstruir todos los mensajes salientes de la conversación
- **3 Sources:** agent_templates (via templates_enviados), messages (outbound), agent_turns (assistant)
- **Disambiguation:** messages matching agent_turn → 'ia', resto → 'humano', templates → 'plantilla'
- **Output:** OutboundEntry[] {tipo, id, tema (minifrase), fullContent}

### 4.13 MinifraseGenerator (`src/lib/agents/somnio/minifrase-generator.ts`)
- **Responsabilidad:** Generar minifrases (~15 palabras temáticas) para mensajes humano/IA
- **Claude call:** Sonnet, max_tokens=128, parallel via Promise.all()
- **Fallback:** primeras 15 palabras del contenido si Sonnet falla

### 4.14 TemplateParaphraser (`src/lib/agents/somnio/template-paraphraser.ts`)
- **Responsabilidad:** Parafrasear templates para intents repetidos
- **Claude call:** Sonnet, max_tokens=512
- **Skip:** templates < 20 chars
- **Validation:** paraphrased max 130% de longitud original
- **Fallback:** original content unchanged on error

---

## 5. UnifiedEngine (`src/lib/agents/engine/unified-engine.ts`)

Thin I/O runner que conecta el agente con los adapters.

### Pipeline del Engine:

```
1. Get session (storage adapter)
2. Get history (from input or DB)
3. Call SomnioAgent.processMessage()
4. Route agent output to adapters:
   ├─ Storage: saveState, updateMode, addTurn, addIntentSeen, handoff, clearPendingTemplates
   ├─ Timer: emit signals (start/reevaluate/cancel), lifecycle hooks
   ├─ Orders: createOrder if shouldCreateOrder
   ├─ Messaging: send via block composition pipeline
   └─ Debug: recordIntent, recordTools, recordTokens, recordState
5. Block Composition Pipeline:
   ├─ Get pending templates from previous cycle
   ├─ composeBlock() merge new + pending
   ├─ [If USE_NO_REPETITION] NoRepFilter.filterBlock()
   ├─ Send via messaging adapter (pre-send check per template)
   ├─ Post-send: append sent IDs (two-phase save)
   └─ Save pending overflow
6. Return EngineOutput
```

### Timer Lifecycle Hooks:
- `onCustomerMessage()` — cancela pending timers al recibir mensaje
- `onIngestStarted()` — inicia timer de data collection
- `onIngestCompleted()` — cancela timer de ingest
- `onModeTransition()` — inicia timer para nuevo modo
- `onSilenceDetected()` — inicia retake timer 90s (Phase 30)

---

## 6. Debug Panel — Estado ACTUAL (Pre-v4.0)

### Data Pipeline

```
SomnioAgent → UnifiedEngine → SandboxDebugAdapter → DebugTurn → Frontend Tabs
```

### SandboxDebugAdapter (`src/lib/agents/engine-adapters/sandbox/debug.ts`)

Captura datos via 4 métodos:
- `recordIntent(info)` — IntentInfo (intent, confidence, alternatives, reasoning)
- `recordTools(tools)` — ToolExecution[] (name, input, result, duration, mode)
- `recordTokens(tokens)` — TokenInfo (tokensUsed, models breakdown)
- `recordState(state)` — SandboxState snapshot

Retrieval: `getDebugTurn(turnNumber)` → DebugTurn completo

### DebugTurn Type (`src/lib/sandbox/types.ts`)

```typescript
interface DebugTurn {
  turnNumber: number
  intent?: IntentInfo
  tools: ToolExecution[]
  tokens: TokenInfo
  stateAfter: SandboxState
}
```

### 6 Tabs Actuales

| Tab | Qué muestra | Datos fuente | Limitaciones |
|-----|------------|-------------|-------------|
| **Tools** | Tool executions + I/O + mode (dry/live) | `debugTurns[*].tools` | No sequencing, solo executed |
| **Estado** | JSON editable del state | `state` prop | No diffs, no legibilidad |
| **Intent** | Intent + confidence bar + alternatives + reasoning | `debugTurns[*].intent` | Solo intent, no category |
| **Tokens** | Per-model + per-turn + budget warning | Per-turn tokens | No breakdown por feature |
| **Ingest** | Classification timeline + field progress + timer controls | `state.ingestStatus` | Timer solo simulación |
| **Config** | Bot name + response speed presets | `responseSpeed` prop | Solo 3 presets |

### Defaults visibles: Tools, Estado, Ingest (Intent, Tokens, Config ocultos)

### Lo que NO se captura (gaps):

- ❌ Message Category (RESPONDIBLE/SILENCIOSO/HANDOFF) + reason
- ❌ Block Composition (compose, merge, overflow)
- ❌ No-Repetition (3 levels, filtered/surviving)
- ❌ Ofi Inter detection (route 1/2/3, patterns, city)
- ❌ Pre-Send Check (interruption, pending saved)
- ❌ Confidence Routing decision (score threshold, disambiguation log)
- ❌ Timer Signals (start/reevaluate/cancel + reasons)
- ❌ Transition Validation (allowed/blocked + reason)
- ❌ Template Selection (primera_vez/siguientes, priorities, counts)
- ⚠️ Intent confidence está en Intent tab, pero la DECISIÓN de routing no

---

## 7. Debug Panel — Diseño v4.0

### Nueva Estructura (8 tabs)

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Pipeline │ │ Classify │ │ Bloques  │  ← VISIBLES por defecto
└──────────┘ └──────────┘ └──────────┘
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐
│ Ingest   │ │ Estado   │ │ Tools    │ │ Tokens │ │ Config │
└──────────┘ └──────────┘ └──────────┘ └────────┘ └────────┘
                          ↑ hidden (toggle on/off, máx 3 visibles)
```

### Tab Pipeline (NUEVO)

**Propósito:** Overview completo del turno. Vista principal.

**Navegación:** Chips horizontales arriba, uno por turno, scroll horizontal.
- Formato chip: `[T5• 🟢 precio 94% ⚡]`
- Colores: 🟢 RESPONDIBLE, 🟡 SILENCIOSO, 🔴 HANDOFF
- Flags especiales (solo cuando aplican): ⚡interrupt, 🔄repeated, 🏢ofi-inter, 💳order

**Contenido:** 11 pasos del pipeline, expandibles:
1. Ingest (Gate 1)
2. Implicit Yes (Gate 2)
3. Ofi Inter (Gate 3)
4. Intent Detection (Claude #3)
5. Message Category (Gate 4)
6. Orchestrate
7. Block Composition
8. No-Repetition
9. Send Loop
10. Timer Signals
11. Order Creation

Cada paso muestra: estado (🟢 activo / ░░ skipped) + resumen 1 línea + [▼] expandir para detalle.
Turnos silenciosos: todos los 11 pasos visibles, los que no corrieron como ░░ skipped.
Footer: total Claude calls + tokens + tiempo estimado.

### Tab Classify (NUEVO, reemplaza Intent)

**Propósito:** Todo sobre "qué entendió el bot".

Secciones:
1. **Intent:** nombre, confidence bar (colores por rango), alternativas con %, reasoning
2. **Category:** badge 🟢/🟡/🔴 + reason + las 4 reglas checadas
3. **Ofi Inter:** Rutas 1 y 3 con detalle de match/no-match
4. **Disambiguation Log:** (solo en HANDOFF por low confidence) expandible con top intents, templates sent, pending, history, status

### Tab Bloques (NUEVO)

**Propósito:** Todo sobre "qué se envía y cómo".

Secciones:
1. **Template Selection:** intent, visit type, loaded/sent counts
2. **Block Composition:** tabla con template name, prioridad (CORE/COMP/OPC), status (sent/dropped/pending)
3. **No-Repetition:** tabla por template con columnas L1/L2/L3/Result + feature flag status
4. **Send Loop:** por template: pre-check result + sent/interrupted + char delay
5. **Paraphrasing:** original vs paraphrased (solo cuando aplica)

### Tab Ingest (MEJORADO)

**Cambios vs actual:**
- QUITAR: timer controls → migran a Config
- AGREGAR: data extraction details por turno (campos, confianza, normalizaciones)
- AGREGAR: implicit yes detection
- AGREGAR: Ofi Inter Ruta 2 (IngestManager)

### Tab Estado (MEJORADO)

**Cambios vs actual:**
- Mantener: JSON editable
- AGREGAR: templates_enviados legible (nombre template + prioridad, no solo IDs)
- AGREGAR: intents_vistos timeline visual
- AGREGAR: pending_templates actual

### Tab Config (MEJORADO)

**Cambios vs actual:**
- Mantener: bot name, response speed
- AGREGAR: timer controls migrados de Ingest (toggle, presets, sliders L0-L4)

### Tabs sin cambios: Tools, Tokens

---

## 8. Datos que necesita capturar el SandboxDebugAdapter v4.0

### DebugTurn type extendido (campos nuevos)

```
DebugTurn {
  turnNumber: number

  // Existentes
  intent?: IntentInfo
  tools: ToolExecution[]
  tokens: TokenInfo
  stateAfter: SandboxState

  // NUEVOS
  classification?: {
    category: 'RESPONDIBLE' | 'SILENCIOSO' | 'HANDOFF'
    reason: string
    rulesChecked: {rule1: boolean, rule1_5: boolean, rule2: boolean, rule3: boolean}
    confidenceThreshold?: number
  }

  blockComposition?: {
    newTemplates: {id: string, intent: string, priority: string}[]
    pendingFromPrev: {id: string, priority: string}[]
    composedBlock: {id: string, name: string, priority: string, status: 'sent'|'dropped'|'pending'}[]
    overflow: {pending: number, dropped: number}
  }

  noRepetition?: {
    enabled: boolean
    perTemplate: {
      templateId: string
      templateName: string
      level1: 'pass' | 'filtered' | null
      level2: 'ENVIAR' | 'NO_ENVIAR' | 'PARCIAL' | null
      level3: 'ENVIAR' | 'NO_ENVIAR' | null
      result: 'sent' | 'filtered'
      filteredAtLevel?: 1 | 2 | 3
    }[]
    summary: {surviving: number, filtered: number}
  }

  ofiInter?: {
    route1: {detected: boolean, pattern?: string}
    route2: {detected: boolean, city?: string}  // IngestManager
    route3: {detected: boolean, city?: string, isRemote?: boolean}
  }

  preSendCheck?: {
    perTemplate: {index: number, checkResult: 'ok' | 'interrupted', newMessageFound?: boolean}[]
    interrupted: boolean
    pendingSaved: number
  }

  timerSignals?: {
    type: 'start' | 'reevaluate' | 'cancel'
    reason?: string
  }[]

  templateSelection?: {
    intent: string
    visitType: 'primera_vez' | 'siguientes'
    loadedCount: number
    alreadySentCount: number
    selectedCount: number
    isRepeated: boolean
    cappedByNoRep: boolean
  }

  transitionValidation?: {
    allowed: boolean
    reason?: string
    autoTrigger?: string
  }

  orchestration?: {
    nextMode: string
    previousMode: string
    modeChanged: boolean
    shouldCreateOrder: boolean
    templatesCount: number
  }

  ingestDetails?: {
    classification?: 'datos' | 'pregunta' | 'mixto' | 'irrelevante'
    classificationConfidence?: number
    extractedFields?: {field: string, value: string, confidence: number}[]
    action?: 'silent' | 'respond' | 'complete' | 'ask_ofi_inter'
    implicitYes?: {triggered: boolean, dataFound: boolean, modeTransition?: string}
  }

  disambiguationLog?: {
    logged: boolean
    topIntents?: {intent: string, confidence: number}[]
    templatesSent?: number
    pendingCount?: number
    historyTurns?: number
  }
}
```

### Nuevos métodos del SandboxDebugAdapter

```
recordClassification(category, reason, rulesChecked)
recordBlockComposition(newTemplates, pending, composed, overflow)
recordNoRepetition(enabled, perTemplate, summary)
recordOfiInter(route1, route2, route3)
recordPreSendCheck(perTemplate, interrupted, pendingSaved)
recordTimerSignals(signals[])
recordTemplateSelection(intent, visitType, counts)
recordTransitionValidation(allowed, reason, autoTrigger)
recordOrchestration(nextMode, prevMode, shouldCreateOrder, templatesCount)
recordIngestDetails(classification, fields, action, implicitYes)
recordDisambiguationLog(logged, topIntents, templatesSent, pending, history)
```

---

## 9. Archivos Clave (Quick Reference)

### Agent
| Archivo | Responsabilidad |
|---------|-----------------|
| `src/lib/agents/somnio/somnio-agent.ts` | Orquestador principal, Gates 1-4, timer signals |
| `src/lib/agents/somnio/message-classifier.ts` | Claude call #1: datos/pregunta/mixto/irrelevante |
| `src/lib/agents/somnio/data-extractor.ts` | Claude call #2: extraer 10 campos |
| `src/lib/agents/claude-client.ts` | Claude call #3: intent detection |
| `src/lib/agents/somnio/message-category-classifier.ts` | Gate 4: RESPONDIBLE/SILENCIOSO/HANDOFF (pure TS) |
| `src/lib/agents/somnio/ingest-manager.ts` | Coordina clasificación + extracción en collecting_data |
| `src/lib/agents/somnio/somnio-orchestrator.ts` | Decide respuesta, templates, siguiente modo |
| `src/lib/agents/somnio/transition-validator.ts` | Valida transiciones de intent |
| `src/lib/agents/somnio/template-manager.ts` | Selección de templates (primera_vez/siguientes) |
| `src/lib/agents/somnio/block-composer.ts` | Merge new+pending, priority rules, cap 3 |
| `src/lib/agents/somnio/no-repetition-filter.ts` | 3-level dedup (L1 ID, L2 minifrase, L3 full) |
| `src/lib/agents/somnio/outbound-registry.ts` | Reconstruye mensajes salientes para no-rep |
| `src/lib/agents/somnio/minifrase-generator.ts` | Claude call #4: generar minifrases |
| `src/lib/agents/somnio/template-paraphraser.ts` | Claude call #7: parafrasear templates |

### Engine
| Archivo | Responsabilidad |
|---------|-----------------|
| `src/lib/agents/engine/unified-engine.ts` | I/O runner, block composition pipeline, adapter routing |

### Debug Panel (Current)
| Archivo | Responsabilidad |
|---------|-----------------|
| `src/lib/agents/engine-adapters/sandbox/debug.ts` | SandboxDebugAdapter (4 record methods) |
| `src/lib/sandbox/types.ts` | DebugTurn, IntentInfo, ToolExecution, TokenInfo types |
| `src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` | Tab management, drag-and-drop, max 3 |
| `src/app/(dashboard)/sandbox/components/debug-panel/tools-tab.tsx` | Tools tab |
| `src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx` | Estado tab |
| `src/app/(dashboard)/sandbox/components/debug-panel/intent-tab.tsx` | Intent tab (será reemplazado por Classify) |
| `src/app/(dashboard)/sandbox/components/debug-panel/tokens-tab.tsx` | Tokens tab |
| `src/app/(dashboard)/sandbox/components/debug-panel/ingest-tab.tsx` | Ingest tab |
| `src/app/(dashboard)/sandbox/components/debug-panel/config-tab.tsx` | Config tab |
| `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` | Top-level container, state management |
| `src/lib/sandbox/ingest-timer.ts` | Timer simulator (5 levels, presets) |

---

## 10. Ofi Inter — Las 3 Rutas de Detección

| Ruta | Dónde | Trigger | Condición | Acción |
|------|-------|---------|-----------|--------|
| **1** | SomnioAgent Step 6 | Mención directa | Mensaje contiene "ofi inter", "oficina", "recojo en inter" | mode→collecting_data_inter, confirmar |
| **2** | IngestManager | Ciudad sin dirección | Municipio extraído sin dirección durante collecting_data | Preguntar: "¿envío a domicilio o recoger en oficina?" |
| **3** | SomnioAgent Step 6 | Municipio remoto | Ciudad detectada + isRemoteMunicipality() | Preguntar preferencia, guardar ciudad, no cambiar mode |

**Campos por modo:**
- **Normal (collecting_data):** 5 críticos (nombre, telefono, direccion, ciudad, departamento) + 3 adicionales (apellido, barrio, correo)
- **Ofi Inter (collecting_data_inter):** 4 críticos (nombre, telefono, ciudad, departamento) + 2 adicionales (apellido, correo) + cedula_recoge

---

## 11. Timer Signals

### Señales posibles
```
{type: 'start', reason?: string}      — Iniciar timer al nivel actual
{type: 'reevaluate', reason?: string}  — Recalcular timer por nuevos datos
{type: 'cancel', reason?: string}      — Cancelar timer actual
```

### Razones comunes
| Señal | Reason | Contexto |
|-------|--------|----------|
| cancel | ingest_complete | Todos los campos capturados |
| cancel | handoff | Transferir a humano |
| start | (none) | Transición a collecting_data, ofrecer_promos |
| start | silence | SILENCIOSO → retake timer 90s |
| reevaluate | (none) | Nuevo dato recibido durante collecting_data |

### Two-Step Pattern (Ingest Complete)
1. `handleIngestMode()` emits: `{type: 'cancel', reason: 'ingest_complete'}`
2. `processMessage() step 11b` emits: `{type: 'start'}` para promo timer

---

*Documento creado: 2026-02-25*
*Actualizar cuando se agreguen features al agente o se modifique el debug panel.*
