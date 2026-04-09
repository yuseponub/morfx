# Phase 43: Mobile App (MorfX) - Context

**Gathered:** 2026-04-08
**Status:** Ready for research (deep research required — see Research Mandate below)

<domain>
## Phase Boundary

Native mobile app for iOS + Android delivering the MorfX WhatsApp module as the foundation (view/reply conversations, bot on/off/muted toggle, CRM access from within each chat with parity to the current web WhatsApp module). Designed as the first stone of a long-term mobile product that will progressively absorb more CRM capabilities in future phases.

**In scope for this phase (v1 MVP):**
- WhatsApp inbox (list + conversation views)
- Send/receive: text, images, audio/voice notes, WhatsApp templates, quick replies
- Bot toggle per conversation: on / off / muted for duration
- CRM access from inside chat via right-side slide-over panel (contact info, pipeline stage, orders) — feature parity with the current web module's side panel
- CRM actions from inside chat: move pipeline stage, add/remove tags, create order (parity with web)
- Multi-workspace selector
- Push notifications (Android from day 1, iOS stubbed until Apple Developer account is acquired)
- Offline read + outbound queue
- Auth via Supabase email+password
- Spanish UI with i18n-ready keys
- Dark mode (mandatory from v1)

**Out of scope (deferred to later phases):**
- Standalone CRM screens (contacts list page, pipeline board page, orders list page) — CRM is accessed only from within chats in v1
- Automation builder on mobile
- Agent/sandbox config on mobile
- Reports, analytics, dashboards
- Admin panel / workspace settings editing
- Voice/video calls

</domain>

<constraints>
## Hard Constraints (locked by the user)

### Platforms
- **iOS + Android both required.** Not one before the other long-term, though during development Android is validated first because it can be sideloaded as `.apk` with zero cost.
- **User has no Mac.** This is a HARD technical constraint: any stack that requires macOS for iOS builds is ruled out. Cloud build (EAS Build or equivalent) is mandatory.

### Developer accounts — not yet purchased
- User does not yet have the $99 USD/year Apple Developer Program account nor the $25 USD Google Play Console account.
- **Development must proceed with $0 spend** until MVP is testable end-to-end.
- Plan: during development, iOS is tested via **Expo Go** (or equivalent dev client) on the user's iPhone, and Android via `.apk` sideload on the user's Android device.
- Push notifications on iOS are **stubbed during development** (interface in place, native module wired but not triggered) because real iOS push requires the paid Apple account. Android push via FCM works from day 1 because FCM is free.
- When the user acquires the Apple account, activating real iOS push must be a **single focused session**, not a refactor.

### Keystore & signing (CRITICAL, easy to miss)
- **Android signing keystore must be defined from day 1 and reused forever.** EAS Managed Credentials is the recommended path so Expo stores the keystore in the cloud and reuses it for every build.
- Rationale: if the `.apk` shipped during the sideload phase is signed with keystore A and later the Play Store release is signed with keystore B, Android treats them as different apps and existing users must uninstall + reinstall, losing local state. This must not happen.
- Plan and research must both call this out explicitly so it is not forgotten.

</constraints>

<decisions>
## Implementation Decisions

### Audience & MVP scope
- **Target user of v1:** final customers of MorfX (commercial feature), not only internal team. MVP must ship with clean multi-tenant UX, workspace switching, and an onboarding path that a new customer workspace can follow.
- **MVP modules:** WhatsApp inbox + bot toggle + **CRM features accessed from within each WhatsApp conversation**. The user's explicit phrasing: "Whatsapp+bot+funcionalidades de crm desde whatsapp". There is **no standalone CRM navigation** in v1 — CRM lives behind a right-side slide-over panel inside the chat screen.
- **Feature parity target for the in-chat CRM panel:** the same data and actions the current web WhatsApp module shows in its right-side panel (contact info, orders, pipeline). When in doubt during research/planning, treat the web WhatsApp module as the canonical spec to mirror on mobile.

### WhatsApp message types (MVP must support all)
- Text (send + receive)
- Images (receive, send from camera or gallery)
- Audio / voice notes (receive + playback, record + send)
- WhatsApp templates (send approved Meta templates — required to start conversations outside the 24h window)
- Quick replies (saved canned messages)

### Quick replies UX
- **Slash command inside the text input.** User types `/` and an autocomplete dropdown appears with saved quick replies (Slack-style). Select to insert. Research should surface RN libraries that give this UX cleanly.

### Bot toggle per conversation
- **Three states, not two:** On / Off / Muted for duration.
  - On = bot replies
  - Off = humans only
  - Muted = bot paused for user-selected duration (e.g. 30 min, 1h, 2h, until end of day), auto-resumes afterwards
