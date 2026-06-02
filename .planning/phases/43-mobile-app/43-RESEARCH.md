# Phase 43: Mobile App (MorfX) — Research

**Researched:** 2026-04-09
**Domain:** Cross-platform mobile (iOS + Android) with Supabase backend, realtime inbox, offline queue, push notifications
**Confidence:** HIGH for stack decision and keystore path, MEDIUM for Supabase Realtime reliability pattern, MEDIUM for offline sync architecture

---

## Summary

MorfX Phase 43 ships a React Native mobile app delivering the WhatsApp module as the foundation of a long-term mobile product. The user has **no Mac** (hard constraint), **no paid Apple or Play accounts yet** (indie $0 budget during dev), and needs feature parity with the web WhatsApp module's in-chat CRM side panel.

After deep investigation across Expo docs, Supabase GitHub discussions/issues, React Native ecosystem reports, and production case studies, **the unambiguous answer is Expo SDK (latest, currently 54+) + EAS Build cloud pipeline + expo-router + Supabase JS client + WatermelonDB for offline + @gorhom/bottom-sheet for the CRM slide-over + expo-notifications (FCM on Android day 1, iOS stubbed)**. Every alternative evaluated either violates a hard constraint (Capacitor needs a Mac for reliable iOS push; native RN CLI needs Xcode) or lags the ecosystem for Supabase Realtime and cloud builds.

**Primary recommendation:** Expo + EAS Build + expo-router + Supabase Realtime + WatermelonDB outbox. Runner-up: Expo + React Navigation v7 (drop expo-router) if file-based routing fights the multi-workspace + slide-over panel patterns during planning. "Pick runner-up when:" the planner discovers expo-router deep-linking + bottom sheet composition produces route state bugs during prototyping.

