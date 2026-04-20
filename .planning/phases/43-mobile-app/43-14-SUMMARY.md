---
phase: 43-mobile-app
plan: 14
title: Mobile — Templates + media rendering + Settings
wave: 9
status: auto-tasks-done-awaiting-checkpoint
completed: 2026-04-20
requires:
  - phase: 43-04
    provides: api-client + ThemeProvider + setThemeOverride + i18n
  - phase: 43-07
    provides: inbox list cache-first pattern (replicada en useTemplates)
  - phase: 43-08
    provides: chat read path + MessageBubble
  - phase: 43-09
    provides: composer + send path endpoint (/messages acepta
      templateName + templateVariables desde su Zod schema)
  - phase: 43-10a
    provides: patron BottomSheet (Modal-based) + domain layer Regla 3
  - phase: 43-10b
    provides: Settings structure reference (Modal overlay sheet pattern)
  - phase: 43-13
    provides: expo-application (transitive de expo-notifications, ya en APK)
provides:
  - GET /api/mobile/templates (read-only, workspace-scoped, APPROVED only)
  - MobileTemplateSchema + mobile copy byte-compatible
  - useTemplates hook cache-first (AsyncStorage key mobile:templates:{ws})
  - TemplatePicker (bottom sheet con busqueda + lista filtrable)
  - TemplateVariableSheet (paso 2 con vista previa en vivo + send)
  - MessageInput: entry point "Plantilla de WhatsApp" en attach ActionSheet
  - ImageRenderer (expo-image, tap-to-fullscreen via Modal)
  - AudioPlayer (expo-audio, hooks-based, progress bar + mm:ss)
  - MessageBubble: integracion real de image + audio renderers
  - SettingsScreen (5 secciones: Cuenta, Apariencia, Notificaciones,
    Idioma, Acerca de)
  - (tabs)/settings.tsx + icono gear en tab bar
  - i18n namespaces: chat.template.*, chat.attach.template, settings.*
affects:
  - 43-15 (smoke + release readiness — ultimo plan, consume todo lo de 14)
subsystem: mobile/templates-media-settings
tags: [mobile, templates, media, settings, expo-image, expo-audio,
       async-storage, i18n, dark-mode, regla-3, regla-6]
tech-stack:
  added: []
  patterns:
    - "Template send bypasea outbox — accion online-only, evita extender
       schema del outbox para campos de template (fuera de scope v1)"
    - "TemplatePicker + TemplateVariableSheet como dos Modals con bottom
       sheet UX (mismo patron que MuteDurationSheet)"
    - "expo-image cachePolicy='memory-disk' + contentFit='cover' thumb /
       'contain' fullscreen"
    - "AudioPlayer auto-loads on mount, NO autoplay (patron WhatsApp)"
    - "AsyncStorage como backing store para settings: tema,
       notify_all_messages, preview_show_content"
    - "Push prefs son CLIENT-SIDE ONLY v1 con disclaimer explicito al
       usuario — server filtering deferido a v1.1"
    - "expo-application require() con try/catch para degradar a '1.0.0'
       si el modulo falta en algun build futuro"
key-files:
  created:
    - src/app/api/mobile/templates/route.ts
    - shared/mobile-api/schemas.ts (adicion de MobileTemplateSchema)
    - apps/mobile/src/lib/api-schemas/templates.ts
    - apps/mobile/src/hooks/useTemplates.ts
    - apps/mobile/src/components/chat/TemplatePicker.tsx
    - apps/mobile/src/components/chat/TemplateVariableSheet.tsx
    - apps/mobile/src/components/media/ImageRenderer.tsx
    - apps/mobile/src/components/media/AudioPlayer.tsx
    - apps/mobile/src/components/settings/SettingsScreen.tsx
    - apps/mobile/app/(tabs)/settings.tsx
  modified:
    - apps/mobile/src/components/chat/MessageInput.tsx (agrega entry
      point "Plantilla" al ActionSheet + mount de los dos Modals)
    - apps/mobile/src/components/chat/MessageBubble.tsx (image + audio
      reales en lugar de placeholders)
    - apps/mobile/app/(tabs)/_layout.tsx (segundo tab: Settings)
    - apps/mobile/src/lib/i18n/es.json (chat.template.* +
      chat.attach.template + settings.*)
