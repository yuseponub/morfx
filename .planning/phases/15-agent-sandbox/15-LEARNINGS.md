# Phase 15: Agent Sandbox - Learnings

**Fecha:** 2026-02-06 al 2026-02-09
**Duración:** 4 días (planes 01-04: 20 min; subplanes 15.5-15.7: 3+ días)
**Plans ejecutados:** 13 planes (4 principales + 9 subplanes)

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| SSR error con Allotment | Allotment library intenta acceder a `window` durante SSR en Next.js | Dynamic import con `ssr: false` en componente SandboxLayout | Siempre usar dynamic imports para librerías que dependen de browser APIs |
| localStorage access en SSR | Acceso directo a localStorage durante server-side rendering | Agregar guard `typeof window !== 'undefined'` antes de acceder localStorage | Crear utility functions que encapsulen checks de SSR |
| Anthropic SDK en cliente | SDK de Anthropic usa Node.js APIs no disponibles en browser | Mover procesamiento a server API route `/api/sandbox/process` | Mantener SDKs de terceros siempre en server-side |
| JsonView editable API | Plan especificaba props v1 pero @uiw/react-json-view v2 usa componente separado | Cambiar a `JsonViewEditor` con `editable={true}` boolean | Verificar versión actual de librería durante research phase |
| Tool name incorrecto CRM | Usaba `crm.contact.tag` en lugar del nombre correcto | Cambiar a `crm.tag.add` según Action DSL registry | Consultar tool registry antes de hardcodear nombres |
| ContactId extraction LIVE mode | Buscaba contactId en `outputs` root en lugar de `outputs.data` | Extraer de `outputs.data.id` para LIVE mode | Documentar estructura de outputs por modo (DRY vs LIVE) |
| WorkspaceId hardcoded | Pasaba 'sandbox' como workspaceId en LIVE mode | Usar workspaceId real de la sesión | Nunca hardcodear IDs de workspace en CRM operations |
| Phone format E.164 | OrderManager no agregaba prefijo + para formato internacional | Agregar `+` prefix en LIVE mode: `+${phone}` | Validar formato E.164 (+57XXXXXXXXXX) en todos los inputs de teléfono |
| Tool registry no inicializado | API route no registraba tools antes de ejecutar LIVE mode | Llamar `registerAllTools(db)` en API handler | Inicializar registries en todos los entry points de API |
| Field validation bloqueante | OrderManager rechazaba orders con datos parciales | Remover validación de campos - permitir creación con datos incompletos | CRM debe ser flexible con datos parciales en recolección progresiva |
| IngestStatus no persistía | newState rebuilding no copiaba ingestStatus | Carry over ingestStatus: `ingestStatus: currentState?.ingestStatus` | Siempre copiar state completo en rebuilds, no solo campos obvios |
| Agent no registrado en sandbox | SandboxEngine no importaba modulo somnio, agente no se encontraba en registry | Commit `7e9b8c6`: Importar modulo somnio en sandbox API route para triggear self-registration | Self-registration pattern requiere importar el modulo barrel en cada entry point |
| Template selection usaba estado post-intent | Orchestrator seleccionaba templates usando intentsVistos que ya incluia el intent actual, causando templates de segunda vez en primera vez | Commit `fbeca3a`: Usar state ANTES del intent actual para template selection | Template selection debe basarse en estado previo, no el estado despues de registrar el intent |
| Espacios multiples colapsados en mensajes | CSS default colapsa multiples espacios, rompiendo formato de templates con indentacion | Commit `2febbc3`: Usar `white-space: pre-line` en message bubbles | Templates con formato usan espacios intencionales - usar pre-line o pre-wrap |
| parseIntentResponse perdia texto raw | DataExtractor recibia intent parsed sin el texto original del usuario | Commit `acf6739`: Preservar raw text en parseIntentResponse para que DataExtractor reciba mensaje original | Siempre pasar datos completos entre componentes, no solo el resultado procesado |
| Timer closure stale | Timer callback usaba estado viejo por closure | Usar useRef (timerEnabledRef) en lugar de state en callbacks | Usar refs para valores que se leen en callbacks asíncronos |
| Timer no iniciaba retroactivo | Toggle habilitado después de collecting_data no iniciaba timer | Detectar collecting_data + enabled en useEffect y start timer | Verificar estado inicial al habilitar features toggleables |
| Timer no persistía en reset | Reset de sesión perdía configuración de timer | Persistir timerEnabled en localStorage separado de session | Separar configuración de usuario de state de sesión |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Inverted theme (user=right/primary, agent=left/muted) | Usar mismo theme que inbox (agent=right) | Distinguir visualmente sandbox de producción, reflejar perspectiva de testing |
| localStorage con MAX_SESSIONS=20 | IndexedDB, API persistence | Simple, rápido, suficiente para testing local |
| Mock session object para orchestrator | Modificar orchestrator para soportar modo in-memory | Mantener compatibilidad sin cambiar producción |
| HH:mm:ss timestamp format | Relative time (hace 2 min) | Precisión para debugging de secuencias |
| JsonViewEditor de @uiw/react-json-view/editor | react-json-view, otro editor | Editable inline, bien mantenido, TypeScript support |
| Allotment para split panes | react-split-pane, custom implementation | Mejor DX, resizable, snap behavior built-in |
| Radix UI Tabs | Headless UI, custom tabs | Consistencia con resto del proyecto |
| Server API route para processing | Client-side engine | Seguridad (API key), compatibilidad con SDK |
| generateSessionId con timestamp+random | UUID, sequential IDs | Human-readable + unique + sortable |
| Confidence thresholds (85/60/40) | Otros valores | Alineado con thresholds del agent engine |
| Token budget warning en 40K | Warning en 50K límite | 80% threshold da tiempo de reaccionar |
| IngestManager silent accumulation | Procesar cada mensaje inmediatamente | Evitar spam, mejor UX en recolección de datos |
| Dual timer logic (30s/60s) | Timer único | L1-L2 requieren urgencia, L3-L4 pueden esperar más |
| CRM agent multi-select | Agent único global | Permitir testing de combinaciones (OrderManager + otros) |
| DRY/LIVE mode badges | Modo oculto | Transparencia sobre qué operaciones afectan DB real |
| IngestTab 5-level UI | Mostrar solo fields | Visualización clara de progreso L1→L5 |
| Timer pluggable via signals | Timer integrado en state machine | Separación de concerns, testeable independiente |
| TabBar + PanelContainer multi-panel | Tabs tradicionales | Soporte para múltiples paneles simultáneos en debug |
| Per-model token tracking | Solo total | Debugging de costos por modelo (Haiku vs Sonnet) |
| Response speed configurable (instant/normal/slow) | Velocidad fija | Flexibilidad en testing de UX con delays realistas |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| SandboxEngine | SomnioOrchestrator | Orchestrator espera AgentSessionWithState de DB | Crear mock session object con estructura completa |
| React client | Anthropic SDK | SDK usa Node.js APIs (fs, crypto) no disponibles en browser | Crear API route `/api/sandbox/process` para server-side |
| localStorage | Next.js SSR | localStorage.getItem() ejecuta durante SSR y falla | Guard `typeof window !== 'undefined'` |
| Allotment | Next.js SSR | Library accede a window durante render inicial | Dynamic import con `next/dynamic` y `ssr: false` |
| JsonViewEditor | TypeScript | Props de v2 diferentes a documentación de v1 | Importar desde `/editor` subpath y usar boolean `editable` |
| IngestManager | SandboxEngine | Engine no propagaba ingestStatus updates | Incluir ingestStatus en response de processMessage |
| CRM tools | Action DSL registry | Registry no inicializado en API context | Llamar registerAllTools en API handler |
| OrderManager | Action DSL | Tool names hardcoded incorrectos | Usar nombres del registry: crm.tag.add, crm.contact.create |
| Timer signals | State machine | Transitions validaban reglas normales | Skip validation para timer-forced transitions |
| IngestTimer | SandboxEngine | Signals retornaban null hardcoded | Propagar signals reales desde timer |
| Timer toggle | React state | Closure capturaba valor viejo de timerEnabled | Usar useRef para valores leídos en timer callbacks |
| Session reset | Timer config | Reset perdía configuración de usuario | Persistir timerEnabled fuera de session state |
| IngestStatus | State rebuilding | newState no copiaba ingestStatus del estado anterior | Carry over ingestStatus en builds de newState |