**Non-negotiables from research:**
1. **Lock EAS Managed Credentials keystore on the very first Android build** and opt in to Play App Signing — this preserves the sideload → Play Store migration without forcing existing users to reinstall.
2. **Do not await Supabase Realtime reconnection logic.** It has known reconnect loops on background/foreground transitions in Expo (supabase/realtime-js #463, supabase/supabase #29916, supabase/realtime #1088). Plan must include a foreground-refetch fallback that does NOT trust Realtime for correctness — treat Realtime as a "nice to have" and poll/refetch as the reliability mechanism, exactly like the existing web ContactPanel already does (`src/app/(dashboard)/whatsapp/components/contact-panel.tsx` polls every 30s alongside Realtime).
3. **Outbox goes in SQLite (via WatermelonDB), not AsyncStorage and not MMKV.** MMKV loses writes on crash, AsyncStorage is too slow and unreliable under load. WatermelonDB gives us ACID + sync primitives + proven Supabase integration path.
4. **iOS gets fully stubbed push during dev** and uses Expo Go for hot-reload testing. Any library the app pulls in that is NOT in Expo Go's prebuilt set forces us to a development build, which requires a Mac OR a paid Apple account for EAS to build. Plan MUST keep the Expo Go compatibility list respected for v1 or budget the $99 as soon as a custom native module is needed.

---

## Stack Decision: Expo vs Capacitor vs Alternatives

### The verdict

| Dimension | Expo + RN | Capacitor | Bare RN CLI | Flutter |
|---|---|---|---|---|
| Build without Mac | **YES** (EAS Build cloud, 30 free builds/mo, 15 iOS) | Partial — Ionic Appflow exists but iOS push reliability is the weak point | **NO** (requires Xcode) | Possible via Codemagic but more fragile |
| Supabase Realtime maturity | **HIGH** (official Expo guide, largest RN+Supabase community) | LOW (web SDK only, no RN-specific fixes) | HIGH | LOW (dart client less mature) |
| iOS push reliability | HIGH (expo-notifications wraps APNs cleanly) | **KNOWN ISSUE** — "iOS Wall": stock plugin returns APNs token not FCM token; needs `@capacitor-firebase/messaging` community plugin | HIGH | HIGH |
| Code reuse from Next.js (Zod, domain types) | **HIGH** — same TS, can share `src/lib/domain` types via workspace | MEDIUM — web code runs but DOM APIs leak | HIGH | **LOW** (Dart) |
| Audio recording/playback | HIGH (expo-audio + expo-av both production-proven) | MEDIUM (web MediaRecorder, quality varies) | HIGH | HIGH |
| Dev experience without native toolchain | **HIGH** (Expo Go on iPhone, .apk sideload on Android) | MEDIUM (web preview ok, native preview needs platform) | LOW | MEDIUM |
| Indie budget viability | **FREE TIER WORKS** — 30 builds/mo, 15 iOS | Ionic Appflow has paid tiers, free tier tighter | Free but requires local toolchain | Codemagic free tier exists |
| Keystore lock-in path | **EXPLICIT** (EAS Managed Credentials, documented migration) | Manual keystore mgmt, error-prone | Manual | Manual |

**Capacitor is ruled out** primarily because of the documented iOS push "wall" (dev.to/saltorgil guide, see Sources) — the stock plugin returns APNs hex tokens incompatible with Firebase Console, forcing a community plugin workaround. Given MorfX depends on push for new-message delivery SLA, shipping a platform with a known iOS push footgun is unacceptable.

**Bare React Native CLI is ruled out** because it requires macOS + Xcode for iOS builds. No cloud build service fully replaces that without paid Apple credentials, and the user has neither.

**Flutter is ruled out** because (a) zero code reuse from the existing Next.js + TS codebase, (b) the Supabase Realtime Dart client has materially less community maturity than `realtime-js`, and (c) the project is already invested in TypeScript everywhere.

**Expo wins on every relevant dimension.** EAS Build documented free tier is 30 builds/month with up to 15 iOS, which is comfortably enough for a 4–8 week MVP sprint. If the user acquires Apple Developer later, EAS seamlessly switches from stubbed to real iOS push without a refactor.

**Confidence:** HIGH — multiple official docs + community reports converge.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| Expo SDK | 54+ (latest) | Managed RN runtime, native modules pre-bundled | Cloud-build story (EAS) is the only path that works without a Mac. Expo Go enables $0 iOS dev. |
| React Native | 0.76+ (whatever Expo 54 ships) | Native UI runtime | Ecosystem for Supabase Realtime, push, audio, offline — all mature. |
| TypeScript | 5.x (match web repo) | Type safety | Enables reuse of Zod schemas and domain types from `src/lib/domain`. |
| expo-router | 4+ | File-based navigation w/ deep linking | Default in new Expo projects; built on React Navigation v7 so escape hatch exists. |
| @supabase/supabase-js | 2.x (match web repo) | Auth + Postgres + Realtime client | Single source of truth with the web. |
| @react-native-async-storage/async-storage | latest | Supabase session persistence ONLY | Required by Supabase JS for auth token storage in RN. Do NOT use for app data. |
| @nozbe/watermelondb | 0.27+ | Offline SQLite + sync engine + outbox | Proven Supabase integration (official Supabase blog post). SQLite backend. Survives OS kill + reboot. |
| expo-notifications | latest | Push notifications (FCM + APNs wrapper) | Single API for both platforms; Android works immediately, iOS wiring ready but stubbed. |
| expo-audio | latest (preferred) or expo-av (fallback) | Voice note record + playback | Native quality; hooks-based API in expo-audio. |
| expo-image-picker | latest | Camera + gallery | Bundled in Expo Go; no native module gymnastics. |
| expo-image | latest | Image rendering w/ caching | Replaces RN `Image` for performance in the inbox list. |
| @gorhom/bottom-sheet | 5+ | In-chat CRM slide-over panel | Reanimated v3 + Gesture Handler v2, recommended by Reanimated official docs, 280+ dependents. |
| react-native-reanimated | 3+ | Animation engine | Required by bottom-sheet and expo-router transitions. Bundled by Expo. |
| react-native-gesture-handler | 2+ | Gesture recognizers | Required by bottom-sheet. Bundled by Expo. |
| i18next + react-i18next | latest | Translation keys from day 1 | User requires Spanish v1 but i18n-ready. Standard in RN. |
| zod | match web repo version | Schema validation | Directly reusable from `src/lib/domain` and `src/lib/whatsapp/types.ts`. |
| date-fns + date-fns/locale/es | match web repo | Timestamps in America/Bogota, Spanish relative times | Already used by web (`formatDistanceToNow` with `es` locale in contact-panel.tsx). |

### Supporting

| Library | Purpose | When to Use |
|---|---|---|
| @shopify/flash-list | High-performance list virtualization | Inbox list (hundreds/thousands of conversations). Replaces FlatList. |
| expo-secure-store | Encrypted storage for Supabase refresh token | If we want stronger auth persistence than AsyncStorage on iOS. |
| expo-haptics | Tactile feedback on bot toggle, send, etc. | Polish, not required for MVP but trivial to include. |
| expo-file-system | Download/cache images and audio from Storage | Needed for offline reading of media. |
| react-native-mmkv | Fast KV for UI state (last-seen workspace, theme) | Not for outbox. Only for ephemeral prefs. |
| lucide-react-native | Icon set | Matches web (`lucide-react`). |
| nativewind 4+ OR react-native-unistyles 2+ | Styling | NativeWind lets us reuse Tailwind class names from web. Claude's discretion. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| expo-router | React Navigation v7 directly | Drop if file-based routing bugs during multi-workspace switching. Both are from the Expo team — migration is mechanical. |
| WatermelonDB | Legend-State + Supabase plugin | Legend-State is newer and has an open issue (LegendApp/legend-state #362) about losing updates during offline periods — not suitable for a chat app. |
| WatermelonDB | Raw expo-sqlite + hand-rolled sync | Hand-rolling is explicitly forbidden (see Don't Hand-Roll). |
| expo-notifications | react-native-firebase/messaging | react-native-firebase requires a custom dev build (not Expo Go compatible) → blocks $0 iOS dev flow. Expo Push Service wraps both FCM + APNs. |
| @gorhom/bottom-sheet | Custom Reanimated panel | Hand-rolling gesture physics loses weeks. @gorhom is the RN standard. |
| Stream Chat RN SDK (slash command autocomplete) | Custom dropdown over TextInput | Stream's SDK is designed for Stream's backend; we use Supabase. Build a lightweight custom autocomplete (the web already has `quick-reply-autocomplete.tsx` — port the logic). |

### Installation (expected)

```bash
npx create-expo-app@latest morfx-mobile --template default
cd morfx-mobile
npx expo install \
  @supabase/supabase-js @react-native-async-storage/async-storage \
  expo-router expo-notifications expo-audio expo-image expo-image-picker \
  expo-file-system expo-secure-store expo-haptics expo-localization \
  react-native-reanimated react-native-gesture-handler \
  @gorhom/bottom-sheet @shopify/flash-list \
  @nozbe/watermelondb \
  lucide-react-native
npm install zod i18next react-i18next date-fns
```

---

## Architecture Patterns

### Recommended Project Structure

```
morfx-mobile/
├── app/                          # expo-router file-based routes
│   ├── (auth)/
│   │   └── login.tsx             # Supabase email+password
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Bottom tabs (single tab in v1: "Inbox")
│   │   └── inbox.tsx             # Conversation list
│   ├── chat/[id].tsx             # Conversation screen w/ bottom-sheet CRM panel
│   └── _layout.tsx               # Root layout: Supabase provider, i18n, theme
├── src/
│   ├── lib/
│   │   ├── supabase.ts           # createClient with AsyncStorage session
│   │   ├── db/                   # WatermelonDB schema, models, sync
│   │   │   ├── schema.ts
│   │   │   ├── models/
│   │   │   ├── sync.ts           # pull + push outbox
│   │   │   └── outbox.ts         # enqueue outbound messages
│   │   ├── domain/               # SHARED with web (copy or workspace)
│   │   │   └── types.ts          # Zod schemas for conversation, message, contact
│   │   ├── realtime/             # Supabase Realtime subscription wrapper w/ foreground refetch fallback
│   │   ├── notifications/        # expo-notifications setup, token registration
│   │   └── i18n/                 # translation keys (es by default)
│   ├── components/
│   │   ├── inbox/
│   │   │   ├── ConversationCard.tsx     # avatar, name, unread badge, pipeline chip, time-since-customer
│   │   │   └── SlaTimer.tsx             # "time since customer last wrote"
│   │   ├── chat/
│   │   │   ├── ChatHeader.tsx           # bot toggle + mute picker
│   │   │   ├── MessageList.tsx          # FlashList, inverted
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── MessageInput.tsx         # slash command autocomplete inside TextInput
│   │   │   ├── TemplatePicker.tsx       # bottom sheet template list
│   │   │   └── AudioRecorder.tsx
│   │   ├── crm-panel/                   # gorhom/bottom-sheet slide-over
│   │   │   ├── ContactPanel.tsx         # parity with web ContactPanel
│   │   │   ├── RecentOrders.tsx
│   │   │   ├── PipelineStagePicker.tsx
│   │   │   ├── TagEditor.tsx
│   │   │   └── CreateOrderSheet.tsx
│   │   └── theme/                       # dark-mode provider
│   └── hooks/
│       ├── useConversations.ts          # Watermelon observable + Supabase sync
│       ├── useSendMessage.ts            # optimistic enqueue → outbox
│       └── useBotToggle.ts              # On/Off/Muted state + duration picker
├── assets/
├── app.json                             # Expo config: bundleIdentifier, package, EAS projectId
├── eas.json                             # Build profiles (dev client, preview apk, production)
└── credentials.json                     # DO NOT COMMIT — references EAS managed keystore
```

### Pattern 1: Supabase Realtime + Foreground Refetch Fallback

**What:** Subscribe to Realtime for the "happy path" but do NOT trust it for correctness. On every app foreground event and on conversation open, re-fetch from REST.

**Why:** Verified GitHub issues (supabase/realtime-js #463, supabase/supabase #29916, supabase/realtime #1088) document reconnect loops and lost updates on iOS/Android after backgrounding. The web MorfX app already handles this pattern in `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` with 30s polling alongside Realtime.

**Example:**

```typescript
// src/lib/realtime/useRealtimeConversations.ts
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { supabase } from '@/lib/supabase'
import { syncConversations } from '@/lib/db/sync'

export function useRealtimeConversations(workspaceId: string) {
  useEffect(() => {
    // 1. Initial sync
    syncConversations(workspaceId)

    // 2. Realtime (best effort)
    const channel = supabase
      .channel(`ws:${workspaceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `workspace_id=eq.${workspaceId}`,
      }, () => syncConversations(workspaceId))
      .subscribe()

    // 3. Reliability fallback: resync on foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncConversations(workspaceId)
    })

    return () => {
      supabase.removeChannel(channel)
      sub.remove()
    }
  }, [workspaceId])
}
```

### Pattern 2: Outbox Send Queue (WatermelonDB + Idempotency Key)

**What:** When the user hits Send, write the message to a local `messages` table marked `status='queued'` AND add a row to an `outbox` table in the same transaction. A single sync loop with a mutex drains the outbox: pull → push → ack.

**Why:** MMKV and AsyncStorage lose writes on crash. Dev.to community research ("React Native offline-first: conflict-safe SQLite sync", 2026) is explicit: "The UI write and outbox enqueue should happen in one transaction, ensuring if it's on screen, it's in the outbox" and "Add a UNIQUE index on idempotency_key on day one." WatermelonDB gives us the transaction boundary for free.

**Example sketch:**

```typescript
// src/lib/db/outbox.ts
import { database } from './index'
import { randomUUID } from 'expo-crypto'