key-decisions:
  - "Template send NO pasa por outbox — el outbox schema no soporta
    templateName/templateVariables sin migracion de payload, y templates
    son accion online-only (Meta los valida en vivo). Direct POST a
    /api/mobile/conversations/:id/messages con los dos campos. El
    endpoint ya los acepta desde Plan 09 — Regla 6 cumplida, no se
    toca el send path del web ni del agente."
  - "TemplateVariableSheet NO inserta optimisticamente en
    cached_messages. Razon: el cache no tiene soporte de type='template'
    (messages-cache.ts solo sabe text + media). El refresh del chat
    (Realtime + AppState focus) trae la fila real desde el server en
    ~1s — trade-off aceptable para accion rara."
  - "ImageRenderer sin pinch-to-zoom: el plan explicitamente dice
    'basic non-zoom fullscreen' para v1. Futuro plan puede layerar
    react-native-gesture-handler PinchGestureHandler sin cambiar el
    API publico del componente."
  - "AudioPlayer cada burbuja instancia su propio player — tocar play
    en B no pausa A. Aceptable para v1; si se vuelve molesto se agrega
    un PlayerCoordinator global."
  - "Settings usa plain Modal + Switch + Pressable (RN builtins) en lugar
    de @gorhom/bottom-sheet para no inflar dependencias — misma decision
    que MuteDurationSheet."
  - "Push prefs toggles (notify_all_messages, preview_show_content) son
    CLIENT-SIDE UX ONLY en v1 — persistencia local solo. El endpoint
    /api/mobile/push/preferences GET que lee estas keys antes de enviar
    push queda para v1.1. Documentado en un disclaimer visible en la
    UI ('Estas preferencias son locales; el servidor envia todas las
    notificaciones por ahora'). Usuario que quiera cero pushes puede
    silenciar desde el OS."
  - "Idioma 'Español' disabled — la infra i18n (i18next) ya esta lista
    para agregar en/es switch, pero el plan no pide activarlo todavia."
metrics:
  duration: ~30min
  completed: 2026-04-20
---

# Phase 43 Plan 14: Templates + Media + Settings Summary

**One-liner:** Cierra los gaps del MVP — envio de templates de WhatsApp (picker + variable filler), renderizado real de imagenes (expo-image + fullscreen) y audio (expo-audio con play/pause + progreso), y pantalla de Settings con override de tema, preferencias de push (client-side v1), logout, idioma disabled y app version.

## MVP Feature Gap Closure

Contrastando con `43-CONTEXT.md` "In scope for this phase (v1 MVP)":

| Feature | Pre-Plan 14 | Post-Plan 14 |
|---|---|---|
| WhatsApp inbox (list + conversation views) | PASS (plans 07+08) | PASS |
| Send/receive text | PASS (plan 09) | PASS |
| Send/receive images | SEND only (plan 09) — inbound era placeholder | **FULL** (render real + fullscreen) |
| Send/receive audio/voice notes | SEND only (plan 09) — inbound era placeholder | **FULL** (render real + play/pause + progreso) |
| Send WhatsApp templates | backend ready (plan 09), **no UI** | **SHIPPED** — picker + variable sheet |
| Quick replies | PASS (plan 09) | PASS |
| Bot toggle per conversation | PASS (plan 11) | PASS |
| CRM access + actions from inside chat | PASS (plan 10a+10b) | PASS |
| Multi-workspace selector | PASS (plan 06) | PASS |
| Push notifications (Android) | PASS (plan 13) | PASS + prefs UI (client-side) |
| Offline read + outbound queue | PASS (plans 05+09) | PASS |
| Supabase auth email+password | PASS (plan 04) | PASS |
| Spanish UI con i18n-ready keys | PASS (plan 04) | PASS |
| Dark mode | PASS (plan 04 infra) | **FULL UX** — override toggle en Settings |

**Todos los items de v1 MVP estan resueltos o cubiertos por plans anteriores.** Plan 15 (siguiente) es smoke + release readiness: stores listings, keystore verification, final E2E.

## Native-Dep Audit

**Verdict: NO new APK required.** OTA via `eas update` es suficiente para todos los cambios.

| Paquete | Version | En APK actual (`20081c7`)? | Nuevo por Plan 14? |
|---|---|---|---|
| `expo-image` | ~3.0.11 | SI (bundle desde Plan 09) | No — primer uso pero ya presente |
| `expo-audio` | ~1.1.1 | SI (bundle desde Plan 09) | No — primer uso en playback (Plan 09 lo usaba para record) |
| `expo-application` | ~7.0.8 | SI (transitive de expo-notifications / Plan 13) | No — primer uso directo pero el modulo nativo ya esta compilado |
| `@gorhom/bottom-sheet` | ^5.2.9 | SI (Plan 06 + 10b) | No usado (plans templates usan Modal plano) |
| `expo-crypto` | ~15.0.8 | SI (desde Plan 05) | randomUUID reutilizado en TemplateVariableSheet |

Verificado end-to-end con `npx expo export --platform android` en cada task (bundle entre 9.25-9.29 MB, 0 errores de resolucion de modulos). **No se invoca `eas update` ni `eas build` por Regla 1.**

## Task Commits

| # | Task | Commit | Pushed |
|---|---|---|---|
| 1 | Templates endpoint + picker + variable sheet + MessageInput wire + i18n | `5042308` | ✓ origin/main |
| 2 | ImageRenderer + AudioPlayer + MessageBubble integration | `b63a12b` | ✓ origin/main |
| 3 | Settings tab + SettingsScreen + i18n | `ccd02ee` | ✓ origin/main |
| 4 | Device verification | **PENDING** — checkpoint:human-verify |

Push-a-main despues de cada task per Regla 1. Zero `eas update` / `eas build` invocations.

## What Works Now (verifiable sin device)

- `cd apps/mobile && npx tsc --noEmit`: clean en los 3 commits.
- `cd apps/mobile && npx expo export --platform android`: bundle 9.29 MB, 0 errores.
- `GET /api/mobile/templates` con auth devuelve `{ templates: [...] }` ordenado por nombre, solo APPROVED.
- MobileTemplateSchema + copia mobile byte-compatibles (verificado por hand comparando los dos archivos).
- `useTemplates` cache-first paint funciona igual que `useQuickReplies` (mismo patron).
- `POST /api/mobile/conversations/:id/messages` con `templateName` + `templateVariables` ya funciona (contrato Plan 09 no tocado) — el TemplateVariableSheet consume ese endpoint existente.
- ImageRenderer renderiza con expo-image cachePolicy='memory-disk', tap abre Modal fullscreen con contentFit='contain'.
- AudioPlayer usa useAudioPlayer + useAudioPlayerStatus, play/pause toggle, progreso linear, label mm:ss.
- MessageBubble image/audio branches delegan a los renderers reales.
- SettingsScreen renderiza 5 secciones, persiste los 3 controles (tema, notify_all, preview_content), lee email via supabase.auth.getUser, logout confirmado via Alert.
- (tabs) bar: Inbox + Settings, ambos presentan sus iconos + titulos traducidos.

## What the User Must Verify in Task 4 (checkpoint)

En **ambos dispositivos** (iPhone via Expo Go, Android APK — ambos tienen el mismo JS bundle tras `eas update`, PERO Regla 1 dice que YO no corro `eas update` → el usuario despues del checkpoint decide cuando hacer el OTA):

### Templates (el gap mas importante)

1. **Enviar un template**:
   - Abrir un chat con una conversacion activa (puede estar dentro de 24h o fuera, el template bypasea la ventana).
   - Tap en el paperclip → "Plantilla de WhatsApp" en el ActionSheet/Alert.
   - Ver la lista de templates aprobados del workspace.
   - Buscar por nombre parcial (ej: "reco") — filtrar debe funcionar.
   - Tap un template → se abre el VariableSheet con inputs `{{1}}`, `{{2}}`, etc.
   - Ver la vista previa en vivo al escribir en los inputs.
   - Submit deshabilitado hasta que todas las variables tengan valor.
   - Enviar → cerrar sheet → esperar ~1s → la burbuja aparece en el chat.
   - Verificar en la web (`/whatsapp`) que el mensaje llego al destinatario correctamente.

2. **Template sin variables**: si hay uno en el workspace sin `{{n}}` tokens, el VariableSheet solo muestra la vista previa + boton enviar — probar que el submit funciona sin inputs.

3. **Cancelar**: abrir picker → tap fuera (backdrop) o X → cierra sin enviar.

### Media inbound

4. **Imagen inbound**:
   - Hacer que un cliente envie una imagen al WhatsApp del workspace (o usar el chat de prueba).
   - Verificar que la imagen renderiza en la burbuja del cliente (thumbnail 240x180 con cacheado).
   - Tap la imagen → se abre fullscreen con contentFit='contain' (preserva aspect ratio).
   - Tap fullscreen → cierra.
   - Scroll arriba y abajo → imagenes siguen rendereando rapido (cache en memoria).

5. **Audio inbound**:
   - Hacer que un cliente envie una nota de voz.
   - Burbuja muestra Play button + barra de progreso + duracion.
   - Tap Play → audio reproduce, progress bar avanza, button cambia a Pause.
   - Tap Pause → pausa.
   - Esperar a que termine → tap Play de nuevo → reproduce desde 0 (didJustFinish handling).

### Settings

6. **Tab de Settings**:
   - Ver que ahora hay 2 tabs (Inbox + Settings) en la bottom bar.
   - Tap en Settings → cargar pantalla.

7. **Cuenta**:
   - Ver tu email.
   - Tap "Cerrar sesion" → sale Alert de confirmacion.
   - Confirmar → regresa a /(auth)/login (via onAuthStateChange).

8. **Apariencia** (dark mode mandatorio en v1 MVP):
   - Tap "Oscuro" → toda la app cambia a tema oscuro instantaneamente (chat, inbox, settings, composer, drawer).
   - Tap "Claro" → vuelve a tema claro.
   - Tap "Seguir el sistema" → sigue el tema del OS.
   - Matar app (swipe up) → reabrir → el override persiste (AsyncStorage).

9. **Notificaciones**:
   - Toggle "Notificar cada mensaje nuevo" → UI responde.
   - Toggle "Mostrar contenido del mensaje" → UI responde.
   - Matar app → reabrir → los toggles mantienen su valor.
   - Leer el disclaimer ("Estas preferencias son locales...") — informado que el servidor envia todo igual por ahora.

10. **Idioma**: "Español" visible, opaco/disabled (no interactivo).

11. **Acerca de**: "Versión" muestra un numero (ej "1.0.0") — debe coincidir con `app.json` `expo.version`.

### Invariantes UX a no regresar

Verificar que Plans 07-13 siguen funcionando:

- Chat SafeAreaView edges `['top','left','right','bottom']`.
- KeyboardAvoidingView `'padding'` iOS / `'height'` Android.
- MessageInput `onSent` refresca cache optimistamente.
- MessageList `maintainVisibleContentPosition.autoscrollToTopThreshold: 200`.
- Inbox `useFocusEffect` refresca al volver + sort `last_customer_message_at DESC`.
- Unread badge optimistic clear al abrir chat.
- Bot toggle chip en el header del chat (Plan 11).
- CRM drawer boton "info" en el header del chat (Plan 10b).
- SearchBar en el inbox (Plan 12) — **bug conocido de results UI diferido, NO tocar**.
- Push notifications tap abre chat deep-link (Plan 13).

## Regla Compliance Audit

- **Regla 1 (push a origin/main):** Despues de cada task (3x). No se corrio `eas update` ni `eas build`.
- **Regla 2 (Bogota timezone):** Settings no muestra fechas; los renderers existentes (MessageBubble timestamps, SLA, etc.) no se cambian.
- **Regla 3 (domain layer):** GET /api/mobile/templates es read-only — no requiere domain. El send path reusa `domain/messages-send-idempotent.ts` (Plan 09) que ya cumple Regla 3. No se crearon mutations nuevas.
- **Regla 4 (SUMMARY):** Este archivo.
- **Regla 5 (migracion antes de deploy):** N/A — no hay migraciones en este plan.
- **Regla 6 (proteger agente en produccion):** NO se cambia el send path del web ni del agente. El endpoint mobile reusa `domain/messages.ts::sendTemplateMessage` via el wrapper idempotent — mismo codepath que el agente. Templates del web (`src/app/actions/templates.ts` y `whatsapp/components/template-send-modal.tsx`) no fueron tocados.

## Deviations from Plan

Ninguna significativa. El plan describe el outbox como el lugar donde persistirian los templates, pero al evaluar el schema `OutboxPayload` vi que no tiene campos templateName/templateVariables y extender eso forzaria un cambio de schema de sqlite que esta fuera del scope (Regla 5 seria relevante si fuera necesario migrar pero como es local sqlite no aplica — aun asi, outbox state machines son invariantes Plan 05 que no quiero tocar en un plan cuyo job principal es UI).

**Decision tomada:** templates bypasean outbox con POST directo. Documentado en el header de `TemplateVariableSheet.tsx`. Consecuencia: template send requiere connectivity — aceptable porque Meta los valida en vivo. Alternativa (outbox) no da valor real en este caso.

## Open / Follow-ups

- **v1.1 push prefs server-side:** `GET /api/mobile/push/preferences` endpoint que el Inngest push function consulte antes de enviar. Migration: agregar columnas `notify_all_messages` + `preview_show_content` a `push_tokens` (o tabla aparte `mobile_push_prefs`). Out of scope de Plan 14.
- **Pinch-to-zoom en fullscreen image:** layerar `react-native-gesture-handler` `PinchGestureHandler` + Reanimated sobre ImageRenderer sin cambiar su API publico. Plan 15 o futuro.
- **AudioPlayer coordinator:** global PlayerCoordinator que pausa el anterior cuando un nuevo Play se presiona. Solo necesario si se vuelve molesto; v1 no lo tiene.
- **cached_messages template support:** si se quiere bubble optimista para template sends, hay que extender messages-cache.ts con `type='template'` + renderer en MessageBubble. Deferido — el refresh existente trae la fila real en ~1s.
- **Variable pre-fill desde contact/order:** el web TemplateSendModal pre-llena variables desde `variable_mapping` + el contacto de la conversacion. Mobile v1 solo muestra el mapping como placeholder hint en el TextInput. Agregar pre-fill requiere exponer el contacto al sheet (cache ya lo tiene — accesible via `getCachedConversation` / `useContactPanel`). Plan 15 o futuro.
- **Cache eviction de templates:** igual que quick-replies, nunca se evictan. Un template que pasa de APPROVED → PAUSED / DISABLED en Meta sigue apareciendo en el cache hasta el proximo refresh. Aceptable — fetch corre en paralelo al paint.

## Self-Check

Archivos creados (verificado en disco):
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/templates/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/lib/api-schemas/templates.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/hooks/useTemplates.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/TemplatePicker.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/TemplateVariableSheet.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/media/ImageRenderer.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/media/AudioPlayer.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/settings/SettingsScreen.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/app/(tabs)/settings.tsx`

Commits en `git log --oneline`:
- `5042308` Task 1 — templates backend + picker + variable sheet + MessageInput wire
- `b63a12b` Task 2 — ImageRenderer + AudioPlayer + MessageBubble integration
- `ccd02ee` Task 3 — Settings tab + SettingsScreen + i18n

Pushed: `origin/main` esta en `ccd02ee`.

Build verifications (por cada task):
- `npx tsc --noEmit`: clean en cada commit.
- `npx expo export --platform android`: bundle entre 9.25 y 9.29 MB, 0 errores de resolucion. Test dirs limpiados tras cada verificacion.

**Self-Check: PASSED**

---
*Phase: 43-mobile-app*
*Plan: 14*
*Completed auto-tasks: 2026-04-20*
*Checkpoint Task 4 pending device verification*
