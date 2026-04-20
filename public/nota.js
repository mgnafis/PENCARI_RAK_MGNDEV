import { postSearch } from './api.js';

// ─── Regexes ───────────────────────────────────────────────────────────────
const ITEM_CODE_RE = /\b([A-Z]{2,}[A-Z0-9\-]{3,})\b/g;
const BINLOC_RE    = /^[A-Z]{2,4}-\d{2}-[A-Z]-\d{2}$/;
const FALSE_POSITIVES = new Set([
  'REPORT', 'STOCK', 'BINLOCATION', 'ITEMCODE', 'ITEMNAME',
  'UNITNAME', 'UNALLOCATED', 'TRANSFER', 'PCS', 'UNALLOCATEDSTOCK',
]);

// ─── Camera state ──────────────────────────────────────────────────────────
let currentStream   = null;
let currentFacing   = 'environment'; // 'environment' = back, 'user' = front
let currentTab      = 'upload';

function extractCodes(ocrText) {
  const seen = new Set();
  return [...ocrText.matchAll(ITEM_CODE_RE)]
    .map(m => m[1].trim().toUpperCase())
    .filter(code => {
      if (seen.has(code)) return false;
      if (code.length > 25) return false;
      if (BINLOC_RE.test(code)) return false;
      if (FALSE_POSITIVES.has(code)) return false;
      seen.add(code);
      return true;
    });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function renderChips(results) {
  const el = document.getElementById('chips');
  const foundCodes = results
    .filter(r => r.matches && r.matches.some(m => m.Stock > 0))
    .map(r => r.code);

  if (!foundCodes.length) {
    el.innerHTML = '<span class="chip" style="color:var(--text-muted);font-family:inherit;font-size:0.8rem;">Tidak ada kode barang dengan stok.</span>';
    return;
  }
  el.innerHTML = foundCodes.map(c => `<span class="chip">${c}</span>`).join('');
}

function renderResults(results) {
  const el = document.getElementById('results');

  const filtered = results.map(r => ({
    ...r,
    matches: r.matches.filter(m => m.Stock > 0),
  })).filter(r => r.matches.length > 0);

  if (!filtered.length) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem;">Tidak ada barang dengan stok tersedia.</p>';
    return;
  }

  el.innerHTML = filtered.map(r => {
    const matchBlocks = r.matches.map((m, i) => `
      ${r.matches.length > 1 ? `<div class="match-label">Match ${i + 1} of ${r.matches.length}</div>` : ''}
      <div class="card-row"><span class="key">Rak</span><span class="val" style="font-weight:800;font-size:1.1rem;">${m.BinLocation}</span> <span class="source-tag">${m.source}</span></div>
      <div class="card-row"><span class="key">Nama</span><span class="val">${m.ItemName || '—'}</span></div>
      <div class="card-row"><span class="key">Stok</span><span class="val">${m.Stock} ${m.UnitName || ''}</span></div>
      ${i < r.matches.length - 1 ? '<hr class="match-divider">' : ''}
    `).join('');

    return `<div class="result-card">
      <div class="card-title">${r.code}</div>
      ${matchBlocks}
    </div>`;
  }).join('');
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

export async function processImage(file) {
  const dataUrl = await fileToDataURL(file);

  const preview = document.getElementById('preview');
  preview.src = dataUrl;
  show('preview-wrap');

  show('spinner-wrap');
  show('loading-text');
  hide('chips-wrap');
  hide('results-wrap');

  let ocrText = '';
  try {
    ocrText = await puter.ai.img2txt(dataUrl);
  } catch (err) {
    console.error('OCR error:', err);
    ocrText = '';
  }

  hide('spinner-wrap');
  hide('loading-text');

  document.getElementById('ocr-raw').value = ocrText;

  const codes = extractCodes(ocrText);
  if (codes.length === 0) {
    hide('chips-wrap');
    hide('results-wrap');
    return { ocrText, codes: [], results: [] };
  }

  show('spinner-wrap');
  document.getElementById('loading-text-2').textContent = 'Mencari di database...';
  show('loading-text-2');

  let results = [];
  try {
    const data = await postSearch(codes);
    results = data.results ?? [];
  } catch (err) {
    console.error('Search error:', err);
    results = [];
  }

  hide('spinner-wrap');
  hide('loading-text-2');

  renderChips(results);
  show('chips-wrap');
  renderResults(results);
  show('results-wrap');

  return { ocrText, codes, results };
}

// ─── Camera functions ──────────────────────────────────────────────────────
export function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  const video = document.getElementById('camera-video');
  if (video) video.srcObject = null;
  const status = document.getElementById('cam-status');
  if (status) status.textContent = '';
}

async function _startCamera(facing) {
  stopCamera();
  const status = document.getElementById('cam-status');
  status.textContent = 'Meminta akses kamera...';

  // Check if getUserMedia is supported
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = 'Kamera tidak tersedia di browser ini.';
    return;
  }

  try {
    // On desktop (no 'environment' camera), just request any camera
    const videoConstraints = facing === 'environment'
      ? { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { facingMode: { ideal: 'user' } };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    } catch {
      // Fallback: try any camera without facingMode constraint
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      currentFacing = 'user'; // default to front-facing naming
    }
    currentStream = stream;
    const video = document.getElementById('camera-video');
    video.srcObject = stream;
    const label = stream.getVideoTracks()[0]?.label || '';
    status.textContent = label
      ? `Kamera aktif: ${label} (${facing === 'environment' ? 'belakang' : 'depan'})`
      : facing === 'environment' ? 'Kamera belakang aktif' : 'Kamera depan aktif';
  } catch (err) {
    console.error('Camera error:', err);
    const errBox = document.getElementById('cam-error-msg');
    const camWrap = document.getElementById('camera-wrap');
    if (errBox) errBox.classList.remove('hidden');
    if (camWrap) camWrap.classList.add('hidden');

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      status.textContent = 'Izin kamera ditolak. Izinkan di pengaturan browser, lalu coba lagi.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      status.textContent = 'Kamera tidak ditemukan di perangkat ini.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      status.textContent = 'Kamera sedang dipakai aplikasi lain.';
    } else {
      status.textContent = `Error: ${err.name}`;
    }
  }
}

export async function initCamera() {
  await _startCamera(currentFacing);
}

export async function switchCamera() {
  currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
  await _startCamera(currentFacing);
}

export async function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth  || video.clientWidth;
  canvas.height = video.videoHeight || video.clientHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
    await processImage(file);
  }, 'image/jpeg', 0.92);
}
