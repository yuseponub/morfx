# Somnio WhatsApp → Meta Direct (migración 360dialog → Cloud API propio) — HANDOFF

**Estado:** EN PROGRESO — bloqueado esperando respuesta de soporte 360dialog. **NO ejecutado aún.**
**Última actualización:** 2026-06-10
**Playbook general reutilizable:** `docs/onboarding/client-integration-playbook.md` (§1 WhatsApp).

## Goal
Migrar el número de WhatsApp de Somnio de **360dialog (BSP)** a **Meta Cloud API directo vía MorfX**, conservando el número y minimizando downtime. WhatsApp es lo único que migra (FB/IG de otros workspaces ya se hizo aparte).

## Datos grounded (de la pantalla del Hub 360dialog + DB, 2026-06-10)
- **Workspace MorfX Somnio:** `a3843b3f-c337-4836-92b5-89c58bb98490` (whatsapp_provider=`360dialog`).
- **Número:** +57 310 5879824 (`573105879824`).
- **360dialog Channel ID:** `w634OLCH` · **WABA Channel External ID:** `983414514856988`.
- **Meta WABA:** ID `1990038191949199` (nombre **"Somnio Morf"**, APPROVED, **Type: Shared**). (360dialog internal id `QdZMUAWA`.)
- **Meta Business Manager ID:** `7325654814189351` (VERIFIED) — el WABA está en **TU BM**, 360dialog es solo BSP.
- **Namespace:** `ae17f176_81fc_4ba6_886c_0065a741b03d` · **Hosting:** Cloud API hosted by Meta · **Region:** US.
- **Channel webhook actual:** `https://morfx-sandy.vercel.app/api/webhooks/whatsapp` (así llega el inbound hoy).
- **Suscripción 360dialog:** Regular 49 EUR/mes · **Saldo:** 37.91 € (reembolsable post-migración).
- **Cancelación 360dialog:** 30 días de aviso hasta fin de mes (NO instantáneo).
- **Cuenta:** somnio / general@somniocolombia.com · Display name: "Somnio".
- **Banco de pruebas directo:** "Pruebas Morfx", phone_number_id `1134593926408063` (ya en meta_direct).

## Decisiones tomadas
- **OPCIÓN B** elegida (no hay número de repuesto): NO pre-crear el WABA a mano; el WABA destino se crea durante la migración; **recrear las plantillas DESPUÉS** y aceptar que las **notificaciones proactivas** se pausan hasta re-aprobación (el bot sigue respondiendo inbound con texto libre).
- Intento de crear WABA manual en Meta Business Settings → **cancelado** (el wizard exige un número y no se puede usar el de Somnio porque está en 360dialog).
- La **línea de crédito de 360dialog** NO se puede desasociar self-serve (confirmado por su bot). Camino = migrar el número.
- **Plantillas (HSM) probablemente NO viajan** → recrear. Respaldadas ✅ (ver `somnio-templates-backup.json`, 12 plantillas).
- **quick_replies + agent_templates** son internos de MorfX → **sobreviven** la migración (no son HSM).

## GATE de madurez (Phase 39 `whatsapp-outbound-templates` = human_needed)
- ✅ **Template por directo PASÓ** (probado en Pruebas Morfx — era el error `131047`).
- ⏳ Pendiente confirmar: envío de **texto** + **imagen** por directo en Pruebas Morfx.

## 🚩 BLOQUEO ACTUAL
No aparece la opción **"Migrate Number"** en el Hub de 360dialog (en el detalle del canal solo está "Cancel subscription" en Danger Zone). Doc oficial dice que está en **"Manage WhatsApp Business Account → localizar WABA → toggle Migrate Number → Migrate number between WABAs"**, pero el usuario no la encuentra.
**Pregunta abierta enviada a soporte 360dialog (humano):**
1. ¿Dónde exactamente está "Migrate Number" en el Hub?
2. ¿El flujo deja el número en **MorfX directo** o sigue en 360dialog? (si sigue en 360dialog, NO sirve).
3. Alternativa: ¿iniciar desde el Embedded Signup de MorfX (2FA off + facturas pagadas)?

## Pasos oficiales verificados (docs 360dialog)
**Flujo "Migrate number between WABAs" (Hub):** Manage WhatsApp Business Account → localizar WABA → toggle **Migrate Number** → "Migrate number between WABAs" → login Meta Business Portfolio → **crear WABA destino** → completar campos → registrar número vía **Embedded Signup** → verificar status "transferred" en WhatsApp Manager. ⚠️ Números **COEX no se pueden migrar** entre WABAs.
**Prerrequisitos (flujo alternate-BSP):** pagar facturas pendientes → **desactivar 2FA** (obligatorio) → coordinar con Meta/nueva app para iniciar → cancelar suscripción → pedir reembolso de fondos no usados.

## Runbook Opción B (resumen — detalle en playbook §1.5)
1. (Pre) Cerrar smokes Pruebas Morfx (texto+imagen). Pagar facturas 360dialog. Ventana de bajo tráfico. Owner en MorfX.
2. Desactivar **2FA** del número.
3. Migrar (Hub 360dialog **o** Embedded Signup MorfX — según respuesta de soporte) → crear WABA destino → registrar número.
4. Confirmar "transferred".
5. `UPDATE workspaces SET whatsapp_provider='meta_direct' WHERE id='a3843b3f-c337-4836-92b5-89c58bb98490';`
6. Verificar live (inbound + bot responde).
7. **Recrear las 12 plantillas** + enviar a aprobación (re-aprobación suele ser rápida si el contenido es idéntico).
8. Agregar **método de pago propio** al WABA nuevo (ya sin línea de crédito 360dialog).
9. **Cancelar suscripción 360dialog** (30 días aviso) + **pedir reembolso** de 37.91 €.
**Rollback** (antes del paso 6 OK): migrar de vuelta a 360dialog + re-flip `360dialog` + reactivar 2FA.

## Próximos pasos al retomar
1. Revisar respuesta de soporte 360dialog (dónde está Migrate + destino = app propia).
2. Decidir trigger: Hub Migrate vs Embedded Signup MorfX.
3. Cerrar GATE (smokes texto+imagen en Pruebas Morfx).
4. Agendar ventana y ejecutar runbook Opción B.

## ⚠️ NO hacer todavía
- NO darle "Cancel subscription" en el Hub antes de migrar.
- NO meter el número de Somnio en el wizard manual de crear WABA.
- NO migrar sin haber recreado/respaldado plantillas y sin ventana de bajo tráfico (Regla 6 — Somnio vende, 4 agentes vivos).
