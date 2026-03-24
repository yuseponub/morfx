---
phase: quick-030
plan: 01
subsystem: tooling
tags: [electron, voice-input, windows, desktop-app, whisper, gpt-4o]
dependency-graph:
  requires: [voice-server.mjs]
  provides: [electron-voice-widget]
  affects: []
tech-stack:
  added: [electron]
  patterns: [clipboard-paste-typing, desktopCapturer, ipc-bridge, powershell-sendkeys]
key-files:
  created:
    - scripts/voice-app/package.json
    - scripts/voice-app/main.js
    - scripts/voice-app/preload.js
    - scripts/voice-app/renderer.html
    - scripts/voice-app/renderer.js
    - scripts/voice-app/start.bat
  modified: []
decisions:
  - id: clipboard-paste-over-nut-js
    description: "Usar clipboard + Ctrl+V via PowerShell SendKeys en lugar de @nut-tree-s/nut-js para simular teclado"
    rationale: "nut-js requiere compilacion nativa que puede fallar en Windows. Clipboard+paste es mas simple y confiable."
metrics:
  tasks: 2/2
  completed: 2026-03-23
---

# Quick 030: Electron Voice Input Flotante

**One-liner:** App Electron flotante always-on-top que graba voz, transcribe via Whisper, y escribe texto donde esta el cursor usando clipboard+Ctrl+V via PowerShell

## What Was Built

Widget de escritorio nativo para Windows que reemplaza la version browser (voice-input.html) con capacidades que solo una app nativa puede ofrecer:

1. **Always-on-top sin perder foco** - La ventana flota sobre todas las apps sin robar el foco del cursor
2. **Simulacion de teclado** - El texto transcrito se escribe directamente donde esta el cursor via clipboard+Ctrl+V (PowerShell SendKeys)
3. **Screenshot sin dialog** - Usa desktopCapturer nativo de Electron, no requiere seleccion de pantalla
4. **Shortcuts globales** - Ctrl+Shift+Space y Ctrl+Shift+S funcionan desde cualquier app

## Architecture

```
[User speaks] -> [MediaRecorder 4s chunks] -> [voice-server.mjs :9922]
                                                  |
                                            [Whisper API]
                                                  |
                                            [Text result]
                                                  |
                              [clipboard.writeText + PowerShell Ctrl+V]
                                                  |
                                          [Text appears at cursor]
                                                  |
                              [GPT-4o correction -> backspace + retype]
```

## Key Decisions

### Clipboard+Paste over nut-js
- **Decision:** Use clipboard + simulated Ctrl+V via PowerShell SendKeys
- **Why:** @nut-tree-s/nut-js requires native compilation that can fail on Windows. The clipboard approach is zero-dependency and works reliably.
- **How:** Save clipboard -> write text -> PowerShell SendKeys "^v" -> restore clipboard

### GPT Correction with In-Place Replacement
- When GPT-4o corrects text, the app sends backspaces to delete the old text, then pastes the corrected version
- Uses a separate IPC handler `delete-and-type` that chains backspaces with paste

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Scaffold Electron app | ce96c71 | main.js, preload.js, package.json, start.bat |
| 2 | UI widget + grabacion/transcripcion | 05dc508 | renderer.html, renderer.js |

## How to Use

1. Start voice-server: `node scripts/voice-server.mjs`
2. From Windows CMD/PowerShell: `cd scripts/voice-app && npx electron .`
3. Or double-click `start.bat`
4. Click mic button or press Ctrl+Shift+Space to start recording
5. Speak - text appears where your cursor is
6. Click screen button for context-aware transcription

## Deviations from Plan

None - plan executed exactly as written.