## Tips para Futuros Agentes

### Lo que funcionó bien
- Research phase identificó pitfalls de SSR antes de implementar
- Commits atómicos por tarea facilitaron debugging de issues
- Mock session pattern permitió reusar código de producción sin modificarlo
- Inverted theme hace sandbox inmediatamente distinguible
- localStorage con MAX_SESSIONS evitó quota issues proactivamente
- Server API route simplificó manejo de Anthropic SDK
- Confidence color-coding alineado con engine thresholds
- Typing indicator con CSS keyframes (no JavaScript) es performante
- IngestManager silent accumulation reduce spam perceptiblemente
- Dual timer logic refleja diferencia real entre urgencia L1-L2 vs L3-L4
- CRM multi-select permite testing de combinaciones de agentes
- DRY/LIVE badges dan transparencia crítica sobre side effects
- Per-model token tracking expone costos reales por modelo
- Timer pluggable via signals permite testing independiente

### Lo que NO hacer
- No asumir que librerías funcionan igual en cliente vs servidor
- No acceder localStorage sin guard de SSR
- No hardcodear nombres de tools - usar registry
- No validar campos estrictamente en CRM - datos parciales son válidos
- No usar state en closures de timers - usar refs
- No asumir que v2 de librería tiene misma API que v1
- No mezclar configuración de usuario con state de sesión
- No olvidar copiar campos "obvios" en state rebuilding
- No skip research phase porque "es solo UI" - SSR issues no son obvios
- No usar `editable` prop en JsonView base - requiere JsonViewEditor
- No asumir que reset limpia todo - config debe persistir
- No validar transitions normalmente cuando son timer-forced
- No hardcodear workspaceIds - siempre obtener de contexto

