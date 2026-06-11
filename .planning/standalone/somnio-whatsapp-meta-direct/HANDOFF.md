# Somnio WhatsApp → Meta Direct (migración 360dialog → Cloud API propio) — HANDOFF

**Estado:** ✅ **COMPLETADA Y VIVA — 2026-06-11.** Número en Meta Cloud API, GREEN conservado, 22 plantillas transferidas solas, provider=meta_direct, inbound/outbound verificados (delivered/read).
**Última actualización:** 2026-06-11
**Playbook general reutilizable:** `docs/onboarding/client-integration-playbook.md` (§1 WhatsApp).

## ✅ CÓMO SE HIZO REALMENTE (flujo verificado en vivo 2026-06-11)
1. NO existe "Migrate Number" para salir de 360dialog → la migración se dispara desde el **Embedded Signup de MorfX** (`/configuracion/integraciones → Conectar WhatsApp`).
2. El popup **creó una WABA NUEVA limpia** (`1658478765367601`) y migró el número — NO se reusó la "Somnio Morf" vieja (que tenía la línea de crédito 360dialog pegada e inamovible).
3. El `register` falló por **falta de método de pago en la WABA nueva**. ⚠️ El error de Meta llegó como genérico `"(#100) Invalid parameter"` con la causa real escondida en `error_data.details` ("Cannot Migrate Phone Number: ...doesn't have a payment method set up."). **Fix de código aplicado 2026-06-11:** `MetaGraphApiError` ahora captura `error_data.details` y `mapRegisterError` lo lee → futuros clientes ven "falta método de pago" directo.
4. Se agregó **tarjeta** a la WABA nueva (sí dejó, sin línea de crédito vieja) → register OK → `CONNECTED` + GREEN.
5. **Flip `whatsapp_provider='meta_direct'`** → outbound recuperado (texto delivered + plantillas read).

## ⚠️ DOWNTIME REAL (~3h) — lección crítica
El número quedó "entre proveedores" desde que se abrió el popup (Meta empieza a reclamarlo y 360dialog deja de enviar) hasta el flip. **NO esperar al register** — la ventana de bajo tráfico debe empezar **al abrir el popup**. 16 inbounds quedaron sin procesar (backlog), se atienden cuando el cliente reescriba.

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

## ✅ BLOQUEO RESUELTO (investigación 2026-06-10, fuentes abajo)
**El botón "Migrate Number" NO existe en el Hub de 360dialog para SALIR a otro BSP — y eso es correcto, no es un bug ni falta de permisos.**

360dialog tiene 6 escenarios de migración. La opción "Migrate number between WABAs" (que antes mandé a buscar) es el escenario **#2** = mover a otro WABA **DENTRO de 360dialog** (WABA destino debe tener <48h). **NO es la nuestra.**

Lo de Somnio es el escenario **#3: "Migrate to alternate BSP"** (360dialog → app Meta propia de MorfX). Doc oficial 360dialog: *"Coordinate with your new BSP or Meta to initiate the migration"* → **la migración se DISPARA DESDE EL DESTINO, no desde 360dialog.** Del lado 360dialog solo: (1) pagar facturas, (2) desactivar 2FA, (3) cancelar suscripción DESPUÉS.

**El disparador real = Embedded Signup de MorfX** (mismo popup de GoDentist FB/IG). MorfX está en el Tech Provider Program. Meta: *"Migrations between different Service Providers can now be completed using the Meta Embedded Sign-Up flow. Partners enrolled in the Tech Provider Program... must use this Hosted Embedded signup process."* Al meter el número (que ya existe en el WABA de 360dialog con 2FA off) en nuestro Embedded Signup, **Meta detecta el número y ofrece migrarlo** ahí mismo.

**Plantillas SÍ viajan (oficial):** Meta dice que en la migración vía Embedded Signup el número *"remain[s] connected... retaining the display name, quality rating, **approved templates** and Official Business Account statuses."* → Probablemente NO toque recrear las 12. (No 100% garantizado por precedente Callbell — backup ✅ listo por si acaso.)

**Ya NO hace falta esperar respuesta de soporte 360dialog** para el "dónde está Migrate" — la respuesta es: no está, va por nuestro Embedded Signup.

**Fuentes:**
- 360dialog — Migrate to alternate BSP: https://docs.360dialog.com/docs/hub/migrations/migrate-to-alternate-bsp
- 360dialog — Migrations (6 escenarios): https://docs.360dialog.com/docs/hub/migrations
- Meta — migración vía Embedded Signup retiene plantillas + 2FA off obligatorio (búsqueda oficial Meta dev docs, 2026-06-10)

## Prerrequisitos verificados (flujo alternate-BSP, lado 360dialog)
Pagar facturas pendientes → **desactivar 2FA** (obligatorio; con 2FA la migración falla) → iniciar desde Embedded Signup MorfX (destino) → tras "transferred": cancelar suscripción + pedir reembolso de fondos no usados. ⚠️ Números **COEX no se pueden migrar**.

## ⚠️ CORRECCIÓN CRÍTICA 2026-06-10 — línea de crédito 360dialog pegada (muro Callbell CONFIRMADO en vivo)
Captura del usuario en `business.facebook.com/.../billing_hub` (asset_id=1990038191949199 "Somnio Morf"): método de pago = **Línea de crédito · Predeterminado · 360dialog GmbH**, botón **"Agregar método de pago" BLOQUEADO** con tooltip *"No puedes agregar un método de pago porque estás usando una línea de crédito compartida."*

**Regla dura de Meta (confirmada, fuente abajo):** una línea de crédito, una vez pegada a un WABA, **NO se puede cambiar**; *"once a payment method is added to a WABA it can only be revoked but never fully removed."* → El WABA "Somnio Morf" está **QUEMADO** (línea 360dialog permanente, no self-serve).

**Solución (textual Meta):** *"If your previous BSP is still holding the credit line... **create a new WABA** and connect it."* → El número se migra a un **WABA NUEVO limpio**. La calificación/límite/display name/OBA **viajan con el NÚMERO** (no con el WABA). El "Somnio Morf" viejo se abandona — da igual perderlo (instinto del usuario = correcto, es la solución técnica, no capricho).

**El paso "agregar tarjeta a Somnio Morf" del runbook viejo era ERRÓNEO** — no se puede y no se debe. La tarjeta/método de pago va al **WABA NUEVO**.

**Variable abierta (verificar):** ¿MorfX como Tech Provider tiene su propia línea de crédito con Meta? Si sí → WABA nuevo la hereda (sin tarjeta). Si no → WABA nuevo necesita tarjeta propia (evidencia playbook: "Pruebas Morfx" usó tarjeta directa → MorfX probablemente NO comparte línea). Revisar Business Settings → Líneas de crédito del BM de MorfX.

**Fuente:** Meta — Share and revoke credit lines: https://developers.facebook.com/docs/whatsapp/embedded-signup/manage-accounts/share-and-revoke-credit-lines/

## Runbook Opción B (resumen — detalle en playbook §1.5)
1. (Pre) Cerrar smokes Pruebas Morfx (texto+imagen). Pagar facturas 360dialog. Ventana de bajo tráfico. Owner en MorfX.
2. Desactivar **2FA** del número.
3. Migrar **desde el Embedded Signup de MorfX** (mismo popup de GoDentist FB/IG): meter +57 310 5879824 → Meta detecta el número existente → ofrece migrarlo → registrar. (NO se inicia desde el Hub 360dialog — ahí no hay botón Migrate para esta dirección.)
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
