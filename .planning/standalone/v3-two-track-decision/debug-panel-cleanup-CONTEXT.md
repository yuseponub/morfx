# Debug Panel v3 Cleanup — Post Two-Track Refactor

## Motivacion

Despues del refactor two-track decision (tt-01, tt-02), el debug panel tiene secciones obsoletas que muestran datos del pipeline viejo. Necesita reflejar la nueva arquitectura: Sales Track + Response Track.

## Archivo a modificar

`src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx`

## Cambios necesarios

### 1. Contexto Raw (ContextoRawSection) — Agregar datos two-track

**Actualmente muestra en `_lastTurn`:**
- turnNumber, intent, classification, orchestration, ingestDetails, stateAfter

**Debe mostrar en `_lastTurn`:**
- turnNumber, intent, classification, **salesTrack**, **responseTrack**, ingestDetails, stateAfter
- Quitar `orchestration` (redundante con salesTrack/responseTrack)

Datos disponibles en DebugTurn:
```typescript
salesTrack?: { accion?: string; reason: string; enterCaptura?: boolean }
responseTrack?: { salesIntents: string[]; infoIntents: string[]; totalMessages: number }
```

### 2. Intent & Decision (IntentDecisionSection) — Simplificar

**Quitar:** El bloque "Decision / Orchestration" (lineas 406-427) — ya esta cubierto por Pipeline > ST/RT.

**Dejar:** Solo Intent (intent + confidence + reasoning) + Categoria (classification.category + reason).

**Renombrar seccion** de "Intent & Decision" a "Intent" (ya no hay decision aqui).

### 3. Ingest & Timers (IngestTimersSection) — Limpiar action badge

**Quitar:** El badge que muestra `ingest.action` con colores silent/respond (lineas 542-553). Ingest siempre retorna 'respond' ahora, el badge no aporta info.

**Dejar:** System event badge (`ingest.systemEvent`), captura badge, y ambos timers.

### 4. Pipeline badge en seccion header — Actualizar

**Actualmente:** El badge de la seccion Pipeline muestra `classification.category` (RESPONDIBLE/SILENCIOSO/HANDOFF).

**Mejor:** Mostrar el resultado del sales track (la accion o "sin accion"). El category del clasificador ya se ve en la seccion Intent.

Propuesta: si `salesTrack.accion` existe, mostrar la accion. Si no, y responseTrack tiene mensajes, mostrar "info". Si 0 mensajes, mostrar "silencio".

## Datos disponibles (DebugTurn fields)

```typescript
// Ya existentes
intent?: IntentInfo                    // intent, confidence, reasoning
classification?: DebugClassification   // category, reason, rulesChecked
orchestration?: DebugOrchestration     // templatesCount, nextMode, shouldCreateOrder, etc
ingestDetails?: DebugIngestDetails     // action, systemEvent, timerSignal
stateAfter: SandboxState               // all state after turn

// Nuevos (tt-02)
salesTrack?: { accion?: string; reason: string; enterCaptura?: boolean }
responseTrack?: { salesIntents: string[]; infoIntents: string[]; totalMessages: number }
```

## Scope

- Solo UI del debug panel (1 archivo)
- Zero cambios a tipos, engine, o agente
- Backward compatible (older sessions sin salesTrack/responseTrack siguen funcionando)