### Patrones a seguir
- **In-memory engine pattern:** State pasa in/out, no DB writes
- **Mock object compatibility:** Crear mock que satisface interface sin modificar código de producción
- **SSR-safe utilities:** Encapsular checks `typeof window !== 'undefined'`
- **Dynamic imports para browser-only:** `next/dynamic` con `ssr: false`
- **Server API routes para SDKs:** Mantener Node SDKs en server-side siempre
- **Inverted theme para testing:** Visual cue que estás en sandbox
- **Confidence thresholds alineados:** Mantener consistency con engine
- **Tool registry consultation:** Nunca hardcodear, siempre consultar registry
- **Ref pattern para callbacks:** useRef para valores leídos en async callbacks
- **Separate user config:** Persistir config de usuario fuera de session state
- **Carry over pattern:** Al rebuilding state, copiar campos existentes explícitamente
- **Signal propagation:** Timer/features usan signals, engine propaga, no hardcodea nulls
- **Skip validation pattern:** Timer-forced transitions skip reglas normales
- **Multi-panel debug:** TabBar + PanelContainer para debugging complejo

### Comandos útiles
```bash
# Verificar que localStorage funciona sin SSR errors
npm run dev
# Abrir /sandbox y revisar console - no debe haber hydration errors

# Verificar que API route funciona
curl -X POST http://localhost:3020/api/sandbox/process \
  -H "Content-Type: application/json" \
  -d '{"message":"hola","state":{}}'

# Ver estructura de outputs en LIVE mode
# En sandbox, habilitar LIVE mode para OrderManager y enviar mensaje
# Revisar Tools tab - outputs.data contiene el resultado

# Limpiar localStorage sessions si hay issues
# En browser console:
localStorage.removeItem('sandbox-sessions')
localStorage.removeItem('sandbox-timer-enabled')

# Ver token usage por modelo
# Enviar mensajes, ir a Tokens tab, ver breakdown por modelo

# Testing de timer
# 1. Habilitar timer toggle
# 2. Ir a collecting_data mode
# 3. Verificar que timer inicia
# 4. Esperar expiration
# 5. Revisar que transition ocurre
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Plan 05 pendiente: Human verification flow en sandbox | Media | 15.8 o post-MVP |
| Ingest timer UI muestra 5 niveles pero engine solo usa 4 | Baja | Cuando se expanda lógica de ingest |
| Response speed config no valida rango (permite negativos) | Baja | Próximo refactor de sandbox UI |
| Session list no tiene búsqueda/filtrado (solo 20 más recientes) | Baja | Si users reportan que necesitan más sesiones |
| Debug panel tabs no memorizan tab seleccionado entre sessions | Baja | QoL improvement futuro |
| No hay export de session a JSON file | Media | Útil para compartir test cases con equipo |
| No hay import de session desde JSON | Media | Par con export, útil para reproducir bugs |
| CRM agents no validan permisos (asumen todos tienen acceso) | Alta | Antes de producción con LIVE mode |
| Tool registry requiere inicialización manual en cada API route | Media | Crear middleware que auto-registre |
| Per-model token breakdown no muestra caching savings | Media | Cuando Claude cache esté en producción |
| IngestManager no expone métricas de clasificación accuracy | Baja | Útil para training pero no bloqueante |
| Timer simulator no permite pausar/resumir | Baja | Nice to have para debugging |
| Sandbox no tiene modo "replay" de session guardada | Baja | Útil para demos pero no critical |
| No hay rate limiting en `/api/sandbox/process` | Alta | Antes de launch - prevenir abuse |

## Notas para el Módulo

Información específica que un agente de documentación de este módulo necesitaría saber:

### Arquitectura del Sandbox
- **Propósito:** Testing de agentes sin afectar WhatsApp real ni crear registros en DB
- **Flow:** Cliente → API route → SandboxEngine → SomnioOrchestrator → respuesta
- **Persistencia:** localStorage para sessions (MAX_20), no DB
- **Mock pattern:** SandboxEngine crea mock session object compatible con orchestrator

### Componentes Clave
- `SandboxEngine`: Wrapper in-memory que procesa mensajes sin DB writes
- `SandboxLayout`: Split-pane Allotment (60/40) con chat + debug panel
- `DebugTabs`: 4 tabs (Tools, Estado, Intent, Tokens) + panels adicionales (Ingest, etc)
- `SessionControls`: New/Save/Load con confirmation dialogs
- `IngestManager`: Silent accumulation de datos con dual timer (30s/60s)
- `IngestTimerSimulator`: Pluggable timer via signals para testing
- `CRM agents`: OrderManager + registry con DRY/LIVE modes

### Integraciones
- **Anthropic SDK:** Solo en server-side via `/api/sandbox/process`
- **Action DSL:** CRM agents pueden ejecutar en LIVE mode (con LIVE badge)
- **Somnio Orchestrator:** Reusa código de producción con mock session
- **localStorage:** Session persistence + timer config (separados)

### Estado y Data Flow
```
User input → SandboxLayout → API route → SandboxEngine
  → Mock session → SomnioOrchestrator → IntentDetector/DataExtractor
  → TemplateManager → Response + DebugTurn
  → Update SandboxState → Render chat + debug panels
