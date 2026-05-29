// Standalone: somnio-sales-v4
// D-13: agent_id literal locked
// D-23: scope = workspace Somnio exclusivo
// D-24: cero imports desde @/lib/agents/somnio-v3/*

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const SOMNIO_V4_AGENT_ID = 'somnio-sales-v4' as const

// Workspace Somnio (D-23). Hardcoded porque v4 SOLO opera aquí.
export const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490' as const

/**
 * v4 AgentConfig — registrado en agentRegistry vía index.ts (Plan 06 Task 7).
 *
 * Estructura clonada conceptualmente de somnio-v3/config.ts:
 *   - intentDetector / orchestrator usan placeholders (v4, igual que v3, usa
 *     comprehension.ts directo + sales-track.ts + response-track.ts; los campos
 *     son metadata para el registry, no se ejecutan).
 *   - tools[] declarativo (no es la fuente real de tools del sub-loop — esa vive
 *     en sub-loop/tools.ts, Plan 05).
 *   - states/initialState/validTransitions: mismo set conceptual que v3 (heredado
 *     vía clone mecánico de transitions.ts).
 *   - confidenceThresholds: legacy v3 0-100 (intent.confidence). El threshold
 *     de v4 (0..1 sobre intent_confidence) vive en platform_config.somnio_v4_low_confidence_threshold (D-11).
 *   - tokenBudget: heredado.
 *
 * D-13: id es el literal locked.
 */
export const somnioV4Config: AgentConfig = {
  id: SOMNIO_V4_AGENT_ID,
  name: 'Somnio Sales v4 (híbrido + sub-loop)',
  description:
    'State machine determinista + sub-loop RAG-generativo (GPT-4.1-mini tooling + Gemini 2.5 Flash generation/compliance; GPT-4o-mini en el path legacy) bajo triggers (low_confidence, ' +
    'crm_mutation, cas_reject, razonamiento_libre). Mutations vía crm-mutation-tools. ' +
    'KB curado + observation loop unknown_cases. Standalone somnio-sales-v4.',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — v4 uses comprehension.ts directly (Gemini 2.5 Flash structured + intent_confidence). El campo `model` de abajo NO se ejecuta (metadata del registry).',
    maxTokens: 1024,
  },

  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — v4 uses sales-track.ts + response-track.ts directly + sub-loop on triggers',
    maxTokens: 512,
  },

  tools: [
    'crm.contact.create',
    'crm.contact.update',
    'crm.order.create',
    'crm.order.update',
    'crm.order.move_stage',
    'crm.note.add',
    'crm.task.create',
    'kb.search',
    'whatsapp.message.send',
  ],

  states: [
    'nuevo',
    'conversacion',
    'captura',
    'captura_inter',
    'promos',
    'confirmacion',
    'orden_creada',
    'handoff',
  ],
  initialState: 'nuevo',
  validTransitions: {
    nuevo: ['conversacion', 'captura', 'handoff'],
    conversacion: ['captura', 'captura_inter', 'handoff'],
    captura: ['captura_inter', 'promos', 'confirmacion', 'handoff'],
    captura_inter: ['captura', 'promos', 'confirmacion', 'handoff'],
    promos: ['confirmacion', 'orden_creada', 'handoff'],
    confirmacion: ['orden_creada', 'promos', 'handoff'],
    orden_creada: ['handoff'],
    handoff: [],
  },

  confidenceThresholds: {
    proceed: 80,
    reanalyze: 60,
    clarify: 40,
    handoff: 0,
  },

  tokenBudget: 50_000,
}

// ───────────────────────────────────────────────────────────────────────────
// Env-bridge de stage UUIDs + pipelineId default (standalone #2 — Plan 02)
//
// Patron espejado de `getCanceledStageUuid` (invocations.ts:64-66): evaluacion
// lazy (function call, NO const top-level) para que los tests inyecten via
// process.env en beforeEach sin requerir module re-import.
//
// UUIDs verificados live 2026-05-29 (RESEARCH §Pattern 2, pipeline
// "Ventas Somnio Standard"). D-15 (createOrder cascaron en NUEVO PEDIDO) +
// D-21 (snapshot _v4, NO _v3:*) + D-18 (confirmar -> moveOrderToStage CONFIRMADO).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Stage UUID para mover pedido a CONFIRMADO (D-18 — confirmar -> moveOrderToStage).
 *
 * fail-closed (null) si no esta seteado: el caller (gate Plan 06) OMITE la mutacion
 * `moveOrderToStage(CONFIRMADO)` + loggea observability. Sin UUID, el pedido NO se
 * confirma (no se inventa un destino).
 */