export async function enqueueOutboundMessage(input: {
  conversationId: string
  body: string
  mediaUri?: string
}) {
  const idempotencyKey = randomUUID()
  await database.write(async () => {
    const msg = await database.get('messages').create(m => {
      m.conversationId = input.conversationId
      m.body = input.body
      m.status = 'queued'
      m.idempotencyKey = idempotencyKey
      m.createdAt = Date.now()
    })
    await database.get('outbox').create(o => {
      o.messageId = msg.id
      o.idempotencyKey = idempotencyKey
      o.attempts = 0
    })
  })
  // kick the drain loop (fire and forget)
  drainOutbox()
}
```

### Pattern 3: Bot Toggle as Three-State Optimistic UI

**What:** The chat header switch is actually three-state (On / Off / Muted for duration). Muted carries a timestamp `mute_until`. UI reads local state optimistically and writes through to the domain layer.

**Why:** User explicit requirement, inspired by Slack's "pause notifications." Must not force a round-trip before reflecting the change in the header.

**Example:**

```typescript
// src/hooks/useBotToggle.ts
type BotState = { mode: 'on' | 'off' | 'muted'; muteUntil?: string }

export function useBotToggle(conversationId: string) {
  const [state, setState] = useState<BotState>({ mode: 'on' })

  const setBotMode = async (next: BotState) => {
    setState(next) // optimistic
    const { error } = await supabase
      .from('conversations')
      .update({ bot_mode: next.mode, bot_mute_until: next.muteUntil ?? null })
      .eq('id', conversationId)
    if (error) {
      setState(state) // rollback
      Alert.alert('No se pudo actualizar el bot')
    }
  }
  return { state, setBotMode }
}
```

NOTE TO PLANNER: the DB columns `bot_mode` and `bot_mute_until` may not yet exist. Audit the schema during planning. If missing, plan a migration as a BLOCKING pre-requisite before the mobile feature lands — per CLAUDE.md Regla 5.

### Pattern 4: In-Chat CRM Panel via @gorhom/bottom-sheet (RIGHT-side slide)

**What:** The CRM panel is a sheet that slides in from the right edge of the chat screen (not the bottom). @gorhom/bottom-sheet ships with a bottom slide by default; for right-side, either (a) use `BottomSheetModal` rotated / positioned, or (b) use `react-native-reanimated-drawer-layout` or `@react-navigation/drawer` with `drawerPosition="right"`.

**Recommended:** Use `@react-navigation/drawer` (part of React Navigation, Expo-compatible) with `drawerPosition="right"` for the CRM panel. It handles gesture + backdrop correctly and is platform-standard. Reserve `@gorhom/bottom-sheet` for mobile-appropriate bottom sheets: template picker, mute duration picker, create order flow.

**Why:** Right-side drawers on mobile are less common than bottom sheets — but the user explicitly wants parity with the web's right-side panel. `@react-navigation/drawer` is the blessed path for drawer-style navigation. Bottom sheets are better for focused single-task input (template picker, mute picker, order form).

### Anti-Patterns to Avoid

- **Trusting Supabase Realtime as source of truth.** Verified broken on background/foreground cycles. Always pair with foreground refetch.
- **Using AsyncStorage or MMKV for the outbox.** Proven to lose writes. Outbox belongs in SQLite.
- **Skipping EAS Managed Credentials on the first Android build.** If you generate a keystore manually for the sideload phase and a different one later, users lose their install. This is the single most expensive mistake the user explicitly flagged.
- **Depending on a library not in Expo Go's prebuilt set for v1.** That forces a development build, which on iOS requires either a Mac or a paid Apple Developer account. Both are absent.
- **`inngest.send` without `await` in any webhook** (already a web-side rule, re-stated here because the mobile app will register push tokens via an API route and that route must follow the same rule).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Offline outbox + sync | Custom AsyncStorage queue w/ retry | WatermelonDB + its sync engine | ACID transactions, proven at scale (Nozbe), official Supabase blog post for integration path. Idempotency, tombstones, conflict resolution all solved. |
| Push notification platform abstraction | Calling FCM REST + APNs HTTP/2 directly from edge functions | expo-notifications + Expo Push Service (OR direct FCM via expo-notifications for Android, stub iOS) | Expo wraps both FCM + APNs behind one API. Swapping from stub → real iOS push is a config change, not a refactor. |
| Right-side slide-over panel | Hand-rolled Reanimated pan gesture | `@react-navigation/drawer` with `drawerPosition="right"` | Gesture physics, backdrop, accessibility, edge-swipe — all solved. |
| Bottom sheets (template picker, mute picker, create order) | Custom modal w/ animated.Value | `@gorhom/bottom-sheet` v5 | 280+ dependents, Reanimated v3, gesture handler v2, TypeScript. Recommended by Reanimated's own docs. |
| Virtualized inbox list | Custom FlatList w/ heavy re-renders | `@shopify/flash-list` | Shopify-maintained, measurable win on long lists. |
| Audio record + playback | Raw iOS/Android native modules | `expo-audio` (preferred) or `expo-av` (fallback) | Cross-platform, permissions handled, production-proven. |
| Image camera + gallery | Raw CameraKit / native pickers | `expo-image-picker` + `expo-image` | In Expo Go's prebuilt set. |
| Supabase full-text search on messages | Client-side filtering after naive LIKE | `websearch_to_tsquery` + `tsvector` generated column + GIN index | Native Postgres FTS beats trigram for natural-language queries. See Open Questions for measurement plan. |
| Slash-command autocomplete | Reinvent dropdown logic | Port existing `quick-reply-autocomplete.tsx` from web | Logic is trivial; UI wraps a RN TextInput with an absolute-positioned suggestion list. No library needed. |
| Date/time relative strings in Spanish | Hand-format | `date-fns` + `formatDistanceToNow(..., { locale: es })` | Matches web exactly (see `contact-panel.tsx`). |
| Android keystore management | Local keystore in repo | **EAS Managed Credentials** + opt-in to Play App Signing | Expo stores and reuses the same keystore across every build forever. Exportable via `eas credentials` if leaving Expo. |

**Key insight:** The mobile ecosystem penalizes hand-rolling more than the web does, because every bug costs an app-store review cycle. Use community libraries with 200+ dependents as the default.

---

## Keystore & Signing Migration Path (CRITICAL)

This is the single hardest-to-fix mistake available in this phase. Research confirmed the path.

### Day 1 setup (exact commands)

```bash
# 1. Authenticate
npx expo login

