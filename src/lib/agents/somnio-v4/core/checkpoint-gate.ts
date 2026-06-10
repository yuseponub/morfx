/**
 * D-06 (somnio-v4-consolidation Plan 07): factoriza el boilerplate repetido de
 * los 8 checkpoints del pipeline v4 (skip-gate por lock fields + lostLock throw
 * + emisión msg_aborted_path_a_combined en interrupt) en un helper único.
 *
 * INVARIANTE ABSOLUTO (D-06): las COLOCACIONES de los checkpoints NO se mueven —
 * la posición de cada checkpoint en el pipeline ES el contrato. Este helper solo
 * centraliza el plumbing repetido; cada caller conserva SU builder de retorno:
 *   - somnio-v4-agent.ts retorna su V4AgentOutput-passthrough
 *   - sub-loop/index.ts retorna su LoopOutcome (no_match + discriminator)
 *   - v4-production-runner.ts / engine-v4.ts drenan la pending list y reinician el loop
 *
 * El helper ENVUELVE el single-source-of-truth `checkpoint()` de
 * `@/lib/agents/interruption-system-v2/checkpoints` — NO lo reemplaza ni altera
 * su fencing-token re-check ni su fail-open (Open Question 5 del módulo). El
 * specifier ABSOLUTO `@/lib/agents/interruption-system-v2/*` es obligatorio
 * (Pitfall 8): los vi.mock de 6+ suites interceptan por specifier de módulo —
 * cambiarlo rompería los mocks.
 *
 * LostLockError vive en el messaging-adapter (no en interruption-system-v2). El
 * helper SIEMPRE lanza LostLockError en lostLock (sin opción de suprimirlo —
 * T-cons-08): la defensa zombie no se debilita al factorizar. El `lostLockLabel`
 * permite preservar byte-exacto el sufijo disambiguador que cada site del
 * runner/engine usaba (`ckpt_6_pre_send_loop_main`, `_pending_templates`, etc.),
 * que NO son valores de CheckpointId pero sí el `at_step` que el catch emite en
 * `zombie_lambda_exit`.
 */

import {
  checkpoint,
  type CheckpointId,
  type CheckpointOptions,
} from '@/lib/agents/interruption-system-v2/checkpoints'
import type { LockChannel, LockHandle } from '@/lib/agents/interruption-system-v2/lock'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { LostLockError } from '@/lib/agents/engine-adapters/production/v4-messaging-adapter'

/**
 * Resultado del gate:
 *   - 'no_lock'              → skip-gate: faltan lock fields (sandbox / pre-v4 /
 *                              fail-open). El caller continúa como si el checkpoint
 *                              no existiera (equivale al `if (lockHandle && ...)` actual).
 *   - 'proceed'              → checkpoint pasó; el caller continúa el pipeline.
 *   - { interrupted: ckptId } → un follower escribió la interrupt key; el caller
 *                              construye SU return / drain con este discriminator.
 *
 * En lostLock el helper NO retorna: lanza LostLockError (el outer catch del
 * caller emite `zombie_lambda_exit`).
 */
export type CheckpointGateResult = 'no_lock' | 'proceed' | { interrupted: CheckpointId }

/**
 * Corre un checkpoint factorizado: skip-gate → checkpoint() → lostLock throw →
 * detección de interrupt (+ emit opcional).
 *
 * @param interruptEmit  Si se provee, al detectar interrupt emite
 *   `msg_aborted_path_a_combined` con ESTE payload (replicar EXACTO el del site
 *   original — agente y sub-loop lo pasan). Los sites del runner/engine NO lo
 *   pasan: ellos emiten en su propio drain (Path A combined + pending_list_combined).
 * @param lostLockLabel  Override del label que recibe LostLockError (default:
 *   `ckptId`). Los sites del runner/engine usan sufijos disambiguadores
 *   (`ckpt_6_pre_send_loop_main`, etc.) — pasarlos aquí preserva el `at_step`
 *   byte-exacto del evento `zombie_lambda_exit`.
 */
