# SMS Time Window — Diferenciación Transaccional vs Marketing

**Gathered:** 2026-04-17 21:30 COT
**Status:** Ready for research/planning
**Type:** Standalone (no phase number)
**Trigger:** Usuario observó bloqueo 9:18 PM de SMS transaccional de pipeline logística. Descubrimos durante debug de `sms-onurix-not-delivered` que el guard actual bloquea TODO SMS fuera 8AM-9PM sin distinguir naturaleza del mensaje.

<domain>
## Phase Boundary

El guard actual en `src/lib/domain/sms.ts:88` aplica `isWithinSMSWindow()` (8 AM - 9 PM Colombia) a **todos** los SMS. Esto es excesivamente restrictivo: la normativa colombiana solo restringe horario a SMS promocionales/publicitarios — los transaccionales están exentos y pueden enviarse 24/7.

**Impacto actual (observado):**
- Automation de pipeline logística "OFI INTER" disparada 9:18 PM (post-ventana) → SMS bloqueado.
- Automation de Shopify "confirmar compra por WhatsApp" → cualquier cliente que compre de noche no recibe el SMS de confirmación.
- Todos los SMS de estatus de envío, guías, OTP, etc. pierden disponibilidad 11 horas al día.

**Objetivo del standalone:**

1. Diferenciar SMS transaccionales (24/7 permitido) vs SMS marketing (sujeto a ventana).
2. Mantener el guard para SMS marketing (default conservador, compliant).
3. Bypass automático del guard para SMS disparados por automations internas (status de pedido, despacho, confirmación, OTP, etc.) — son inherentemente transaccionales por naturaleza del trigger.
4. Permitir opt-in explícito para marcar un SMS como marketing cuando aplica (campañas masivas futuras).

**Fuera de alcance:**
- Segmentación por día (weekday vs weekend vs festivo) — el guard actual no lo hace; queda igual en esta fase.
- Cola de retry para marketing fuera de ventana — fuera de scope, se puede agregar después.
- Clasificación ML automática de contenido — innecesario; la clasificación viene del origen (automation=transactional, campaign UI=marketing).
- Revisar detalladamente todos los tipos de SMS existentes — se asume que TODO lo actual es transaccional (confirmación, despacho, status); no hay UI de campañas marketing todavía.

</domain>

<decisions>
## Implementation Decisions — a definir en /gsd-discuss-phase

### Decisión 1: Cómo identificar el tipo de SMS

**Opción A — Nuevo parámetro explícito `smsType: 'transactional' | 'marketing'`:**
- Cambio breaking en signature de `domainSendSMS(ctx, params)`.
- Caller debe decidir explícitamente cada vez.
- Más robusto pero requiere tocar todos los call sites.

**Opción B — Derivar del campo `source` ya existente:**
- `sms_messages.source` actualmente tiene valores `'automation'`, `'campaign'` (según migración).
- Regla: `source='automation'` → transactional → bypass guard. `source='campaign'` → marketing → aplica guard. `source IS NULL` → transactional (default seguro para compatibilidad).
- Zero nuevos parámetros, menos fricción.
- Requiere auditar qué sources existen hoy.

**Opción C — Bypass siempre (quitar guard por completo):**
- Dejar responsabilidad al usuario al configurar la automation.
- Simple pero riesgoso si algún día se agregan campañas marketing.

**Recomendación tentativa:** Opción B — el `source` ya está ahí y refleja naturalmente la distinción. Validar en discuss-phase si todos los `source` actuales son efectivamente transaccionales.

### Decisión 2: Default del guard para fuentes desconocidas/NULL

- **Conservador:** aplicar guard (potencial bloqueo de transaccionales si source no fue seteado). Falso negativo seguro: compliant.
- **Permisivo:** bypass guard (riesgo si alguien envía marketing sin setear source). Falso positivo de SMS marketing fuera de horario: no compliant.

**Recomendación:** Permisivo + hacer `source` mandatory en todos los callers internos (auditar y forzar). Defenderse por contrato, no por guard.

