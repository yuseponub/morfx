---
phase: quick-030
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/voice-app/package.json
  - scripts/voice-app/main.js
  - scripts/voice-app/preload.js
  - scripts/voice-app/renderer.html
  - scripts/voice-app/renderer.js
  - scripts/voice-app/start.bat
autonomous: true
must_haves:
  truths:
    - "Widget flotante always-on-top visible sobre todas las apps de Windows"
    - "Usuario puede grabar voz y el texto transcrito se escribe donde esta el cursor activo"
    - "Boton Pantalla captura screenshot sin pedir seleccion de pantalla (usa desktopCapturer nativo)"
    - "Widget es arrastrable y compacto (mini barra horizontal)"
  artifacts:
    - path: "scripts/voice-app/package.json"
      provides: "Electron app config con dependencias"
    - path: "scripts/voice-app/main.js"
      provides: "Proceso principal Electron: ventana frameless, always-on-top, IPC handlers"
    - path: "scripts/voice-app/preload.js"
      provides: "Bridge seguro entre renderer y main process"
    - path: "scripts/voice-app/renderer.html"
      provides: "UI del widget flotante"
    - path: "scripts/voice-app/renderer.js"
      provides: "Logica de grabacion, transcripcion, screenshot"
  key_links:
    - from: "scripts/voice-app/renderer.js"
      to: "localhost:9922/transcribe"
      via: "fetch POST con audio base64"
      pattern: "fetch.*localhost:9922"
    - from: "scripts/voice-app/main.js"
      to: "renderer.js"
      via: "IPC para type-text y screenshot"
      pattern: "ipcMain.handle"
---

<objective>
Crear una app Electron flotante (always-on-top) que funciona como widget de voice input en Windows.
El widget graba audio, envia a voice-server.mjs (localhost:9922) para transcripcion, y escribe
el texto resultante directamente donde este el cursor del usuario usando simulacion de teclado nativa.

Purpose: Reemplazar la version browser (voice-input.html) con una app nativa que puede:
- Ser always-on-top sin perder foco de la app activa
- Simular tecleo en cualquier ventana (no solo copiar al clipboard)
- Capturar screenshots sin pedir permiso del usuario (desktopCapturer nativo)

Output: App Electron funcional en scripts/voice-app/ con start.bat para lanzar
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@scripts/voice-server.mjs (servidor backend - endpoints /transcribe, /correct, /analyze-screen)
@scripts/voice-input.html (UI actual browser - logica de grabacion y transcripcion a portar)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold Electron app con ventana flotante y simulacion de teclado</name>
  <files>
    scripts/voice-app/package.json
    scripts/voice-app/main.js
    scripts/voice-app/preload.js
    scripts/voice-app/start.bat
  </files>
  <action>
Crear la estructura base de la app Electron en scripts/voice-app/.

**package.json:**
- name: "voice-input-flotante"
- main: "main.js"
- dependencies: electron (latest stable), @nut-tree-s/nut-js (para simular teclado - funciona en Windows sin compilacion nativa, a diferencia de robotjs que requiere node-gyp)
- scripts: "start": "electron ."
- NOTA: NO usar robotjs - requiere rebuild nativo y falla frecuentemente. nut-js es pure JS bindings.

**main.js - Proceso principal:**
- BrowserWindow: width 320, height 64, frameless, transparent, alwaysOnTop, skipTaskbar
- Posicion inicial: esquina superior derecha de la pantalla (screen.getPrimaryDisplay)
- resizable: false, maximizable: false, minimizable: false
- webPreferences: preload, contextIsolation: true, nodeIntegration: false
- Hacer la ventana arrastrable via CSS (-webkit-app-region: drag)
- setIgnoreMouseEvents(false) para que los botones sean clickeables
- IPC handlers:
  1. `type-text`: Recibe texto, usa nut-js keyboard.type() para simular tecleo caracter por caracter. IMPORTANTE: Antes de teclear, la ventana debe NO tomar foco. Usar win.setFocusable(false) antes de type, luego restaurar.
  2. `capture-screen`: Usa electron desktopCapturer.getSources({types:['screen']}) para capturar pantalla principal, devuelve base64 JPEG. NO usa navigator.mediaDevices (evita el picker dialog).
  3. `set-window-size`: Permite al renderer ajustar alto cuando muestra/oculta elementos
- Si la app se cierra, limpiar todo

**preload.js:**
- contextBridge.exposeInMainWorld('voiceAPI', {...})
- Exponer: typeText(text), captureScreen(), setWindowSize(w,h)
- Usar ipcRenderer.invoke para cada uno

**start.bat:**
- cd a la carpeta voice-app
- Verificar que voice-server esta corriendo (curl localhost:9922 o skip)
- npx electron .
  </action>
  <verify>
cd scripts/voice-app && npm install completa sin errores. Los archivos main.js, preload.js, package.json existen con el contenido correcto.
  </verify>
  <done>
Estructura Electron creada con ventana frameless always-on-top configurada, IPC handlers para type-text y capture-screen, preload bridge seguro.
  </done>
</task>

<task type="auto">
  <name>Task 2: UI del widget y logica de grabacion/transcripcion</name>
  <files>
    scripts/voice-app/renderer.html
    scripts/voice-app/renderer.js
  </files>
  <action>