export async function runCheckpointGate(args: {
  ckptId: CheckpointId
  lockHandle: LockHandle | null | undefined
  workspaceId: string
  lockChannel: LockChannel | null | undefined
  lockIdentifier: string | null | undefined
  opts?: CheckpointOptions
  interruptEmit?: Record<string, unknown>
  lostLockLabel?: string
}): Promise<CheckpointGateResult> {
  const {
    ckptId,
    lockHandle,
    workspaceId,
    lockChannel,
    lockIdentifier,
    opts,
    interruptEmit,
    lostLockLabel,
  } = args

  // (1) skip-gate: sin lock plumbing el checkpoint no aplica (sandbox / pre-v4).
  if (!lockHandle || !lockChannel || !lockIdentifier) {
    return 'no_lock'
  }

  const ck = await checkpoint(
    ckptId,
    lockHandle,
    workspaceId,
    lockChannel,
    lockIdentifier,
    opts,
  )

  // (2) lostLock → zombie throw (defensa D-15; SIEMPRE lanza — T-cons-08).
  if (ck.lostLock) {
    throw new LostLockError(lostLockLabel ?? ckptId)
  }

  // (3) interrupt detectado → emit opcional + discriminator para el caller.
  if (!ck.proceed && ck.interrupted) {
    if (interruptEmit) {
      emitLockEvent('msg_aborted_path_a_combined', interruptEmit)
    }
    return { interrupted: ckptId }
  }

  return 'proceed'
}

/**
 * D-06: tabla declarativa single-source de las 8 colocaciones de checkpoints en
 * el pipeline v4. Documentación TIPADA — el orden y la posición de cada entry
 * reflejan el contrato real verificado en el inventario del Plan 07. Mover una
 * colocación es romper el contrato (T-cons-09): este array es la referencia
 * canónica de DÓNDE vive cada checkpoint.
 *
 * CKPT-7.N (per-template) vive en el send-adapter (V4MessagingAdapter.
 * shouldAbortBeforeTemplate en prod; loop sintético en engine-v4.ts en sandbox)
 * y NO usa runCheckpointGate — se documenta aquí para completar la tabla.
 */
export const CHECKPOINT_PLACEMENTS = [
  {
    id: 'ckpt_0_post_acquire',
    owner: 'core (hoy v4-production-runner.ts + engine-v4.ts)',
    position: 'inicio de cada iteración del restart loop, post session-resolution, pre-todo',
  },
  {
    id: 'ckpt_1_post_comprehension',
    owner: 'somnio-v4-agent.ts',
    position: 'tras comprehension, antes del state merge / guards',
  },
  {
    id: 'ckpt_2_post_state_machine',
    owner: 'somnio-v4-agent.ts',
    position: 'tras guards, antes de la resolución del sales-track state machine',
  },
  {
    id: 'ckpt_3_post_tooling',
    owner: 'sub-loop/index.ts',
    position: 'tras la tooling-call (RAG split path) — vía ckptInSubLoop; el path legacy combinado emite bajo este mismo id',
  },
  {
    id: 'ckpt_4_post_generation',
    owner: 'sub-loop/index.ts',
    position: 'tras la generation-call (RAG split path) — vía ckptInSubLoop',
  },
  {
    id: 'ckpt_5_post_compliance',
    owner: 'sub-loop/index.ts',
    position: 'tras el compliance-check (NUNCA-decir) — vía ckptInSubLoop',
  },
  {
    id: 'ckpt_6_pre_send_loop',
    owner: 'core (runner 6a pending-templates + 6b main; engine 6 main)',
    position: 'antes del send-loop; 6a (pending-templates pre-send) es prod-only, sandbox no lo necesita',
  },
  {
    id: 'ckpt_7_pre_template',
    owner: 'V4MessagingAdapter (prod) / loop sintético engine-v4.ts (sandbox)',
    position: 'per-template dentro del send (NO usa runCheckpointGate)',
  },
] as const