# 2. Initialize EAS in the project
npx eas init

# 3. Configure build profiles in eas.json
#    - development: dev client APK for sideload
#    - preview: preview APK for sideload testing
#    - production: AAB for Play Store (later)

# 4. First Android build — EAS prompts to generate a managed keystore
#    CHOOSE: "Generate new keystore" → EAS stores it on their servers
npx eas build --platform android --profile preview

# 5. Verify the keystore is locked in
npx eas credentials
# Select Android → production → shows the stored keystore fingerprint
```

### How the sideload → Play Store transition stays safe

1. The `.apk` generated via EAS `preview` profile is signed with the EAS Managed Keystore.
2. When the user later creates a Google Play listing and uploads the first AAB, they **opt in to Play App Signing** (Google's default since 2021). Google asks for the **upload certificate** — which IS the same EAS Managed keystore. Google then manages the final app signing key going forward.
3. Because the upload key matches the sideload key, Google recognizes it as the same app. Users who sideloaded the `.apk` will be able to upgrade over-the-air from the Play Store without uninstalling.
4. **DO NOT** generate a new keystore for the Play Store release. **DO NOT** let someone in a panic run `eas credentials` → "Reset keystore." That is the canary scenario that breaks sideload upgrades.

Sources: Expo docs — [App credentials](https://docs.expo.dev/app-signing/app-credentials/), [Managed credentials](https://docs.expo.dev/app-signing/managed-credentials/), [Android build process](https://docs.expo.dev/build-reference/android-builds/). Opt-in to Play App Signing means "you can upload an APK signed with an upload certificate and Google Play will automatically replace it with the app signing certificate" — which is exactly the sideload continuity we need.

### Exit path from EAS (if ever needed)

```bash
npx eas credentials
# Android → production → Download keystore
# Exports a .jks file locally. Use for Gradle signing in a bare RN / local build later.
```

Confidence: HIGH. Docs are explicit; multiple dev.to walkthroughs confirm.

### Application ID decision (lock this on day 1 too)

Pick the `android.package` in `app.json` on day 1 and NEVER change it. Recommended: `app.morfx.mobile`. Package name + keystore together define Android app identity. Changing the package = new app in the Play Store.

---

## iOS Without Apple Developer Account — Exact Limits

Verified from official Expo docs, Expo GitHub discussion #27489, and eas-cli issue #997.

### What works $0 on iOS during development

- **Expo Go on the user's iPhone:** Install Expo Go from the App Store (free). Scan a QR code from `npx expo start` on any non-Mac machine (Windows/Linux/WSL works). The JS runs inside Expo Go's sandbox. Hot reload, Fast Refresh, debugging — all fine.
- **All prebuilt native modules in Expo Go's set work**: expo-image-picker, expo-audio, expo-av, expo-file-system, expo-haptics, expo-secure-store, expo-image, expo-localization, expo-crypto. This is enough for the v1 MVP feature list.
- **Supabase JS client works fine inside Expo Go** (pure JS, no native module).
- **`react-native-reanimated` v3, `react-native-gesture-handler` v2, `@gorhom/bottom-sheet`, `@react-navigation/drawer`, `@shopify/flash-list`** — all included in Expo Go.

### What does NOT work $0 on iOS

- **Push notifications on iOS real-device:** Requires APNs credentials, which require a paid Apple Developer Program membership. Expo Go can simulate local notifications but cannot receive true APNs pushes.
- **`@nozbe/watermelondb`:** Has a native module. **NOT in Expo Go.** This is the critical blocker for our stack — see below.
- **Any native module not in the prebuilt Expo Go set:** e.g., `react-native-mmkv`, `react-native-firebase`, custom native modules.

### Resolution for the WatermelonDB blocker

Two paths:

**Path A — Use Expo Development Build and accept that the user needs ONE person with an Apple Developer account to sign the iOS dev build once.**
- EAS Build can produce an iOS Development Build as an `.ipa`, but Apple requires it to be signed with a provisioning profile from a paid Apple Developer account.
- "credentials can be generated by an authorized user and uploaded to your Expo account, so users without Apple Developer account access can create builds using the uploaded credentials" (Expo forums).
- Workaround: the user borrows an Apple Developer account ($99) from a friend/collaborator ONCE to generate credentials, uploads them to EAS, and from then on the user's iPhone can install the dev build without needing ongoing Apple Developer access.
- Still requires the $99 somewhere in the chain.

**Path B — Defer WatermelonDB until iOS testing is unblocked.** Start v1 with a simpler offline strategy (expo-sqlite direct + manual outbox table, no Watermelon sync engine) that is in Expo Go's prebuilt set. This keeps $0 dev working on iOS. Migrate to WatermelonDB in a later phase once Apple Developer is acquired.

**Recommendation:** **Path B for the first 2–4 weeks of implementation** (validate the UX on Android via sideload + iOS via Expo Go with expo-sqlite outbox), then **switch to Path A and WatermelonDB** once the user purchases Apple Developer. The $99 becomes unavoidable at the moment the user wants to test on a real iPhone AND needs any native module outside Expo Go's set. Plan should call this out as a decision checkpoint around the end of week 2.

**Confidence:** HIGH on Expo Go limits, HIGH on the $99 trigger point, MEDIUM on the Path B simpler-outbox design (needs prototyping).

### The exact moment $99 becomes unavoidable

1. The MVP needs to test push on iOS end-to-end. (Deferred in v1 per user — so not yet.)
2. The MVP needs WatermelonDB (or any native module) on iOS real-device. (Recommended ~week 3.)
3. The MVP is ready to ship to TestFlight or the App Store.

Any of those three. The earliest trigger is #2 if we go with WatermelonDB from day 1.

---

## Web WhatsApp Module — Parity Inventory for In-Chat CRM Side Panel

Read from `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` (the canonical web spec). Every item below MUST exist on mobile v1 unless noted:

**Header:**
- [ ] "Contacto" label + close button

**Window indicator (top of panel):**
- [ ] 24h WhatsApp window state (`last_customer_message_at`)

**Contact block:**
- [ ] Avatar circle (User icon placeholder)
- [ ] Contact name, **inline editable** (click to edit, Enter/Escape, saves via `updateContactName`)
- [ ] Phone number
- [ ] Address + city (if present)
- [ ] Tags (conversation.tags) rendered as TagBadge
- [ ] "Ver en CRM" link (deep-link to `/crm/contactos/:id`)
- [ ] **Create Task button** (tasks integration — ask planner whether this ships v1 or is deferred; context says "create order" is required but tasks is not in CONTEXT.md — flag for discuss-phase confirmation)
- [ ] Unknown-contact state: profile_name fallback + "Crear contacto" button
- [ ] "Crear contacto" sheet with defaults (phone, profile_name, conversationId)

**Recent orders block:**
- [ ] Section header "Pedidos recientes"
- [ ] For each order:
  - [ ] Stage badge (clickable → PopoverContent Command list of pipeline stages, search, click to move with optimistic update + revert on error)
  - [ ] Total value formatted as COP currency
  - [ ] Created-at relative time in Spanish (`formatDistanceToNow`)
  - [ ] **Recompra button** (creates duplicate order, stage picker)
  - [ ] View button (opens ViewOrderSheet)
  - [ ] Tags per order:
    - [ ] Remove tag (X button, optimistic)
    - [ ] Add tag (+ button, Popover Command list, optimistic)
- [ ] "Ver todos" link at bottom
- [ ] Empty state: "No hay pedidos recientes"
- [ ] Loading skeleton (3 pulse rows)

**Create order block:**
- [ ] "Crear pedido" button full width → CreateOrderSheet
- [ ] Sheet receives: defaultContactId, defaultPhone, defaultName, conversationId
- [ ] Sheet triggers `handleOrderCreated` → refresh orders

**Realtime refresh mechanism:**
- [ ] Supabase channel on `panel-realtime:{conversationId}` listening for `conversations UPDATE` + `orders INSERT` for this contact
- [ ] **PLUS polling every 30s** as reliability mechanism (this is the web's current approach and is the same mitigation we need on mobile)

**NOT in the web panel (and therefore NOT in mobile v1):**
- Email (user explicitly excluded)
- Full order detail edit (that lives in ViewOrderSheet — separate screen)
- Product editor (lives in a separate sheet)
- Notes field

**Chat header actions** (from `chat-header.tsx` + `agent-config-slider.tsx`):
- [ ] Bot toggle (currently via `toggleConversationAgent` — v1 mobile extends to three-state On/Off/Muted-for-duration)
- [ ] Mark as read
- [ ] Archive / Unarchive
- [ ] Edit contact name
- [ ] Open in CRM (deep link)
- [ ] Assign to user (AssignDropdown)
- [ ] Conversation tag input
- [ ] Confirmation of GoDentist appointment (workspace-scoped) — DEFERRED for mobile v1 (tenant-specific action)
- [ ] Debug panel toggle (super-user only) — DEFERRED for mobile v1

**Chat input / message-input.tsx parity:**
- [ ] Send text
- [ ] Image picker (camera + gallery)
- [ ] Audio recording + send
- [ ] Template picker (`template-send-modal.tsx`)
- [ ] Quick reply slash-command autocomplete (`quick-reply-autocomplete.tsx`)
- [ ] Emoji picker — Claude's discretion (native keyboard emoji is sufficient for v1)

---

## Common Pitfalls

### Pitfall 1: Supabase Realtime reconnect loop on background/foreground

**What goes wrong:** App is backgrounded, network changes, WebSocket TIMED_OUT. On foreground, `realtime-js` enters a loop of SUBSCRIBED → CLOSED → SUBSCRIBED. Messages sent during the gap are never delivered via the channel.

**Why it happens:** Documented bugs in `realtime-js` and the `realtime` service: [supabase/realtime-js #463](https://github.com/supabase/realtime-js/issues/463), [supabase/supabase #29916](https://github.com/supabase/supabase/issues/29916), [supabase/realtime #1088](https://github.com/supabase/realtime/issues/1088), [supabase discussion #27513](https://github.com/orgs/supabase/discussions/27513), [supabase discussion #5641](https://github.com/orgs/supabase/discussions/5641).

**How to avoid:** Treat Realtime as best-effort. On every `AppState` change to `active`, call an explicit refetch. On conversation open, refetch. Use a "last-seen cursor" (`max(created_at)`) to fetch only delta rows. Do NOT rely on Realtime for the correctness of the inbox unread badge — derive it from the fetched state.

**Warning signs:** Users report "stale unread count" or "message didn't arrive until I swiped down." If you see those, the fallback isn't running.

### Pitfall 2: Keystore mismatch between sideload APK and Play Store AAB

**What goes wrong:** User sideloads v0.1 APK signed with keystore A. Later, someone creates a new keystore B for the Play Store release. Android treats it as a different app. Existing users must uninstall before they can install the Play Store version. They lose local cache and feel it as a "reset."

**Why it happens:** Generating a new keystore instead of reusing the EAS Managed one. Or: manually signing outside EAS for one build.

**How to avoid:** ONLY build via `eas build` from day 1. NEVER run `eas credentials` → "Generate new keystore" unless the first build doesn't exist yet. Opt-in to Google Play App Signing on first AAB upload.

**Warning signs:** `eas credentials` shows two different keystore fingerprints in history. Stop immediately and restore.

### Pitfall 3: Expo Go dev path quietly broken by a native module PR

**What goes wrong:** A dev adds `react-native-mmkv` or `@nozbe/watermelondb` because "it's the standard." Next `npx expo start` on iPhone, Expo Go crashes or throws "native module not found."

**Why it happens:** Those libs are NOT in Expo Go's prebuilt set. Forces a development build. Development build for iOS needs a Mac or a paid Apple account.

**How to avoid:** Maintain an explicit "Expo Go compatibility list" in the repo README. Before adding any RN library, check if it's bundled in Expo Go. If not, treat it as a phase-transition decision requiring an Apple Developer account.

**Warning signs:** PR description mentions a new native module. PR reviewer must ask: "does this work in Expo Go?"

### Pitfall 4: Outbox on MMKV or AsyncStorage loses messages on crash

**What goes wrong:** User sends 3 messages offline. App crashes or OS kills it. On next launch, 1 of the 3 is gone.

**Why it happens:** MMKV batches writes for speed. AsyncStorage is not transactional. Neither is ACID.

**How to avoid:** Outbox in SQLite (via WatermelonDB or expo-sqlite). UI write + outbox enqueue in ONE transaction. UNIQUE idempotency_key from day one.

**Warning signs:** Users report "I sent it but it never arrived and it's not in my queue either." This is catastrophic; design to prevent it from the first commit.

### Pitfall 5: Assuming `inngest.send` works without `await` in mobile push token registration

**What goes wrong:** Mobile app registers FCM/APNs token via `/api/mobile/register-token`. Route fires `inngest.send('mobile.token.registered', ...)` without await. On Vercel serverless, the function returns, the promise is killed, the event is lost.

**Why it happens:** Same root cause as the existing web-side bug documented in MEMORY.md — Vercel serverless does not keep unawaited promises alive.

**How to avoid:** Every call to `inngest.send` in any route MUST be awaited. Re-state this rule in the mobile backend route specifically.

**Warning signs:** Dev logs show "event sent" but Inngest dashboard shows nothing.

### Pitfall 6: Bot "muted until" timestamp stored in wrong timezone

**What goes wrong:** User picks "mute for 1 hour." App computes `new Date(Date.now() + 3600000)` in the device's local TZ. DB stores it as UTC. Display later renders in device local TZ. Everything looks fine — until a user in Medellin has their phone on "Panama" time (UTC-5) but the laptop web app is "America/Bogota" (also UTC-5) — same value, accidentally correct. Then a user in Miami installs the app...

**Why it happens:** Colombian workspace, Colombian support team, some users travel. America/Bogota is the canonical business TZ (Regla 2). Device TZ is not.

**How to avoid:** All "until" timestamps stored as UTC in DB (Supabase `timestamptz`). All **display** in `America/Bogota` using `toLocaleString('es-CO', { timeZone: 'America/Bogota' })` — same rule as web. Duration math (`now + 1h`) is TZ-independent so UTC is fine for storage.

**Warning signs:** A muted conversation auto-resumes at the "wrong" clock time for the support team.

---

## Code Examples

### Supabase client with AsyncStorage (for session)

```typescript
// src/lib/supabase.ts
// Source: https://docs.expo.dev/guides/using-supabase/
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN doesn't have URL-based auth callbacks
  },
})
```

### expo-notifications token registration

```typescript
// src/lib/notifications/register.ts
// Source: https://docs.expo.dev/push-notifications/push-notifications-setup/
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'

