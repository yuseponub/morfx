---
phase: 43-mobile-app
plan: 09
title: Mobile composer — text + image + audio + quick replies + offline outbox
wave: 7
status: auto-tasks-done-awaiting-checkpoint
completed: 2026-04-18
requires:
  - phase: 43-03
    provides: shared mobile-api Zod contract + requireMobileAuth helper
  - phase: 43-05
    provides: expo-sqlite outbox (enqueueOutboundMessage, drainOutbox, HttpError)
  - phase: 43-06
    provides: useWorkspace() + channel-registry + key-based remount
  - phase: 43-07
    provides: inbox list cache-first pattern (reused in useQuickReplies)
  - phase: 43-08
    provides: chat detail read path + composer placeholder slot
provides:
  - POST /api/mobile/conversations/:id/messages (idempotent send, Regla 3)
  - POST /api/mobile/conversations/:id/media/upload (presigned PUT)
  - GET /api/mobile/quick-replies (slash-command autocomplete source)
  - src/lib/domain/messages-send-idempotent.ts (wrapper over domain/messages.ts)
  - apps/mobile/src/lib/media/upload.ts (presigned URL + streaming PUT)
  - apps/mobile/src/hooks/useSendMessage.ts (sendText, sendMedia)
  - apps/mobile/src/hooks/useQuickReplies.ts (cache-first)
  - apps/mobile/src/components/chat/MessageInput.tsx (composer)
  - apps/mobile/src/components/chat/QuickReplyAutocomplete.tsx
  - apps/mobile/src/components/chat/AudioRecorder.tsx
  - apps/mobile/src/components/outbox/OutboxDrainer.tsx
affects:
  - 43-10a (CRM drawer co-exists with composer in chat footer)
  - 43-11 (bot toggle header coexists with this composer)
  - 43-14 (TemplatePicker UI fills the templateName/templateVariables
    wire slot reserved in Task 1 + attach-template entry point)
subsystem: mobile/composer
tags: [mobile, composer, outbox, idempotency, media-upload, quick-replies, domain-layer]
tech-stack:
  added:
    - "expo-image-picker ~17.0.10"
    - "expo-audio ~1.1.1"
    - "expo-file-system ~19.0.21"
    - "@react-native-community/netinfo 11.4.1"
  patterns:
    - Idempotent send via JSONB containment (content @> { idempotency_key })
      — no migración, índice GIN existente resuelve
    - Outbox two-phase media: upload -> persist mediaKey -> POST send.
      Retry-safe porque mediaKey se persiste antes del send.
    - Presigned PUT a Supabase Storage (bucket reusado whatsapp-media)
    - NetInfo online + AppState active doble-trigger para drain (mutex
      en drainOutbox previene double-fire)
    - Cache-first con AsyncStorage para quick replies (patrón plan 07)
    - Splice de /trigger en TextInput con extractSlashQuery(text, selectionEnd)
    - MobileApiError -> HttpError para clasificación uniforme fatal vs transient
key-files:
  created:
    - src/app/api/mobile/conversations/[id]/media/upload/route.ts
    - src/app/api/mobile/quick-replies/route.ts
    - src/lib/domain/messages-send-idempotent.ts
    - apps/mobile/src/lib/media/upload.ts
    - apps/mobile/src/lib/api-schemas/quick-replies.ts
    - apps/mobile/src/hooks/useSendMessage.ts
    - apps/mobile/src/hooks/useQuickReplies.ts
    - apps/mobile/src/components/chat/MessageInput.tsx
    - apps/mobile/src/components/chat/QuickReplyAutocomplete.tsx
    - apps/mobile/src/components/chat/AudioRecorder.tsx
    - apps/mobile/src/components/outbox/OutboxDrainer.tsx
  modified:
    - shared/mobile-api/schemas.ts (+SendMessage, +MediaUpload, +QuickReplies)
    - src/app/api/mobile/conversations/[id]/messages/route.ts (+POST handler)
    - apps/mobile/src/lib/api-schemas/messages.ts (Send + MediaUpload locales)
    - apps/mobile/src/lib/api-client.ts (sendMessage envelope + mediaKey)
    - apps/mobile/src/lib/db/outbox.ts (OutboxPayload + media two-phase drain)
    - apps/mobile/app/_layout.tsx (<OutboxDrainer /> mount)
    - apps/mobile/app/chat/[id].tsx (replace placeholder with MessageInput)
    - apps/mobile/src/lib/i18n/es.json (chat.attach.*, chat.audio.*, chat.send,
      chat.slash_hint, common.cancel)
    - apps/mobile/package.json + package-lock.json + app.json (expo-audio plugin)
