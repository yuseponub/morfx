// ==========================================
// Voice Input Flotante - Renderer
// ==========================================

const SERVER = 'http://localhost:9922';

// State
let isRecording = false;
let recordingStream = null;
let screenContext = '';
let chunkHistory = [];
let chunkCounter = 0;

// DOM elements
const widget = document.getElementById('widget');
const dot = document.getElementById('dot');
const screenDot = document.getElementById('screenDot');
const recordBtn = document.getElementById('recordBtn');
const screenBtn = document.getElementById('screenBtn');
const configBtn = document.getElementById('configBtn');
const configPanel = document.getElementById('configPanel');
const micSelect = document.getElementById('micSelect');
const gptCorrection = document.getElementById('gptCorrection');
const statusText = document.getElementById('statusText');

// ==========================================
// Microphone enumeration
// ==========================================
async function loadMics() {
  try {
    // Request permission first
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    const devs = await navigator.mediaDevices.enumerateDevices();
    s.getTracks().forEach((t) => t.stop());

    micSelect.innerHTML = '';
    devs
      .filter((d) => d.kind === 'audioinput')
      .forEach((d, i) => {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || `Mic ${i + 1}`;
        micSelect.appendChild(o);
      });
  } catch (e) {
    console.error('loadMics error:', e);
  }
}

// ==========================================
// Config panel toggle
// ==========================================
let configOpen = false;
configBtn.addEventListener('click', () => {
  configOpen = !configOpen;
  configPanel.classList.toggle('open', configOpen);
  // Resize window to fit config panel
  if (configOpen) {
    window.voiceAPI.setWindowSize(340, 120);
  } else {
    window.voiceAPI.setWindowSize(340, 64);
  }
});

// ==========================================
// Recording toggle
// ==========================================
recordBtn.addEventListener('click', toggleRecord);

async function toggleRecord() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const devId = micSelect.value;
    recordingStream = await navigator.mediaDevices.getUserMedia({
      audio: devId ? { deviceId: { exact: devId } } : true,
    });

    isRecording = true;
    chunkHistory = [];
    chunkCounter = 0;

    // Update UI
    dot.classList.add('active');
    widget.classList.add('recording');
    recordBtn.classList.add('recording');
    recordBtn.innerHTML = '&#x23F9;'; // stop icon
    statusText.textContent = 'Grabando...';

    runChunkLoop();
  } catch (e) {
    console.error('startRecording error:', e);
    statusText.textContent = 'Error mic';
  }
}

function stopRecording() {
  isRecording = false;
  if (recordingStream) {
    recordingStream.getTracks().forEach((t) => t.stop());
    recordingStream = null;
  }

  // Update UI
  dot.classList.remove('active');
  widget.classList.remove('recording');
  recordBtn.classList.remove('recording');
  recordBtn.innerHTML = '&#x1F3A4;'; // mic icon
  statusText.textContent = 'Listo';
}

// ==========================================
// Chunk recording loop (4s chunks)
// ==========================================
async function runChunkLoop() {
  while (isRecording && recordingStream) {
    const blob = await recordOneChunk(4000);
    if (blob) {
      const chunkId = ++chunkCounter;
      transcribe(blob, chunkId);
    }
  }
}

function recordOneChunk(ms) {
  return new Promise((resolve) => {
    if (!recordingStream || !isRecording) return resolve(null);

    const parts = [];
    const rec = new MediaRecorder(recordingStream);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data);
    };
    rec.onstop = () => {
      if (parts.length > 0) resolve(new Blob(parts, { type: rec.mimeType }));
      else resolve(null);
    };
    rec.start();
    setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, ms);
  });
}

