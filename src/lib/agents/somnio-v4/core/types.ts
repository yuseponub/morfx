/**
 * Contratos del CORE de turno v4 (D-05 somnio-v4-consolidation Plan 09 — interface-first).
 *
 * Este archivo pinnea la interfaz que el orquestador único de turno (`turn-orchestrator.ts`)
 * consume. La motivación verbatim del usuario: "el sandbox debe ser producción con adapters
 * falsos" — estos contratos son el mecanismo que lo hace cierto POR CONSTRUCCIÓN: prod inyecta
 * adapters reales (V4MessagingAdapter + SessionManager + Supabase), sandbox inyecta adapters
 * de memoria/NDJSON, y el core no sabe la diferencia.
 *
 * INVARIANTE D-05 (agnosticidad): este archivo NO importa NADA de los canales de mensajería,
 * NDJSON, la base de datos, los adapters de entorno ni el sandbox. SOLO tipos de somnio-v4
 * (V4AgentOutput etc.), interruption-system-v2 y propios. (Verificable por grep de imports
 * prohibidos == 0.)
 *
 * INVARIANTE D-03/D-05 (patrón optional-method, cero flags de entorno): las capabilities que
 * solo prod o solo sandbox necesitan son MÉTODOS OPCIONALES del adapter (`?:`), no `if (isProd)`.
 * El orquestador gatea por `if (adapters.getPendingTemplates)` — el adapter que no implementa el
 * método salta la rama (patrón existente del runner :499/:580). Cero `NODE_ENV`, cero config flag.
 *
 * Los Planes 10 (runner→wrapper) y 11 (engine→wrapper) implementan CONTRA esto sin re-interpretar.
 */

import type {
  ProcessedMessage,
  TurnLedgerDims,
  V4AgentOutput,
  SystemEvent,
} from '@/lib/agents/somnio-v4/types'
import type { CarryState } from './restart-context'

// ============================================================================
// CoreSeedState — el estado-semilla del turno (per-iteración, B1)
// ============================================================================

/**
 * El estado desde el que el core siembra cada iteración del turno (lo que hoy el runner
 * deriva de `session.state` en :285-304 y el engine de `input.state` en :256).
 *
 * - **Prod:** el adapter hace fetch de la sesión por-iteración (B1 — `getSeedState` lee DB fresh)
 *   + extrae los `_v3:` keys, acciones_ejecutadas, turn_ledger_dims, etc.
 * - **Sandbox:** el adapter lo construye desde `input.state` en memoria.
 *
 * El core NO conoce de dónde viene — solo consume estos campos neutrales. El crash-recovery
 * legacy `_v3:pendingUserMessage` (D-18) viaja como `legacyPendingMessage` opcional para que el
 * core lo combine en el orden Pitfall 7 (CKPT-0 drain → seed → legacy combine).
 */
export interface CoreSeedState {
  /** Id de la sesión resuelta (prod: DB; sandbox: sintético). Echo en el TurnResult. */
  sessionId: string
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  /** Runtime es AccionRegistrada[]; el core lo arrastra como unknown[] para no acoplar el shape. */
  accionesEjecutadas: unknown[]
  /** Dims del turno previo restauradas (default graceful `{ atendido: [], crmActions: [] }`). */
  turnLedgerDims: TurnLedgerDims
  /** Historia conversacional ya resuelta por el adapter (prod: DB; sandbox: in-memory). */
  history: { role: 'user' | 'assistant'; content: string }[]
  /** Número de turno (prod: deriva de history.length; sandbox: input.turnNumber). */
  turnNumber: number
  /**
   * Vision context del path image-respond v4 (media-gate → vision_respond). Presente SOLO en ese
   * path; ausente en texto/audio/sticker. Campo neutral (descripcion + categoria, NO tipos de
   * WhatsApp). El core lo threadea al V4AgentInput tal cual lo hacía el runner (:332). Plan 10:
   * regresión introducida por la extracción del Plan 09 (el runner viejo lo pasaba; el core no).
   */
  visionContext?: { descripcion: string; categoria: string }
}

// ============================================================================
// SendBlock — lo que el core pasa al adapter de envío (contrato YA existente)
// ============================================================================

/**
 * Bloque de envío que el core entrega a `adapters.send()`. Es EXACTAMENTE lo que el runner
 * pasa hoy a `messaging.send` (:708-723 / :513-527) — NO se inventa otro shape (D-05 /
 * Don't Hand-Roll). El adapter de prod lo manda por WhatsApp; el sandbox lo recoge en memoria.
 */