### Decisión 3: UI / superficie de usuario

¿El usuario debería ver en la UI de automation builder una opción explícita tipo "este SMS es marketing" con checkbox que default=false? O quedarse implícito (todo lo del builder es transaccional por definición, marketing solo viene de un módulo futuro de campañas)?

**Recomendación:** implícito por ahora. No hay UI de campañas. Agregar checkbox el día que exista módulo campañas.

### Decisión 4: ¿Renombrar/documentar `isWithinSMSWindow()`?

La función debería seguir existiendo (útil para módulo campañas futuro) pero renombrarse a algo más explícito: `isWithinMarketingSMSWindow()` para dejar claro cuál es su caso de uso.

### Decisión 5: Backfill del campo `source` en rows existentes

Rows actuales en `sms_messages` tienen `source='automation'` por default (según migración 20260316100000_sms_onurix_foundation.sql:94). ¿Hay algún row con source NULL? Confirmar y backfillear si hace falta.

</decisions>

<files_affected>
## Files Affected (tentative)

- `src/lib/domain/sms.ts` — modificar guard (líneas 87-93) para condicionar según type/source.
- `src/lib/sms/utils.ts` — `isWithinSMSWindow()` posible rename.
- `src/lib/automations/action-executor.ts` — si Opción A, cada llamada a `domainSendSMS` pasa type explícito. Si Opción B, ya está seteando `source: 'automation'`.
- `src/app/actions/sms.ts` — cualquier call site desde server actions.
- `src/inngest/functions/*` — cualquier inngest que envíe SMS.
- (Si aplica) nueva migración para hacer `source` NOT NULL con default.
- (Si aplica) script de backfill para rows viejos.
</files_affected>

<regulatory_context>
## Contexto Regulatorio (Colombia)

**Normativa aplicable:**
- CRC Resolución 5111 de 2017 (modif. por 5372/2018) — regula mensajes comerciales no solicitados.
- Ley 1581 de 2012 (Habeas Data) — consentimiento para comunicaciones comerciales.
- SIC — Superintendencia de Industria y Comercio enforcement.

**Distinción clave:**

| Tipo | Definición | Restricción horaria |
|---|---|---|
| **Transaccional / Utilidad** | Mensaje derivado de una transacción o relación preexistente iniciada por el usuario. Incluye: confirmación de compra, OTPs, notificaciones de despacho/entrega, alertas de seguridad, recordatorios de citas, status de servicio. | **Sin restricción** — 24/7 permitido. El usuario solicitó la relación. |
| **Comercial / Marketing** | Mensaje de promoción, publicidad, oferta no solicitada individualmente. | Lunes-Viernes 7 AM - 9 PM; Sábado 8 AM - 8 PM; Domingo y festivos **prohibido**. |

**Nota:** el código actual (8 AM - 9 PM todos los días) es incluso más conservador que la norma para marketing — no diferencia sábado ni domingo. Si se va a mantener para campañas futuras, vale la pena ajustar al detalle regulatorio correcto.

</regulatory_context>

<pending_from_sms_onurix_not_delivered>
## PENDIENTES de `.planning/debug/sms-onurix-not-delivered.md` (NO son scope de esta fase pero mantener visibles)

Este standalone salió DE ese debug. La sesión original queda abierta con estos hilos sueltos:

### 1. Task C — test directo Onurix (transitory vs persistent)
- **Status:** pending al cerrar contexto. Script listo: `scripts/test-onurix-sms.mjs` (o `diagnose-onurix-sms.mjs` para re-query de dispatch_id específico).
- **Pregunta:** el `Error:1081 Destino inaccesible` del 17/04 20:35 COT fue un evento único (celular sin señal/trunk caído) o es persistente?
- **Cómo cerrarlo:** correr el script mañana después de 8 AM (o bypass del guard) con celular prendido. Si llega → caso cerrado. Si falla 1081 otra vez → escalar Onurix soporte con dispatch_id como evidencia.
- **Decisión del usuario en discuss-phase siguiente:** si queremos hacer este test ANTES del standalone marketing-vs-transactional o después (no es bloqueante, solo curiosity).