```

### Features Especiales
- **Inverted theme:** User=right/primary (opposite de inbox) para distinguir sandbox
- **DRY/LIVE modes:** DRY simula, LIVE ejecuta contra DB real (con badges)
- **Per-model tokens:** Breakdown por modelo (Haiku/Sonnet) en TokensTab
- **Response speed:** Configurable (instant/normal/slow) para testing UX
- **Timer pluggable:** IngestTimerSimulator vía signals, no acoplado a state machine
- **5-level ingest:** L1 (nombre) → L2 (dirección) → L3 (detalle) → L4 (confirmar) → L5 (done)
- **Multi-panel debug:** TabBar permite múltiples panels simultáneos

### Testing Workflow
1. Abrir `/sandbox` (visible para todos los authenticated users)
2. Seleccionar agente (Somnio por defecto, puede agregar CRM agents)
3. Enviar mensajes en chat panel
4. Revisar debug info en tabs (Tools, Estado, Intent, Tokens, Ingest)
5. Habilitar LIVE mode si quieres ejecutar contra DB real (aparece badge rojo)
6. Guardar session con nombre custom
7. Load session guardada para continuar testing

### Configuración Requerida
- `ANTHROPIC_API_KEY` en `.env.local` (servidor)
- No requiere configuración adicional para DRY mode
- Para LIVE mode: workspace debe existir en DB

### Pitfalls Conocidos
- Allotment requiere dynamic import (`ssr: false`)
- localStorage requiere SSR guard
- JsonViewEditor es componente separado en v2
- CRM tools requieren registry initialization en API handlers
- Timer callbacks requieren refs, no state
- Session reset debe preservar user config (timerEnabled)
- State rebuilding debe carry over campos como ingestStatus

### Expansiones Futuras
- Plan 05 pendiente: Human verification flow
- Export/import de sessions a JSON
- Replay mode de sessions guardadas
- Rate limiting en API route
- Permisos para LIVE mode CRM operations
- Pausar/resumir timer simulator

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
