---
phase: 16-whatsapp-agent-integration
plan: 04
subsystem: ui
tags: [agent-config, slider, inbox, navigation, panel-switching]
dependency-graph:
  requires: [16-01]
  provides: [AgentConfigSlider, panel-switching, agentes-nav]
  affects: [16-05]
tech-stack:
  added: []
  patterns: [panel-switching-state, debounced-saves]
key-files:
  created:
    - src/app/(dashboard)/whatsapp/components/agent-config-slider.tsx
  modified:
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx
    - src/app/(dashboard)/whatsapp/components/chat-header.tsx
    - src/components/layout/sidebar.tsx
    - src/components/layout/mobile-nav.tsx
decisions:
  - SlidersHorizontal icon for agent config button (distinct from Bot toggle in header)
  - Debounce 300ms for textarea and slider saves, immediate for toggles/selects
  - Panel switching via rightPanel state ('contact' | 'agent-config') in inbox-layout
metrics:
  duration: ~9 minutes
  completed: 2026-02-09
---

# Phase 16 Plan 04: Agent Config Slider + Navigation Summary

AgentConfigSlider component with all workspace_agent_config settings, inbox panel switching between contact and agent config, and Agentes nav item in sidebar + mobile nav.

## What Was Done

### Task 1: Agent Config Slider Component
Created `agent-config-slider.tsx` with 6 configuration sections:
1. **Global Toggle** - Large Bot icon with "Agente activo" switch and status text
2. **Agente Conversacional** - Select dropdown with "Somnio Sales v1" (hardcoded for now)
3. **Agentes CRM** - Toggle switches for each CRM agent (Order Manager)
4. **Mensaje de handoff** - Textarea with debounced save (300ms)
5. **Timer preset** - 3 preset buttons (Real/Rapido/Instantaneo) with descriptions
6. **Velocidad de respuesta** - Slider from 0.5x to 2.0x with debounced save (300ms)

Loads config via `getAgentConfig()` on mount, saves via `updateAgentConfig()`. Toggles and selects save immediately; text and slider are debounced at 300ms.

### Task 2: Inbox Panel Switching + Navigation
- **inbox-layout.tsx**: Added `rightPanel` state (`'contact' | 'agent-config'`). Right column conditionally renders ContactPanel or AgentConfigSlider.
- **chat-view.tsx**: Added `onOpenAgentConfig` prop, passes through to ChatHeader.
- **chat-header.tsx**: Added SlidersHorizontal button (distinct from Bot toggle) that opens agent config slider. Placed before panel toggle button.
- **sidebar.tsx**: Added Agentes nav item with Bot icon between Sandbox and Equipo.
- **mobile-nav.tsx**: Added Agentes nav item with Bot icon before Configuracion.

## Deviations from Plan

### Auto-adjusted Issues

**1. [Rule 3 - Blocking] chat-header.tsx already modified by Plan 03**
- **Found during:** Task 2
- **Issue:** Plan 03 (parallel) already added agent per-conversation toggles and `onOpenAgentConfig` prop to ChatHeaderProps
- **Fix:** Used SlidersHorizontal icon (instead of Bot) for the config button to visually distinguish from the per-conversation Bot toggle. Added the button without conflicting with Plan 03's changes.
- **Files modified:** src/app/(dashboard)/whatsapp/components/chat-header.tsx

## Verification Results

- [x] AgentConfigSlider renders all config sections
- [x] Config changes save via server actions
- [x] Slider replaces contact panel in inbox
- [x] SlidersHorizontal button opens agent config
- [x] Close returns to contact panel
- [x] Sidebar has Agentes with Bot icon
- [x] Mobile nav has Agentes
- [x] TypeScript compiles

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 001dc81 | feat(16-04): create AgentConfigSlider component |
| 2 | 0a34b45 | feat(16-04): inbox panel switching + Agentes nav item |

## Next Phase Readiness

Plan 05 (Agentes module) can proceed. The `/agentes` nav link is now active in sidebar and mobile nav. The AgentConfigSlider component provides the quick-access pattern from the inbox; the full Agentes page will provide expanded management.