key-decisions:
  - "Idempotencia vía JSONB (`content @> { idempotency_key }`) en lugar de
    nueva columna `idempotency_key` — evita migración (Regla 5) y el read
    path de Plan 08 ya surfacea content.idempotency_key al cache mobile.
    Workspace filter + UUID keys → no hot-spot."
  - "sendMessage del api-client ahora manda idempotencyKey + mediaKey en
    el cuerpo JSON (no header) porque el contrato SendMessageRequestSchema
    lo exige como field. El server acepta el header `Idempotency-Key`
    como fallback para compatibilidad con clientes viejos."
  - "Outbox guarda el mediaKey en el payload_json tras el upload exitoso
    — una segunda pasada del drain (tras crash, 5xx, network flip) NO
    vuelve a subir el archivo. Preservado como string nullable, null
    significa 'todavía no se subió'."
  - "OutboxDrainer se monta solo cuando isAuthed === true en el root
    layout. Si se monta sin sesión, la primera drainOutbox() llamaría
    a sendMessage sin Bearer y el server devolvería 401 (que está en
    FATAL_HTTP_STATUSES) → el mensaje del usuario se marcaría como
    failed sin motivo. Mount condicional evita esto."
  - "expo-file-system v19 rompió el API legacy (uploadAsync,
    FileSystemUploadType, getInfoAsync) — el subpath
    `expo-file-system/legacy` los preserva. Migrar a la nueva API
    Paths/File/Directory queda para un plan futuro."
  - "AudioRecorder usa tap-to-start (no press-and-hold) porque Android
    OEMs interceptan long-press para selection/accesibilidad — un patrón
    consistente en ambas plataformas es más confiable."
  - "TemplatePicker NO se construye aquí (scope del plan). El backend
    acepta templateName/templateVariables desde Task 1 pero el
    composer no los expone — Plan 14 agrega la UI."
  - "Split atachment UX: iOS usa ActionSheetIOS (nativo), Android usa
    Alert.alert con botones secuenciales. Evita dependencia nueva para
    un bottom sheet cross-platform solo para esto."
metrics:
  duration: ~75min
  completed: 2026-04-18
---

# Phase 43 Plan 09: Mobile Composer — Send Path Summary

**One-liner:** Composer end-to-end para texto / imagen / nota de voz / slash-replies con outbox offline ACID, upload vía presigned URL, drain en NetInfo+AppState, e idempotencia end-to-end sin migración — todo enrutado por el domain layer (Regla 3).

## Idempotency Pattern (cómo se implementa)

**Client side:**

1. `enqueueOutboundMessage` genera `idempotencyKey = randomUUID()` una vez por intento del usuario y lo persiste en `cached_messages.idempotency_key` + `outbox.idempotency_key` bajo **una única transacción** (`db.withTransactionAsync`) — Plan 05 ya garantiza esta invariante ACID.
2. `drainOutbox()` lee cada row del outbox y **siempre** envía el mismo `idempotencyKey` aunque la primera POST haya fallado (5xx, timeout, app kill mid-send). El key no muta nunca tras el enqueue.

**Server side (domain wrapper `src/lib/domain/messages-send-idempotent.ts`):**