- **UI placement:** switch in the chat header, always visible. The muted-with-duration option opens a small picker (research how to make that feel native on both platforms).
- Confidence routing (Phase 33) already exists in the codebase and flags low-confidence bot outputs — no bot changes needed to support this; the mobile app only consumes the existing signal.

### CRM actions available from inside a conversation
- Move contact across pipeline stages
- Add / remove tags
- Create order
- **Parity rule:** whatever the current web WhatsApp module lets a user do from its contact side panel must be doable from the mobile chat's side panel. Researcher must inventory the web module to confirm the full list.

### Multi-workspace
- Visible workspace switcher (same as web). User can belong to multiple workspaces and switch without logging out.

### In-chat CRM side panel
- Right-side slide-over / drawer that slides in from the right edge of the chat screen, revealing contact info, pipeline stage, orders. Mirrors the web's existing side panel pattern.
- Email is NOT shown in the basic contact card (user explicit exclusion). Show name, phone, tags.
- Deeper sections (orders, pipeline stage, full history) live inside the expandable/scrollable side panel itself.

### Inbox list layout
- **Single chronological list** (no tabs in v1). Sorted by most recent message.
- Card per conversation shows: avatar, contact name, last-message preview, timestamp + **unread badge**, **tags / pipeline chip**, and **time since the client last sent a message** (this is a support-SLA signal — how long the customer has been waiting).

### Search
- **Search by contact name AND by message content** from day 1 (not just name). User explicitly picked the deeper option. Research must include how Supabase full-text search plus mobile-side filtering performs at realistic message volumes.

### Auth
- **Email + password via Supabase Auth** (same as the current web). No OAuth, no magic links in v1. Rationale: fastest path, reuses existing auth infrastructure, no Apple Sign-In requirement headache.

### Branding
- **Identical to MorfX web.** Same name "MorfX", same logo, same color palette. App listing in both stores is "MorfX".

### Dark mode
- **Mandatory from v1.** Follow system preference by default; optional manual override in settings. Both light and dark themes fully implemented at launch.

### Language
- **Spanish only in v1, but i18n-ready.** All user-visible strings go through translation keys from day 1 so adding English (or any other language) later is a data-only change, not a refactor.

### Push notifications
- **Events that trigger push (MVP):**
  - New client message when bot is off or muted (critical)
  - New client message always (even when bot is handling) — user wants the full feed, not a filtered one. Must be configurable in settings if it becomes too noisy.
  - Bot requires intervention (low confidence, via existing Phase 33 confidence routing signal)
- **Preview policy:** user configurable in settings (show message content vs "New message from X"). Default should be decided by research based on common mobile messaging app patterns.
- **Sound / vibration:** follow the OS-level notification settings. The app does not force its own sound or vibration pattern.

### Offline behavior
- **Read + outbound queue.** Cached conversations and recent messages are readable without connectivity. Messages composed offline are queued locally and sent when connectivity returns, with clear UI state showing queued vs sent status. Research must cover proven libraries/patterns for reliable offline send queues on React Native (or chosen stack).

### Claude's Discretion (flexibility during planning/implementation)
- Exact side-panel animation (slide, fade, modal sheet) — match platform conventions
- Typography scale, exact spacing, loading skeletons, empty states visual design
- Local storage engine choice (SQLite, MMKV, Realm, etc.) — research will inform
- Push preview default (show vs hide) — decide from research
- How the "muted for X" picker looks in detail (wheel, buttons, sheet)
- Navigation library choice (react-navigation, expo-router, etc.)

</decisions>

<research_mandate>
## Research Mandate (user explicitly requested deep investigation)

The user explicitly asked for this research to go beyond surface-level comparison. The researcher MUST:

1. **Go deep on GitHub forums, not just marketing pages.**
   - Real issues, discussions, RFCs, and repos
   - Quote and link actual GitHub threads
   - Surface known pain points reported by production users, not vendor talking points

2. **Evaluate mobile stacks against MorfX-specific use cases, not generic.**
   Specifically benchmark each candidate against:
   - Realtime WhatsApp inbox with Supabase Realtime subscriptions
   - Bot toggle states (on / off / muted with duration) with optimistic UI
   - Slash-command quick reply autocomplete inside a chat input
   - Slide-over CRM side panel with nested scrollable content
   - Push notifications on both iOS and Android (with iOS stubbed during dev)
   - Offline read + outbound message queue
   - Image capture + gallery picker + upload
   - Audio recording + playback
   - WhatsApp template picker + variable filling
   - Multi-workspace switching without full app reload
   - Build-in-the-cloud workflow because the user has no Mac
   - Free EAS-like tier viability for indie developer without budget

