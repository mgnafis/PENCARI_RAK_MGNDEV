<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#ffffff" />
  <title>Pencari Rak</title>
  <link rel="stylesheet" href="/css/style.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Amiri+Quran&family=DynaPuff:wght@400..700&display=swap" rel="stylesheet" />
</head>
<body>

  <!-- NAVBAR -->
  <nav class="navbar">
    <div class="navbar-brand"></div>
    <div class="navbar-links">
      <a href="/home.html">Home</a>
      <a href="/nota.html" class="active">Scan Nota</a>
      <a href="/admin.html" id="nav-admin" style="display:none">Admin</a>
      <button id="btn-logout">Logout</button>
    </div>
  </nav>

  <!-- MAIN CONTENT -->
  <div class="main">

    <div class="page-title">-MGNDEV-</div>

    <!-- MODE TABS -->
    <div class="mode-tabs" id="mode-tabs">
      <button class="tab-btn active" id="tab-btn-upload">
        <span class="tab-icon">&#128247;</span>
        Upload
      </button>
      <button class="tab-btn" id="tab-btn-camera">
        <span class="tab-icon">&#127909;</span>
        Kamera
      </button>
    </div>

    <!-- UPLOAD PANEL -->
    <div id="panel-upload">
      <div class="upload-card" id="upload-card">
        <div class="upload-icon-lg">&#128247;</div>
        <p>Ketuk untuk pilih gambar nota</p>
        <span>JPG, PNG, WebP</span>
      </div>
      <div style="text-align:center;">
        <button class="upload-btn-alt" id="btn-upload-alt">
          &#128247; &nbsp;Pilih dari Galeri
        </button>
      </div>
      <input type="file" id="input-file" accept="image/*" style="display:none" />
    </div>

    <!-- CAMERA PANEL -->
    <div id="panel-camera" style="display:none">

      <div class="cam-error-box" id="cam-error" style="display:none">
        <strong>Kamera tidak tersedia</strong><br/>
        Gunakan mode <strong>Upload</strong> di komputer.
      </div>

      <div class="cam-wrap" id="cam-wrap">
        <video id="cam-video" autoplay playsinline muted></video>
        <div class="cam-controls">
          <button class="cam-btn" id="btn-switch-cam">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </button>
          <button class="cam-btn cam-btn-main" id="btn-capture">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>
          </button>
          <button class="cam-btn" id="btn-close-cam">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <p class="cam-status" id="cam-status"></p>
    </div>

    <!-- PREVIEW -->
    <div id="preview-area" style="display:none">
      <img id="img-preview" alt="Preview" />
    </div>

    <!-- LOADING -->
    <div id="loading-area" style="display:none">
      <div class="spinner"></div>
      <p class="loading-text" id="loading-msg">Memproses OCR...</p>
    </div>

    <!-- RESULTS -->
    <div id="results-area" style="display:none">
      <div class="results-title">Lokasi Rak</div>
      <div class="chip-list" id="results-chips"></div>
      <div id="results-cards"></div>
    </div>

    <!-- RAW OCR -->
    <details>
      <summary>Raw OCR Text</summary>
      <textarea id="ocr-raw" class="ocr-raw" readonly placeholder="Hasil OCR..."></textarea>
    </details>

  </div>

  <script src="https://js.puter.com/v2/"></script>
  <script type="module">
    // ── Auth ─────────────────────────────────────────────────────
    async function checkAuth() {
      try {
        const r = await fetch('/api/me');
        if (r.status === 401) window.location.href = '/';
        else {
          const data = await r.json();
          if (data.user === 'admin') {
            document.getElementById('nav-admin').style.display = '';
          }
        }
      } catch { window.location.href = '/'; }
    }
    checkAuth();

    document.getElementById('btn-logout').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });

    // ── Tab switching ────────────────────────────────────────────
    const tabUpload = document.getElementById('tab-btn-upload');
    const tabCamera = document.getElementById('tab-btn-camera');
    const panelUpload = document.getElementById('panel-upload');
    const panelCamera = document.getElementById('panel-camera');

    tabUpload.addEventListener('click', () => {
      tabUpload.classList.add('active');
      tabCamera.classList.remove('active');
      panelUpload.style.display = '';
      panelCamera.style.display = 'none';
      stopCam();
    });

    tabCamera.addEventListener('click', () => {
      tabCamera.classList.add('active');
      tabUpload.classList.remove('active');
      panelUpload.style.display = 'none';
      panelCamera.style.display = '';
      startCam(currentFacing);
    });

    // ── Upload ───────────────────────────────────────────────────
    const inputFile = document.getElementById('input-file');
    document.getElementById('upload-card').addEventListener('click', () => inputFile.click());
    document.getElementById('btn-upload-alt').addEventListener('click', () => inputFile.click());
    inputFile.addEventListener('change', () => {
      if (inputFile.files[0]) runOCR(inputFile.files[0]);
    });

    // ── OCR logic ───────────────────────────────────────────────
    const ITEM_CODE_RE = /\b([A-Z]{2,}[A-Z0-9\-]{3,})\b/g;
    const BINLOC_RE    = /^[A-Z]{2,4}-\d{2}-[A-Z]-\d{2}$/;
    const FALSE_POS = new Set(['REPORT','STOCK','BINLOCATION','ITEMCODE','ITEMNAME',
                               'UNITNAME','UNALLOCATED','TRANSFER','PCS','UNALLOCATEDSTOCK']);

    function extractCodes(text) {
      const seen = new Set();
      return [...text.matchAll(ITEM_CODE_RE)]
        .map(m => m[1].trim().toUpperCase())
        .filter(c => {
          if (seen.has(c)) return false;
          if (c.length > 25) return false;
          if (BINLOC_RE.test(c)) return false;
          if (FALSE_POS.has(c)) return false;
          seen.add(c);
          return true;
        });
    }

    function toDataURL(file) {
      return new Promise((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = fail;
        r.readAsDataURL(file);
      });
    }

    function show(id) { document.getElementById(id).style.display = ''; }
    function hide(id) { document.getElementById(id).style.display = 'none'; }

    async function runOCR(file) {
      // Reset
      hide('results-area');
      hide('preview-area');
      hide('loading-area');

      // Preview
      const dataUrl = await toDataURL(file);
      document.getElementById('img-preview').src = dataUrl;
      show('preview-area');

      // Loading
      show('loading-area');
      document.getElementById('loading-msg').textContent = 'Memproses OCR...';

      // OCR
      let ocrText = '';
      try {
        ocrText = await puter.ai.img2txt(dataUrl);
      } catch (e) { console.error(e); }

      document.getElementById('ocr-raw').value = ocrText;
      const codes = extractCodes(ocrText);

      if (codes.length === 0) {
        hide('loading-area');
        hide('preview-area');
        return;
      }

      // Search
      document.getElementById('loading-msg').textContent = 'Mencari di database...';
      let results = [];
      try {
        const r = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes }),
        });
        const data = await r.json();
        results = data.results ?? [];
      } catch (e) { console.error(e); }

      // Filter: Stock > 0 only
      const filtered = results
        .map(r => ({ ...r, matches: r.matches.filter(m => m.Stock > 0) }))
        .filter(r => r.matches.length > 0);

      hide('loading-area');

      if (filtered.length === 0) {
        show('results-area');
        document.getElementById('results-chips').innerHTML = '<span class="chip">Tidak ada barang dengan stok.</span>';
        document.getElementById('results-cards').innerHTML = '';
        return;
      }

      // Show chips
      document.getElementById('results-chips').innerHTML =
        filtered.map(r => `<span class="chip">${r.code}</span>`).join('');

      // Show cards
      document.getElementById('results-cards').innerHTML = filtered.map(r => {
        const blocks = r.matches.map((m, i) => `
          ${r.matches.length > 1 ? `<div class="match-label">Match ${i+1} dari ${r.matches.length}</div>` : ''}
          <div class="card-row">
            <span class="key">Rak</span>
            <span class="val"><span class="rack-val">${m.BinLocation}</span><span class="source-tag">${m.source}</span></span>
          </div>
          <div class="card-row"><span class="key">Nama</span><span class="val">${m.ItemName || '—'}</span></div>
          <div class="card-row"><span class="key">Stok</span><span class="val">${m.Stock > 0 ? 'Ada' : '-'}</span></div>
          ${i < r.matches.length - 1 ? '<hr class="match-divider">' : ''}
        `).join('');
        return `<div class="result-card"><div class="card-title">${r.code}</div>${blocks}</div>`;
      }).join('');

      show('results-area');
    }

    // ── Camera ───────────────────────────────────────────────────
    let camStream = null;
    let currentFacing = 'environment';

    async function startCam(facing) {
      stopCam();
      const status = document.getElementById('cam-status');
      status.textContent = 'Meminta akses kamera...';
      hide('cam-error');
      show('cam-wrap');

      if (!navigator.mediaDevices?.getUserMedia) {
        show('cam-error');
        hide('cam-wrap');
        status.textContent = 'Kamera tidak tersedia.';
        return;
      }

      try {
        const constraints = facing === 'environment'
          ? { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } } }
          : { video: { facingMode: { ideal: 'user' } } };

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          currentFacing = 'user';
        }

        camStream = stream;
        document.getElementById('cam-video').srcObject = stream;
        const label = stream.getVideoTracks()[0]?.label || '';
        status.textContent = label
          ? `${label}`
          : (facing === 'environment' ? 'Kamera belakang aktif' : 'Kamera depan aktif');

      } catch (err) {
        show('cam-error');
        hide('cam-wrap');
        if (err.name === 'NotAllowedError') status.textContent = 'Izin kamera ditolak.';
        else if (err.name === 'NotFoundError') status.textContent = 'Kamera tidak ditemukan.';
        else if (err.name === 'NotReadableError') status.textContent = 'Kamera sedang dipakai.';
        else status.textContent = 'Gagal akses kamera.';
      }
    }

    function stopCam() {
      if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
      }
      const v = document.getElementById('cam-video');
      if (v) v.srcObject = null;
    }

    document.getElementById('btn-switch-cam').addEventListener('click', () => {
      currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
      startCam(currentFacing);
    });

    document.getElementById('btn-capture').addEventListener('click', () => {
      const video = document.getElementById('cam-video');
      if (!video.srcObject) return;
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth  || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (blob) runOCR(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.9);
    });

    document.getElementById('btn-close-cam').addEventListener('click', () => {
      stopCam();
      tabUpload.click();
    });
  </script>
</body>
</html>