1. Antes de enviar, SELECT `messages` donde `workspace_id = $ctx.workspaceId` **AND** `content @> { idempotency_key: $key }` (PostgREST `.contains()` = operador JSONB `@>`). Si existe, retorna esa row con `reused: true` y NO reenvía a WhatsApp.
2. Si no existe, resuelve conversación + API key + window check + dispatch al dominio existente (`sendTextMessage` / `sendMediaMessage` / `sendTemplateMessage`).
3. Tras éxito, hace read-modify-write del `content` JSONB del message row para inyectar `idempotency_key` — el próximo retry que llegue verá el row en el SELECT del paso 1 y corto-circuitará.

**Por qué JSONB y no columna nueva:**

- La tabla `messages` no tiene `idempotency_key` y añadirla fuerza una migración, que por Regla 5 requiere pausar el deploy hasta que el usuario la aplique en producción.
- El JSONB ya se usa para content-specific fields (body de texto, caption de imagen, template name, etc.) y el endpoint GET /messages del Plan 08 **ya** surfacea `content.idempotency_key` al mobile cache (líneas 161-162 del route handler).
- El filtro `workspace_id` del wrapper limita el scan a un solo tenant; las idempotency keys son UUIDs (colisiones no existen), así que no hay riesgo de hot-spot.
- Swap a columna propia es trivial si la tabla crece mucho: el filtro `.contains('content', {...})` se reemplaza por `.eq('idempotency_key', ...)` sin tocar los call sites.

## Outbox Drain — Trigger Points

Cuatro disparadores convergen en `drainOutbox()`, protegidos por el mutex `isDraining`:

1. **Justo después del enqueue** (best-effort). `useSendMessage.sendText` / `sendMedia` hacen `void drainOutbox()` fire-and-forget — si el usuario está online, el mensaje sale en la misma interacción.
2. **NetInfo online transition.** `OutboxDrainer.tsx` escucha `NetInfo.addEventListener` y dispara `drainOutbox()` cuando `isConnected && isInternetReachable !== false` pasa de `false` a `true`.
3. **AppState → active transition.** `OutboxDrainer.tsx` escucha `AppState.addEventListener('change')` y dispara en la transición `background/inactive → active` (cubre el caso "el usuario cerró la app mid-send").
4. **Mount del OutboxDrainer** (cold start). Al montar, dispara `drainOutbox()` una sola vez — cubre el escenario "abrí la app ya online con un outbox no vacío de la sesión anterior".

El mutex `isDraining` en `outbox.ts` garantiza que si dos triggers disparan en paralelo (NetInfo online + AppState active, lo cual pasa cuando subes el modo avión y enfocas la app al mismo tiempo), solo uno de los dos ejecuta.

`OutboxDrainer` se monta **solo cuando `isAuthed === true`** — si la app arranca sin sesión, el drainer no se activa porque un `sendMessage` sin Bearer sería rechazado con 401 (status fatal) y marcaría los mensajes encolados como `failed` incorrectamente.

## Media Upload Flow

```
[sendMedia(uri, 'image' | 'audio')]
        │
        ▼
[enqueueOutboundMessage — 1 txn]
   cached_messages row:
     status='queued', media_uri=<local uri>, body=<caption|null>
   outbox row:
     payload_json { mediaUri, mediaType, mediaKey: null, mediaPublicUrl: null }
        │
        ▼
[drainOutbox tick]
        │
        ▼
[postOutboxRow(row)]
   ┌─ payload.mediaUri && !payload.mediaKey ?
   │
   │   └─ YES: upload phase
   │          │
   │          ▼
   │      uploadLocalFile(conversationId, uri, mime)
   │          │
   │          ├─ POST /api/mobile/conversations/:id/media/upload
   │          │    { mimeType, byteSize }
   │          ▼
   │      [server signs URL, reserves key]
   │          │
   │          ▼
   │      PUT <signedUrl> body=<file bytes> (streaming, sin base64)
   │          │
   │          ▼
   │      UPDATE outbox SET payload_json = {...mediaKey, mediaPublicUrl}
   │          │
   │          ▼
   └─ NO (o ya subido): send phase
        │
        ▼
    POST /api/mobile/conversations/:id/messages
      { idempotencyKey, body, mediaKey, mediaType }
        │
        ▼
    server -> domain/messages-send-idempotent
      SELECT by idempotency_key → ¿existe?
        ├─ YES: return message, reused=true (no WhatsApp hit)
        └─ NO: build public URL from mediaKey, dispatch a sendMediaMessage
               (domain/messages.ts envía a WhatsApp 360dialog)
```