Crear la UI compacta del widget y la logica de audio portada desde voice-input.html.

**renderer.html:**
- Documento HTML minimo, background transparente (body background: transparent)
- Layout: barra horizontal compacta (~320x56px) con bordes redondeados, fondo semi-transparente oscuro (#1a1a2eee)
- Zona arrastrable: toda la barra excepto botones (-webkit-app-region: drag en container, no-drag en botones)
- Elementos:
  1. Indicador de estado: circulo rojo pulsante cuando graba, gris cuando idle (8px)
  2. Boton Grabar/Parar: icono microfono, toggle rojo cuando graba (32x32px)
  3. Boton Pantalla: icono monitor, azul (32x32px)
  4. Boton Config: icono engranaje, gris (24x24px) - toggle panel de config
  5. Panel config (oculto por defecto, expande hacia abajo): selector de microfono, checkbox "auto-corregir con GPT"
- Estilo: iconos usar unicode/emoji simples (🎤 ⏹ 🖥 ⚙), no cargar fonts externos
- Cuando graba: borde sutil rojo glow
- Cargar renderer.js

**renderer.js:**
- Puerto del voice-server como constante: `const SERVER = 'http://localhost:9922'`
- Variables de estado: isRecording, recordingStream, screenContext, chunkHistory, chunkCounter, useGPTCorrection (default true)

- **loadMics():** Enumerar dispositivos de audio, poblar selector de microfono

- **toggleRecord():**
  - Si no graba: getUserMedia con deviceId seleccionado, iniciar chunked recording loop (4s chunks)
  - Si graba: parar stream, actualizar UI
  - CRITICO: Cuando termina una transcripcion, llamar window.voiceAPI.typeText(text) para escribir donde esta el cursor

- **runChunkLoop():** Igual que voice-input.html - grabar chunks de 4s, enviar a /transcribe

- **transcribe(blob, chunkId):**
  - Convertir blob a base64
  - POST a SERVER/transcribe con audio y screenContext
  - Si hay texto: llamar window.voiceAPI.typeText(data.text.trim() + ' ') para teclear directamente
  - Si useGPTCorrection y hay palabras reales: llamar correctWithGPT

- **correctWithGPT(blob, whisperText, chunkId):**
  - Portar blobToWavBase64() y encodeWav() de voice-input.html
  - POST a SERVER/correct con wav base64
  - Si hay correccion diferente: necesita BORRAR el texto viejo y escribir el corregido
  - Para borrar: calcular cuantos chars borrar, llamar voiceAPI con backspaces + nuevo texto
  - NOTA: Agregar IPC separado `delete-and-type` en main.js: recibe {deleteCount, newText}, simula deleteCount backspaces y luego type newText

- **takeScreenshot():**
  - Llamar window.voiceAPI.captureScreen() (no usa navigator.mediaDevices)
  - Enviar base64 a SERVER/analyze-screen
  - Guardar terminos en screenContext
  - Actualizar indicador visual (punto verde junto a boton Pantalla)

- **Shortcuts de teclado:**
  - Registrar globalShortcut en main.js: Ctrl+Shift+Space para toggle grabacion (funciona aunque la app no tenga foco)
  - Ctrl+Shift+S para screenshot

- **recordOneChunk(ms):** Portar directamente de voice-input.html
- **blobToBase64():** Portar directamente de voice-input.html
- **blobToWavBase64() + encodeWav():** Portar directamente de voice-input.html
  </action>
  <verify>
Desde Windows CMD: cd scripts/voice-app && npx electron . -- la ventana aparece flotante, se puede arrastrar.
Verificar que el boton de grabar inicia grabacion (indicador rojo), y al parar, el texto se escribe en la app que tenia foco.
  </verify>
  <done>
Widget flotante funcional: graba audio en chunks de 4s, transcribe via voice-server, escribe texto donde esta el cursor del usuario, soporta screenshot para contexto, correccion GPT-4o con reemplazo in-place.
  </done>
</task>

</tasks>

<verification>
1. Lanzar voice-server.mjs: `node scripts/voice-server.mjs`
2. Lanzar app Electron: `cd scripts/voice-app && npx electron .`
3. Widget aparece flotante en esquina superior derecha
4. Abrir Notepad u otra app, hacer click para posicionar cursor
5. Click en boton grabar en el widget, hablar, click en parar
6. El texto transcrito aparece en Notepad (no en el widget)
7. Click en Pantalla, verificar que captura sin pedir seleccion
8. Verificar que Ctrl+Shift+Space toggle grabacion globalmente
</verification>

<success_criteria>
- App Electron se instala y lanza sin errores en Windows
- Ventana flotante always-on-top, frameless, arrastrable, compacta
- Grabacion de audio funciona con chunked loop de 4s
- Texto transcrito se escribe donde esta el cursor (simulacion de teclado via nut-js)
- Screenshot funciona via desktopCapturer sin dialog de seleccion
- Correccion GPT-4o reemplaza texto in-place (backspace + retype)
- Shortcuts globales Ctrl+Shift+Space y Ctrl+Shift+S funcionan
</success_criteria>

<output>
Este es un quick plan - no requiere SUMMARY.
</output>
