# Twilio → Onurix Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisiones canónicas están en `CONTEXT.md` — este log preserva las alternativas consideradas.

**Date:** 2026-04-16
**Project:** twilio-to-onurix-migration (standalone)
**Areas discussed:** Estrategia de cutover, Naming del action type, Huérfanos del webhook R1, Alcance limpieza UI

---

## Estrategia de cutover

### Q1 — ¿Cómo secuencias los deploys del cutover?

| Option | Description | Selected |
|--------|-------------|----------|
| Dos deploys: migrar → validar → eliminar | Deploy 1 migra autos + fix bugs. Deploy 2 elimina Twilio. Doble ventana de rollback. Recomendado por Regla 6. | ✓ (Claude's discretion) |
| Single deploy: rename + eliminar todo junto | Deploy único. Rename action type + eliminar código en mismo PR. Más rápido pero sin validación intermedia. | |
| Single deploy con dual-write temporal | Onurix primero, fallback Twilio, luego eliminar. Máxima seguridad pero complejidad alta. | |

**User's choice:** "lo que tu recomiendes. la idea es eliminar twilio sin mas"
**Notes:** Claude recomendó opción 1 (dos fases) pero ajustó: Fase A no es deploy de código sino script standalone + validación humana; Fase B es el PR único de limpieza. Equilibra simplicidad ("eliminar Twilio sin más") con Regla 6 (proteger 740 SMS/30d activos).

### Q2 — ¿Cómo migras las 3 automatizaciones activas?

| Option | Description | Selected |
|--------|-------------|----------|
| UPDATE DB directo (jsonb_set) | Migración SQL versionada, idempotente, rollback con migration. | |
| Script standalone que el usuario corre | Script Node.js con admin client. Ejecutado una vez por usuario. | ✓ |
| Edición manual desde UI | Usuario edita cada automation manualmente. | |

**User's choice:** Script standalone
**Notes:** Ninguna.

### Q3 — ¿Feature flag durante cutover?

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, flag con default false | `USE_ONURIX_FOR_SEND_SMS` env var. Rollback instantáneo sin redeploy. | |
| No, cutover directo tras validación | Onurix ya validado. Rollback vía revert git / reverse script. | ✓ (Claude's discretion) |

**User's choice:** "no entiendo esto. muy tecnico decide tu"
**Notes:** Claude decidió NO feature flag por escala trivial (4 autos, 1 workspace Somnio) y validación previa sólida.

### Q4 — ¿Validación manual pre-cutover con SMS reales?

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, disparar trigger manual de cada automation | Ejecutar las 3 automations con datos de prueba, validar SMS llega vía Onurix. | ✓ |
| No, confiar en tests A/B/C + monitoreo post-cutover | Monitorear `sms_messages` post-deploy, si 30 min sin errores = ok. | |
| Solo validar 1 de las 3 automations | Disparar la más crítica, aceptar las otras 2 por similitud. | |

**User's choice:** "las corremos y luego tu me ayudas a validar"
**Notes:** Decisión: disparamos las 3 automations con triggers reales y Claude asiste al usuario en la validación (logs + `sms_messages.provider='onurix'`).

---

## Naming del action type

### Q1 — ¿Rename `send_sms_onurix` → `send_sms`?

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, rename a `send_sms` — más limpio (Recommended) | Un solo action type. Script también migra REPARTO. UI muestra 'Enviar SMS'. | ✓ |
| No, mantener `send_sms_onurix` explícito | Prefijo de proveedor para flexibilidad futura. | |

**User's choice:** Sí, rename a `send_sms`
**Notes:** Ninguna.

### Q2 — ¿Cómo queda el menú de acciones tras eliminar Twilio?

| Option | Description | Selected |
|--------|-------------|----------|
| Mantener categoría 'SMS' (eliminar 'Twilio') (Recommended) | Categoría 'Twilio' desaparece. 'Enviar SMS' en categoría 'SMS'. | ✓ |
| Fusionar SMS en categoría 'Mensajería' | Agrupar con Template WhatsApp en categoría superior. | |
| Tú decides | Claude revisa catálogo en planning. | |

**User's choice:** Mantener categoría 'SMS'
**Notes:** Ninguna.

### Q3 — ¿Rename afecta a REPARTO?

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, también se actualiza REPARTO | Script rename TODAS las 4 automations. Cero legacy en DB. | ✓ |
| Solo las 3 de Twilio, dejar `send_sms_onurix` vivo | Executor acepta ambos types. Menos riesgo en REPARTO pero queda dual. | |

**User's choice:** "no sabia que reparto usa onurix. se supone que onurix no estaba funcionando hasta ahorita. el caso es que todo quede consistente entonces actualizalo"
**Notes:** Investigar en research-phase cuándo REPARTO fue configurado con `send_sms_onurix` — no era conocido por el usuario. Script las trata igual por consistencia.

---

## Huérfanos del webhook R1

### Q1 — ¿Qué hacemos con el webhook `/api/webhooks/twilio/status`?

| Option | Description | Selected |
|--------|-------------|----------|
| Eliminar inmediatamente en deploy de limpieza (Recommended) | Webhook roto desde 2026-03-16 sin impacto. Twilio reintentará 24-48h y se calla. | ✓ |
| Dejar respondiendo 200 vacío (stub) hasta deleción final | Evitar 404 temporal en consola Twilio. Extra complejidad, beneficio mínimo. | |

**User's choice:** Eliminar inmediatamente
**Notes:** Ninguna.

### Q2 — ¿Backfill de los 740 SMS huérfanos?

| Option | Description | Selected |
|--------|-------------|----------|
| No, aceptar la deuda histórica (Recommended) | Twilio se elimina, nadie consultará esos registros post-cutover. Zero trabajo. | ✓ |
| Sí, llamar Twilio API para obtener status final de los 740 | Script one-off + mantener credenciales + dep 1-2h extra. | |

**User's choice:** No, aceptar deuda histórica
**Notes:** Ninguna.

### Q3 — ¿Elimino dep npm `twilio` en el mismo PR?

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, en el mismo PR de limpieza (Recommended) | Cero callers escondidos (P9). Un solo commit, cero deuda. | ✓ |
| No, esperar 1 semana post-cutover | Monitoreo conservador. Pero TS typecheck ya protege. | |

**User's choice:** Sí, en el mismo PR
**Notes:** Ninguna.

---

## Alcance limpieza UI

### Q1 — ¿Qué hacemos con el tab 'Twilio' en `/configuracion/integraciones`?

| Option | Description | Selected |
|--------|-------------|----------|
| Reemplazar por tab 'SMS' con balance + link a super-admin (Recommended) | Owner/Admin ve balance Onurix, link a recarga via super-admin. Reutiliza layout `twilio-usage.tsx`. | ✓ |
| Eliminar tab completo — SMS solo vía super-admin | Tab desaparece. Workspace admin sin visibilidad. | |
| Eliminar y no añadir tab por ahora | Tab en phase posterior. Foco solo en retirar Twilio. | |

**User's choice:** Reemplazar por tab 'SMS'
**Notes:** Ninguna.

### Q2 — `checkTwilioConfigured` + `twilioWarning` en actions-step

| Option | Description | Selected |
|--------|-------------|----------|
| Reemplazar por check `sms_workspace_config.is_active` (Recommended) | Warning real si workspace NO tiene SMS configurado. Link a configuración. | ✓ |
| Eliminar warning completamente | Sin warning, falla en runtime con notificación. Peor DX. | |

**User's choice:** Reemplazar por check real
**Notes:** Ninguna.

### Q3 — `getSmsUsage` + `getSmsUsageChart` en integrations.ts

| Option | Description | Selected |
|--------|-------------|----------|
| Adaptar a Onurix si elegimos mantener tab SMS (Recommended) | Reescribir queries para `sms_messages` + `sms_transactions` filtradas por workspace. | ✓ |
| Eliminar funciones y usar las existentes del super-admin | Reutilizar del super-admin. Posible violación de scope. | |
| Decide en planning | Claude revisa código super-admin y elige. | |

**User's choice:** Adaptar a Onurix
**Notes:** Ninguna.

---

## Claude's Discretion

- Cutover sequence (Q1 Cutover) — usuario delegó; Claude eligió 2 fases ajustadas (script + validación, luego deploy de limpieza)
- Feature flag (Q3 Cutover) — usuario delegó; Claude eligió NO flag
- Nombre exacto del script standalone y ubicación en `scripts/`
- Orden interno del PR de limpieza (commits atómicos)
- Manejo del bug R2 (eliminar junto con el form, sin fix intermedio)
- Texto exacto del warning UI y copys en español
- Ubicación final del nuevo `getSmsUsage` Onurix (integrations.ts vs sms.ts nuevo)

## Deferred Ideas

- Backfill histórico de los 740 SMS Twilio
- Retirada manual de env vars Twilio en Vercel
- Tab SMS para workspaces nuevos (onboarding SMS)
- Test E2E de trigger → action_executor → Onurix
- Features nuevas SMS (plantillas, campañas masivas, bidireccional)

---

## Cross-Phase Note (para research-phase)

**REPARTO using `send_sms_onurix`:** el usuario no sabía que REPARTO (Somnio `c24cde89-2f91-493c-8d5b-7cd7610490e8`) tenía action type `send_sms_onurix` antes de la validación Onurix del 2026-04-16. Investigar en research-phase:
- ¿Cuándo se configuró REPARTO con `send_sms_onurix`?
- ¿Ejecutó SMS reales antes del 2026-04-16? (revisar `sms_messages` con `provider='onurix'` anteriores a esa fecha)
- Si ejecutó, verificar que el balance del workspace Somnio refleja esos consumos.

Hallazgo no bloqueante para la migración — el script normaliza por consistencia.