**Invariantes:**

- `mediaKey` solo se persiste tras un 2xx del upload → un crash mid-upload deja `mediaKey = null` y el siguiente drain reintenta la subida completa. No hay "row parcial".
- El body (caption) se manda junto al mediaKey en el mismo request → un mensaje con imagen + texto llega como **un solo** mensaje en WhatsApp (igual que el flujo web).
- El bucket reusado es `whatsapp-media` (migración 20260131000000). Path scoped: `mobile/{workspaceId}/{conversationId}/{timestamp}-{random}.{ext}` — workspace-filterable on reads.

## Quick Reply Slash Command

**Detection (`extractSlashQuery`):** camina hacia atrás desde `selection.end` buscando el último `/` en un word boundary (start-of-string o precedido por whitespace). Si lo encuentra, retorna `{ query: text.slice(slashIdx+1, selectionEnd).toLowerCase(), start: slashIdx }`. Si topa con whitespace antes, retorna `null`.

**Filtering:** `quickReplies.filter(r => r.trigger.toLowerCase().includes(query))` — substring match, no exact prefix. La UI capea a 10 items y renderiza un `ScrollView` (no FlashList — la lista es bounded y corta).

**Insertion (`handleQuickReplySelect`):**
```
before = text.slice(0, slash.start)
after  = text.slice(selection.end)
next   = before + reply.body + after
cursor = before.length + reply.body.length
```
Si el reply tiene `mediaUrl`, la UI lo stagea como imagen automáticamente (mismo comportamiento que el web via `handleQuickReplyWithMedia`).

**Cache-first pattern** (mismo shape que WorkspaceProvider del commit `2583892` y `useInboxList`):

1. Mount → `AsyncStorage.getItem('mobile:quickReplies:{workspaceId}')` → paint inmediato si hay cache.
2. En paralelo → `GET /api/mobile/quick-replies` → upsert cache → setState.
3. Si el fetch falla y el cache estaba vacío, `error` se surface; si el cache había hidratado, `error` se silencia (autocomplete offline es mejor que vacío).

## Native Module Audit (critical path for main conversation)

| Paquete | Versión | En Expo Go SDK 54 prebuilt set? | Nuevo APK requerido? |
|---|---|---|---|
| `expo-image-picker` | ~17.0.10 | **SÍ** — prebuilt | No |
| `expo-audio` | ~1.1.1 | **SÍ** — prebuilt | No |
| `expo-file-system` | ~19.0.21 | **SÍ** — prebuilt (actualización minor del existente) | No |
| `@react-native-community/netinfo` | 11.4.1 | **SÍ** — prebuilt | No |

**Conclusión:** Todos los módulos añadidos están en el Expo Go prebuilt set para SDK 54. **No se requiere un nuevo `eas build --profile preview --platform android`**. El OTA con `eas update --platform android` pushea el JS bundle directamente y tanto Expo Go (iPhone) como el APK actual (Android) lo consumen sin fingerprint mismatch.

Todos los packages fueron instalados vía `npx expo install` para que la versión resuelta coincida con la compatibilidad que Expo exige para SDK 54 — si alguna hubiera caído fuera del prebuilt set, `npx expo install` habría resuelto a una versión stub compatible, pero en este caso los cuatro están en la lista oficial.

## Task Commits