### 2. Billing policy para SMS fallidos
- **Hecho observado:** SMS falló con `Error:1081` y Onurix reportó `credits: "0"` (no cobraron externamente). Pero MorfX cobró 97 COP al workspace.
- **Gap de política:** no está decidido si en fallo se debe (A) dejar el cobro ("pagas por intento") o (B) refundar automáticamente.
- **Acción pendiente:** abrir discusión aparte. No es scope de este standalone ni del debug original — es un tercer standalone potencial: `sms-refund-on-failure`.
- **Importancia:** P2 — no bloquea producción pero genera reclamos eventuales de usuarios.

### 3. Auditoría de los 12 archivos Twilio pendientes
- **Referencia:** `.planning/standalone/twilio-to-onurix-migration/AUDIT-MANDATE.md` — auditoría de 12 archivos con referencias Twilio residuales que quedó pendiente post-cutover del 2026-04-16.
- **Relación con este standalone:** baja. Pero si la auditoría revela paths alternos de envío SMS (scripts de migración, utilidades), esos también deben respetar la distinción transactional/marketing.
- **Acción pendiente:** ejecutar la auditoría como tarea aparte cuando se pueda.

### 4. Columna `provider_state_raw` (resuelto HOY 2026-04-17)
- **Status:** **COMPLETADO**. Commit `97af3c7`.
- Migración `20260418030000_sms_provider_state_raw.sql` aplicada en producción.
- `sms-delivery-check.ts` ya persiste el state textual de Onurix.
- Script diagnóstico `scripts/diagnose-onurix-sms.mjs` disponible para queries ad-hoc por dispatch_id.
- Próximos SMS fallidos tendrán motivo exacto en DB sin necesidad de consultas manuales.

### 5. Row huérfano (SMS original del debug)
- El row `sms_messages.id = a5a7ce83-ef45-4c33-a511-d68b6de86c2e` se quedó con `provider_state_raw = NULL` porque el inngest corrió antes del deploy del fix.
- **Backfill opcional:** `UPDATE sms_messages SET provider_state_raw = 'Error:1081 msg: Destino inaccesible' WHERE id = 'a5a7ce83-ef45-4c33-a511-d68b6de86c2e';` — 1 línea, deja evidencia completa para post-mortem.

</pending_from_sms_onurix_not_delivered>

<references>
## Referencias

- Debug session que originó este standalone: `.planning/debug/sms-onurix-not-delivered.md`
- Migración SMS Onurix foundation: `supabase/migrations/20260316100000_sms_onurix_foundation.sql`
- Migración billing atomic RPC: `supabase/migrations/20260418011321_sms_atomic_rpc.sql`
- Migración observabilidad state raw: `supabase/migrations/20260418030000_sms_provider_state_raw.sql`
- Domain SMS entry point: `src/lib/domain/sms.ts:72-231` (sendSMS)
- Guard actual a modificar: `src/lib/domain/sms.ts:87-93` + `src/lib/sms/utils.ts:isWithinSMSWindow`
- Standalone hermano (billing atomic): `.planning/standalone/sms-billing-atomic-rpc/`
- Standalone hermano (migración twilio→onurix): `.planning/standalone/twilio-to-onurix-migration/`
- CLAUDE.md Regla 5: migración antes de código en producción
- CLAUDE.md Regla 1: push a Vercel tras cambios de código
- Regla 3: mutaciones por domain layer (aplicable al modificar `sendSMS`)
</references>

<next_command>
Siguiente: `/gsd-research-phase` para investigar el estado actual de `source` en `sms_messages`, confirmar call sites de `domainSendSMS`, y validar que la auditoría del campo no reveló usos inesperados. Luego `/gsd-plan-phase` para atomizar.
</next_command>
