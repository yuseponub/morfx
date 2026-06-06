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

## ✅ Smokes IG validados en vivo 2026-06-06
- [x] **IG inbound IMAGEN** — llegó `type:image` con link lookaside (operador confirmó)
- [x] **IG inbound audio** — llegó `type:audio` con link (transcripción ahora cableada en 41-11, falta revalidar abajo)
- [x] **IG outbound IMAGEN** — JPEG real llega a IG+FB (HTTP 200, reproducido). Falla solo HEIC/>8MB → ahora con guard (41-10)
- [x] **IG nombre real** — Ruth Zapata Duarte mostró nombre real (el `@` previo era cuenta sin nombre)

## ⏳ Re-smoke en vivo de los fixes shipped (deploy e8b992b1) — operador
- [ ] **GAP-41-04 HEIC** — adjuntar foto HEIC de iPhone a un chat IG/FB → mensaje español claro tipo "Convierte la imagen a JPG/PNG", NO "Error al enviar archivo" genérico
- [ ] **GAP-41-04 >8MB** — adjuntar imagen >8MB a chat IG/FB → mensaje "...límite 8MB...", bloqueado antes de subir
- [ ] **GAP-41-04 error real** — forzar un fallo de send → toast muestra la razón real (no la constante)
- [ ] **GAP-41-04 WhatsApp intacto** — enviar imagen 9MB por WhatsApp → sigue permitido (límite 16MB sin cambios, Regla 6)
- [ ] **GAP-41-05 tipos IG** — enviar a @varixcenter: una publicación/reel compartido → `[Publicación compartida]`; respuesta a historia → `[Respuesta a tu historia]`; una reacción ❤️ → `[Reacción: ❤️]`. NUNCA burbuja vacía.
- [ ] **GAP-41-06 transcripción** — enviar nota de voz por IG → aparece transcripción bajo el player (o degrada a null sin romper)

## ⏳ Re-smoke GAP-41-07 (formato media saliente — deploy 8c95e58f) — operador
- [ ] **Audio IG mp3** — adjuntar un .mp3 a chat IG → mensaje claro "Instagram solo acepta audio AAC/M4A/WAV/MP4…" (bloqueado antes de subir)
- [ ] **Audio IG m4a/wav** — adjuntar .m4a (nota de voz iPhone) o .wav a chat IG → **se envía** (llega al DM)
- [ ] **Audio FB mp3** — adjuntar .mp3 a chat FB → **se envía** (FB es permisivo)
- [ ] **Doc IG no-PDF** — adjuntar .docx a chat IG → mensaje "Instagram solo acepta documentos PDF"
- [ ] **WhatsApp passthrough** — adjuntar .mp3/.gif por WhatsApp → sigue permitido (Regla 6)
> Nota verificada por Graph API: IG audio sí funciona con AAC/M4A/WAV/MP4 (mp3 NO); Meta inspecciona los bytes reales. FB acepta AAC/MP4/MP3/AMR/OGG/OPUS.

- [ ] **GAP-41-08 audio .mp4 round-trip** — descargar un audio de un chat (3 puntos) y re-enviarlo a IG y FB → ahora **se envía** (antes fallaba con (#100) porque se mandaba como video). Reclasificado a audio.

## ⏳ Smokes IG aún sin probar
- [ ] **IG inbound video / sticker** — enviar → manejo correcto o degradación clara
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