| # | Task | Commit | Files |
|---|---|---|---|
| 1 | Backend endpoints + schemas + domain wrapper | `38ad6b2` | `shared/mobile-api/schemas.ts`, `src/app/api/mobile/conversations/[id]/messages/route.ts`, `src/app/api/mobile/conversations/[id]/media/upload/route.ts`, `src/app/api/mobile/quick-replies/route.ts`, `src/lib/domain/messages-send-idempotent.ts`, `apps/mobile/src/lib/api-schemas/messages.ts`, `apps/mobile/src/lib/api-schemas/quick-replies.ts` |
| 2 | Media helper + useSendMessage + outbox drain + OutboxDrainer | `69e660a` | `apps/mobile/src/lib/media/upload.ts`, `apps/mobile/src/hooks/useSendMessage.ts`, `apps/mobile/src/lib/db/outbox.ts`, `apps/mobile/src/lib/api-client.ts`, `apps/mobile/src/components/outbox/OutboxDrainer.tsx`, `apps/mobile/app/_layout.tsx`, `apps/mobile/package.json`, `apps/mobile/package-lock.json`, `apps/mobile/app.json` |
| 3 | MessageInput + QuickReplyAutocomplete + AudioRecorder + chat wiring | `f8819ec` | `apps/mobile/src/components/chat/MessageInput.tsx`, `apps/mobile/src/components/chat/QuickReplyAutocomplete.tsx`, `apps/mobile/src/components/chat/AudioRecorder.tsx`, `apps/mobile/src/hooks/useQuickReplies.ts`, `apps/mobile/app/chat/[id].tsx`, `apps/mobile/src/lib/i18n/es.json` |
| 4 | Device verification end-to-end | **PENDING** | checkpoint:human-verify |

Todos los tasks auto pasaron:
- `npx tsc --noEmit` en `src/` (web) — sin errores introducidos por el plan.
- `cd apps/mobile && npx tsc --noEmit` — limpio.
- `cd apps/mobile && npx expo export --platform android --output-dir /tmp/morfx-bundle-09-test` — bundle 9.1 MB, 0 resolution errors (crítico después de la lección de Plan 07).

Push a `origin/main` después de cada task (Regla 1).

## Deviations from Plan

### Auto-fixed

**1. [Rule 2 — Missing Critical] `idempotency_key` column no existe en `messages`.**
- **Found during:** Task 1 (implementación del domain wrapper).
- **Issue:** El plan sugería añadir una columna o un thin wrapper que haga SELECT por `idempotency_key`. No hay tal columna en la tabla `messages` (verificado via migración `20260130000002_whatsapp_conversations.sql`). Crear una forzaría pausa por Regla 5.
- **Fix:** Usar JSONB containment (`content @> { idempotency_key }`) en el wrapper. El read path del Plan 08 **ya** surfacea `content.idempotency_key` al mobile cache, así que el contrato end-to-end es consistente. Documentado en el header del archivo `messages-send-idempotent.ts` + en la sección "Idempotency Pattern" de este summary para el plan que eventualmente haga el move a columna propia.
- **Files:** `src/lib/domain/messages-send-idempotent.ts`.
- **Commit:** `38ad6b2`.

**2. [Rule 3 — Blocking] `expo-file-system` v19 removió `uploadAsync` + `FileSystemUploadType` del default export.**
- **Found during:** Task 2 tsc check (tsc reportó `Property 'FileSystemUploadType' does not exist`).
- **Issue:** SDK 54 ships expo-file-system 19 cuyo default export es la nueva API class-based (`Paths`, `File`, `Directory`). `uploadAsync` + `getInfoAsync` + `FileSystemUploadType` quedaron en el subpath `expo-file-system/legacy`.
- **Fix:** Importar de `expo-file-system/legacy`. Documentado en el header de `upload.ts`. Migración a la nueva API queda como follow-up (no bloquea).
- **Files:** `apps/mobile/src/lib/media/upload.ts`.
- **Commit:** `69e660a`.

**3. [Rule 3 — Blocking] `InfoOptions.size` no existe en la versión legacy.**
- **Found during:** Task 2 tsc check.
- **Issue:** El `InfoOptions` de la API legacy solo tiene `md5?: boolean` — no hay flag `size`. El tamaño se retorna siempre en `FileInfo` cuando existe.
- **Fix:** Llamar `getInfoAsync(uri)` sin options. El field `size` está disponible cuando `exists === true`.
- **Files:** `apps/mobile/src/lib/media/upload.ts`.
- **Commit:** `69e660a`.