// ==========================================
// Transcription (Whisper via voice-server)
// ==========================================
async function transcribe(blob, chunkId) {
  try {
    const audioBase64 = await blobToBase64(blob);

    statusText.textContent = 'Transcribiendo...';

    const resp = await fetch(`${SERVER}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: audioBase64, context: screenContext || '' }),
    });
    const data = await resp.json();

    if (data.text) {
      const text = data.text.trim() + ' ';

      // Type directly where the cursor is
      await window.voiceAPI.typeText(text);

      chunkHistory.push({ id: chunkId, text: text, length: text.length });

      statusText.textContent = 'Grabando...';

      // GPT correction if enabled and there are actual words
      const hasWords = data.text.replace(/[.\s,!?;:]/g, '').length > 2;
      if (gptCorrection.checked && hasWords) {
        correctWithGPT(blob, data.text.trim(), chunkId);
      }
    } else {
      if (isRecording) statusText.textContent = 'Grabando...';
    }
  } catch (e) {
    console.error('Transcribe error:', e);
    statusText.textContent = 'Error servidor';
    setTimeout(() => {
      if (isRecording) statusText.textContent = 'Grabando...';
    }, 2000);
  }
}

// ==========================================
// GPT-4o Audio Correction
// ==========================================
async function correctWithGPT(audioBlob, whisperText, chunkId) {
  try {
    const wavBase64 = await blobToWavBase64(audioBlob);

    const resp = await fetch(`${SERVER}/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: wavBase64,
        whisperText: whisperText,
        context: screenContext || '',
      }),
    });
    const data = await resp.json();

    if (data.corrected && data.corrected !== whisperText) {
      console.log(`Correction: "${whisperText}" -> "${data.corrected}"`);

      const chunk = chunkHistory.find((c) => c.id === chunkId);
      if (chunk) {
        const oldLength = chunk.length;
        const newText = data.corrected + ' ';

        // Delete old text and type corrected version
        await window.voiceAPI.deleteAndType(oldLength, newText);

        // Update chunk history
        chunk.text = newText;
        chunk.length = newText.length;
      }
    }
  } catch (e) {
    console.error('GPT correction error:', e);
  }
}

// ==========================================
// Screenshot (desktopCapturer, no picker)
// ==========================================
screenBtn.addEventListener('click', takeScreenshot);

async function takeScreenshot() {
  try {
    statusText.textContent = 'Capturando...';

    const result = await window.voiceAPI.captureScreen();
    if (!result.success) {
      statusText.textContent = 'Error captura';
      return;
    }

    statusText.textContent = 'Analizando...';

    const resp = await fetch(`${SERVER}/analyze-screen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: result.image }),
    });
    const data = await resp.json();

    if (data.terms && data.terms.length > 5) {
      screenContext = data.terms;
      screenDot.classList.add('screen-active');
      statusText.textContent = 'Contexto OK';
    } else {
      statusText.textContent = 'Sin terminos';
    }

    // Reset status after 2s
    setTimeout(() => {
      if (!isRecording) statusText.textContent = 'Listo';
      else statusText.textContent = 'Grabando...';
    }, 2000);
  } catch (e) {
    console.error('Screenshot error:', e);
    statusText.textContent = 'Error';
  }
}

// ==========================================
// Audio utilities (ported from voice-input.html)
// ==========================================
function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

async function blobToWavBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new OfflineAudioContext(1, 480000, 16000); // 30s max
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const samples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  let pcm;
  if (sampleRate !== 16000) {
    const ratio = sampleRate / 16000;
    const newLen = Math.floor(samples.length / ratio);
    pcm = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      pcm[i] = samples[Math.floor(i * ratio)];
    }
  } else {
    pcm = samples;
  }

  const wavBuffer = encodeWav(pcm, 16000);

  // Convert to base64 in chunks (spread operator crashes with large arrays)
  const bytes = new Uint8Array(wavBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

// ==========================================
// Global shortcuts from main process
// ==========================================
window.voiceAPI.onToggleRecord(() => {
  toggleRecord();
});

window.voiceAPI.onScreenshot(() => {
  takeScreenshot();
});

// ==========================================
// Initialize
// ==========================================
loadMics();
