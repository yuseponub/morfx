# Phase 19: AI Automation Builder - Learnings

**Fecha:** 2026-02-16
**Duración:** ~3 días (2026-02-14 a 2026-02-16)
**Plans ejecutados:** 10

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| UIMessage vs ModelMessage mezclados en session store | AI SDK v6 usa UIMessage con `parts[]` no `content`; al persistir y restaurar se perdía el formato | Usar `convertToModelMessages()` para bridge, no mezclar tipos | Siempre verificar qué tipo espera cada función del SDK |
| Model ID incorrecto `claude-sonnet-4-5` | El formato real es `claude-sonnet-4-20250514` con fecha | Corregido a model ID exacto | Verificar model IDs contra documentación oficial |
| Messages sin `.parts` crasheaban el chat | Mensajes restaurados de DB no tenían `parts` (formato legacy) | Guard defensivo `message.parts?.length` | Siempre validar shape de datos externos |
| Cycle detection falsos positivos | Detección no consideraba `trigger_config` — asumía que cualquier action→trigger del mismo tipo era ciclo | Smart detection con comparación de trigger_config y condiciones | Cycle detection debe ser context-aware, no solo type-based |
| Builder prompt ambiguo trigger/condition/action | Agente confundía "cuando tag = VIP" (condition) con "cuando se asigne tag" (trigger) | Agregar sección explícita de disambiguación al system prompt | Prompts de agentes necesitan ejemplos de confusiones comunes |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| AI SDK v6 con `useChat` + `DefaultChatTransport` | Raw Anthropic SDK, AI SDK v5 | v6 maneja streaming, tool calls y UIMessage nativamente |
| `@xyflow/react` para diagramas | Mermaid, D3, custom SVG | Nodos interactivos, zoom/pan, React-native, mejor para preview editable |
| Custom fetch wrapper en transport | `onResponse` callback (deprecated en v6) | v6 eliminó onResponse; custom fetch intercepta headers (X-Session-Id) |
| `dynamic-tool` part type para tool results | `tool-invocation` (v5) | v6 cambió nombres de part types; `dynamic-tool` con 4 estados |
| Session store con createAdminClient | User-context Supabase client | Builder sessions necesitan acceso desde API route (no hay cookie context) |
| `sendMessage` reemplaza `handleSubmit` | `handleSubmit` + `handleInputChange` (v5) | v6 simplifica: un solo método, manejar input state localmente |
| key-based remount para cambio de sesión | State reset manual | Más limpio: cambiar `chatKey` fuerza remount completo de BuilderChat |
| Inline diagram en chat (no panel separado) | Panel lateral de preview | Mejor UX: diagrama aparece en contexto del mensaje |
| Confirmación por texto literal | Botón que envía evento | "Confirmo. Crea la automatizacion." — agente interpreta naturalmente |
| Validación consolidada en módulo único | Duplicada en tools.ts y validation/ | Eliminamos 260 líneas duplicadas, single source of truth |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| AI SDK v6 `useChat` | React 19 | `forwardRef` deprecated en React 19; `useChat` esperaba ref pattern antiguo | Usar React 19 ref prop pattern directamente en BuilderInput |
| AI SDK v6 `tool()` | Zod v4 (TypeScript) | `inputSchema` requerido (no `parameters`); tipado incompatible con v3 | Cambiar a `inputSchema` property en todas las 9 tool definitions |
| `@xyflow/react` Node<T> | DiagramNodeData | Requiere `[key: string]: unknown` index signature en T | Agregar index signature a DiagramNodeData type |
| Session store persist | UIMessage format | Messages guardados como `unknown[]` en JSONB; al restaurar perdían `parts` | Cast explícito a UIMessage[] + convertToModelMessages() para streamText |
| Builder chat transport | Session ID tracking | v6 eliminó `onResponse` callback para interceptar headers | Custom fetch wrapper en DefaultChatTransport que lee X-Session-Id |

## Tips para Futuros Agentes

### Lo que funcionó bien
- AI SDK v6 `useChat` + `streamText` es la combinación correcta para chat con tools
- Consolidar validación en módulo único previene divergencia
- System prompt con ejemplos de confusiones comunes mejora mucho la calidad del agente
- React Flow con nodos custom da excelente UX para preview de automatizaciones
- Session history como overlay panel (no sidebar persistente) es más limpio

### Lo que NO hacer
- NO mezclar UIMessage y ModelMessage — son tipos incompatibles en v6
- NO usar `onResponse` ni `ChatInit.api` — deprecated en AI SDK v6
- NO hacer cycle detection solo por tipo — debe considerar trigger_config
- NO asumir que datos de DB tienen la misma shape que objetos en memoria
- NO duplicar lógica de validación entre tools y módulos de validación
- NO usar `forwardRef` con React 19 — usar ref prop pattern directamente

### Patrones a seguir
- **Transport pattern:** `new DefaultChatTransport({ api, fetch: customFetch })` para interceptar headers
- **Session switching:** `key={chatKey}` en componente de chat para forzar remount limpio
- **Tool rendering:** Switch sobre `part.toolInvocation.toolName` + estado (`output-available`) para render condicional
- **Diagram rendering:** `dynamic(() => import(...), { ssr: false })` para React Flow (no funciona en SSR)
- **Confirmation flow:** Texto literal del usuario → agente interpreta → llama tool `createAutomation`
- **Validation module:** Single source para resource check + cycle detection + duplicate detection

### Comandos útiles
```bash
# Verificar build completo
npx tsc --noEmit && npm run build

# Ver rutas generadas por Next.js
npm run build 2>&1 | grep "├\|└\|Route"

# Verificar que AI SDK v6 está correcto
npm ls ai @ai-sdk/anthropic @ai-sdk/react
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| avgResponseTimeMs retorna 0 (Phase 16 metrics) | Baja | Post-MVP |
| Phases 15.5, 15.7, 16 tienen plans incompletos en ROADMAP | Media | Limpieza milestone |
| Builder no soporta todas las action types en el wizard visual | Baja | Iteración futura |
| Session history no tiene paginación | Baja | Cuando haya muchas sesiones |

## Notas para el Módulo

- El AI Automation Builder vive en `src/app/(dashboard)/automatizaciones/builder/`
- API route: `src/app/api/builder/chat/route.ts` (streaming con AI SDK v6)
- Sessions API: `src/app/api/builder/sessions/route.ts`
- Tools: `src/lib/builder/tools.ts` (9 herramientas AI SDK)
- Validation: `src/lib/builder/validation/` (resource check, cycle detection, duplicates)
- Diagram: `src/lib/builder/diagram-generator.ts` + `src/components/automatizaciones/builder/automation-preview.tsx`
- System prompt: `src/lib/builder/system-prompt.ts`
- Session store: `src/lib/builder/session-store.ts`
- El agente usa Claude Sonnet 4 (model ID: `claude-sonnet-4-20250514`)
- Scope del agente definido en `.claude/rules/agent-scope.md`: SOLO puede crear/modificar/clonar automatizaciones, NO puede crear tags/pipelines/templates

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