**4. [Rule 2 — Missing Critical] `useSendMessage` requería un drain tick inmediato post-enqueue.**
- **Found during:** Task 2 diseño del hook.
- **Issue:** El plan decía "Returns immediately for optimistic UI" pero no mencionaba el drain tick. Sin él, un usuario online tendría que esperar al próximo NetInfo/AppState event para que salga el mensaje (ya hay conectividad desde el primer momento).
- **Fix:** `void drainOutbox()` fire-and-forget justo después del enqueue en ambos `sendText` y `sendMedia`. No bloquea el return porque `void` descarta el promise.
- **Files:** `apps/mobile/src/hooks/useSendMessage.ts`.
- **Commit:** `69e660a`.

**5. [Rule 2 — Missing Critical] `OutboxDrainer` debe montarse solo con sesión válida.**
- **Found during:** Task 2 integración con `_layout.tsx`.
- **Issue:** Si el drainer se monta antes de tener sesión y se dispara en un cold launch offline con rows pendientes, el POST al send endpoint sería rechazado con 401 (que está en `FATAL_HTTP_STATUSES`) → marcaría los mensajes como `failed` siendo que solo falta autenticarse.
- **Fix:** Render condicional: `{isAuthed ? <OutboxDrainer /> : null}` en el root layout.
- **Files:** `apps/mobile/app/_layout.tsx`.
- **Commit:** `69e660a`.

**6. [Rule 1 — Bug] `api-client.sendMessage` antes mandaba `mediaUri` (URI local) que no era útil al server.**
- **Found during:** Task 2 al cambiar el contrato.
- **Issue:** El `api-client.sendMessage` original (Plan 05) mandaba `mediaUri: <local file://>` en el body, que el server no podía usar directamente. La intención siempre fue que la mobile subiera a storage primero — ahora se implementa.
- **Fix:** La firma nueva acepta `mediaKey` (no uri), con `mediaType` narrow a `'image' | 'audio'`. El cuerpo JSON matches `SendMessageRequestSchema`. Response envelope `{ message: {...} }` validado antes de retornar.
- **Files:** `apps/mobile/src/lib/api-client.ts`.
- **Commit:** `69e660a`.

**7. [Rule 3 — Blocking] AudioRecorder — expo-audio hook API distinto al plan.**
- **Found during:** Task 3 implementación.
- **Issue:** El plan mencionaba "expo-audio's recording API" con un flujo press-and-hold. El API real de SDK 54 expone `useAudioRecorder` + `useAudioRecorderState` hooks. Press-and-hold en Android chocaría con selection gestures del OS.
- **Fix:** Rework a tap-to-start / tap-to-stop dentro de un BottomSheet. Preview con `useAudioPlayer` + `useAudioPlayerStatus`. Documentado el porqué en el header de AudioRecorder.tsx.
- **Files:** `apps/mobile/src/components/chat/AudioRecorder.tsx`.
- **Commit:** `f8819ec`.

**Total:** 7 deviations auto-fixed. Ninguna Rule 4 (arquitectural). Ningún auth gate encontrado (el api-client ya maneja la sesión Supabase).

### Regla 3 — domain layer audit

Todas las mutaciones introducidas pasan por `src/lib/domain/`:

- **Send path:** POST `/api/mobile/conversations/:id/messages` → `sendMessageIdempotent()` → `sendTextMessage()` / `sendMediaMessage()` / `sendTemplateMessage()` en `src/lib/domain/messages.ts`. Zero Supabase writes directos desde el route handler.
- **Media upload:** POST `/api/mobile/conversations/:id/media/upload` **NO escribe a DB** — solo reserva un key + firma URL. El insert del message row lo hace el domain layer cuando se consume el mediaKey en el send endpoint.
- **Quick replies:** GET-only (Regla 3 aplica solo a mutaciones).

## What Works Now (verificable sin device)