export interface SendBlock {
  sessionId: string
  conversationId: string
  messages: string[]
  /** Templates resueltos (id/content/contentType/delaySeconds) — shape del adapter actual. */
  templates: {
    id: string
    content: string
    contentType: ProcessedMessage['contentType']
    delaySeconds: number
  }[]
  intent?: string
  workspaceId: string
  contactId?: string
  phoneNumber?: string
  /** ISO timestamp del inbound que disparó el turno (Phase 31 pre-send check). */
  triggerTimestamp?: string
}

/**
 * Resultado del envío — contrato YA existente de `messaging.ts` (:347-353). NO inventar otro
 * (D-05). El adapter puede ADEMÁS lanzar `LostLockError` desde su CKPT-7.N interno (el core lo
 * deja burbujear al catch externo → zombie_exit).
 */
export interface SendResult {
  messagesSent: number
  /** El send fue interrumpido por un inbound nuevo (Phase 31). */
  interrupted?: boolean
  /** Índice (0-based) donde ocurrió la interrupción; templates desde ahí NO se enviaron. */
  interruptedAtIndex?: number
}

// ============================================================================
// CommittedTurn — insumos del bloque commit post-send (B7)
// ============================================================================

/**
 * Lo que el core entrega a `adapters.commitTurn?.()` tras un PATH B / turno normal commiteado.
 * Empaqueta los insumos del bloque post-send del runner (:892-1051): el estado a persistir, los
 * IDs realmente enviados, el contenido visto por el cliente, el output del agente comprometido y
 * el número de turno. El adapter de prod persiste a DB (saveState + addTurn + addIntentSeen +
 * handoff + emit ledger); el sandbox no implementa commitTurn (no hay DB → rama saltada).
 */
export interface CommittedTurn {
  sessionId: string
  turnNumber: number
  /** Output del agente del turno final (fuente de verdad de los efectos commiteados). */
  output: V4AgentOutput
  /** El mensaje efectivo del usuario del turno (puede ser combinado por un Path A previo). */
  effectiveMessage: string
  /** IDs de templates REALMENTE enviados across iteraciones (excluye `rag:*` — T-7). */
  actuallySentIds: string[]
  /** Templates_enviados del seed (para la unión final del state-save). */
  inputTemplatesEnviados: string[]
  /** Todo lo que el cliente vio across iteraciones (assistant-turn record). */
  allSentContents: string[]
  /** Tokens acumulados across restart iterations (single source of truth — Pitfall 2). */
  totalTokens: number
}

// ============================================================================
// TurnResult — resultado discriminado NEUTRAL del core (C5)
// ============================================================================

/**
 * Resultado del turno que el core retorna. Discriminado por `kind` y NEUTRAL (C5): el core NO
 * conoce ni el shape de `EngineOutput` (prod) ni el de `V4EngineOutput` (sandbox). Los wrappers
 * (Plan 10/11) MAPEAN este resultado a su shape — incluida la divergencia intencional del error
 * (prod `success:false` vs sandbox `success:true` con `[Error v4]`).
 */
export type TurnResult =
  | {
      kind: 'completed'
      /** Output del agente del turno comprometido (los wrappers leen messages/newMode/crmResult). */
      output: V4AgentOutput
      sessionId: string
      /** Total de mensajes enviados across iteraciones. */
      templatesSentCount: number
      /** Todo lo que el cliente vio across iteraciones (join → response). */
      allSentContents: string[]
      totalTokens: number
      /** True en el edge Path A 0-sends que defirió vía `_v3:pendingUserMessage` (D-18). */
      wasInterruptedWithZeroSends: boolean
      /**
       * True SOLO en el early-return de CKPT-6b Path B con pending vacío (prod-only): el output del
       * turno NO se envió ni se commiteó (solo se enviaron los pending-templates de un turno previo).
       * El `output` adjunto es el DESCARTADO de msg1 — NO debe propagarse `newMode`/`orderCreated`/
       * `messages` al consumidor (webhook-processor:1053 ejecutaría un handoff fantasma de un turno
       * no persistido). Los wrappers (mapResult) suprimen esos campos cuando está seteado.
       *
       * REGRESIÓN restaurada (M-01 review): el runner viejo retornaba `{ success:true, messages:[] }`
       * SIN `newMode`/`orderCreated`; la reescritura exponía el output descartado completo.
       */
      outputDiscarded?: boolean
    }
  | {
      kind: 'zombie_exit'
      ckptId: string
      message: string
    }
  | {
      kind: 'error'
      message: string
      cause?: unknown
    }