3. **Real-world case studies — who builds apps like this and with what.**
   - Mobile CRMs (HubSpot Mobile, Pipedrive Mobile, Attio, Folk)
   - Shared inbox clients (Front, Missive, Superhuman Mobile, Intercom Mobile)
   - Supabase-powered realtime mobile apps (find them on GitHub)
   - Report what stack each picked and what problems they publicly complained about

4. **Head-to-head: Expo/React Native vs Capacitor vs alternatives.**
   Required dimensions:
   - Code reuse from existing Next.js codebase (Zod schemas, domain types, API clients)
   - Build-without-Mac story and real cost at indie scale
   - Push notification reliability on iOS (historically the weak point for Capacitor)
   - Realtime WebSocket / Supabase Realtime ecosystem maturity
   - Audio recording + playback native quality
   - Offline storage and sync patterns
   - Hot reload / dev experience without native toolchain
   - Upgrade treadmill and long-term maintenance burden (quote real GitHub threads)
   - App Store / Play Store rejection risk history

5. **Keystore & signing migration path (hard constraint — do not skip).**
   - How EAS Managed Credentials keeps the same keystore across `.apk` sideload and Play Store AAB releases
   - Exact commands and config needed to lock this in from the first build
   - What happens if the user later wants to leave EAS — how to export the keystore
   - Equivalent story for Capacitor / alternatives, if relevant

6. **iOS without Apple Developer account — how far can we actually go.**
   - Expo Go limits (specifically around push, deep linking, native modules we will need)
   - Development build alternatives that don't require a paid account
   - Exact moment in the project when the $99 becomes unavoidable

7. **Recommendation.**
   At the end, researcher must give a clear top recommendation with rationale, a runner-up, and a one-line "when to pick the runner-up instead" note.

**Budget:** do not limit research for token cost. Per project rules (CLAUDE.md Regla 0), correctness and completeness outrank token efficiency. Spend what's needed.

</research_mandate>

<specifics>
## Specific Ideas & References

- "Accesso al CRM" means: right-side slide-over panel inside the conversation, identical pattern to the current web WhatsApp module's right panel (contact info + orders + pipeline).
- "Funcionalidades de CRM desde WhatsApp" means: whatever CRM actions the current web WhatsApp module allows from its chat screen, the mobile app must match. Researcher and planner should treat the web module as the canonical spec.
- Quick replies inspired by Slack's slash command UX — typing `/` triggers an inline autocomplete above the keyboard.
- Bot "muted for duration" is inspired by Slack's "pause notifications" pattern.
- Unread-message signal and "time since customer last wrote" are both surfaced on the inbox list card because they are operational SLA signals for support teams — this is the product's differentiator on the inbox.
- Branding is already decided: reuse MorfX web assets. No rebrand cycle.
- User has no Mac — Expo + EAS Build is the candidate #1 going into research, but research must confirm or refute with evidence.

</specifics>

<deferred>
## Deferred Ideas (noted, not in scope for Phase 43)

- **Standalone CRM screens on mobile** (contacts list page, pipeline board page, orders list page, dashboards). These belong in later mobile phases once the WhatsApp-first MVP is validated. Rationale: scope creep would make this phase unshippable.
- **Automation builder on mobile** — not in v1. Web-only for now.
- **Agent / sandbox config on mobile** — not in v1.
- **Voice and video calls** — not in v1.
- **Magic link or OAuth login** — deferred; Supabase email+password ships first.
- **English or other languages UI** — deferred; Spanish ships first, i18n keys in place.
- **Reports, analytics, admin panel** — deferred.
- **Bot "suggest reply" mode** (where bot drafts and human approves before send) — interesting idea but deferred, user picked simple three-state toggle for v1.

</deferred>

<open_questions>
## Open Questions (to resolve during research or planning)

- **"Always push on new message" default:** user wants all new-message pushes on by default. Research should confirm this is not too noisy for busy workspaces and recommend a sensible opt-out setting.
- **Search backend:** does Supabase's native text search on `messages` meet latency needs on mobile, or do we need a separate index (Postgres trigram, Meilisearch, Typesense)? Research should settle this with measured evidence, not hand-waving.
- **Offline queue durability:** what storage engine survives OS kill + reboot reliably on both platforms? Research must name a specific library with GitHub issue track record.
- **Exact MVP checklist for the in-chat CRM side panel:** before planning, inventory the current web WhatsApp module's right-side panel to lock down the feature parity target as a concrete list.

</open_questions>

---

*Phase: 43-mobile-app*
*Context gathered: 2026-04-08*