export async function registerForPushNotifications(userId: string, workspaceId: string) {
  if (!Device.isDevice) return // no push on simulator

  if (Platform.OS === 'ios') {
    // DEV STUB: we don't yet have Apple Developer. Skip.
    console.log('[push] iOS stubbed — no Apple Developer account yet')
    return
  }

  // Android: FCM via expo-notifications
  const { status: existing } = await Notifications.getPermissionsAsync()
  let status = existing
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync()
    status = req.status
  }
  if (status !== 'granted') return

  const tokenResponse = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  })

  // Store in DB — Domain layer per Regla 3
  await supabase.from('push_tokens').upsert({
    user_id: userId,
    workspace_id: workspaceId,
    platform: 'android',
    token: tokenResponse.data,
    updated_at: new Date().toISOString(),
  })
}
```

### Full-text search on messages (client-side query)

```typescript
// src/hooks/useMessageSearch.ts
// Source: https://supabase.com/docs/guides/database/full-text-search
export async function searchMessages(workspaceId: string, query: string) {
  // Requires: ALTER TABLE messages ADD COLUMN fts tsvector
  //   GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(body, ''))) STORED;
  // CREATE INDEX messages_fts_idx ON messages USING GIN (fts);
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, conversation_id, created_at')
    .eq('workspace_id', workspaceId)
    .textSearch('fts', query, { type: 'websearch', config: 'spanish' })
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}
```

### @gorhom/bottom-sheet for mute duration picker

```typescript
// src/components/chat/MuteDurationSheet.tsx
// Source: https://gorhom.dev/react-native-bottom-sheet/
import { useMemo, useRef } from 'react'
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'