// ============================================================================
// TurnCoreInput — entrada neutral del core (derivada de EngineInput, SIN WhatsApp)
// ============================================================================

/**
 * Entrada neutral del core. Deriva de `EngineInput` (engine/types.ts) pero SIN tipos de WhatsApp
 * ni de Supabase: solo los campos que el restart loop necesita. Los lock fields vienen del
 * webhook (Plan 03); el core los re-deriva en `lockCtx` con el THROW defensivo del runner (A1).
 */
export interface TurnCoreInput {
  message: string
  conversationId: string
  contactId?: string
  workspaceId: string
  /** Teléfono para el envío (el adapter de prod lo usa para enrutar; sandbox lo ignora). */
  phoneNumber?: string
  /** ISO timestamp del inbound que disparó el turno (Phase 31 pre-send check). */
  messageTimestamp?: string
  /** Handle del lock distribuido (null en sandbox sin lock / pre-v4 / fail-open). */
  lockHandle?: import('@/lib/agents/interruption-system-v2/lock').LockHandle | null
  /** Canal del lock (whatsapp/facebook/instagram) — del webhook event.data (W3). */
  lockChannel?: import('@/lib/agents/interruption-system-v2/lock').LockChannel | null
  /** Identifier del lock (phone / external_subscriber_id) — del webhook event.data (W3). */
  lockIdentifier?: string | null
  /** JSON exacto que el webhook RPUSHeó como entrada propia del holder (crash-recovery D-16). */
  ownPendingEntryJson?: string | null
  /**
   * D-22 (somnio-v4-crm-subloop): cuando `true`, el core lo threadea al `V4AgentInput` para que el
   * gate CRM corra el sub-loop con mutation-tools SIMULADAS (no DB write). El wrapper SANDBOX
   * (`engine-v4.ts`) lo setea `true`; el runner PROD lo deja `undefined`/`false` → mutation-tools
   * reales. Campo NEUTRAL (boolean, no tipo de canal — compatible con D-05). Default false.
   *
   * REGRESIÓN restaurada (CR-01 somnio-v4-consolidation review): el engine viejo pasaba
   * `simulate: true` al V4AgentInput; la reescritura del Plan 11 lo dropeó → el gate CRM del sandbox
   * ejecutaba mutation-tools REALES contra el workspace real. Restaurado threadeándolo por el core.
   */
  simulate?: boolean
  /**
   * Evento de sistema del path timer-simulado (sandbox retomas D-21). El core lo threadea al
   * `V4AgentInput` para que `processMessage` despache a `processSystemEvent` cuando
   * `type === 'timer_expired'` (en vez de entrar a comprehension con mensaje vacío). El wrapper
   * SANDBOX lo provee desde `V4EngineInput.systemEvent`; el runner PROD no lo setea (los timers
   * reales van por `agent-timers-v4.ts` → `processMessage` directo, sin runner). Campo NEUTRAL
   * (struct `{ type, level }` de somnio-v4, no tipo de canal — compatible con D-05).
   *
   * REGRESIÓN restaurada (H-02 somnio-v4-consolidation review): el engine viejo pasaba
   * `systemEvent: input.systemEvent` al agente; la reescritura del Plan 11 lo dropeó → la simulación
   * de timers del sandbox quedó rota (turnos de timer entraban por `processUserMessage` con mensaje
   * vacío). Restaurado threadeándolo por el core.
   */
  systemEvent?: SystemEvent
}

// ============================================================================
// TurnCoreAdapters — la interfaz de adapters (D-05, patrón optional-method)
// ============================================================================

/**
 * Interfaz de adapters del core. Los métodos OBLIGATORIOS son el contrato mínimo que ambos lados
 * (prod + sandbox) implementan; los OPCIONALES (`?:`) son capabilities que solo un lado necesita
 * — el core gatea por `if (adapters.metodo)` (patrón optional-method del runner, cero flags de
 * entorno). El que no lo implementa salta la rama → paridad exacta con el comportamiento actual.
 */
export interface TurnCoreAdapters {
  // ---- OBLIGATORIOS ----