export function getConfirmadoStageUuid(): string | null {
  return process.env.SOMNIO_CONFIRMADO_STAGE_UUID ?? null
}

/**
 * Stage UUID para el cascaron de pedido nuevo en NUEVO PEDIDO (D-15 — birth stage).
 *
 * Elegido para NO disparar la automation `order.created` (matchea solo NUEVO PAG WEB,
 * 42da9d61... — RESEARCH §Riesgos). fail-closed (null): sin UUID, el caller (gate
 * Plan 06) OMITE `createOrder` cascaron + loggea observability.
 */
export function getNuevoPedidoStageUuid(): string | null {
  return process.env.SOMNIO_NUEVO_PEDIDO_STAGE_UUID ?? null
}

/**
 * Pipeline default Somnio. `createOrder` (crm-mutation-tools) requiere un pipelineId
 * UUID -> el gate del Plan 06 lo resuelve llamando esta funcion (sin runtime
 * pipelines_list round-trip).
 *
 * EXCEPCION al patron fail-closed de los stages: tiene fallback verificado al UUID
 * default Somnio (NO fail-closed a null) porque el pipeline default es estable y
 * conocido ("Ventas Somnio Standard", is_default=true, live-verified 2026-05-29 —
 * RESEARCH §Pattern 2). Override opcional via SOMNIO_VENTAS_PIPELINE_UUID en Vercel.
 */
export function getPipelineUuid(): string {
  return process.env.SOMNIO_VENTAS_PIPELINE_UUID ?? 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8'
}

/**
 * Stages pre-confirmacion (set v4-local). Origen: whitelist de transiciones del
 * gate (Plan 06: solo -> CONFIRMADO desde estos) + fallback de Vista A en
 * crm-grounding (config_not_set -> el ultimo pedido sigue "activo" solo si esta en
 * uno de estos stages, no terminal).
 *
 * Hardcode aceptado per CONTEXT Deferred ("whitelist configurable = futuro").
 * UUIDs verificados live 2026-05-29 (RESEARCH §Pattern 2):
 *   NUEVO PEDIDO    6be952b0-0a95-4957-b5f7-62e8fd8eb815  (birth stage cascaron, D-15)
 *   FALTA INFO      05c1f783-8d5a-492d-86c2-c660e8e23332
 *   FALTA CONFIRMAR e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd
 */
export const PRE_CONFIRMATION_STAGE_UUIDS: ReadonlySet<string> = new Set([
  '6be952b0-0a95-4957-b5f7-62e8fd8eb815', // NUEVO PEDIDO
  '05c1f783-8d5a-492d-86c2-c660e8e23332', // FALTA INFO
  'e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd', // FALTA CONFIRMAR
])

/**
 * Mapa UUID -> nombre legible de stage. Resuelve Pitfall 4 (OrderDetail NO trae
 * stageName ni order_stage_history) sin un domain read extra.
 *
 * Los 5 stages del pipeline "Ventas Somnio Standard" (RESEARCH §Pattern 2,
 * live-verified 2026-05-29). NUEVO PAG WEB se incluye para legibilidad aunque el
 * agente NUNCA lo escribe (dispara automation order.created — EVITAR, D-15).
 */
export const STAGE_NAME_BY_UUID: Record<string, string> = {
  '4770a36e-5feb-4eec-a71c-75d54cb2797c': 'CONFIRMADO',
  '6be952b0-0a95-4957-b5f7-62e8fd8eb815': 'NUEVO PEDIDO',
  '05c1f783-8d5a-492d-86c2-c660e8e23332': 'FALTA INFO',
  'e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd': 'FALTA CONFIRMAR',
  '42da9d61-6c00-4317-9fd9-2cec9113bd38': 'NUEVO PAG WEB',
}