const DURATIONS = [
  { label: '30 minutos', ms: 30 * 60_000 },
  { label: '1 hora', ms: 60 * 60_000 },
  { label: '2 horas', ms: 120 * 60_000 },
  { label: 'Hasta el final del día', ms: null /* compute to 23:59 Bogota */ },
]

export function MuteDurationSheet({ onPick }: { onPick: (muteUntil: Date) => void }) {
  const ref = useRef<BottomSheetModal>(null)
  const snapPoints = useMemo(() => ['40%'], [])

  const present = () => ref.current?.present()
  // ... render BottomSheetModal w/ DURATIONS list
}
```

---

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|---|---|---|---|
| React Navigation 5/6 stack config | React Navigation 7 OR expo-router (file-based) | Expo SDK 50+ | expo-router is default in new Expo projects; type-safe deep links |
| Reanimated v2 | Reanimated v3 | 2023 | Mandatory for `@gorhom/bottom-sheet` v5 and modern gesture handling |
| FlatList | `@shopify/flash-list` | 2022+ | Measurable wins on scroll perf for long lists — matters for the inbox |
| expo-av (audio) | `expo-audio` (hooks API) | Expo SDK 52+ | Cleaner API; expo-av still works but is in maintenance |
| react-native-firebase/messaging | expo-notifications (Expo-managed) | Expo SDK 50+ | expo-notifications now wraps both FCM + APNs with prebuilt Expo Go support for local notifications |
| AsyncStorage for everything | AsyncStorage for auth ONLY + SQLite for data | 2023+ | Durability; AsyncStorage is not transactional |
| react-native-mmkv as DB | MMKV as KV prefs only, SQLite as DB | 2024+ | MMKV loses writes on crash (see GH issue #513) |
| Local keystore committed to repo | **EAS Managed Credentials** | 2022+ | Safer, shared, exportable, survives team changes |

**Deprecated / outdated ideas Claude might suggest:**
- "Use react-native-firebase" — not needed if expo-notifications covers you, and it forces a dev build.
- "Use React Navigation 5 syntax" — upgrade everything to v7.
- "Use expo-av" — prefer expo-audio for new code; expo-av is fine if it ships bundled with Expo Go longer.
- "Store the outbox in AsyncStorage" — confirmed bad.
- "Use Zustand for server state" — use React Query / tanstack-query for server cache, Zustand only for UI state.

---

## Open Questions

1. **Search backend: Postgres FTS vs external index**
   - What we know: `websearch_to_tsquery` + GIN index on a generated `tsvector` column is fast for natural-language queries. Performance depends on message volume per workspace.
   - What's unclear: measured latency at MorfX's realistic message volume (hundreds of thousands per workspace) from a mobile client over 4G.
   - Recommendation: **Ship with Postgres FTS.** Add a migration for the `fts` generated column + GIN index as part of the plan. Measure p50/p95 latency with a realistic seed. Only bring in Meilisearch/Typesense if p95 > 500ms after indexing.
   - Confidence: MEDIUM. Needs measurement.

2. **"Always push on new message" default**
   - What we know: User wants all new-message pushes on by default per CONTEXT.md.
   - What's unclear: noise threshold for active workspaces (GoDentist receives hundreds/day).
   - Recommendation: **Default ON, with a settings toggle** "Only notify when I need to intervene" (filters to bot-off + low-confidence signals). Ship both paths from v1; user picks during onboarding.
   - Confidence: LOW. Product-side judgment call, not a research finding.

3. **Push preview default (show content vs generic)**
   - What we know: Industry norm is to show sender + preview by default, hide on lock screen if user toggles "hide sensitive content" in OS settings.
   - Recommendation: **Default to show preview.** Users can disable at OS level if concerned. Match WhatsApp and Slack behavior.
   - Confidence: MEDIUM.

4. **Task creation button in side panel — v1 or deferred?**
   - What we know: Web panel has a `CreateTaskButton` component. CONTEXT.md says "create order" is required but doesn't explicitly call out tasks.
   - Recommendation: **Defer to v1.1.** Tasks integration adds scope without being on the critical path. Plan should flag this for user confirmation in discuss-phase if not already resolved.
   - Confidence: LOW — product decision.

5. **WatermelonDB now vs later (blocks iOS dev on $0 budget)**
   - What we know: WatermelonDB is the right long-term choice, but it's not in Expo Go — forces a dev build — forces an Apple Developer account for iOS.
   - Recommendation: **Two-phase approach.** Weeks 1–2: ship with raw `expo-sqlite` + a simple outbox table, iOS works in Expo Go, Android sideload. Weeks 3+: migrate to WatermelonDB once the user buys Apple Developer ($99) and we switch iOS to dev builds. Plan MUST call this out explicitly because it materially affects task ordering.
   - Confidence: HIGH on the blocker, MEDIUM on the two-phase execution plan (Planner should refine).

6. **Multi-workspace switching without full reload — architecture**
   - What we know: Context says "without full app reload." The web achieves this via Next.js route params + workspace context.
   - What's unclear: whether we key the Supabase client per workspace (seems unnecessary — same connection, just filter workspace_id) or key the top-level route / provider.
   - Recommendation: Put `workspaceId` in a React context at the root; key `useQuery` / Watermelon observables on it; channel subscriptions teardown + re-subscribe on switch. No reload needed.
   - Confidence: MEDIUM — needs prototyping during planning.

---

## Sources

### Primary (HIGH confidence)

- [Expo — App credentials](https://docs.expo.dev/app-signing/app-credentials/) — EAS Managed Credentials lifecycle
- [Expo — Using automatically managed credentials](https://docs.expo.dev/app-signing/managed-credentials/) — keystore generation + reuse path
- [Expo — Android build process](https://docs.expo.dev/build-reference/android-builds/) — gradle + signing config injection
- [Expo — Push notifications setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) — expo-notifications + FCM/APNs
- [Expo — Send notifications with FCM and APNs](https://docs.expo.dev/push-notifications/sending-notifications-custom/) — direct path without Expo Push Service
- [Expo — Using Supabase](https://docs.expo.dev/guides/using-supabase/) — canonical RN + Supabase client setup
- [Expo — Create a development build on EAS](https://docs.expo.dev/develop/development-builds/create-a-build/) — when dev build is required
- [Expo Router — Introduction](https://docs.expo.dev/router/introduction/) — file-based navigation
- [Expo Router — Migrate from React Navigation](https://docs.expo.dev/router/migrate/from-react-navigation/) — escape hatch path
- [Expo — Audio (expo-audio)](https://docs.expo.dev/versions/latest/sdk/audio/) — new hooks-based audio API
- [Expo — AV (expo-av)](https://docs.expo.dev/versions/latest/sdk/av/) — legacy audio fallback
- [Expo — Subscriptions, plans, and add-ons](https://docs.expo.dev/billing/plans/) — free tier 30 builds/mo, 15 iOS
- [Expo Application Services Pricing](https://expo.dev/pricing) — Starter $19/mo with build credit
- [Apple Developer Program roles and permissions for EAS Build](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/) — iOS credential requirements
- [Supabase — Full Text Search](https://supabase.com/docs/guides/database/full-text-search) — websearch_to_tsquery + GIN indexes + generated tsvector columns
- [Supabase — Sending Push Notifications](https://supabase.com/docs/guides/functions/examples/push-notifications) — Edge Function + FCM flow
- [Supabase blog — Offline-first React Native Apps with Expo, WatermelonDB, and Supabase](https://supabase.com/blog/react-native-offline-first-watermelon-db) — canonical offline integration
- [@nozbe/WatermelonDB GitHub](https://github.com/Nozbe/WatermelonDB) — reactive SQLite ORM
- [@gorhom/react-native-bottom-sheet GitHub](https://github.com/gorhom/react-native-bottom-sheet) — v5 w/ Reanimated v3
- [React Native Reanimated — Bottom Sheet example](https://docs.swmansion.com/react-native-reanimated/examples/bottomsheet/) — official recommendation of @gorhom
- [Storage Benchmark — MMKV vs AsyncStorage vs WatermelonDB vs Realm vs SQLite](https://github.com/mrousavy/StorageBenchmark) — measured comparison

### Secondary (MEDIUM confidence)

- [Supabase Realtime reconnect after offline in Expo — Issue #463 (realtime-js)](https://github.com/supabase/realtime-js/issues/463) — verified reconnect bug
- [Realtime not reconnecting after offline and refreshing in Expo — Issue #29916 (supabase/supabase)](https://github.com/supabase/supabase/issues/29916) — confirmed in production tracking
- [Realtime connection unable to reconnect after TIMED_OUT — Issue #1088 (supabase/realtime)](https://github.com/supabase/realtime/issues/1088) — reconnect loop
- [Auto reconnect subscription after CLOSED connection — Discussion #27513 (supabase)](https://github.com/orgs/supabase/discussions/27513) — community workaround: manual removeChannel
- [How to obtain reliable realtime updates in the real world — Discussion #5641 (supabase)](https://github.com/orgs/supabase/discussions/5641) — acknowledged "lost updates during reconnect" gap
- [Understanding and Monitoring Realtime Heartbeats — Discussion #41239 (supabase)](https://github.com/orgs/supabase/discussions/41239) — exponential backoff pattern
- [EAS Build claims to use correct keystore but produces incorrectly signed builds — Issue #3127 (eas-cli)](https://github.com/expo/eas-cli/issues/3127) — edge case to watch
- [Change EAS Managed Keystore Value Used — Issue #1048 (eas-cli)](https://github.com/expo/eas-cli/issues/1048) — keystore management operations
- [No way to build iOS preview without paid account — Discussion #27489 (expo)](https://github.com/expo/expo/discussions/27489) — confirmed $99 floor for iOS dev build
- [EAS: Apple Developer account needed while it should be optional — Issue #997 (eas-cli)](https://github.com/expo/eas-cli/issues/997) — workaround: upload credentials from a collaborator
- [Supabase realtime sync after back online — Issue #362 (LegendApp/legend-state)](https://github.com/LegendApp/legend-state/issues/362) — reason we do NOT pick legend-state
- [Capacitor iOS Push "Wall" — The Complete Guide (dev.to)](https://dev.to/saltorgil/the-complete-guide-to-capacitor-push-notifications-ios-android-firebase-bh4) — documented APNs-vs-FCM token mismatch requiring community plugin
- [Offline-first React Native Apps with Expo, WatermelonDB, and Supabase (Morrow)](https://www.themorrow.digital/blog/building-an-offline-first-app-with-expo-supabase-and-watermelondb) — community walkthrough
- [React Native offline-first: conflict-safe SQLite sync (dev.to, 2026)](https://dev.to/sathish_daggula/react-native-offline-first-conflict-safe-sqlite-sync-549a) — outbox + idempotency key pattern
- [MMKV as local DB — Issue #513 (react-native-mmkv)](https://github.com/mrousavy/react-native-mmkv/issues/513) — confirmed not suitable for durable write log
- [Mentions / autocomplete — Issue #855 (react-native-gifted-chat)](https://github.com/FaridSafi/react-native-gifted-chat/issues/855) — community context on chat mention/autocomplete patterns
- [Capacitor vs React Native (NextNative, 2025/2026)](https://nextnative.dev/comparisons/capacitor-vs-react-native) — decision matrix
- [Building iOS app without paid developer account — Expo forum](https://forums.expo.dev/t/building-ios-app-without-paid-developer-account/67973) — confirmed Path A workaround

### Tertiary (LOW confidence — treat as directional)

- [Expo Go vs Development Builds: Which should you use? (Expo blog)](https://expo.dev/blog/expo-go-vs-development-builds) — marketing framing but accurate on capability differences
- [Yvaine — Create Development Builds Without an Apple Developer Program](https://yvainee.com/blog/create-development-builds-without-an-Apple-Developer-Program) — unofficial workaround write-up
- [TinyBase vs WatermelonDB vs RxDB (PkgPulse, 2026)](https://www.pkgpulse.com/blog/tinybase-vs-watermelondb-vs-rxdb-offline-first-2026) — community comparison, directional only
- [Stream Chat React Native SDK docs — AutoCompleteInput](https://getstream.io/chat/docs/sdk/react-native/ui-components/auto-complete-input/) — reference implementation (not used — we build our own, simpler)
- HubSpot Mobile / Pipedrive / Front / Missive / Attio / Folk / Superhuman Mobile stacks — **could not verify publicly.** These companies do not publish their mobile stacks. StackShare shows Pipedrive uses JS/Node/MySQL backend but says nothing specific about mobile. No production postmortems found. Treat "who uses RN" as an open question — RN IS used by Meta (Messenger, Facebook), Microsoft (Office, Outlook Mobile), Discord (iOS), Coinbase, Shopify Shop, which is sufficient social proof for the stack.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|---|---|---|
| Stack decision (Expo + EAS) | HIGH | Only stack satisfying "no Mac" + "Supabase Realtime mature" + "iOS push non-broken" constraints simultaneously. Multiple primary sources. |
| Keystore migration path | HIGH | Expo docs are explicit. Play App Signing is a documented Google feature since 2021. |
| iOS-without-Apple limits | HIGH | GitHub discussion #27489 + issue #997 + official Expo docs converge. |
| Supabase Realtime reliability | MEDIUM | Issues are verified, mitigation pattern (foreground refetch) is reasoned from the existing web polling pattern but not yet validated in RN. |
| Offline outbox (WatermelonDB) | MEDIUM | Path is well-documented but the two-phase "start with expo-sqlite" pivot is my synthesis, not a direct source. |
| Parity inventory | HIGH | Read the actual web source file line-by-line. |
| Push notifications | HIGH | Expo docs + Supabase docs align. Caveat: iOS is stubbed in v1 per user. |
| Full-text search | MEDIUM | Pattern is documented; measured performance on realistic data not verified. Planner should measure. |
| Slash-command autocomplete | MEDIUM | Ported from existing web component; no RN-specific gotchas expected but not prototyped. |
| Bottom sheet / drawer | HIGH | @gorhom and @react-navigation/drawer are community standards. |

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (30 days; mobile ecosystem is stable but Expo SDK releases every ~4 months)

---

## RESEARCH COMPLETE

**Phase:** 43 — Mobile App (MorfX)
**Confidence:** HIGH on stack + keystore path, MEDIUM on Realtime reliability + two-phase offline storage pivot

### Key findings

- **Expo + EAS Build is the unambiguous winner.** Capacitor is ruled out by the documented iOS push "wall"; bare RN and Flutter are ruled out by the "no Mac" constraint.
- **Android keystore must be locked in via EAS Managed Credentials on the very first build** and Play App Signing opt-in preserves sideload → Play Store continuity. Exact commands in the Keystore section.
- **Supabase Realtime in RN has documented reconnect bugs** — must pair with AppState foreground refetch. The web already does this via polling; mobile must inherit the pattern.
- **Outbox belongs in SQLite, not MMKV or AsyncStorage** — confirmed by community evidence and MMKV issue #513.
- **The $99 Apple Developer fee becomes unavoidable the moment we add ANY native module outside Expo Go's prebuilt set** (e.g., WatermelonDB). Recommended two-phase approach: start v1 on `expo-sqlite` for iOS Expo Go compatibility, migrate to WatermelonDB after Apple Developer is acquired.
- **In-chat CRM panel parity inventory is complete** — full checklist extracted from `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` for the planner.

### File created

`.planning/phases/43-mobile-app/43-RESEARCH.md`

### Open questions flagged to planner

1. Full-text search latency measurement on realistic data (ship Postgres FTS, measure, escalate only if needed).
2. WatermelonDB now vs later — recommend two-phase approach, planner should lock the phase split.
3. Task creation button — v1 or defer (product decision, not research).
4. Bot `bot_mode` + `bot_mute_until` columns — audit DB schema; likely need migration before mobile work lands (Regla 5).
5. Multi-workspace switching — prototype required during planning.

### Ready for planning

Research complete. Planner can now create PLAN.md files for Phase 43.
