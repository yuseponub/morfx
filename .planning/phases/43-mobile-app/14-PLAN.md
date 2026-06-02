---
phase: 43-mobile-app
plan: 14
type: execute
wave: 9
depends_on: [4, 7, 8, 9, 10a, 10b]
files_modified:
  - apps/mobile/src/components/chat/TemplatePicker.tsx
  - apps/mobile/src/components/chat/TemplateVariableSheet.tsx
  - apps/mobile/src/hooks/useTemplates.ts
  - src/app/api/mobile/templates/route.ts
  - shared/mobile-api/schemas.ts
  - apps/mobile/src/components/chat/MessageInput.tsx
  - apps/mobile/src/components/media/ImageRenderer.tsx
  - apps/mobile/src/components/media/AudioPlayer.tsx
  - apps/mobile/src/components/chat/MessageBubble.tsx
  - apps/mobile/src/components/settings/SettingsScreen.tsx
  - apps/mobile/app/(tabs)/settings.tsx
  - apps/mobile/src/lib/i18n/es.json
autonomous: false
must_haves:
  truths:
    - "GET /api/mobile/templates returns approved Meta WhatsApp templates for the workspace"
    - "TemplatePicker is a BottomSheet listing templates, tapping one opens TemplateVariableSheet to fill variables, then sends via the existing message send path with templateName + templateVariables"
    - "Incoming image messages render using expo-image with tap-to-zoom (simple fullscreen modal)"
    - "Incoming audio messages render with a play button; expo-audio handles playback, shows a progress bar"
    - "Settings screen at /(tabs)/settings exposes: theme override (light/dark/system), push preview toggle, 'always push on new message' toggle, logout"
    - "Settings values persist to AsyncStorage"
    - "Tabs bar now has two tabs: Inbox and Settings"
    - "Push preference toggles (notify_all_messages, preview_show_content) are CLIENT-SIDE UX ONLY in v1 — they persist to AsyncStorage but the server always sends pushes with full content. Server-side filtering (reading these prefs before sending) is DEFERRED to v1.1. Documented in the Settings screen as 'Estas preferencias son locales; el servidor envía todas las notificaciones por ahora'. Users who want zero pushes can disable at the OS level."
  artifacts:
    - apps/mobile/src/components/chat/TemplatePicker.tsx
    - apps/mobile/src/components/media/AudioPlayer.tsx
    - apps/mobile/src/components/settings/SettingsScreen.tsx
  key_links:
    - "Closes the media + template + settings gap in the MVP feature list"
---

<objective>
Fill the remaining MVP gaps: WhatsApp template sending, inbound media rendering (images with zoom, audio with playback), and a minimal Settings screen with theme + push preferences + logout.

Output: template picker + variable filler, media renderers, settings screen, extra tab.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@src/app/(dashboard)/whatsapp/components/template-send-modal.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Templates endpoint + picker + variable sheet</name>
  <files>
    src/app/api/mobile/templates/route.ts
    shared/mobile-api/schemas.ts
    apps/mobile/src/hooks/useTemplates.ts
    apps/mobile/src/components/chat/TemplatePicker.tsx
    apps/mobile/src/components/chat/TemplateVariableSheet.tsx
    apps/mobile/src/components/chat/MessageInput.tsx
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. `src/app/api/mobile/templates/route.ts` GET: auth, returns approved templates for the workspace. Grep the codebase for how the web lists templates (likely `whatsapp_templates` table). Reuse.
  2. Schemas: `MobileTemplateSchema` = `{ name, language, components: [...], variable_count }`.
  3. `useTemplates.ts` hook.
  4. `TemplatePicker.tsx`: BottomSheet with search + list of templates. Tap → calls `onPick(template)`.
  5. `TemplateVariableSheet.tsx`: takes the selected template, renders a TextInput per variable with placeholder preview, submit → calls `sendMessage` with `{ templateName, templateVariables }`. The existing send endpoint (Plan 09) already accepts these fields per its Zod schema.
  6. Wire a "template" button inside `MessageInput`'s attach ActionSheet that opens the TemplatePicker.</action>
  <verify>`npm run build` + `npx tsc --noEmit` pass.</verify>
  <done>Templates ship.</done>