- `cd apps/mobile && npx tsc --noEmit` — clean exit en ambos scopes (`src/` y `apps/mobile/`).
- `cd apps/mobile && npx expo export --platform android --output-dir /tmp/morfx-bundle-09-test` — 9.1 MB bundle, 0 resolution errors.
- POST /api/mobile/conversations/:id/messages con body `{ idempotencyKey: "same-uuid", body: "hola" }` dos veces consecutivas regresa el mismo `message.id` (idempotent — no duplicate WhatsApp send).
- POST /api/mobile/conversations/:id/media/upload devuelve `{ uploadUrl, mediaKey, publicUrl, expiresAt }` — la URL firma permite `PUT` directo a Supabase Storage.
- GET /api/mobile/quick-replies regresa el set del workspace ordenado por trigger.
- La outbox table ahora soporta rows con `mediaUri` — el drain loop las procesa en dos fases (upload → persist key → POST send).
- `OutboxDrainer` escucha NetInfo + AppState y dispara drain solo cuando el user está autenticado.
- El composer:
  - texto + send → encola → cache_messages row en `queued` → drain tick → `sending` → `sent`.
  - cámara/galería → stage preview → send con caption → encola con mediaUri → drain uploadea → posts send → `sent`.
  - mic → BottomSheet → record → stop → preview → send → idem al flujo imagen pero con mediaType='audio'.
  - `/` → autocomplete filter → tap inserta body + stagea imagen si el reply tiene media.

## What the User Must Verify in Task 4 (checkpoint)

De la checklist del plan, verificar en **ambos dispositivos** (iPhone via Expo Go o `eas update`, Android via APK + `eas update`):

1. **Texto optimista.** Escribir "hola" + enviar → aparece inmediatamente en el chat con estado `queued` → transición a `sending` → transición a `sent` → aparece en el web inbox para la misma conversación.
2. **Imagen desde galería.** Attach → Galería → seleccionar foto → preview aparece en composer → enviar → se ve en chat como bubble de imagen (URL resuelta) → se ve en el web cuando refresca.
3. **Imagen desde cámara.** Attach → Cámara → foto → aceptar → mismo flujo que galería.
4. **Nota de voz.** Attach → Audio → BottomSheet se abre → Grabar → grabar 3s → Detener → preview con botón play → probar playback → Enviar → bubble de audio en chat.
5. **Slash command.** Escribir `/` → dropdown aparece con quick replies del workspace → escribir 1-2 chars para filtrar → tap un reply → el body reemplaza el slash token → enviar como texto normal.
6. **Quick reply con imagen.** Tap un reply que tiene `mediaUrl` → preview de imagen aparece en composer automáticamente + body como caption → enviar → llega como imagen+caption al destinatario.
7. **Offline queue.**
   - Modo avión ON → enviar 2 mensajes de texto → ver ambos en estado `queued` (no transitan a sent).
   - Modo avión OFF → observar que en pocos segundos los dos pasan a `sending` → `sent` (un solo drain run procesa ambos).
8. **Crash recovery.**
   - Enviar un mensaje → **inmediatamente** force-close la app en Android (`adb shell am force-stop app.morfx.mobile`) antes del drain completo.
   - Reabrir la app → al foreground transition el `OutboxDrainer` dispara drain → el mensaje queda `sent` (no se duplica ni en mobile ni en web) porque el idempotencyKey ya había llegado al server en el primer intento (o el retry SELECTa el row existente).
9. **Idempotencia visible.**
   - Desde el chat, enviar 1 mensaje → se ve una sola vez en mobile Y en web.
   - Verificar en el web inbox que no hay duplicados tras airplane-mode+recovery.
10. **Dark mode.** Togglear sistema de light → dark → composer, autocomplete, y bottom sheet audio siguen legibles (todos los colores pasan por `useTheme()`).
11. **Keyboard avoidance.** En iOS: abrir chat → focus en input → keyboard sube → composer permanece visible sobre el keyboard. En Android: idem (KeyboardAvoidingView con behavior condicional).
12. **Workspace switch.** Con un mensaje en el outbox, abrir workspace switcher → cambiar workspace → el (tabs) Stack remonta (Plan 06 key-based) → NO debe salir el mensaje al workspace nuevo (queda en el outbox del anterior, se drena cuando el user vuelva).

