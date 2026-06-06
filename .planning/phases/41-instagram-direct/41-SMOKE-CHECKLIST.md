# Phase 41 — Smoke Checklist (post-cutover, live)

Estado a 2026-06-06. Workspace Varixcenter `c6621640-ba67-43de-9f05-905f09a6dc8f`.
Páginas: Varix Center FB+IG = `528898033801678` (IG @varixcenter, ig_account_id `17841405433849344`); Somnio/Pruebas FB = `714615171734964`.
instagram_provider Varixcenter = `meta_direct` (flipeado 2026-06-05).

## ✅ Ya validado en vivo
- [x] IG-03 Conectar Instagram (login dedicado + token refresh) — @varixcenter conectado
- [x] IG inbound texto — "Ola" ruteó a Varixcenter (A1: entry.id==ig_account_id; A2: webhook dispara)
- [x] IG outbound texto — responder DM funciona (meta_direct vía Graph API)
- [x] FB Messenger inbound texto — Varix + Somnio (tras fix GAP-41-03 callback www + resolveByPageId channel)
- [x] FB outbound texto — salió 2026-06-05 03:21 (status=sent)

## ⏳ Smokes IG pendientes
- [ ] **IG inbound IMAGEN** — enviar imagen por DM a @varixcenter → aparece en inbox como imagen (burbuja con media, no solo texto)
- [ ] **IG inbound audio / nota de voz** — enviar nota de voz → se maneja (transcripción si está cableada, o al menos no rompe; ver `messages.transcription`)
- [ ] **IG inbound video / sticker** — enviar → manejo correcto o degradación clara
- [ ] **IG outbound IMAGEN** — responder con imagen desde el inbox → llega al DM (sendInstagramImage + caption como follow-up text)
- [ ] **IG outbound tipos no soportados** — si el inbox permite, verificar error claro (no spinner infinito)
- [ ] **IG nombre real** — DM desde una cuenta de IG CON nombre configurado → muestra el nombre, no el @ (la cuenta de prueba anterior no tenía nombre, por eso salió @)
- [ ] **IG-05 ventana 24h** — en un hilo con último inbound >24h (o backdatear `last_customer_message_at`), intentar enviar → BLOQUEADO con mensaje español "Ventana de 24h cerrada..."

## ⏳ Smokes FB pendientes (paridad)
- [ ] **FB inbound imagen** — imagen por Messenger → aparece como imagen
- [ ] **FB outbound imagen** — responder con imagen → llega

## 🐞 Bugs/deuda aparte (NO son smokes — requieren su propio fix)
- [ ] **contact_id null** (transversal FB+IG): las conversaciones de canal no crean contacto CRM porque `normalizePhone('ig-/fb-...')` da null → `resolveOrCreateContact` falla. Verificado: 0 contactos `fb-/ig-`, conversaciones con `contact_id` null. Fix = standalone `channel-contact-resolution` (decisión de diseño A/B/C; recomendado C: guardar identificador crudo + ocultar en UI el "teléfono" no numérico). Toca domain layer + canal en prod (Regla 0/6).
- [ ] (opcional) UI: ocultar "teléfono" `ig-/fb-` en el panel de contacto.

## 🏁 Cierre de fase
- [ ] Cuando pasen los smokes IG/FB → `/gsd-verify-work 41` para marcar Fase 41 completa (hoy `[~]` en ROADMAP).
- [ ] Quitar Varixcenter de meta_direct si fuera necesario revertir: `UPDATE workspaces SET instagram_provider='manychat' WHERE id='c6621640-...'`.

## Gaps resueltos esta sesión (referencia)
- GAP-41-01 (plan 41-09): getPageToken data[0] → página del workspace.
- GAP-41-02 (migración `20260605200000_relax_uq_meta_page_facebook_only.sql`): uq_meta_page parcial WHERE channel='facebook'.
- GAP-41-03 (fix `resolveByPageId` + test): `.eq('channel','facebook')` — FB Messenger roto cuando la página también tiene IG.
- Config Meta: callback del producto `page` corregido apex→www.