</task>

<task type="auto">
  <name>Task 2: Inbound media renderers — images with zoom, audio player</name>
  <files>
    apps/mobile/src/components/media/ImageRenderer.tsx
    apps/mobile/src/components/media/AudioPlayer.tsx
    apps/mobile/src/components/chat/MessageBubble.tsx
  </files>
  <action>
  1. `ImageRenderer.tsx`: `expo-image` `<Image source={{ uri }} />` with `contentFit="cover"` at a fixed max-width, tap opens a simple fullscreen Modal with a zoomable view. For v1 a basic non-zoom fullscreen (pinch-to-zoom optional — use `react-native-gesture-handler` PinchGestureHandler if trivial, else skip).
  2. `AudioPlayer.tsx`: uses `expo-audio` `useAudioPlayer` hook (SDK 54+). Play/pause button, progress bar (linear interpolation of current / duration), duration label in `mm:ss`. Preloads on mount but does not autoplay.
  3. Update `MessageBubble.tsx`: if the message has `media_type === 'image'` render `<ImageRenderer uri={media_url} />`; if `media_type === 'audio'` render `<AudioPlayer uri={media_url} />`; else render the text body as today.</action>
  <verify>Tap an inbound image from a test conversation and see it fullscreen. Tap an inbound audio and hear playback.</verify>
  <done>Media renderers ship.</done>
</task>

<task type="auto">
  <name>Task 3: Settings screen + tab</name>
  <files>
    apps/mobile/src/components/settings/SettingsScreen.tsx
    apps/mobile/app/(tabs)/settings.tsx
    apps/mobile/app/(tabs)/_layout.tsx
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. Add a second Tab in `(tabs)/_layout.tsx` — "Settings" (icon: gear). Total tabs = 2: Inbox + Settings.
  2. `SettingsScreen.tsx` sections:
     - **Cuenta**: signed-in email, logout button
     - **Apariencia**: theme override radio — light / dark / system (persist via `setThemeOverride` from Plan 04)
     - **Notificaciones**: toggle `notify_all_messages` (default true), toggle `preview_show_content` (default true). Persist to AsyncStorage keys `mobile:notify_all_messages`, `mobile:preview_show_content`. These get read by the Inngest push function via a `/api/mobile/push/preferences` GET (add this endpoint lazily if scope allows, OR document it as a follow-up; for v1 the flags are client-side UX only — user can turn off push at the OS level).
     - **Idioma**: shows "Español" (disabled, placeholder for i18n future)
     - **Acerca de**: app version (from `Application.nativeApplicationVersion`), keystore fingerprint (optional — from README)
  3. All strings via `t()`.</action>
  <verify>Settings screen renders + saves + restores across restart.</verify>
  <done>Settings ship.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 4: Verify all gaps closed on both devices</name>
  <files>n/a</files>
  <action>On both devices:
  1. Send a WhatsApp template → fill variables → send → web confirms.
  2. Receive an inbound image → mobile renders it → tap → fullscreen → close.
  3. Receive an inbound audio → mobile renders → tap play → hear audio.
  4. Open Settings tab → toggle dark mode explicitly → whole app themes update instantly → kill app → reopen → dark mode still on.
  5. Tap logout from Settings → returns to login.

  Fix any issues before marking done.</action>
  <verify>User confirms.</verify>
  <done>All MVP feature gaps filled.</done>
</task>

</tasks>

<verification>
- Templates route reuses existing web template source of truth
- expo-image + expo-audio used (not custom native modules) — stays in Expo Go
- Settings persist correctly
- Two tabs exist
</verification>

<success_criteria>
User can send WhatsApp templates, render inbound media, configure theme + logout. MVP is feature-complete for v1 (modulo Phase B storage migration, which is a separate phase).
</success_criteria>

<output>
Create `.planning/phases/43-mobile-app/43-14-SUMMARY.md` with: MVP checklist ticked against 43-CONTEXT.md "In scope for this phase (v1 MVP)" list.
</output>