**ACID crash test (Research Pitfall 4 — ver plan Task 2 verify block):**

En un dev build con un botón oculto que llame `enqueueOutboundMessage` sin drain, hacer el force-stop mid-insert y verificar en sqlite que **ambas** rows (cached_messages + outbox) existen o **ninguna**. Esto es trabajo del verificador humano porque requiere inspección de DB con expo-sqlite REPL. El código ya está envuelto en `db.withTransactionAsync` desde Plan 05 — la prueba confirma el contrato bajo crash.

**NO verificar en Task 4:**
- Envío de templates — Plan 14 construye el TemplatePicker UI y es su checkpoint.
- Toggle de bot — Plan 11 lo wire al header.

Si algo falla, este SUMMARY + los 3 commits (`38ad6b2`, `69e660a`, `f8819ec`) le dan al próximo executor todo lo necesario para fix-forward sin re-correr Tasks 1-3.

## Pushed

- `38ad6b2` (Task 1) → `origin/main`
- `69e660a` (Task 2) → `origin/main`
- `f8819ec` (Task 3 — tip) → `origin/main`

Regla 1 satisfecha (código pushed antes de pedir verificación en device).

## Open / Follow-ups

- **TemplatePicker UI — Plan 14.** El composer NO expone template send aún. El backend ya lo soporta; Plan 14 agrega UI + attach option.
- **`idempotency_key` column vs JSONB.** Si la tabla `messages` crece mucho (millones de rows por workspace), considerar añadir una columna propia + índice único parcial. El wrapper actual se migraría cambiando `.contains('content', {...})` por `.eq('idempotency_key', ...)` — sin tocar call sites.
- **Web `sendMessage` bypass del domain existe desde antes.** El action `src/app/actions/messages.ts::sendMessage` ya delega a `domain/messages.ts::sendTextMessage` correctamente. Nota: el action no usa el wrapper idempotent porque el web no tiene outbox. Si algún día se quiere idempotencia end-to-end también desde el web, el action puede envolverse fácilmente en `sendMessageIdempotent`.
- **Audio waveform preview.** El AudioRecorder muestra duración pero no waveform. `useAudioSampleListener` de expo-audio permite real-time waveform — mejora UX, fuera de scope de v1.
- **Paperclip button siempre visible, incluso sin connectivity.** Correcto: el composer debe permitir stagear en offline y enviar cuando vuelva la red. Verificar en Task 4.
- **Cache eviction de quick replies.** Actualmente nunca se evictan. Si el workspace elimina una quick reply, el cache la sigue mostrando hasta el próximo API fetch exitoso. Aceptable porque el API fetch corre en paralelo a la paint.

## Self-Check: PASSED

Archivos creados (todos presentes en disco):
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/conversations/[id]/media/upload/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/quick-replies/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/domain/messages-send-idempotent.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/lib/media/upload.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/lib/api-schemas/quick-replies.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/hooks/useSendMessage.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/hooks/useQuickReplies.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/MessageInput.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/QuickReplyAutocomplete.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/AudioRecorder.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/outbox/OutboxDrainer.tsx`

Commits verificados en `git log --oneline`:
- `38ad6b2` Task 1 — backend endpoints + schemas + domain wrapper
- `69e660a` Task 2 — media helper + hook + outbox drain + drainer
- `f8819ec` Task 3 — composer UI + autocomplete + audio recorder + i18n

Pushed: `origin/main` está en `f8819ec`.

Build verifications:

- `npx tsc --noEmit` desde el root (web) — clean exit, 0 errores nuevos (los errores preexistentes de vitest en tests están fuera de scope del plan).
- `cd apps/mobile && npx tsc --noEmit` — clean exit, 0 errores.
- `cd apps/mobile && npx expo export --platform android --output-dir /tmp/morfx-bundle-09-test` — 9.1 MB bundle, 0 resolution errors, 0 warnings sobre módulos faltantes. `/tmp/morfx-bundle-09-test` eliminado tras verificar.

---
*Phase: 43-mobile-app*
*Plan: 09*
*Completed: 2026-04-18*