  /**
   * Envía un bloque de templates. Contrato YA existente de messaging.ts (:347-353) — NO inventar
   * otro (D-05). Puede lanzar `LostLockError` desde su CKPT-7.N interno (prod) → el core lo deja
   * burbujear al catch externo (zombie_exit).
   */
  send(block: SendBlock): Promise<SendResult>

  /**
   * Resuelve el estado-semilla del turno por-iteración (B1). Prod: fetch sesión fresh de DB +
   * extracción de `_v3:` keys; sandbox: `input.state` de memoria. Llamado DENTRO del loop, después
   * de CKPT-0 y antes del combine legacy (orden Pitfall 7).
   *
   * `carry` (Plan 10): el carryState que el core seteó en la iteración previa de un reprocess
   * Path B (null en iter 1 / Path A). El builder lo APLICA encima del estado-semilla derivado de
   * la sesión — patrón `carryState ?? sessionDerived` del runner viejo (:296). Sin esto el
   * reprocess Path B re-saludaría / re-enviaría (el core setea carryState pero NO lo re-lee — lo
   * delega al builder, que es quien conoce el shape del seed: prod DB vs sandbox SandboxState).
   */
  getSeedState(carry?: CarryState | null): Promise<CoreSeedState>

  // ---- OPCIONALES prod-only ----

  /** B7: persiste el turno commiteado (saveState + addTurn + ledger emit). Sandbox: no DB → no implementa. */
  commitTurn?(turn: CommittedTurn): Promise<void>

  /** B3: pending-templates de un turno previo interrumpido (habilita CKPT-6a). Sandbox no los carrea. */
  getPendingTemplates?(sessionId: string): Promise<unknown[]>
  /** B3: guarda los templates aún no enviados para el próximo turno. */
  savePendingTemplates?(sessionId: string, templates: unknown[]): Promise<void>
  /** B3: limpia los pending-templates (turno completado o handoff). */
  clearPendingTemplates?(sessionId: string): Promise<void>

  /**
   * B2 (D-18 crash-recovery prod-only): lee el mensaje del usuario pendiente persistido en
   * session_state (`_v3:pendingUserMessage`) por un turno previo que murió tras consumir el inbound
   * pero antes de enviar nada. Cuando presente y `effectiveMessage` aún es null (iter 1), el core
   * lo combina ANTES del input.message (orden Pitfall 7: CKPT-0 drain → seed → legacy combine).
   * Sandbox no lo implementa → undefined → el core usa input.message directo.
   */
  getLegacyPendingMessage?(): string | undefined

  /**
   * B2 (D-18 crash-recovery prod-only): persiste el mensaje del usuario en session_state para el
   * edge Path A 0-sends (lambda murió tras consumir el inbound pero antes de enviar nada). El
   * próximo inbound lo re-combina vía `getLegacyPendingMessage`.
   */
  savePathARollback?(turn: {
    sessionId: string
    message: string
    intentsVistos: string[]
    datosCapturados: Record<string, string>
    packSeleccionado: string | null
    accionesEjecutadas: unknown[]
  }): Promise<void>

  /** B5 (no-repetición prod-only): filtra templates ya enviados antes del send. Sandbox no filtra. */
  filterOutbound?(
    templates: ProcessedMessage[],
    ctx: { sessionId: string; conversationId: string; intent: string; inputTemplatesEnviados: string[] },
  ): Promise<ProcessedMessage[]>

  /** B4 (preload prod-only): inyecta preloadedData + agent_module marker en sesiones nuevas. Idempotente. */
  preloadOnce?(sessionId: string): Promise<void>

  /** B8 (debug prod-only): registra intent/tokens/clasificación/orquestación del turno al debug sink. */
  recordDebug?(args: { output: V4AgentOutput; turnNumber: number; totalTokens: number }): void

  // ---- OPCIONALES sandbox-only ----

  /**
   * C1 (sandbox timing): hook ANTES de invocar al agente, por iteración. El sandbox duerme
   * `simulateProdTimingMs` para abrir la ventana de interrupción; prod no lo implementa.
   */
  beforeAgentInvoke?(iteration: number): Promise<void>

  /**
   * C4 (sandbox-result, Open Question 1 RESUELTA): se invoca con el resultado FINAL del turno
   * ANTES del release del lock en el finally. El follower del sandbox long-pollea `sandbox-result`
   * y DEBE verlo antes de poder adquirir el lock — por eso va dentro del try externo, antes del
   * finally-release. Prod no lo implementa.
   */
  onResultReady?(result: TurnResult): Promise<void>
}
