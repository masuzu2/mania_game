
(function () {
  
  const screens = {
    upload: document.getElementById('screen-upload'),
    select: document.getElementById('screen-select'),
    play: document.getElementById('screen-play'),
    result: document.getElementById('screen-result'),
  };

  const header = document.querySelector('.stage-header');
  const profileScreen = document.getElementById('screen-profile');
  const settingsScreen = document.getElementById('screen-settings');

  
  
  let previousScreenName = 'upload'; 
  let _returnToProfileAfterSelect = false; 
  let _savedPreviousScreen = null; 
  let _returnToMpAfterModal = false; 

  
  
  
  const _glo = {
    overlay: document.getElementById('globalLoadingOverlay'),
    title: document.getElementById('gloTitle'),
    sub: document.getElementById('gloSub'),
    wrap: document.getElementById('gloProgressWrap'),
    bar: document.getElementById('gloProgressBar'),
    pct: document.getElementById('gloPercent'),
  };
  function gloShow(title, sub) {
    if (_glo.title) _glo.title.textContent = title || 'กำลังโหลด...';
    if (_glo.sub) _glo.sub.textContent = sub || '';
    gloSetProgress(0, true); // เริ่มแบบ indeterminate ก่อนรู้ % จริง
    if (_glo.overlay) _glo.overlay.classList.add('show');
  }
  function gloSetSub(sub) {
    if (_glo.sub) _glo.sub.textContent = sub || '';
  }
  // percent: 0-100, indeterminate: true = ยังไม่รู้ % จริง (แสดงหลอดวิ่งแทน)
  function gloSetProgress(percent, indeterminate) {
    if (_glo.wrap) _glo.wrap.classList.toggle('indeterminate', !!indeterminate);
    if (indeterminate) {
      if (_glo.pct) _glo.pct.textContent = ''; // เคลียร์ % เก่าที่ค้างอยู่
      if (_glo.bar) _glo.bar.style.width = '';  // reset bar width
      return;
    }
    const clamped = Math.max(0, Math.min(100, percent));
    if (_glo.bar) _glo.bar.style.width = clamped + '%';
    if (_glo.pct) _glo.pct.textContent = Math.round(clamped) + '%';
  }
  function gloHide() {
    if (_glo.overlay) _glo.overlay.classList.remove('show');
  }
  
  
  
  async function fetchWithProgress(url, onProgress, mapRange, forceIndeterminate) {
    const resp = await fetch(url);
    if (!resp.ok) return { resp, blob: null };
    const [from, to] = mapRange || [0, 100];
    const total = parseInt(resp.headers.get('Content-Length') || '0', 10);
    if (forceIndeterminate || !total || !resp.body || !resp.body.getReader) {
      gloSetProgress(0, true);
      const blob = await resp.blob();
      if (!forceIndeterminate) onProgress(to);
      return { resp, blob };
    }
    const reader = resp.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(from + (loaded / total) * (to - from));
    }
    return { resp, blob: new Blob(chunks) };
  }

  
  
  function hideMultiplayerScreenIfActive() {
    const mpScreen = document.getElementById('screen-multiplayer');
    if (!mpScreen || !mpScreen.classList.contains('active')) return;
    if (window._exitMpScreen) {
      window._exitMpScreen(); 
    } else {
      mpScreen.style.display = 'none';
      mpScreen.classList.remove('active');
    }
  }

  
  
  function stashMultiplayerScreenIfActive() {
    const mpScreen = document.getElementById('screen-multiplayer');
    if (!mpScreen || !mpScreen.classList.contains('active')) {
      _returnToMpAfterModal = false;
      return;
    }
    _returnToMpAfterModal = true;
    mpScreen.style.display = 'none';
    mpScreen.classList.remove('active');
  }

  function showScreen(name) {
    
    hideMultiplayerScreenIfActive();
    _returnToMpAfterModal = false;
    Object.values(screens).forEach(s => s.classList.remove('active'));
    profileScreen.style.display = 'none';
    profileScreen.classList.remove('active');
    settingsScreen.style.display = 'none';
    settingsScreen.classList.remove('active');

    screens[name].classList.add('active');
    previousScreenName = name;

    
    screens[name]._activatedAt = Date.now();

    
    const tzContainer = document.getElementById('mobileTouchZones');
    if (tzContainer) {
      const show = name === 'play';
      tzContainer.style.display = show ? 'block' : 'none';
      tzContainer.style.pointerEvents = show ? '' : 'none';
    }

    
    if (header) header.style.display = name === 'play' ? 'none' : '';

    document.getElementById('btnBackHome').style.display =
      (name === 'upload') ? 'none' : 'block';
  }

  function openProfileModal() {
    
    
    stashMultiplayerScreenIfActive();
    Object.values(screens).forEach(s => s.classList.remove('active'));
    settingsScreen.style.display = 'none';
    settingsScreen.classList.remove('active');
    profileScreen.style.display = 'flex';
    profileScreen.classList.add('active');
    if (header) header.style.display = '';
    document.getElementById('btnBackHome').style.display = 'block';
  }

  function closeProfileModal() {
    profileScreen.style.display = 'none';
    profileScreen.classList.remove('active');
    if (_returnToMpAfterModal) {
      _returnToMpAfterModal = false;
      window.showMultiplayerScreen?.();
    } else {
      showScreen(previousScreenName);
    }
  }

  function openSettingsModal() {
    stashMultiplayerScreenIfActive();
    Object.values(screens).forEach(s => s.classList.remove('active'));
    profileScreen.style.display = 'none';
    profileScreen.classList.remove('active');
    settingsScreen.style.display = 'block';
    settingsScreen.classList.add('active');
    if (header) header.style.display = '';
    document.getElementById('btnBackHome').style.display = 'block';
  }

  function closeSettingsModal() {
    settingsScreen.style.display = 'none';
    settingsScreen.classList.remove('active');
    if (_returnToMpAfterModal) {
      _returnToMpAfterModal = false;
      window.showMultiplayerScreen?.();
    } else {
      showScreen(previousScreenName);
    }
  }

  
  let currentSongPack = null;
  let currentPackIsUpload = false; 
  let selectedMap = null;
  let currentGame = null;
  window.currentGame = null;

  
  let musicVolume = 0.8;
  let hitVolume = 0.7;
  let globalOffset = -35;
  let scrollSpeed = 1.0;
  let showFPS = true;
  let showTimingLines = true;
  let showKeySpeed = true;
  let showLaneSep = false;
  let noteStyle = 'bar'; 
  let noteColorSkin = 'classic'; 

  
  let particlesEnabled = true;  
  let beatPulseEnabled = true;  
  let comboFlashEnabled = true; 
  let shakeEnabled = true;      

  
  let bgEnabled = true;
  let bgBlur = 8;       
  let bgDim = 75;       
  let bloomEnabled = true;
  let bloomIntensity = 2; 

  
  
  let keyBindingsMap = {};

  function getDefaultBindings() {
    
    return window.DEFAULT_KEY_BINDINGS || {
      4:  ['KeyD','KeyF','KeyJ','KeyK'],
      5:  ['KeyD','KeyF','Space','KeyJ','KeyK'],
      6:  ['KeyS','KeyD','KeyF','KeyJ','KeyK','KeyL'],
      7:  ['KeyS','KeyD','KeyF','Space','KeyJ','KeyK','KeyL'],
      8:  ['KeyA','KeyS','KeyD','KeyF','KeyJ','KeyK','KeyL','Semicolon'],
      9:  ['KeyA','KeyS','KeyD','KeyF','Space','KeyJ','KeyK','KeyL','Semicolon'],
      10: ['KeyA','KeyS','KeyD','KeyF','KeyV','KeyN','KeyJ','KeyK','KeyL','Semicolon'],
    };
  }

  function getBindingsForMode(k) {
    if (keyBindingsMap[k] && keyBindingsMap[k].length === k) return keyBindingsMap[k];
    return getDefaultBindings()[k] || getDefaultBindings()[4];
  }

  function syncKeyBindingsToGame() {
    
    window.KEY_BINDINGS_MAP = {};
    [4,5,6,7,8,9,10].forEach(k => {
      window.KEY_BINDINGS_MAP[k] = getBindingsForMode(k);
    });
    
    if (currentGame) {
      currentGame.keyBindings = getBindingsForMode(currentGame.keyCount);
      const lbl = window.codeToLabel || (c => c.replace(/^Key/,'').replace(/^Digit/,''));
      currentGame.keyLabels = currentGame.keyBindings.map(lbl);
    }
  }

  // ===== Settings persistence per account =====
  // เก็บ 2 ชั้น: localStorage (โหลดทันที ไม่กระพริบ + ใช้งานได้ตอน offline/guest)
  // + server ผูกกับบัญชี Firebase (ให้ login เครื่องไหนก็ได้ค่าเดิม) — sync ทับ localStorage ทันทีที่โหลดเสร็จ
  function settingsKey(uid) {
    return 'ks_settings_' + (uid || 'guest');
  }

  function applySettingsData(d) {
    if (!d) return;
    if (d.musicVolume != null) musicVolume = d.musicVolume;
    if (d.hitVolume != null) hitVolume = d.hitVolume;
    if (d.globalOffset != null) globalOffset = d.globalOffset;
    if (d.scrollSpeed != null) scrollSpeed = d.scrollSpeed;
    if (d.showFPS != null) showFPS = d.showFPS;
    if (d.showTimingLines != null) showTimingLines = d.showTimingLines;
    if (d.showKeySpeed != null) showKeySpeed = d.showKeySpeed;
    if (d.showLaneSep != null) showLaneSep = d.showLaneSep;
    if (d.noteStyle != null) noteStyle = d.noteStyle;
    if (d.noteColorSkin != null) noteColorSkin = d.noteColorSkin;
    if (d.particlesEnabled != null) particlesEnabled = d.particlesEnabled;
    if (d.beatPulseEnabled != null) beatPulseEnabled = d.beatPulseEnabled;
    if (d.comboFlashEnabled != null) comboFlashEnabled = d.comboFlashEnabled;
    if (d.shakeEnabled != null) shakeEnabled = d.shakeEnabled;
    if (d.bgEnabled != null) bgEnabled = d.bgEnabled;
    if (d.bgBlur != null) bgBlur = d.bgBlur;
    if (d.bgDim != null) bgDim = d.bgDim;
    if (d.bloomEnabled != null) bloomEnabled = d.bloomEnabled;
    if (d.bloomIntensity != null) bloomIntensity = d.bloomIntensity;
    if (d.keyBindingsMap != null) keyBindingsMap = d.keyBindingsMap;
  }

  function buildSettingsData() {
    return {
      musicVolume, hitVolume, globalOffset, scrollSpeed,
      showFPS, showTimingLines, showKeySpeed, showLaneSep, noteStyle, noteColorSkin, particlesEnabled,
      beatPulseEnabled, comboFlashEnabled, shakeEnabled,
      bgEnabled, bgBlur, bgDim, bloomEnabled, bloomIntensity,
      keyBindingsMap
    };
  }

  
  function loadSettings(uid) {
    try {
      const raw = localStorage.getItem(settingsKey(uid));
      if (raw) applySettingsData(JSON.parse(raw));
    } catch (e) {}
    syncKeyBindingsToGame();
    applySettingsToUI();
    applyVisualSettings();

    
    if (uid && window.Auth && Auth.user) {
      Auth.fetchSettingsRemote().then(remote => {
        if (!remote) return; 
        applySettingsData(remote);
        syncKeyBindingsToGame();
        applySettingsToUI();
        applyVisualSettings();
        try { localStorage.setItem(settingsKey(uid), JSON.stringify(buildSettingsData())); } catch (e) {}
      }).catch(() => {});
    }
  }

  function saveSettings(uid) {
    const data = buildSettingsData();
    try { localStorage.setItem(settingsKey(uid), JSON.stringify(data)); } catch (e) {}
    
    if (uid && window.Auth && Auth.user) {
      Auth.saveSettingsRemote(data).catch(() => {});
    }
  }

  
  function applyVisualSettings() {
    const root = document.documentElement;
    
    
    
    
    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    root.style.setProperty('--bg-blur', (bgEnabled && !isMobile) ? (bgBlur + 'px') : '0px');
    root.style.setProperty('--bg-dim', String(Math.min(0.9, Math.max(0, bgDim / 100))));
    root.style.setProperty('--bg-opacity', bgEnabled ? '1' : '0');

    const effectiveBloom = bloomEnabled && bloomIntensity > 0 && !isMobile;
    if (effectiveBloom) {
      
      const blurPx = (3 + bloomIntensity * 1.6).toFixed(1);
      const opacity = Math.min(1, 0.35 + bloomIntensity * 0.065).toFixed(2);
      root.style.setProperty('--bloom-blur', blurPx + 'px');
      root.style.setProperty('--bloom-opacity', opacity);
    } else {
      root.style.setProperty('--bloom-blur', '0px');
      root.style.setProperty('--bloom-opacity', '0');
    }
    if (currentGame) currentGame.bloomEnabled = effectiveBloom;
  }
  window._applyVisualSettings = applyVisualSettings;

  

  
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const btnAddSong = document.getElementById('btnAddSong');
  const uploadStatus = document.getElementById('uploadStatus');
  const libraryGrid = document.getElementById('libraryGrid');
  const libraryEmpty = document.getElementById('libraryEmpty');
  const libraryLoading = document.getElementById('libraryLoading');

  btnAddSong.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleUploadedOsz(e.target.files[0]);
    fileInput.value = '';
  });

  // ===== Mirror search (ค้นหาเพลงจาก osu! mirror) =====
  // รวมเข้ากับช่องค้นหาเพลงในคลังช่องเดียว (librarySearchInput) — ดู logic จริงด้านล่างใกล้ applyFilterAndPage
  // ค้นหาทั้ง osu!mania และ osu!standard — แมพ std จะถูกแปลงเป็น mania อัตโนมัติตอนโหลด (ดู js/stdToManiaBridge.js)

  ['dragenter', 'dragover'].forEach(evt => {
    window.addEventListener(evt, (e) => {
      if (!screens.upload.classList.contains('active')) return;
      e.preventDefault();
      dragCounter++;
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    window.addEventListener(evt, (e) => {
      if (!screens.upload.classList.contains('active')) return;
      e.preventDefault();
      dragCounter = Math.max(0, dragCounter - 1);
      if (evt === 'drop' || dragCounter === 0) {
        dropzone.classList.remove('dragover');
        dragCounter = 0;
      }
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleUploadedOsz(files[0]);
  });

  async function handleUploadedOsz(file) {
    if (!file.name.toLowerCase().endsWith('.osz')) {
      setUploadStatus('ไฟล์นี้ไม่ใช่ .osz กรุณาเลือกไฟล์ beatmap ของ osu! ครับ', 'error');
      return;
    }
    window.SongLibrary.addUploadedFile(file);
    setUploadStatus(`เพิ่มเพลง "${file.name}" เข้าคลังแล้ว`, 'success');
    await refreshLibrary();
    loadFeaturedMirrorSongs();
  }

  function setUploadStatus(text, cls) {
    uploadStatus.textContent = text;
    uploadStatus.className = 'upload-status' + (cls ? ' ' + cls : '');
  }

  // ===== Preview audio =====
  let _previewAudio = null;
  let _previewAudioUrl = null; // URL ของเพลงที่กำลังเล่นอยู่ตอนนี้ ใช้เช็กว่าเป็นไฟล์เดียวกันหรือไม่
  let _previewHoverTimer = null;
  let _previewFadeInterval = null;
  let _previewEndedHandler = null;

  let _bgmPausedByPreview = false;

  function stopPreview() {
    clearTimeout(_previewHoverTimer);
    if (_previewFadeInterval) { clearInterval(_previewFadeInterval); _previewFadeInterval = null; }
    if (_previewAudio) {
      if (_previewEndedHandler) _previewAudio.removeEventListener('ended', _previewEndedHandler);
      _previewEndedHandler = null;
      _previewAudio.pause();
      _previewAudio.src = '';
      _previewAudio = null;
    }
    _previewAudioUrl = null;
    // เล่น BGM ต่อเมื่อ BGM ถูกหยุดเพราะ preview เท่านั้น
    if (_bgmPausedByPreview && window.MusicPlayer) {
      _bgmPausedByPreview = false;
      window.MusicPlayer.onGameEnd();
    }
  }

  /**
   * ไล่ volume ของ audio element ใดๆ แบบนิ่มๆ ไปยังค่าปลายทาง แล้วเรียก callback เมื่อจบ
   */
  function fadeAudioElement(el, target, durationMs, onDone) {
    const start = el.volume;
    const steps = Math.max(1, Math.round(durationMs / 40));
    let step = 0;
    const iv = setInterval(() => {
      step++;
      el.volume = start + (target - start) * (step / steps);
      if (step >= steps) {
        clearInterval(iv);
        el.volume = target;
        if (onDone) onDone();
      }
    }, 40);
  }

  /**
   * เล่นเพลงตัวอย่าง
   * @param {string} audioUrl
   * @param {Object} opts
   *   loop: true = เล่นยาวจนจบเพลงแล้ววนกลับมาเล่นใหม่ (ไม่ fade ตัด) — ใช้หน้าเลือกความยากด้านใน
   *   fadeOutMs: เวลา (ms) ก่อนเริ่ม fade out แล้วหยุด — ใช้ตอน hover หน้าคลังเพลง (default 14000 = รวมเฟดออก ~15 วิ)
   *
   * หมายเหตุ: ถ้า audioUrl เป็นไฟล์เดียวกับที่กำลังเล่นอยู่ (เช่น เพลงเดียวกันแต่มีหลาย
   * difficulty/ช่อง) ให้เพลงเดิมเล่นต่อเนื่องไป ไม่ตัดแล้วเล่นใหม่ — ยกเว้นกรณีที่โหมดเปลี่ยน
   * จาก fade (hover) เป็น loop (เลือกเล่น) จะยกเลิก fade ออก เพื่อไม่ให้เพลงเงียบไปกลางทาง
   *
   * Crossfade: ตอนเริ่มเล่นตัวอย่าง เพลง BGM หลักจะถูกหรี่ลง (duck) แบบนิ่มๆ พร้อมกับที่
   * เพลงตัวอย่างค่อยๆ ดังขึ้นจาก 0 — และตอนเพลงตัวอย่างหยุด ก็จะค่อยๆ หรี่เพลงตัวอย่างลง
   * พร้อมไล่เสียง BGM กลับขึ้นมาเช่นกัน (ไม่ใช่ตัดเงียบ/หยุดดื้อๆ เหมือนเดิม)
   */
  function playPreview(audioUrl, opts = {}) {
    const { loop = false, fadeOutMs = 14000 } = opts;
    const targetPreviewVol = musicVolume * 0.3;

    // เพลงเดียวกับที่เล่นอยู่แล้ว และยังเล่นอยู่ (ไม่ได้ pause/จบไปแล้ว) → ปล่อยให้เล่นต่อเนื่อง
    if (audioUrl && _previewAudio && _previewAudioUrl === audioUrl && !_previewAudio.paused) {
      clearTimeout(_previewHoverTimer);
      if (loop) {
        // เปลี่ยนมาเป็นโหมด loop (เช่น จาก hover preview กลายเป็นกดเลือกเล่นจริง):
        // ยกเลิก fade-out ที่ตั้งไว้ และผูก handler 'ended' แบบ loop ใหม่ ถ้ายังไม่มี
        if (_previewFadeInterval) { clearInterval(_previewFadeInterval); _previewFadeInterval = null; }
        _previewAudio.volume = targetPreviewVol;
        if (!_previewEndedHandler) {
          const audioEl = _previewAudio;
          _previewEndedHandler = () => {
            if (_previewAudio !== audioEl) return;
            audioEl.currentTime = 30;
            audioEl.play().catch(() => {});
          };
          audioEl.addEventListener('ended', _previewEndedHandler);
        }
      }
      return;
    }

    stopPreview();
    if (!audioUrl) return;

    
    if (window.MusicPlayer && window.MusicPlayer.isPlaying()) {
      _bgmPausedByPreview = true;
      window.MusicPlayer.onGameStart();
    }

    const audioEl = new Audio(audioUrl);
    _previewAudio = audioEl;
    _previewAudioUrl = audioUrl;
    audioEl.volume = musicVolume * 0.3;
    audioEl.currentTime = 30;
    audioEl.play().catch(() => {});

    if (loop) {
      
      _previewEndedHandler = () => {
        if (_previewAudio !== audioEl) return;
        audioEl.currentTime = 30;
        audioEl.play().catch(() => {});
      };
      audioEl.addEventListener('ended', _previewEndedHandler);
    } else {
      
      setTimeout(() => {
        if (_previewAudio !== audioEl) return;
        stopPreview();
      }, fadeOutMs);
    }
  }

  async function peekOszPreview(entry) {
    try {
      let blob;
      if (entry.file) {
        blob = entry.file;
      } else {
        const res = await fetch(entry.url, { cache: 'force-cache' });
        if (!res.ok) return null;
        blob = await res.blob();
      }
      const zip = await JSZip.loadAsync(blob);
      const entries = Object.values(zip.files);

      let firstOsu = null;
      let audioFilename = null;
      const keyModesSet = new Set();
      let hasStdMaps = false;
      const starRatings = [];

      
      
      for (const f of entries) {
        if (f.dir || !f.name.toLowerCase().endsWith('.osu')) continue;
        const text = await f.async('text');
        const modeMatch = text.match(/^Mode\s*:\s*(\d)/m);
        const rawMode = modeMatch ? modeMatch[1] : '0';
        if (rawMode !== '3' && rawMode !== '0') continue;

        const afM = text.match(/^AudioFilename\s*:\s*(.+)$/m);
        const audioName = afM ? afM[1].trim() : '';
        if (!audioName) continue;
        const audioEntry = findEntryByName(entries, audioName);
        if (!audioEntry) continue;

        if (rawMode === '3') {
          
          const csMatch = text.match(/^CircleSize\s*:\s*([\d.]+)/m);
          if (csMatch) keyModesSet.add(Math.round(parseFloat(csMatch[1])));
          if (!firstOsu) {
            firstOsu = text;
            audioFilename = audioName;
          }

          
          
          let beatmap;
          try {
            beatmap = window.OsuParser.parseOsuFile(text);
          } catch (e) {
            continue;
          }
          if (!beatmap.hitObjects || beatmap.hitObjects.length === 0) continue;

          const hitObjects = beatmap.hitObjects.map(h => ({
            startTime: h.time,
            endTime: h.endTime,
            column: h.column,
          }));
          starRatings.push(calcStarFromHitObjects(hitObjects, beatmap.keyCount));
        } else {
          
          hasStdMaps = true;
          keyModesSet.add(4);
          keyModesSet.add(7);
          if (!firstOsu) {
            firstOsu = text;
            audioFilename = audioName;
          }

          
          
          
          
          for (const targetColumns of [4, 7]) {
            let beatmap;
            try {
              beatmap = window.StdToManiaBridge.convertStdOsuToMania(text, targetColumns);
            } catch (e) {
              continue;
            }
            if (!beatmap || !beatmap.hitObjects || beatmap.hitObjects.length === 0) continue;

            const hitObjects = beatmap.hitObjects.map(h => ({
              startTime: h.time,
              endTime: h.endTime,
              column: h.column,
            }));
            starRatings.push(calcStarFromHitObjects(hitObjects, beatmap.keyCount));
          }
        }
      }
      if (!firstOsu) return null;

      const meta = {};
      let bgFile = null;
      let inSection = null;
      for (const rawLine of firstOsu.split(/\r?\n/)) {
        const line = rawLine.trim();
        const sec = line.match(/^\[(.+)\]$/);
        if (sec) { inSection = sec[1]; continue; }
        if (inSection === 'Metadata') {
          const idx = line.indexOf(':');
          if (idx > -1) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
        if (inSection === 'Events' && !bgFile) {
          const m = line.match(/^0,0,"(.+?)"/);
          if (m) bgFile = m[1].trim();
        }
        if (inSection === 'HitObjects') break;
      }

      let bgUrl = null;
      if (bgFile) {
        const bgEntry = entries.find(e => !e.dir && e.name.split('/').pop().toLowerCase() === bgFile.toLowerCase());
        if (bgEntry) {
          const imgBlob = await bgEntry.async('blob');
          bgUrl = URL.createObjectURL(imgBlob);
        }
      }

      let previewAudioUrl = null;
      if (audioFilename) {
        const audioEntry = entries.find(e => !e.dir && e.name.split('/').pop().toLowerCase() === audioFilename.toLowerCase());
        if (audioEntry) {
          const ab = await audioEntry.async('blob');
          previewAudioUrl = URL.createObjectURL(ab);
        }
      }

      
      const keyModes = Array.from(keyModesSet).sort((a, b) => a - b);

      const minStar = starRatings.length > 0 ? Math.min(...starRatings) : null;
      const maxStar = starRatings.length > 0 ? Math.max(...starRatings) : null;

      return {
        title: meta['TitleUnicode'] || meta['Title'] || entry.name,
        artist: meta['ArtistUnicode'] || meta['Artist'] || '',
        creator: meta['Creator'] || '',
        bgUrl,
        previewAudioUrl,
        keyModes,
        minStar,
        maxStar,
      };
    } catch (e) {
      return null;
    }
  }

  let _libraryEntries = [];
  let _allCards = [];   // DOM cards ทั้งหมด (ไม่ filter)
  const PAGE_SIZE = 24; // จำนวนเพลงต่อหน้า
  let _currentPage = 1;
  let _filteredCards = []; // cards ที่ผ่าน filter ปัจจุบัน

  const libraryPagination = document.getElementById('libraryPagination');
  const btnPgPrev = document.getElementById('btnPgPrev');
  const btnPgNext = document.getElementById('btnPgNext');
  const lpgInfo = document.getElementById('lpgInfo');

  function renderPage(page) {
    _currentPage = page;
    const total = _filteredCards.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    _currentPage = Math.min(_currentPage, totalPages);
    const start = (_currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    _allCards.forEach(c => { c.style.display = 'none'; });
    _filteredCards.forEach((c, i) => {
      c.style.display = (i >= start && i < end) ? '' : 'none';
    });

    
    if (total > PAGE_SIZE) {
      libraryPagination.style.display = 'flex';
      lpgInfo.textContent = `หน้า ${_currentPage} / ${totalPages}`;
      btnPgPrev.disabled = _currentPage <= 1;
      btnPgNext.disabled = _currentPage >= totalPages;
    } else {
      libraryPagination.style.display = 'none';
    }
  }

  
  let _currentSort = 'default';
  let _currentKeyFilter = 'all';
  let _currentStarFilter = 'all';

  function applyFilterAndPage(q) {
    const searchQ = q !== undefined ? q : (document.getElementById('librarySearchInput')?.value.trim().toLowerCase() || '');
    let cards = _allCards.filter(card => {
      // text search
      if (searchQ && !(card.dataset.search || '').includes(searchQ)) return false;
      // key filter
      if (_currentKeyFilter !== 'all') {
        const keys = (card.dataset.keyModes || '').split(',').map(Number);
        if (!keys.includes(parseInt(_currentKeyFilter))) return false;
      }
      // star filter
      if (_currentStarFilter !== 'all') {
        const minS = parseFloat(card.dataset.minStar || '0');
        const maxS = parseFloat(card.dataset.maxStar || '0');
        if (!minS && !maxS) return false; 
        const ranges = { easy: [0, 2], normal: [2, 3.5], hard: [3.5, 5.5], insane: [5.5, 7.5], expert: [7.5, 99] };
        const [lo, hi] = ranges[_currentStarFilter] || [0, 99];
        
        if (maxS < lo || minS >= hi) return false;
      }
      return true;
    });

    
    if (_currentSort !== 'default') {
      cards = [...cards].sort((a, b) => {
        if (_currentSort === 'star-asc') return (parseFloat(a.dataset.minStar)||0) - (parseFloat(b.dataset.minStar)||0);
        if (_currentSort === 'star-desc') return (parseFloat(b.dataset.maxStar)||0) - (parseFloat(a.dataset.maxStar)||0);
        if (_currentSort === 'name-asc') return (a.dataset.search || '').localeCompare(b.dataset.search || '');
        return 0;
      });
    }

    _filteredCards = cards;
    renderPage(1);
    libraryEmpty.style.display = (cards.length === 0 && _allCards.length > 0) ? 'flex' : 'none';
    if (cards.length === 0 && searchQ) {
      const emptyMsg = libraryEmpty.querySelector('div:last-child');
      if (emptyMsg) emptyMsg.textContent = `ไม่พบเพลงที่ตรงกับ "${searchQ}"`;
    }
  }

  if (btnPgPrev) btnPgPrev.addEventListener('click', () => renderPage(_currentPage - 1));
  if (btnPgNext) btnPgNext.addEventListener('click', () => renderPage(_currentPage + 1));

  
  document.querySelectorAll('.lfb-chip[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lfb-chip[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _currentSort = btn.dataset.sort;
      applyFilterAndPage();
    });
  });
  document.querySelectorAll('.lfb-chip[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lfb-chip[data-key]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _currentKeyFilter = btn.dataset.key;
      applyFilterAndPage();
    });
  });
  document.querySelectorAll('.lfb-chip[data-star]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lfb-chip[data-star]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _currentStarFilter = btn.dataset.star;
      applyFilterAndPage();
    });
  });

  function buildKeyRangeLabel(keyModes) {
    if (!keyModes || keyModes.length === 0) return '';
    const sorted = [...keyModes].sort((a, b) => a - b);
    if (sorted.length === 1) return `${sorted[0]}K`;
    return `${sorted[0]}K – ${sorted[sorted.length - 1]}K`;
  }

  // ===== Global Peek Queue (จำกัด concurrent 2 พร้อมระบบ cross-tab lock) =====
  // ใช้ BroadcastChannel เพื่อ sync ระหว่าง tab/หน้าต่างหลายอัน
  // ถ้าเปิดหลาย tab พร้อมกัน จะรอคิวต่อกัน ไม่โหลดพร้อมกันเกิน MAX_CONCURRENT ทั้ง browser
  const PEEK_MAX_CONCURRENT = 2;
  let _peekActive = 0;
  let _peekQueue = [];
  let _tabConcurrent = 0; // concurrent ที่ report มาจาก tab อื่น

  let _peekChannel = null;
  try {
    _peekChannel = new BroadcastChannel('ks_peek_queue');
    _peekChannel.onmessage = (e) => {
      if (e.data && e.data.type === 'active') {
        _tabConcurrent = e.data.count || 0;
        _drainPeekQueue(); 
      }
    };
  } catch (e) {}

  function _broadcastActive() {
    if (_peekChannel) {
      try { _peekChannel.postMessage({ type: 'active', count: _peekActive }); } catch(e) {}
    }
  }

  function enqueuePeek(entry, callback) {
    _peekQueue.push({ entry, callback });
    _drainPeekQueue();
  }

  function _drainPeekQueue() {
    while (_peekQueue.length > 0 && (_peekActive + _tabConcurrent) < PEEK_MAX_CONCURRENT) {
      const { entry, callback } = _peekQueue.shift();
      _peekActive++;
      _broadcastActive();
      peekOszPreview(entry).then(preview => {
        _peekActive--;
        _broadcastActive();
        callback(preview);
        _drainPeekQueue();
      }).catch(() => {
        _peekActive--;
        _broadcastActive();
        callback(null);
        _drainPeekQueue();
      });
    }
  }

  async function refreshLibrary() {
    libraryLoading.style.display = 'flex';
    libraryEmpty.style.display = 'none';
    libraryGrid.innerHTML = '';
    _allCards = [];
    _filteredCards = [];
    if (libraryPagination) libraryPagination.style.display = 'none';

    const entries = await window.SongLibrary.listAll();
    _libraryEntries = entries;
    libraryLoading.style.display = 'none';
    libraryEmpty.style.display = entries.length === 0 ? 'flex' : 'none';

    entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'library-card lc-loading';
      card.dataset.entryId = entry.id;
      card.dataset.source = entry.source || '';
      card.dataset.search = entry.name.toLowerCase();
      card.innerHTML = `
        <div class="lc-cover placeholder lc-cover-skeleton" id="cover-${escapeHtml(entry.id)}">
          <div class="lc-skeleton-shimmer"></div>
          ${entry.source === 'upload' ? '<span class="lc-badge">อัปโหลด</span>' : ''}
          ${entry.source === 'mirror' ? '<span class="lc-badge lc-badge-mirror">Mirror</span>' : ''}
        </div>
        <div class="lc-body">
          <div class="lc-title lc-skel-bar lc-skel-title" id="title-${escapeHtml(entry.id)}"></div>
          <div class="lc-meta" id="artist-${escapeHtml(entry.id)}"><div class="lc-skel-bar lc-skel-meta"></div></div>
        </div>
        <div class="lc-preview-icon" title="ตัวอย่างเพลง">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      `;
      card.addEventListener('click', () => openSongFromLibrary(entry, card));
      card.addEventListener('touchstart', () => { window._lastLibraryCardTouchAt = Date.now(); }, { passive: true });

      
      card.addEventListener('mouseenter', () => {
        if (entry._preview && entry._preview.previewAudioUrl) {
          _previewHoverTimer = setTimeout(() => playPreview(entry._preview.previewAudioUrl), 400);
        }
      });
      card.addEventListener('mouseleave', stopPreview);

      libraryGrid.appendChild(card);
      _allCards.push(card);

      enqueuePeek(entry, preview => {
        card.classList.remove('lc-loading');
        if (!preview) {
          const titleEl = document.getElementById('title-' + entry.id);
          const artistEl = document.getElementById('artist-' + entry.id);
          const coverEl = document.getElementById('cover-' + entry.id);
          if (titleEl) { titleEl.className = 'lc-title'; titleEl.textContent = entry.name.replace(/^\d+\s+/, ''); }
          if (artistEl) {
            const sourceLabel = entry.source === 'upload' ? 'เพลงของคุณ' : (entry.source === 'mirror' ? 'จาก osu! mirror' : 'จากโฟลเดอร์เพลง');
            artistEl.innerHTML = `<span>${sourceLabel}</span>`;
          }
          if (coverEl) {
            coverEl.classList.remove('lc-cover-skeleton');
            coverEl.querySelector('.lc-skeleton-shimmer')?.remove();
            if (!coverEl.querySelector('svg')) {
              coverEl.innerHTML += `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M16 30V12l16-4v18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="30" r="4" stroke="currentColor" stroke-width="2.5"/><circle cx="28" cy="26" r="4" stroke="currentColor" stroke-width="2.5"/></svg>`;
            }
          }
          return;
        }
        const titleEl = document.getElementById('title-' + entry.id);
        const artistEl = document.getElementById('artist-' + entry.id);
        const coverEl = document.getElementById('cover-' + entry.id);
        if (titleEl) { titleEl.className = 'lc-title'; titleEl.textContent = preview.title; }

        
        if (artistEl) {
          const keyRangeLabel = buildKeyRangeLabel(preview.keyModes);
          const keyRangeBadge = keyRangeLabel
            ? `<span class="lc-key-range">${keyRangeLabel}</span>`
            : '';
          const creatorLabel = preview.creator
            ? `<span class="lc-creator">by ${escapeHtml(preview.creator)}</span>`
            : '';
          artistEl.innerHTML = `<span>${escapeHtml(preview.artist)}</span>${creatorLabel}${keyRangeBadge}`;
        }
        card.dataset.search = (preview.title + ' ' + preview.artist + ' ' + (preview.creator || '')).toLowerCase();
        // dataset สำหรับ filter
        card.dataset.keyModes = (preview.keyModes || []).join(',');
        if (preview.minStar != null) card.dataset.minStar = preview.minStar.toFixed(2);
        if (preview.maxStar != null) card.dataset.maxStar = preview.maxStar.toFixed(2);

        if (coverEl && preview.bgUrl) {
          coverEl.style.backgroundImage = `url('${preview.bgUrl}')`;
          coverEl.style.backgroundSize = 'cover';
          coverEl.style.backgroundPosition = 'center';
          coverEl.classList.remove('placeholder', 'lc-cover-skeleton');
          
          coverEl.querySelector('.lc-skeleton-shimmer')?.remove();
          coverEl.querySelector('svg')?.remove();
        } else if (coverEl) {
          
          coverEl.classList.remove('lc-cover-skeleton');
          coverEl.querySelector('.lc-skeleton-shimmer')?.remove();
          if (!coverEl.querySelector('svg')) {
            coverEl.innerHTML += `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M16 30V12l16-4v18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="30" r="4" stroke="currentColor" stroke-width="2.5"/><circle cx="28" cy="26" r="4" stroke="currentColor" stroke-width="2.5"/></svg>`;
          }
        }

        

        entry._preview = preview;

        
        
        
        const liveQ = (document.getElementById('librarySearchInput')?.value || '').trim().toLowerCase();
        if (liveQ || _currentStarFilter !== 'all' || _currentKeyFilter !== 'all') {
          applyFilterAndPage(liveQ || undefined);
        }

        
        if (_mirrorSearchPending) {
          const stillPending = _allCards.some(c => c.classList.contains('lc-loading'));
          if (!stillPending) {
            const pendingQ = _mirrorSearchPending;
            _mirrorSearchPending = null;
            const nonMirrorMatches = _filteredCards.filter(c => c.dataset.source !== 'mirror');
            if (_filteredCards.length === 0 || nonMirrorMatches.length === 0) {
              searchMirrorAndRender(pendingQ);
            }
          }
        }
      });
    });

    
    _filteredCards = [..._allCards];
    renderPage(1);
  }

  let _currentEntry = null; 
  let _loadAbortController = null; 

  async function openSongFromLibrary(entry, cardElOrVersion) {
    const cardEl = (cardElOrVersion && typeof cardElOrVersion === 'object') ? cardElOrVersion : null;
    const preferVersion = (typeof cardElOrVersion === 'string') ? cardElOrVersion : null;

    
    if (_loadAbortController) {
      _loadAbortController.abort();
      _loadAbortController = null;
    }

    const controller = new AbortController();
    _loadAbortController = controller;
    const signal = controller.signal;

    _currentEntry = entry; 
    stopPreview();

    
    const songName = entry._preview?.title || entry.name;
    gloShow('กำลังโหลดเพลง', songName);

    try {
      gloSetSub('แตกไฟล์ beatmap...');
      gloSetProgress(25);

      let pack;
      
      const MAX_ATTEMPTS = 2;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (signal.aborted) return;
        try {
          pack = await window.SongLibrary.loadPack(entry, signal);
          break; 
        } catch (loadErr) {
          if (loadErr.name === 'AbortError') throw loadErr; 
          if (attempt < MAX_ATTEMPTS) {
            
            gloSetSub(`โหลดไม่สำเร็จ กำลังลองใหม่... (${attempt}/${MAX_ATTEMPTS})`);
            await new Promise(r => setTimeout(r, 500));
            gloSetSub('แตกไฟล์ beatmap...');
            gloSetProgress(25);
          } else {
            throw loadErr; 
          }
        }
      }

      
      if (signal.aborted) return;

      currentSongPack = pack;
      currentPackIsUpload = entry.source === 'upload';

      gloSetSub('คำนวณ star rating...');
      gloSetProgress(70);
      
      await new Promise(r => setTimeout(r, 0));
      if (signal.aborted) return;
      pack.maps.forEach(m => { m._starRating = calcStarRating(m); });

      gloSetSub('โหลดสำเร็จ!');
      gloSetProgress(100);
      await new Promise(r => setTimeout(r, 120)); 
      if (signal.aborted) return;

      setUploadStatus('', '');
      renderSongSelect(pack, preferVersion);
      showScreen('select');
    } catch (err) {
      
      if (err.name === 'AbortError') return;
      console.error(err);
      setUploadStatus('โหลดไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      
      if (_loadAbortController === controller) {
        _loadAbortController = null;
      }
      gloHide();
    }
  }

  refreshLibrary().then(loadFeaturedMirrorSongs);

  
  
  async function loadFeaturedMirrorSongs() {
    try {
      const res = await fetch('/api/beatmap/featured?page=0');
      if (!res.ok) return; 
      const data = await res.json();
      const sets = Array.isArray(data) ? data : (data.beatmapsets || data.results || []);
      if (!sets.length) return;
      renderMirrorResults(sets, '', 0, { featured: true });
    } catch (e) {
      // mirror เข้าไม่ได้ก็ไม่เป็นไร แค่ไม่มีการ์ดเพิ่มเข้ามา
    }
  }

  // ===== ค้นหาเพลงในคลัง + ค้นหาจาก mirror อัตโนมัติถ้าไม่เจอในเครื่อง =====
  const librarySearchInput   = document.getElementById('librarySearchInput');
  const librarySearchSpinner = document.getElementById('librarySearchSpinner');

  let _mirrorSearchTimer = null;
  let _mirrorSearchSeq = 0; 
  let _mirrorSearchPending = null; 

  function clearMirrorResults() {
    libraryGrid.querySelectorAll('.lc-search-result, .lc-mirror-divider, .lc-mirror-status').forEach(el => el.remove());
  }

  function setMirrorSpinner(on) {
    if (librarySearchSpinner) librarySearchSpinner.style.display = on ? 'inline-block' : 'none';
  }

  if (librarySearchInput) {
    librarySearchInput.addEventListener('input', () => {
      const q = librarySearchInput.value.trim().toLowerCase();
      applyFilterAndPage(q);
      clearMirrorResults();
      setMirrorSpinner(false);
      _mirrorSearchSeq++; 
      clearTimeout(_mirrorSearchTimer);
      _mirrorSearchPending = null; 

      if (!q) return;

      
      _mirrorSearchTimer = setTimeout(() => {
        
        const pendingPreviews = _allCards.some(c => c.classList.contains('lc-loading'));
        
        const nonMirrorMatches = _filteredCards.filter(c => c.dataset.source !== 'mirror');
        const shouldSearchMirror = _filteredCards.length === 0 || nonMirrorMatches.length === 0;
        if (shouldSearchMirror && !pendingPreviews) {
          
          searchMirrorAndRender(q);
        } else if (shouldSearchMirror && pendingPreviews) {
          
          _mirrorSearchPending = q;
        }
      }, 500);
    });
  }

  async function searchMirrorAndRender(q) {
    const seq = ++_mirrorSearchSeq;
    clearMirrorResults();
    setMirrorSpinner(true);

    const statusDiv = document.createElement('div');
    statusDiv.className = 'lc-mirror-status';
    statusDiv.textContent = `ไม่พบเพลงนี้ในเครื่อง — กำลังค้นหาจาก osu! mirror...`;
    libraryGrid.appendChild(statusDiv);

    try {
      
      const isNumericId = /^\d+$/.test(q.trim());
      if (isNumericId) {
        const res = await fetch(`/api/beatmap/info/${q.trim()}`);
        if (seq !== _mirrorSearchSeq) return;
        statusDiv.remove();
        setMirrorSpinner(false);
        if (res.ok) {
          const set = await res.json();
          if (set && set.id) {
            renderMirrorResults([set], q, seq);
            return;
          }
        }
        
        libraryEmpty.style.display = 'flex';
        const emptyMsg = libraryEmpty.querySelector('div:last-child');
        if (emptyMsg) emptyMsg.textContent = `ไม่พบ beatmap set ID "${q.trim()}" ใน mirror`;
        return;
      }

      
      
      async function doMirrorSearch(query) {
        const res = await fetch(`/api/beatmap/search?q=${encodeURIComponent(query)}&page=0`);
        if (!res.ok) throw new Error('server error ' + res.status);
        const data = await res.json();
        return Array.isArray(data) ? data : (data.beatmapsets || data.results || []);
      }

      
      function normStr(s) {
        return (s || '').toLowerCase()
          .replace(/\s*[\(\[]f(?:eat|t)\.?[^\)\]]*[\)\]]/gi, '')
          .replace(/\s+/g, ' ').trim();
      }

      // ฟังก์ชันกรองผลลัพธ์ที่ title หรือ title_unicode ตรงกับ q (full หรือ normalized)
      function filterRelevant(sets, q) {
        const lq = q.toLowerCase();
        const nq = normStr(q);
        return sets.filter(s => {
          const t  = (s.title || '').toLowerCase();
          const tu = (s.title_unicode || '').toLowerCase();
          const nt  = normStr(s.title);
          const ntu = normStr(s.title_unicode);
          return t.includes(lq)  || tu.includes(lq)  ||
                 lq.includes(t)  || lq.includes(tu)  ||
                 nt.includes(nq) || ntu.includes(nq) ||
                 nq.includes(nt) || nq.includes(ntu);
        });
      }

      // สร้าง query หลายแบบเพื่อเพิ่มโอกาสเจอผล
      // เช่น "Salamander feat. Hatsune Miku" → ลอง 3 query: เต็ม, ตัด artist, ตัดถึง feat.
      const queryVariants = [q];
      // ตัด artist หลัง feat. ออก → "Salamander feat."
      const beforeFeatDot = q.replace(/\s+f(?:eat|t)\.?\s+.+$/gi, ' feat.').trim();
      if (beforeFeatDot !== q) queryVariants.push(beforeFeatDot);
      // ตัด feat. และ artist ออกหมด → "Salamander"
      const noFeat = q
        .replace(/\s*[\(\[]f(?:eat|t)\.?[^\)\]]*[\)\]]/gi, '')
        .replace(/\s+f(?:eat|t)\.?.*$/gi, '')
        .trim();
      if (noFeat && noFeat !== q && noFeat !== beforeFeatDot) queryVariants.push(noFeat);

      const queries = queryVariants.map(v => doMirrorSearch(v));
      const results = await Promise.all(queries);
      if (seq !== _mirrorSearchSeq) return;

      // รวมผลทั้งสอง query และ deduplicate ด้วย set.id
      const seen = new Set();
      const allSets = [];
      for (const r of results) {
        for (const s of r) {
          if (!seen.has(s.id)) { seen.add(s.id); allSets.push(s); }
        }
      }

      // กรองเฉพาะที่ชื่อตรงก่อน ถ้ายังว่างค่อยใช้ผลดิบทั้งหมด
      let sets = filterRelevant(allSets, q);
      if (!sets.length) sets = allSets;

      statusDiv.remove();
      setMirrorSpinner(false);

      if (!sets.length) {
        libraryEmpty.style.display = 'flex';
        const emptyMsg = libraryEmpty.querySelector('div:last-child');
        if (emptyMsg) emptyMsg.textContent = `ไม่พบเพลงที่ตรงกับ "${q}" ทั้งในเครื่องและใน mirror`;
        return;
      }

      renderMirrorResults(sets, q, seq);
    } catch (e) {
      if (seq !== _mirrorSearchSeq) return;
      statusDiv.remove();
      setMirrorSpinner(false);
      libraryEmpty.style.display = 'flex';
      const emptyMsg = libraryEmpty.querySelector('div:last-child');
      if (emptyMsg) emptyMsg.textContent = `ค้นหาจาก mirror ไม่สำเร็จ: ${e.message}`;
    }
  }

  function renderMirrorResults(sets, q, seq, opts) {
    const featured = !!(opts && opts.featured);
    if (!featured && seq !== _mirrorSearchSeq) return;
    if (!featured) clearMirrorResults();
    libraryEmpty.style.display = 'none';

    sets.forEach(set => {
      const coverUrl = `https://assets.ppy.sh/beatmaps/${set.id}/covers/list.jpg`;
      const title = set.title || set.title_unicode || '?';
      const artist = set.artist || set.artist_unicode || '';
      const creator = set.creator || set.creator_name || (set.user && set.user.username) || '';

      const allBeatmaps = set.beatmaps || [];
      // แยก diff mania (mode_int 3) ออกจาก std (mode_int 0) — แต่ละ mode มีความหมายของ cs/star ต่างกัน
      const maniaBeatmaps = allBeatmaps.filter(b => (b.mode_int ?? b.mode) === 3 || b.mode === 'mania');
      const stdBeatmaps = allBeatmaps.filter(b => (b.mode_int ?? b.mode) === 0 || b.mode === 'osu');
      const hasStd = stdBeatmaps.length > 0;
      const hasMania = maniaBeatmaps.length > 0;

      let keyModes = [];
      let minStar = null, maxStar = null;
      if (hasMania) {
        
        const keyModesSet = new Set();
        const starRatings = [];
        maniaBeatmaps.forEach(b => {
          const cs = b.cs ?? b.CS ?? b.circle_size;
          if (cs != null) keyModesSet.add(Math.round(parseFloat(cs)));
          const sr = b.difficulty_rating ?? b.star_rating ?? b.stars;
          if (sr != null && !isNaN(parseFloat(sr))) starRatings.push(parseFloat(sr));
        });
        keyModes = Array.from(keyModesSet).sort((a, b) => a - b);
        minStar = starRatings.length > 0 ? Math.min(...starRatings) : null;
        maxStar = starRatings.length > 0 ? Math.max(...starRatings) : null;
      } else if (hasStd) {
        
        
        keyModes = [4, 7];
      }
      const keyRangeLabel = buildKeyRangeLabel(keyModes);

      const card = document.createElement('div');
      card.className = 'library-card lc-mirror' + (featured ? '' : ' lc-search-result');
      card.dataset.setId = set.id;
      card.dataset.search = (title + ' ' + artist + ' ' + creator).toLowerCase();
      card.dataset.keyModes = keyModes.join(',');
      if (minStar != null) card.dataset.minStar = minStar.toFixed(2);
      if (maxStar != null) card.dataset.maxStar = maxStar.toFixed(2);
      const creatorLabel = creator ? `<span class="lc-creator">by ${escapeHtml(creator)}</span>` : '';
      card.innerHTML = `
        <div class="lc-cover" style="background-image:url('${coverUrl}');background-size:cover;background-position:center;">
          <span class="lc-badge lc-badge-mirror">Mirror</span>
          <div class="lc-mirror-progress" style="display:none;">
            <div class="lc-mirror-progress-track"><div class="lc-mirror-progress-fill"></div></div>
            <div class="lc-mirror-progress-text">0%</div>
          </div>
        </div>
        <div class="lc-body">
          <div class="lc-title">${escapeHtml(title)}</div>
          <div class="lc-meta"><span>${escapeHtml(artist)}</span>${creatorLabel}${keyRangeLabel ? `<span class="lc-key-range">${keyRangeLabel}</span>` : ''}</div>
        </div>
        <div class="lc-preview-icon" title="ดาวน์โหลดเพลงนี้">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </div>
      `;
      const onCardClick = () => downloadMirrorSong(set, card);
      card._mirrorClickHandler = onCardClick;
      card.addEventListener('click', onCardClick);

      if (featured) {
        libraryGrid.appendChild(card);
        _allCards.push(card);
        _filteredCards.push(card);
      } else {
        
        const cardSearch = card.dataset.search || '';
        const allDomCards = Array.from(libraryGrid.querySelectorAll('.library-card'));
        let insertBefore = null;
        for (const existing of allDomCards) {
          const existingSearch = existing.dataset.search || '';
          if (cardSearch.localeCompare(existingSearch) < 0) {
            insertBefore = existing;
            break;
          }
        }
        if (insertBefore) {
          libraryGrid.insertBefore(card, insertBefore);
        } else {
          libraryGrid.appendChild(card);
        }
      }
    });

    if (featured) renderPage(1);
  }

  // AbortController สำหรับ Mirror download ที่กำลังโหลดอยู่ (ยกเลิกได้เพียงอันเดียว)
  let _mirrorDownloadController = null;
  let _mirrorDownloadCard = null; // card ที่กำลังโหลดอยู่ตอนนี้

  async function downloadMirrorSong(set, card) {
    // ถ้ากดการ์ดเดิมซ้ำขณะกำลังโหลด → ไม่ทำอะไร
    if (card.dataset.downloading === '1') return;

    
    if (_mirrorDownloadController) {
      _mirrorDownloadController.abort();
      _mirrorDownloadController = null;
      if (_mirrorDownloadCard && _mirrorDownloadCard !== card) {
        const oldCard = _mirrorDownloadCard;
        oldCard.dataset.downloading = '0';
        oldCard.classList.remove('lc-mirror-loading');
        const oldProgressEl = oldCard.querySelector('.lc-mirror-progress');
        if (oldProgressEl) oldProgressEl.style.display = 'none';
        const oldFill = oldCard.querySelector('.lc-mirror-progress-fill');
        if (oldFill) { oldFill.style.width = '0%'; oldFill.classList.remove('indeterminate'); }
      }
      _mirrorDownloadCard = null;
    }

    const controller = new AbortController();
    _mirrorDownloadController = controller;
    _mirrorDownloadCard = card;

    card.dataset.downloading = '1';
    card.classList.add('lc-mirror-loading');

    const progressEl   = card.querySelector('.lc-mirror-progress');
    const progressFill = card.querySelector('.lc-mirror-progress-fill');
    const progressText = card.querySelector('.lc-mirror-progress-text');
    progressEl.style.display = 'flex';
    progressFill.style.width = '0%';
    progressFill.classList.add('indeterminate');
    progressText.textContent = 'กำลังโหลด...';

    try {
      const resp = await fetch(`/api/beatmap/download/${set.id}`, { signal: controller.signal });
      
      progressFill.classList.remove('indeterminate');
      if (!resp.ok) throw new Error(`mirror ตอบกลับ ${resp.status}`);

      const total = parseInt(resp.headers.get('Content-Length') || '0', 10);
      
      
      if (total <= 0) progressFill.classList.add('indeterminate');

      let blob;
      if (resp.body && resp.body.getReader) {
        
        const reader = resp.body.getReader();
        const chunks = [];
        let received = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            if (controller.signal.aborted) {
              reader.cancel();
              throw new DOMException('Aborted', 'AbortError');
            }
            chunks.push(value);
            received += value.length;
            if (total > 0) {
              const pct = Math.min(100, Math.round((received / total) * 100));
              progressFill.style.width = pct + '%';
              progressText.textContent = pct + '%';
            } else {
              progressText.textContent = `กำลังโหลด... ${(received / 1024 / 1024).toFixed(1)} MB`;
            }
          }
        } catch (readErr) {
          reader.cancel().catch(() => {});
          throw readErr;
        }

        
        if (total > 0 && received < total) {
          throw new Error(`ไฟล์โหลดไม่ครบ (ได้ ${received} จาก ${total} bytes) กรุณาลองใหม่`);
        }

        blob = new Blob(chunks, { type: 'application/octet-stream' });
      } else {
        
        progressText.textContent = 'กำลังโหลด...';
        blob = await resp.blob();
      }

      progressFill.classList.remove('indeterminate');
      progressFill.style.width = '100%';
      progressText.textContent = '100%';

      
      const safeTitle  = (set.title || set.title_unicode || String(set.id)).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
      const safeArtist = (set.artist || set.artist_unicode || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
      const fileName = `${safeArtist ? safeArtist + ' - ' : ''}${safeTitle}.osz`;
      const file = new File([blob], fileName, { type: 'application/octet-stream' });
      const entry = window.SongLibrary.addUploadedFile(file, 'mirror');
      entry.beatmapSetId = set.id; 

      
      
      card.classList.remove('lc-mirror', 'lc-mirror-loading', 'lc-search-result');
      card.dataset.downloading = '0';
      card.dataset.entryId = entry.id;
      card.dataset.source = 'mirror';
      delete card.dataset.setId;
      progressEl.style.display = 'none';
      card.querySelector('.lc-badge-mirror')?.remove();
      const previewIcon = card.querySelector('.lc-preview-icon');
      if (previewIcon) previewIcon.title = 'ตัวอย่างเพลง';

      
      if (card._mirrorClickHandler) {
        card.removeEventListener('click', card._mirrorClickHandler);
        card._mirrorClickHandler = null;
      }
      card.addEventListener('click', () => openSongFromLibrary(entry, card));
      card.addEventListener('touchstart', () => { window._lastLibraryCardTouchAt = Date.now(); }, { passive: true });
      card.addEventListener('mouseenter', () => {
        if (entry._preview && entry._preview.previewAudioUrl) {
          _previewHoverTimer = setTimeout(() => playPreview(entry._preview.previewAudioUrl), 400);
        }
      });
      card.addEventListener('mouseleave', stopPreview);

      _allCards.push(card);
      if (!_filteredCards.includes(card)) _filteredCards.push(card);
      _libraryEntries.push(entry);

      
      openSongFromLibrary(entry, card);
    } catch (e) {
      progressFill.classList.remove('indeterminate');
      
      if (e.name === 'AbortError') return;

      progressFill.classList.remove('indeterminate');
      progressText.textContent = 'โหลดไม่สำเร็จ';
      progressFill.style.width = '0%';
      card.dataset.downloading = '0';
      card.classList.remove('lc-mirror-loading');
      setTimeout(() => { progressEl.style.display = 'none'; }, 2500);
    } finally {
      
      if (_mirrorDownloadController === controller) {
        _mirrorDownloadController = null;
        _mirrorDownloadCard = null;
      }
    }
  }

  if (librarySearchInput) {
    
    librarySearchInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = librarySearchInput.value.trim().toLowerCase();
      if (q && _filteredCards.length === 0) {
        clearTimeout(_mirrorSearchTimer);
        searchMirrorAndRender(q);
      }
    });
  }

  
  window._openSongById = function(entryId) {
    
    if (entryId && entryId.startsWith('mirror-search:')) {
      const setId = entryId.replace('mirror-search:', '');
      // ดาวน์โหลดจาก mirror แล้วเปิดเลย (ใช้ overlay เหมือน searchAndPlayFromMirror)
      gloShow('กำลังโหลดเพลงจาก mirror', '');
      gloSetProgress(0, true);
      fetchWithProgress(`/api/beatmap/download/${setId}`, () => {}, [10, 95], true)
        .then(({ resp, blob }) => {
          if (!resp.ok) throw new Error('mirror ตอบกลับ ' + resp.status);
          const file = new File([blob], setId + '.osz', { type: 'application/octet-stream' });
          const entry = window.SongLibrary.addUploadedFile(file, 'mirror');
          _libraryEntries.push(entry);
          gloHide();
          openSongFromLibrary(entry);
        })
        .catch(e => {
          gloHide();
          alert('โหลดเพลงจาก mirror ไม่สำเร็จ: ' + e.message);
        });
      return;
    }
    const entry = _libraryEntries.find(e => e.id === entryId);
    if (entry) openSongFromLibrary(entry);
  };

    async function searchAndPlayFromMirror(title, version, beatmapSetId) {
    gloShow('กำลังค้นหาเพลงจาก mirror', title);

    
    
    function normalizeForMatch(s) {
      return (s || '').toLowerCase()
        .replace(/\s*[\(\[]feat\.?[^\)\]]*[\)\]]/gi, '')
        .replace(/\s*[\(\[]ft\.?[^\)\]]*[\)\]]/gi, '')
        .trim();
    }

    // สร้าง query หลายตัว: ลอง title เต็มก่อน ถ้าไม่ได้ผลลอง strip feat. ออก
    async function fetchMirrorSets(q) {
      // ค้นหาทั้ง mania และ std เพราะเพลงที่เคยเล่นอาจเป็นแมพ std ที่แปลงไว้
      const res = await fetch(`/api/beatmap/search?q=${encodeURIComponent(q)}&page=0`);
      if (!res.ok) throw new Error('ค้นหาจาก mirror ไม่สำเร็จ');
      const data = await res.json();
      return Array.isArray(data) ? data : (data.beatmapsets || data.results || []);
    }

    // ฟังก์ชันหา set ที่ตรงที่สุดจาก title (เช็คทั้ง title และ title_unicode)
    function pickBestSet(sets, title) {
      const lowerTitle = title.toLowerCase();
      const normTitle = normalizeForMatch(title);
      // 1) ตรงเป๊ะ (title หรือ title_unicode)
      const exactMatch = sets.find(s =>
        (s.title || '').toLowerCase() === lowerTitle ||
        (s.title_unicode || '').toLowerCase() === lowerTitle
      );
      if (exactMatch) return exactMatch;
      // 2) ตรงเป๊ะหลัง normalize feat.
      const normMatch = sets.find(s =>
        normalizeForMatch(s.title) === normTitle ||
        normalizeForMatch(s.title_unicode) === normTitle
      );
      if (normMatch) return normMatch;
      // 3) partial (title หรือ title_unicode)
      const partialMatch = sets.find(s =>
        (s.title || '').toLowerCase().includes(lowerTitle) ||
        (s.title_unicode || '').toLowerCase().includes(lowerTitle) ||
        lowerTitle.includes((s.title || '').toLowerCase()) ||
        lowerTitle.includes((s.title_unicode || '').toLowerCase())
      );
      if (partialMatch) return partialMatch;
      // 4) partial หลัง normalize
      const normPartial = sets.find(s =>
        normalizeForMatch(s.title).includes(normTitle) ||
        normalizeForMatch(s.title_unicode).includes(normTitle) ||
        normTitle.includes(normalizeForMatch(s.title)) ||
        normTitle.includes(normalizeForMatch(s.title_unicode))
      );
      return normPartial || null;
    }

    try {
      // ถ้ามี beatmapSetId จากประวัติ → โหลดตรงๆ ไม่ต้องค้นชื่อ
      if (beatmapSetId) {
        gloSetSub('กำลังโหลดไฟล์...');
        gloSetProgress(0, true);
        const { resp, blob } = await fetchWithProgress(`/api/beatmap/download/${beatmapSetId}`, () => {}, [10, 95], true);
        if (resp.ok) {
          gloSetProgress(0, true);
          const file = new File([blob], `${beatmapSetId}.osz`, { type: 'application/octet-stream' });
          const entry = window.SongLibrary.addUploadedFile(file, 'mirror');
          entry.beatmapSetId = beatmapSetId;
          _libraryEntries.push(entry);
          gloHide();
          openSongFromLibrary(entry, version);
          return;
        }
        
        gloSetProgress(0, true);
      }

      
      const titleVariants = [title];
      const titleBeforeFeat = title.replace(/\s+f(?:eat|t)\.?\s+.+$/gi, ' feat.').trim();
      if (titleBeforeFeat !== title) titleVariants.push(titleBeforeFeat);
      const titleNoFeat = title
        .replace(/\s*[\(\[]f(?:eat|t)\.?[^\)\]]*[\)\]]/gi, '')
        .replace(/\s+f(?:eat|t)\.?.*$/gi, '')
        .trim();
      if (titleNoFeat && titleNoFeat !== title && titleNoFeat !== titleBeforeFeat) titleVariants.push(titleNoFeat);

      // ค้นทุก variant พร้อมกัน แล้วรวมผล
      const allResults = await Promise.all(titleVariants.map(v => fetchMirrorSets(v)));
      const seen = new Set();
      let sets = [];
      for (const r of allResults) {
        for (const s of r) {
          if (!seen.has(s.id)) { seen.add(s.id); sets.push(s); }
        }
      }
      let set = sets.length ? pickBestSet(sets, title) : null;

      if (!set && sets.length) set = sets[0]; // fallback ใช้ผลแรกถ้าไม่มีตัวไหนตรงเลย
      if (!set) throw new Error('ไม่พบเพลงนี้ใน mirror แล้ว (อาจถูกลบหรือเปลี่ยนชื่อ)');

      gloSetSub('กำลังโหลดไฟล์...');
      gloSetProgress(0, true);
      const { resp, blob } = await fetchWithProgress(`/api/beatmap/download/${set.id}`, () => {}, [25, 95], true);
      if (!resp.ok) throw new Error(`mirror ตอบกลับ ${resp.status}`);

      const safeTitle  = (set.title || set.title_unicode || String(set.id)).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
      const safeArtist = (set.artist || set.artist_unicode || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
      const fileName = `${safeArtist ? safeArtist + ' - ' : ''}${safeTitle}.osz`;
      const file = new File([blob], fileName, { type: 'application/octet-stream' });
      const entry = window.SongLibrary.addUploadedFile(file, 'mirror');
      entry.beatmapSetId = set.id; 
      _libraryEntries.push(entry);

      gloHide();
      openSongFromLibrary(entry, version);
    } catch (e) {
      gloHide();
      setUploadStatus('โหลดเพลงจาก mirror ไม่สำเร็จ: ' + e.message, 'error');
    }
  }

  
  
  window._openSongByTitle = function(songId, beatmapSetId) {
    
    
    _returnToProfileAfterSelect = profileScreen.classList.contains('active');
    if (_returnToProfileAfterSelect) {
      _savedPreviousScreen = previousScreenName; 
      profileScreen.style.display = 'none';
      profileScreen.classList.remove('active');
      stopPreview();
    }
    
    const match = songId.match(/^(.*?) \[(.+?)\]$/);
    if (!match) return;
    const [, title, version] = match;
    
    for (const entry of _libraryEntries) {
      const preview = entry._preview;
      if (!preview) continue;
      if (preview.title === title || entry.name === title) {
        openSongFromLibrary(entry, version);
        return;
      }
    }
    
    const lowerTitle = title.toLowerCase();
    for (const entry of _libraryEntries) {
      const preview = entry._preview;
      const name = (preview ? preview.title : entry.name) || '';
      if (name.toLowerCase().includes(lowerTitle)) {
        openSongFromLibrary(entry, version);
        return;
      }
    }
    // ไม่มีในเครื่องเลย (เช่น เคยโหลดจาก mirror ไว้ตอนเล่นรอบก่อน แต่ปิดแอป/รีเฟรชไปแล้ว
    // ไฟล์จึงหายไปจาก memory) — ลองค้นหาและโหลดจาก mirror ใหม่ให้อัตโนมัติ
    searchAndPlayFromMirror(title, version, beatmapSetId);
  };

  window._startGameWithMap = function(map) {
    if (map) {
      selectedMap = map;
      startGame(map);
    }
  };

  window._computeRank = function(accuracy, missCount) {
    return computeRank(accuracy, missCount);
  };
  window._getLibraryEntries = function() { return _libraryEntries; };
  // เพิ่ม entry เข้า library กลาง (ใช้โดย multiplayer.js เมื่อโหลดเพลงจาก mirror ในห้อง MP
  // เพื่อให้ _getLibraryEntries() เห็น entry นี้ทันที — กันโหลดซ้ำ + กัน Beatmap panel ว่าง)
  window._addLibraryEntry = function(entry) {
    if (!entry) return;
    if (!_libraryEntries.some(e => e.id === entry.id)) {
      _libraryEntries.push(entry);
    }
  };
  window._peekOszPreview = peekOszPreview;
  // expose สำหรับ multiplayer.js — ใช้คำนวณ/แสดง star rating ตอนเลือก diff ในห้อง MP (ใช้สูตรเดียวกับหน้าเลือกเพลงปกติ)
  window._calcStarRating = calcStarRating;
  window._difficultyLabel = difficultyLabel;
  window._relativeStarColorHex = relativeStarColorHex;
  window._relativeStarColorBg = relativeStarColorBg;
  window._playPreview = playPreview;
  window._stopPreview = stopPreview;

  // ===== Song select =====
  const diffList = document.getElementById('diffList');
  const songDetail = document.getElementById('songDetail');
  const packTitle = document.getElementById('packTitle');
  const packCount = document.getElementById('packCount');

  function renderSongSelect(pack, preferVersion) {
    packTitle.textContent = pack.name;
    packCount.textContent = `${pack.maps.length} difficulty`;
    diffList.innerHTML = '';
    selectedMap = null;
    songDetail.style.display = 'none';

    
    
    const packStars = pack.maps.map(m => m._starRating ?? calcStarRating(m));
    const packMinStar = packStars.length ? Math.min(...packStars) : null;
    const packMaxStar = packStars.length ? Math.max(...packStars) : null;

    pack.maps.forEach((map, idx) => {
      const card = document.createElement('div');
      card.className = 'diff-card';
      const sr = map._starRating ?? calcStarRating(map);
      card.innerHTML = `
        <div class="diff-thumb" style="background-image:url('${map.backgroundUrl || ''}')"></div>
        <div class="diff-info">
          <div class="dname">${escapeHtml(map.version)}</div>
          <div class="dmeta">
            <span>${escapeHtml(map.artistUnicode)}</span>
            <span>${map.noteCount} notes</span>
            ${map.lnCount > 0 ? `<span class="ln-tag">${map.lnCount} LN</span>` : ''}
            <span class="k-badge">${map.keyCount}K</span>
          </div>
        </div>
        <div class="diff-stars" style="color:${relativeStarColorHex(sr, packMinStar, packMaxStar)}; background:${relativeStarColorBg(sr, packMinStar, packMaxStar, 0.15)};">${difficultyLabel(map)}</div>
      `;
      card.addEventListener('click', (e) => {
        
        if (window._lastLibraryCardTouchAt && Date.now() - window._lastLibraryCardTouchAt < 1500) return;
        selectMap(map, card);
      });
      card._map = map;

      diffList.appendChild(card);
    });

    if (pack.maps.length > 0) {
      
      let autoSelectIdx = 0;
      if (preferVersion) {
        const vi = pack.maps.findIndex(m => m.version === preferVersion);
        if (vi >= 0) autoSelectIdx = vi;
      }
      selectMap(pack.maps[autoSelectIdx], diffList.children[autoSelectIdx]);
    }
  }

  

  const STAR_GRADIENT_STOPS = [
    { t: 0.0,  rgb: [230, 230, 250] }, 
    { t: 0.33, rgb: [230, 230, 250] }, 
    { t: 0.66, rgb: [230, 230, 250] }, 
    { t: 1.0,  rgb: [230, 230, 250] }, 
  ];

  function gradientColorAtT(t) {
    const tt = Math.max(0, Math.min(1, t));
    let lo = STAR_GRADIENT_STOPS[0];
    let hi = STAR_GRADIENT_STOPS[STAR_GRADIENT_STOPS.length - 1];
    for (let i = 0; i < STAR_GRADIENT_STOPS.length - 1; i++) {
      if (tt >= STAR_GRADIENT_STOPS[i].t && tt <= STAR_GRADIENT_STOPS[i + 1].t) {
        lo = STAR_GRADIENT_STOPS[i];
        hi = STAR_GRADIENT_STOPS[i + 1];
        break;
      }
    }
    const span = (hi.t - lo.t) || 1;
    const lt = (tt - lo.t) / span;
    return [
      Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * lt),
      Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * lt),
      Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * lt),
    ];
  }

  
  
  function starGradientRGB(star) {
    const s = Math.max(0.5, Math.min(10, star ?? 0.5));
    const t = (s - 0.5) / 9.5; 
    return gradientColorAtT(t);
  }

  
  
  function relativeStarGradientRGB(star, minStar, maxStar) {
    if (minStar == null || maxStar == null || maxStar - minStar < 0.01) {
      return gradientColorAtT(0.5); 
    }
    const t = (star - minStar) / (maxStar - minStar);
    return gradientColorAtT(t);
  }

  function starColorHex(star) {
    const [r, g, b] = starGradientRGB(star);
    return `rgb(${r}, ${g}, ${b})`;
  }

  
  function blendStarColorHex(starA, starB) {
    const [r1, g1, b1] = starGradientRGB(starA);
    const [r2, g2, b2] = starGradientRGB(starB);
    const r = Math.round((r1 + r2) / 2);
    const g = Math.round((g1 + g2) / 2);
    const b = Math.round((b1 + b2) / 2);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function starColorBg(star, alpha) {
    const [r, g, b] = starGradientRGB(star);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function relativeStarColorHex(star, minStar, maxStar) {
    const [r, g, b] = relativeStarGradientRGB(star, minStar, maxStar);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function relativeStarColorBg(star, minStar, maxStar, alpha) {
    const [r, g, b] = relativeStarGradientRGB(star, minStar, maxStar);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

    function calcStarRating(map) {
    if (!map) return 0.5;

    
    if (map.beatmap && Array.isArray(map.beatmap.hitObjects) && map.beatmap.hitObjects.length > 0) {
      const hitObjects = map.beatmap.hitObjects.map(h => ({
        startTime: h.time,
        endTime: h.endTime,
        column: h.column,
      }));
      const keyCount = map.keyCount || map.beatmap.keyCount || 4;
      const sr = window.ManiaStarRating.calcManiaStarRating(hitObjects, keyCount);
      return Math.max(0, Math.min(15.0, sr));
    }

    
    return 0.5;
  }

  
  
  function calcStarFromHitObjects(hitObjects, keyCount) {
    if (!hitObjects || hitObjects.length === 0) return 0.5;
    const sr = window.ManiaStarRating.calcManiaStarRating(hitObjects, keyCount || 4);
    return Math.max(0, Math.min(15.0, sr));
  }

  

  function difficultyLabel(map) {
    const sr = map._starRating ?? calcStarRating(map);
    
    if (map._starRating == null) map._starRating = sr;
    return `★ ${window.ManiaStarRating.formatStarRating(sr)}`;
  }

  function selectMap(map, cardEl) {
    selectedMap = map;
    document.querySelectorAll('.diff-card').forEach(c => c.classList.remove('selected', 'previewing'));
    if (cardEl) cardEl.classList.add('selected', 'previewing');

    songDetail.style.display = 'flex';
    document.getElementById('detailCover').style.backgroundImage = map.backgroundUrl ? `url('${map.backgroundUrl}')` : 'none';
    document.getElementById('detailTitle').textContent = map.titleUnicode;
    document.getElementById('detailArtist').textContent = map.artistUnicode + (map.creator ? ` · mapped by ${map.creator}` : '');
    document.getElementById('detailVersion').textContent = map.version;
    document.getElementById('detailBpm').textContent = Math.round(map.bpm);
    document.getElementById('detailNotes').textContent = map.noteCount;
    document.getElementById('detailLn').textContent = map.lnCount;
    document.getElementById('detailDuration').textContent = formatTime(map.duration);
    const odEl = document.getElementById('detailOD');
    if (odEl) odEl.textContent = map.od != null ? map.od.toFixed(1) : '—';
    const kcEl = document.getElementById('detailKeyCount');
    if (kcEl) kcEl.textContent = map.keyCount ? `${map.keyCount}K` : '—';
    renderStdKeyPicker(map);

    
    if (map.audioUrl) playPreview(map.audioUrl, { loop: true });

    
    const uploadNote = document.getElementById('uploadScoreNote');
    if (uploadNote) uploadNote.style.display = currentPackIsUpload ? 'flex' : 'none';

    const songId = `${map.titleUnicode} [${map.version}]`;
    if (currentPackIsUpload) {
      if (selectLbList) selectLbList.innerHTML = '<div class="select-lb-empty">เพลงอัปโหลดเอง — ไม่มีกระดานคะแนน</div>';
    } else {
      
      renderSelectLeaderboard(songId);
    }
  }

    function renderStdKeyPicker(map) {
    const wrap = document.getElementById('stdKeyPicker');
    const buttonsEl = document.getElementById('stdKeyPickerButtons');
    if (!wrap || !buttonsEl) return;

    if (!map.convertedFromStandard || !map.stdSourceText || !map.stdAvailableColumns) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = 'block';
    buttonsEl.innerHTML = '';
    map.stdAvailableColumns.forEach((cols) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'std-key-picker-btn' + (cols === map.stdCurrentColumns ? ' active' : '');
      btn.textContent = `${cols}K`;
      btn.addEventListener('click', () => switchStdMapColumns(map, cols));
      buttonsEl.appendChild(btn);
    });
  }

    function switchStdMapColumns(map, targetColumns) {
    if (map.stdCurrentColumns === targetColumns) return;
    const buttonsEl = document.getElementById('stdKeyPickerButtons');
    const buttons = buttonsEl ? Array.from(buttonsEl.querySelectorAll('.std-key-picker-btn')) : [];
    buttons.forEach((b) => { b.disabled = true; });

    let beatmap;
    try {
      beatmap = window.StdToManiaBridge.convertStdOsuToMania(map.stdSourceText, targetColumns);
    } catch (e) {
      console.error('แปลงคีย์ไม่สำเร็จ', e);
      buttons.forEach((b) => { b.disabled = false; });
      return;
    }
    if (!beatmap || beatmap.hitObjects.length === 0) {
      buttons.forEach((b) => { b.disabled = false; });
      return;
    }

    
    map.beatmap = beatmap;
    map.keyCount = beatmap.keyCount;
    map.noteCount = beatmap.hitObjects.length;
    map.lnCount = beatmap.hitObjects.filter(h => h.isLongNote).length;
    map.duration = beatmap.hitObjects.length > 0 ? Math.max(...beatmap.hitObjects.map(h => h.endTime)) : 0;
    map.stdCurrentColumns = targetColumns;
    map._starRating = null; 
    map._starRating = calcStarRating(map);

    
    document.getElementById('detailNotes').textContent = map.noteCount;
    document.getElementById('detailLn').textContent = map.lnCount;
    document.getElementById('detailDuration').textContent = formatTime(map.duration);
    const kcEl = document.getElementById('detailKeyCount');
    if (kcEl) kcEl.textContent = `${map.keyCount}K`;
    renderStdKeyPicker(map);

    
    const cardEl = Array.from(diffList.querySelectorAll('.diff-card')).find((c) => c._map === map);
    if (cardEl) {
      const kBadge = cardEl.querySelector('.k-badge');
      if (kBadge) kBadge.textContent = `${map.keyCount}K`;
      const noteSpan = cardEl.querySelector('.dmeta span:nth-child(2)');
      if (noteSpan) noteSpan.textContent = `${map.noteCount} notes`;
      const starEl = cardEl.querySelector('.diff-stars');
      if (starEl) starEl.textContent = difficultyLabel(map);
    }
  }

  
  const selectLbList = document.getElementById('selectLbList');
  function rankColorSel(r) {
    return { 'S+': '#ff66db', X: '#ff6666', S: '#ffd700', A: '#a0e060', B: '#60b0ff', C: '#ffaa44', D: '#ff5555' }[r] || '#fff';
  }
  async function renderSelectLeaderboard(songId) {
    if (!selectLbList) return;
    selectLbList.innerHTML = '<div class="select-lb-empty">กำลังโหลด...</div>';
    if (!window.Auth) { selectLbList.innerHTML = '<div class="select-lb-empty">ไม่พบคะแนน</div>'; return; }
    try {
      const board = await Auth.fetchLeaderboard(songId);
      if (!board || !board.length) {
        selectLbList.innerHTML = '<div class="select-lb-empty">ยังไม่มีคะแนน เป็นคนแรกเลย!</div>';
        return;
      }
      selectLbList.innerHTML = board.map((s, i) => `
        <div class="select-lb-item${i === 0 ? ' top' : ''}" data-uid="${escapeHtml(s.uid||'')}" data-name="${escapeHtml(s.displayName||'')}" data-photo="${escapeHtml(s.photoURL||'')}" style="cursor:pointer;" title="คลิกเพื่อดูรายละเอียด · คลิกขวาเพื่อดูโปรไฟล์">
          <span class="select-lb-rank">#${i + 1}</span>
          ${s.photoURL
            ? `<img src="${escapeHtml(s.photoURL)}" class="select-lb-avatar" referrerpolicy="no-referrer" data-uid="${escapeHtml(s.uid||'')}">`
            : `<span class="select-lb-avatar select-lb-avatar-fallback" data-uid="${escapeHtml(s.uid||'')}">${escapeHtml((s.displayName || '?')[0].toUpperCase())}</span>`}
          <div class="select-lb-name-wrap">
            <div class="select-lb-name">${escapeHtml(s.displayName || 'ไม่ระบุ')}</div>
            <div class="select-lb-acc">${s.accuracy != null ? s.accuracy.toFixed(2) + '%' : '—'}</div>
          </div>
          <span class="select-lb-grade" style="color:${rankColorSel(s.rank)};">${escapeHtml(s.rank || '')}</span>
          <span class="select-lb-score">${String(s.score).padStart(6, '0')}</span>
        </div>`).join('');
      // resolve server avatars หลัง render
      if (window.Auth?.resolveAvatar) {
        board.forEach(s => {
          if (!s.uid) return;
          const img = selectLbList.querySelector(`img[data-uid="${CSS.escape(s.uid)}"]`);
          if (img) Auth.resolveAvatar(s.uid, s.photoURL || '', img);
          // fallback span (ถ้าไม่มี photoURL) — แทนที่ด้วย img ถ้า server มีรูป
          const span = selectLbList.querySelector(`span.select-lb-avatar[data-uid="${CSS.escape(s.uid)}"]`);
          if (span) Auth.resolveAvatar(s.uid, '', null).then(url => {
            if (url && span.isConnected) {
              const newImg = document.createElement('img');
              newImg.src = url; newImg.className = 'select-lb-avatar'; newImg.referrerPolicy = 'no-referrer';
              span.replaceWith(newImg);
            }
          });
        });
      }
      selectLbList.querySelectorAll('.select-lb-item').forEach((row, i) => {
        const s = board[i];
        
        row.addEventListener('click', () => {
          if (!s || !window._openScoreDetail) return;
          window._openScoreDetail({
            songId: songId,
            score: s.score,
            accuracy: s.accuracy,
            rank: s.rank,
            maxCombo: s.maxCombo,
            judgeCounts: s.judgeCounts,
            ts: s.ts,
            uid: s.uid,
            displayName: s.displayName,
            photoURL: s.photoURL,
            showPlay: false,
            showProfile: true,
          });
        });
        
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const uid = row.dataset.uid;
          if (!uid || !window._openFriendProfile) return;
          window._openFriendProfile(uid, row.dataset.name, row.dataset.photo);
        });
      });
    } catch (e) {
      selectLbList.innerHTML = '<div class="select-lb-empty">โหลดคะแนนไม่สำเร็จ</div>';
    }
  }

  function formatTime(ms) {
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  document.getElementById('btnStartGame').addEventListener('click', (e) => {
    if (!selectedMap) return;
    
    if (window._lastLibraryCardTouchAt && Date.now() - window._lastLibraryCardTouchAt < 1500) return;
    startGame(selectedMap);
  });

  document.getElementById('btnBackHome').addEventListener('click', () => {
    
    
    const mpScreenEl = document.getElementById('screen-multiplayer');
    if (mpScreenEl && mpScreenEl.classList.contains('active')) return;

    stopPreview();
    if (currentGame) { currentGame.stop(); currentGame = null; window.currentGame = null; }
    showScreen('upload');
    
    if (window.MusicPlayer) window.MusicPlayer.onGameEnd();
  });

  
  const btnBrandHome = document.getElementById('btnBrandHome');
  if (btnBrandHome) {
    btnBrandHome.addEventListener('click', () => {
      document.getElementById('btnBackHome').click();
    });
  }

  
  const canvas = document.getElementById('gameCanvas');
  const hudScore = document.getElementById('hudScore');
  const hudAcc = document.getElementById('hudAcc');
  const judgePopup = document.getElementById('judgePopup');
  const comboPopup = document.getElementById('comboPopup');
  const beatGlowBorder = document.getElementById('beatGlowBorder');
  const comboBgFlash = document.getElementById('comboBgFlash');
  const progressFill = document.getElementById('progressFill');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const btnSkip = document.getElementById('btnSkip');
  const skipBtnLabel = document.getElementById('skipBtnLabel');
  const playLoadingOverlay = document.getElementById('playLoadingOverlay');

  
  
  function showSkipBtn() {
    btnSkip.style.display = 'flex';
    
    void btnSkip.offsetWidth;
    btnSkip.classList.add('is-visible');
  }
  function hideSkipBtn() {
    btnSkip.classList.remove('is-visible');
  }
  
  btnSkip.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'opacity' && !btnSkip.classList.contains('is-visible')) {
      btnSkip.style.display = 'none';
    }
  });

  btnSkip.addEventListener('click', () => {
    if (!currentGame) return;
    if (window._isMultiplayerGame && window.mpVoteSkip) {
      
      window.mpVoteSkip();
    } else {
      currentGame.trySkip();
    }
  });

    function waitForAudioReady(audio, timeoutMs = 3000) {
    return new Promise((resolve) => {
      if (audio.readyState >= 3) { resolve(); return; }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('canplay', onReady);
        clearTimeout(timer);
        resolve();
      };
      const onReady = () => finish();
      audio.addEventListener('canplaythrough', onReady);
      audio.addEventListener('canplay', onReady);
      const timer = setTimeout(finish, timeoutMs);
    });
  }

  function startGame(map) {
    
    if (!window._isMultiplayerGame) {
      _updatePauseMode(false);
    }
    stopPreview();
    showScreen('play');
    
    if (window.MusicPlayer) window.MusicPlayer.onGameStart();
    pauseOverlay.classList.remove('show');

    
    const bgLayer = document.getElementById('gameBgLayer');
    if (bgLayer) {
      bgLayer.style.backgroundImage = map.backgroundUrl ? `url('${map.backgroundUrl}')` : 'none';
    }
    applyVisualSettings();

    
    hudScore.textContent = '000000';
    hudAcc.textContent = '0.00%';
    comboPopup.textContent = '';
    comboPopup.style.display = 'none';
    judgePopup.textContent = '';
    judgePopup.className = 'judge-popup';
    if (beatGlowBorder) beatGlowBorder.style.setProperty('--beat-glow-alpha', '0');
    progressFill.style.width = '0%';
    hideSkipBtn();
    btnSkip.style.display = 'none';
    if (playLoadingOverlay) playLoadingOverlay.classList.add('show');

    requestAnimationFrame(() => {
      currentGame = new ManiaGame(canvas, map, {
        onScoreUpdate: (snap) => {
          hudScore.textContent = String(snap.score).padStart(6, '0');
          hudAcc.textContent = snap.accuracy.toFixed(2) + '%';
          
          if (window.mpSendLiveScore) window.mpSendLiveScore(snap.score, snap.accuracy, snap.combo, snap.judgeCounts, snap.maxCombo);

          
          if (snap.combo >= 2) {
            comboPopup.textContent = snap.combo + 'x';
            comboPopup.style.display = 'block';
            comboPopup.classList.remove('combo-bump');
            void comboPopup.offsetWidth;
            comboPopup.classList.add('combo-bump');
          } else {
            comboPopup.style.display = 'none';
          }
        },
        onJudge: (judgement) => {
          judgePopup.textContent = judgement;
          judgePopup.className = 'judge-popup judge-' + judgement;
          void judgePopup.offsetWidth;
          judgePopup.classList.add('show');
        },
        onBeatPulse: (pulse) => {
          
          if (beatPulseEnabled && beatGlowBorder) {
            const intensity = pulse * 0.28; 
            beatGlowBorder.style.setProperty('--beat-glow-alpha', intensity.toFixed(3));
          }
        },
        onComboFlash: (milestone) => {
          
          if (comboFlashEnabled && comboBgFlash) {
            comboBgFlash.classList.add('active');
            clearTimeout(comboBgFlash._flashTimer);
            comboBgFlash._flashTimer = setTimeout(() => {
              comboBgFlash.classList.remove('active');
            }, 350);
          }
        },
        onProgress: (now, durationMs) => {
          const pct = Math.min(100, Math.max(0, (now / durationMs) * 100));
          progressFill.style.width = pct + '%';
        },
        onSkipState: ({ canSkipIntro }) => {
          if (canSkipIntro) {
            if (window._isMultiplayerGame) {
              
              if (!window._mpSkipVoted) {
                skipBtnLabel.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:4px"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20"/></svg>โหวตข้าม';
              }
            } else {
              skipBtnLabel.textContent = 'ข้ามอินโทร';
            }
            showSkipBtn();
          } else {
            
            if (window._isMultiplayerGame && window._mpSkipVoted) return;
            hideSkipBtn();
          }
        },
        onFinish: (snap) => {
          hideSkipBtn();
          if (window._isMultiplayerGame) {
            
            if (window.mpSendGameFinish) window.mpSendGameFinish(snap);
            if (window.mpShowResultWaiting) window.mpShowResultWaiting(map, snap);
          } else {
            showResult(map, snap);
          }
        },
      });
      window.currentGame = currentGame; 
      currentGame.scrollSpeed = scrollSpeed;
      currentGame.globalOffset = globalOffset || 0;
      currentGame.audio.volume = musicVolume;
      currentGame.hitSound.setVolume(hitVolume);
      currentGame.hitSound.setEnabled(hitSoundEnabled);
      currentGame.showFPS = showFPS;
      currentGame.showTimingLines = showTimingLines;
      currentGame.showKeySpeed = showKeySpeed;
      currentGame.showLaneSep = showLaneSep;
      currentGame.noteStyle = noteStyle;
      currentGame.noteColorSkin = noteColorSkin;
      currentGame.particlesEnabled = particlesEnabled;
      currentGame.beatPulseEnabled = beatPulseEnabled;
      currentGame.comboFlashEnabled = comboFlashEnabled;
      currentGame.shakeEnabled = shakeEnabled;
      currentGame.bloomEnabled = bloomEnabled && bloomIntensity > 0;
      waitForAudioReady(currentGame.audio).then(() => {
        if (playLoadingOverlay) playLoadingOverlay.classList.remove('show');
        if (currentGame) {
          currentGame.start();
          requestAnimationFrame(() => {
            if (window._setupMobileTouchZones && currentGame) {
              window._setupMobileTouchZones(currentGame);
            }
            
            
            const isMobile = window.matchMedia('(pointer: coarse)').matches;
            if (isMobile && currentGame && currentGame._judgeWindows) {
              const w = currentGame._judgeWindows;
              w.PERFECT = (w.PERFECT || 30) + 20;
              w.GREAT   = (w.GREAT   || 60) + 20;
              w.GOOD    = (w.GOOD    || 100) + 20;
              w.BAD     = (w.BAD     || 130) + 20;
            }
          });
        }
      });
    });
  }

  document.getElementById('btnResume').addEventListener('click', togglePause);

  const btnRestart = document.getElementById('btnRestart');
  if (btnRestart) btnRestart.addEventListener('click', () => {
    if (currentGame) { currentGame.stop(); currentGame = null; window.currentGame = null; }
    pauseOverlay.classList.remove('show');
    if (selectedMap) startGame(selectedMap);
  });

  
  const btnPauseSettings = document.getElementById('btnPauseSettings');
  if (btnPauseSettings) btnPauseSettings.addEventListener('click', () => {
    applySettingsToUI();
    openSettingsModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;

    
    const scoreDetailModal = document.getElementById('scoreDetailModal');
    if (scoreDetailModal && scoreDetailModal.style.display !== 'none' && scoreDetailModal.style.display !== '') {
      e.preventDefault();
      if (window._closeScoreDetail) window._closeScoreDetail();
      return;
    }

    // 1) Overlay ลอยอยู่บนสุด (ค้นหา / อันดับโลก / leaderboard panel) — ปิดก่อนเป็นอันดับแรก
    const rankingModalEl = document.getElementById('rankingModal');
    if (rankingModalEl && rankingModalEl.style.display === 'flex') {
      e.preventDefault();
      const btn = document.getElementById('btnCloseRanking');
      if (btn) btn.click();
      return;
    }
    const searchModalEl = document.getElementById('searchModal');
    if (searchModalEl && searchModalEl.style.display === 'flex') {
      e.preventDefault();
      const btn = document.getElementById('btnCloseSearch');
      if (btn) btn.click();
      return;
    }
    const lbPanelEl = document.getElementById('leaderboardPanel');
    if (lbPanelEl && lbPanelEl.style.display === 'block') {
      e.preventDefault();
      const btn = document.getElementById('btnCloseLeaderboard');
      if (btn) btn.click();
      return;
    }

    
    
    const mpScreenEl = document.getElementById('screen-multiplayer');
    if (mpScreenEl && mpScreenEl.classList.contains('active')) {
      e.preventDefault();
      if (window._mpBackStep) window._mpBackStep();
      return;
    }

    
    if (settingsScreen.classList.contains('active')) {
      e.preventDefault();
      btnSaveSettings.click();
      return;
    }
    if (profileScreen.classList.contains('active')) {
      e.preventDefault();
      closeProfileModal();
      return;
    }

    
    if (currentGame && screens.play.classList.contains('active')) {
      e.preventDefault();
      togglePause();
      return;
    }

    
    
    if (screens.select.classList.contains('active')) {
      e.preventDefault();
      if (_returnToProfileAfterSelect) {
        _returnToProfileAfterSelect = false;
        
        
        if (_savedPreviousScreen !== null) {
          previousScreenName = _savedPreviousScreen;
          _savedPreviousScreen = null;
        }
        stopPreview();
        openProfileModal();
      } else {
        document.getElementById('btnBackHome').click();
      }
      return;
    }

    
    
    if (screens.result.classList.contains('active')) {
      e.preventDefault();
      document.getElementById('btnBackToSelect').click();
      return;
    }
  });

  function togglePause() {
    if (!currentGame) return;
    
    if (window._isMultiplayerGame) {
      const isShowing = pauseOverlay.classList.contains('show');
      pauseOverlay.classList.toggle('show', !isShowing);
      return;
    }
    const isPaused = currentGame.togglePause();
    pauseOverlay.classList.toggle('show', isPaused);
    if (isPaused) {
      hideSkipBtn();
    } else if (currentGame._prevCanSkipIntro) {
      skipBtnLabel.textContent = 'ข้ามอินโทร';
      showSkipBtn();
    }
  }
  
  window._togglePause = togglePause;

  let hitSoundEnabled = true;
  function toggleHitSound() {
    hitSoundEnabled = !hitSoundEnabled;
    if (currentGame) currentGame.hitSound.setEnabled(hitSoundEnabled);
  }

  
  document.getElementById('btnQuit').addEventListener('click', () => {
    if (currentGame) { currentGame.stop(); currentGame = null; window.currentGame = null; }
    pauseOverlay.classList.remove('show');
    showScreen('select');
  });

  
  const btnQuitMP = document.getElementById('btnQuitMP');
  if (btnQuitMP) {
    btnQuitMP.addEventListener('click', () => {
      pauseOverlay.classList.remove('show');
      
      if (currentGame) { currentGame.stopAudio(); currentGame.stop(); currentGame = null; window.currentGame = null; }
      window._isMultiplayerGame = false;
      screens.play.classList.remove('active');
      if (header) header.style.display = '';
      const mpScreen = document.getElementById('screen-multiplayer');
      if (mpScreen) { mpScreen.style.display = 'flex'; mpScreen.classList.add('active'); }
      if (window.MusicPlayer) { try { window.MusicPlayer.onGameEnd(); } catch(e) {} }
      
      if (window.mpSendHostQuitGame) {
        window.mpSendHostQuitGame();
      } else if (window.mpSendGameFinish) {
        window.mpSendGameFinish();
      }
    });
  }

  
  function _updatePauseMode(isMP) {
    const btnQuit = document.getElementById('btnQuit');
    const btnRestart = document.getElementById('btnRestart');
    const btnQuitMP = document.getElementById('btnQuitMP');
    if (isMP) {
      if (btnQuit) btnQuit.style.display = 'none';
      if (btnQuitMP) btnQuitMP.style.display = '';
      if (btnRestart) btnRestart.style.display = 'none'; 
    } else {
      if (btnQuit) btnQuit.style.display = '';
      if (btnQuitMP) btnQuitMP.style.display = 'none';
      if (btnRestart) btnRestart.style.display = '';
    }
  }

  // ===== Result =====
  function showResult(map, snap) {
    // หยุดแค่ loop เกม/คีย์ ไม่ตัดเพลง ให้เพลงเล่นต่อจนกว่าผู้เล่นจะกด "เลือกเพลงอื่น" หรือ "เล่นใหม่"
    if (currentGame) { currentGame.stop(true); }

    const rank = computeRank(snap.accuracy, snap.judgeCounts.MISS);
    const rankEl = document.getElementById('resultRank');
    rankEl.textContent = rank;
    rankEl.className = 'result-rank rank-' + rank;

    document.getElementById('resultSong').textContent = `${map.titleUnicode} [${map.version}]`;
    document.getElementById('resultScore').textContent = String(snap.score).padStart(6, '0');
    document.getElementById('resultAcc').textContent = `Accuracy ${snap.accuracy.toFixed(2)}%`;

    document.getElementById('cntPerfect').textContent = snap.judgeCounts.PERFECT;
    document.getElementById('cntGreat').textContent = snap.judgeCounts.GREAT;
    document.getElementById('cntGood').textContent = snap.judgeCounts.GOOD;
    document.getElementById('cntBad').textContent = snap.judgeCounts.BAD;
    document.getElementById('cntMiss').textContent = snap.judgeCounts.MISS;
    document.getElementById('cntMaxCombo').textContent = snap.maxCombo;

    
    ['scoreSavedMsg', 'loginHintResult', 'uploadNoSaveMsg'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    
    window._lastResultIsUpload = currentPackIsUpload;

    showScreen('result');

    const songId = `${map.titleUnicode} [${map.version}]`;
    if (currentPackIsUpload) {
      
      const note = document.createElement('div');
      note.id = 'uploadNoSaveMsg';
      note.className = 'score-status is-info';
      note.innerHTML = `
        <svg class="ss-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 8v5"/>
          <circle cx="12" cy="16" r="0.5" fill="currentColor"/>
        </svg>
        <span>เพลงอัปโหลดเอง — คะแนนนี้ไม่ถูกบันทึกลงกระดานคะแนน</span>
      `;
      const actions = document.querySelector('#screen-result .result-actions');
      if (actions) actions.parentNode.insertBefore(note, actions);
    } else if (window.Auth && Auth.user) {
      Auth.submitScore({
        songId,
        beatmapSetId: _currentEntry?.beatmapSetId || null,
        score: snap.score,
        accuracy: snap.accuracy,
        rank,
        judgeCounts: snap.judgeCounts,
        maxCombo: snap.maxCombo,
      }).then(res => {
        if (res && res.saved) {
          const isBest = res.best && res.best.score === snap.score;
          const saved = document.createElement('div');
          saved.id = 'scoreSavedMsg';
          saved.className = 'score-status' + (isBest ? ' is-best' : '');
          saved.innerHTML = `
            <svg class="ss-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            <span>บันทึกคะแนนแล้ว</span>
            ${isBest ? '<span class="ss-best-tag">NEW BEST</span>' : ''}
          `;
          const actions = document.querySelector('#screen-result .result-actions');
          if (actions) actions.parentNode.insertBefore(saved, actions);
          
          
          
          if (window.showPPGainToast && window.GamePP) {
            const _scorePP = GamePP.calcScorePP({ accuracy: snap.accuracy, maxCombo: snap.maxCombo });
            setTimeout(() => window.showPPGainToast({
              accuracy: snap.accuracy,
              maxCombo: snap.maxCombo,
              scorePP: _scorePP,
              isBest,
              lifetimeScoreAfter: res.lifetimeScore,
              scoreGained: snap.score,
            }), 400);
          }
        }
      });
    } else if (window.Auth && !Auth.user) {
      const hint = document.createElement('div');
      hint.id = 'loginHintResult';
      hint.className = 'score-status is-warn';
      hint.innerHTML = `
        <svg class="ss-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4.2"/>
          <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>
        </svg>
        <span>เข้าสู่ระบบด้วย Google เพื่อบันทึกคะแนน</span>
      `;
      const actions = document.querySelector('#screen-result .result-actions');
      if (actions) actions.parentNode.insertBefore(hint, actions);
    }
  }

  function computeRank(accuracy, missCount) {
    if (missCount === 0 && accuracy >= 100) return 'X';
    if (missCount === 0 && accuracy >= 98) return 'S+';
    if (accuracy >= 95) return 'S';
    if (accuracy >= 88) return 'A';
    if (accuracy >= 75) return 'B';
    if (accuracy >= 60) return 'C';
    return 'D';
  }

  document.getElementById('btnRetry').addEventListener('click', () => {
    if (currentGame) currentGame.stopAudio();
    window._isMultiplayerGame = false;
    _updatePauseMode(false);
    if (selectedMap) startGame(selectedMap);
  });
  document.getElementById('btnBackToSelect').addEventListener('click', () => {
    if (currentGame) { currentGame.stopAudio(); currentGame = null; window.currentGame = null; }
    window._isMultiplayerGame = false;
    _updatePauseMode(false);
    showScreen('select');
  });

  
  const btnSettings = document.getElementById('btnSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const musicVolSlider = document.getElementById('musicVolume');
  const hitVolSlider = document.getElementById('hitVolume');
  const offsetSlider = document.getElementById('offsetSlider');
  const scrollSpeedSlider = document.getElementById('settingsScrollSpeed');
  const musicVolVal = document.getElementById('musicVolVal');
  const hitVolVal = document.getElementById('hitVolVal');
  const offsetVal = document.getElementById('offsetVal');
  const scrollSpeedVal = document.getElementById('settingsScrollSpeedVal');
  const chkShowFPS = document.getElementById('settingsShowFPS');
  const chkShowTimingLines = document.getElementById('settingsShowTimingLines');
  const chkShowKeySpeed = document.getElementById('settingsShowKeySpeed');
  const chkShowLaneSep = document.getElementById('settingsShowLaneSep');
  const chkBGM = document.getElementById('settingsBGM');
  const chkBgEnabled = document.getElementById('settingsBgEnabled');
  const bgBlurSlider = document.getElementById('settingsBgBlur');
  const bgBlurVal = document.getElementById('settingsBgBlurVal');
  const bgDimSlider = document.getElementById('settingsBgDim');
  const bgDimVal = document.getElementById('settingsBgDimVal');
  const chkBloomEnabled = document.getElementById('settingsBloomEnabled');
  const bloomIntensitySlider = document.getElementById('settingsBloomIntensity');
  const bloomIntensityVal = document.getElementById('settingsBloomIntensityVal');
  const chkParticlesEnabled = document.getElementById('settingsParticlesEnabled');
  const chkBeatPulseEnabled = document.getElementById('settingsBeatPulseEnabled');
  const chkComboFlashEnabled = document.getElementById('settingsComboFlashEnabled');
  const chkShakeEnabled = document.getElementById('settingsShakeEnabled');

  
  const hitsoundSelectN = document.getElementById('hitsoundSelectN');
  const hitsoundSelectLN = document.getElementById('hitsoundSelectLN');
  const hitsoundSelectMiss = document.getElementById('hitsoundSelectMiss');
  const hitsoundPreviewN = document.getElementById('hitsoundPreviewN');
  const hitsoundPreviewLN = document.getElementById('hitsoundPreviewLN');
  const hitsoundPreviewMiss = document.getElementById('hitsoundPreviewMiss');
  const hitsoundFolderHint = document.getElementById('hitsoundFolderHint');

  async function initHitsoundUI() {
    if (!window.HitsoundLoader) return;
    await window.HitsoundLoader.init();
    const files = window.HitsoundLoader.getFiles();
    const selected = window.HitsoundLoader.getSelected();

    function populateSelect(sel, fileList, currentVal) {
      if (!sel) return;
      while (sel.options.length > 1) sel.remove(1);
      fileList.forEach(fname => {
        const opt = document.createElement('option');
        opt.value = fname;
        opt.textContent = fname.replace(/\.[^.]+$/, '');
        sel.appendChild(opt);
      });
      sel.value = currentVal || '';
      if (fileList.length === 0 && hitsoundFolderHint) {
        hitsoundFolderHint.style.display = '';
      }
    }

    populateSelect(hitsoundSelectN,    files.N,    selected.N);
    populateSelect(hitsoundSelectLN,   files.LN,   selected.LN);
    populateSelect(hitsoundSelectMiss, files.Miss, selected.Miss);
  }

  initHitsoundUI();

  if (hitsoundSelectN) {
    hitsoundSelectN.addEventListener('change', async () => {
      if (window.HitsoundLoader) await window.HitsoundLoader.select('N', hitsoundSelectN.value || null);
    });
  }
  if (hitsoundSelectLN) {
    hitsoundSelectLN.addEventListener('change', async () => {
      if (window.HitsoundLoader) await window.HitsoundLoader.select('LN', hitsoundSelectLN.value || null);
    });
  }
  if (hitsoundSelectMiss) {
    hitsoundSelectMiss.addEventListener('change', async () => {
      if (window.HitsoundLoader) await window.HitsoundLoader.select('Miss', hitsoundSelectMiss.value || null);
    });
  }

  if (hitsoundPreviewN) {
    hitsoundPreviewN.addEventListener('click', () => {
      if (!window.HitsoundLoader) return;
      window.HitsoundLoader.unlock();
      const played = window.HitsoundLoader.playN(hitVolume);
      if (!played) {
        const tmp = new window.HitSound();
        tmp.ctx = new (window.AudioContext || window.webkitAudioContext)();
        tmp.volume = hitVolume;
        tmp.playTap();
      }
    });
  }

  if (hitsoundPreviewLN) {
    hitsoundPreviewLN.addEventListener('click', () => {
      if (!window.HitsoundLoader) return;
      window.HitsoundLoader.unlock();
      const played = window.HitsoundLoader.playLN(hitVolume);
      if (!played) {
        const tmp = new window.HitSound();
        tmp.ctx = new (window.AudioContext || window.webkitAudioContext)();
        tmp.volume = hitVolume;
        tmp.playHoldStart();
      }
    });
  }

  if (hitsoundPreviewMiss) {
    hitsoundPreviewMiss.addEventListener('click', () => {
      if (!window.HitsoundLoader) return;
      window.HitsoundLoader.unlock();
      const played = window.HitsoundLoader.playMiss(hitVolume);
      if (!played) {
        const tmp = new window.HitSound();
        tmp.ctx = new (window.AudioContext || window.webkitAudioContext)();
        tmp.volume = hitVolume;
        tmp.playMiss();
      }
    });
  }

  function updateVolDisplays() {
    if (musicVolVal) musicVolVal.textContent = Math.round(musicVolume * 100) + '%';
    if (hitVolVal) hitVolVal.textContent = Math.round(hitVolume * 100) + '%';
    if (offsetVal) offsetVal.textContent = globalOffset + ' ms';
    if (scrollSpeedVal) scrollSpeedVal.textContent = scrollSpeed.toFixed(1) + 'x';
  }

  function applySettingsToUI() {
    if (musicVolSlider) musicVolSlider.value = musicVolume;
    if (hitVolSlider) hitVolSlider.value = hitVolume;
    if (offsetSlider) offsetSlider.value = globalOffset;
    if (scrollSpeedSlider) scrollSpeedSlider.value = scrollSpeed;
    if (chkShowFPS) chkShowFPS.checked = showFPS;
    if (chkShowTimingLines) chkShowTimingLines.checked = showTimingLines;
    if (chkShowKeySpeed) chkShowKeySpeed.checked = showKeySpeed;
    if (chkShowLaneSep) chkShowLaneSep.checked = showLaneSep;
    if (chkBGM && window.MusicPlayer) chkBGM.checked = window.MusicPlayer.getEnabled();
    if (chkBgEnabled) chkBgEnabled.checked = bgEnabled;
    if (bgBlurSlider) bgBlurSlider.value = bgBlur;
    if (bgBlurVal) bgBlurVal.textContent = bgBlur + 'px';
    if (bgDimSlider) bgDimSlider.value = bgDim;
    if (bgDimVal) bgDimVal.textContent = bgDim + '%';
    if (chkBloomEnabled) chkBloomEnabled.checked = bloomEnabled;
    if (bloomIntensitySlider) bloomIntensitySlider.value = bloomIntensity;
    if (bloomIntensityVal) bloomIntensityVal.textContent = String(bloomIntensity);
    if (chkParticlesEnabled) chkParticlesEnabled.checked = particlesEnabled;
    if (chkBeatPulseEnabled) chkBeatPulseEnabled.checked = beatPulseEnabled;
    if (chkComboFlashEnabled) chkComboFlashEnabled.checked = comboFlashEnabled;
    if (chkShakeEnabled) chkShakeEnabled.checked = shakeEnabled;
    updateVolDisplays();
    
    document.querySelectorAll('.note-style-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === noteStyle);
    });
    
    document.querySelectorAll('.skin-swatch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.skin === noteColorSkin);
    });
    
    const noteEl = document.getElementById('settingsSaveNoteText');
    if (noteEl) {
      const user = window.Auth && Auth.user;
      if (user) {
        const name = user.displayName || user.email || user.uid;
        noteEl.textContent = `บันทึกกับบัญชี: ${name} — login เครื่องไหนก็ได้ค่านี้`;
      } else {
        noteEl.textContent = 'ยังไม่ได้ login — บันทึกไว้ในเครื่องนี้เท่านั้น';
      }
    }
    
    if (window._renderKeybindGrid) window._renderKeybindGrid();
  }

  
  window._applySettingsToUI = applySettingsToUI;
  window._openProfileModal = openProfileModal;
  window._closeProfileModal = closeProfileModal;
  
  window._showHomeScreen = () => showScreen('upload');

  
  window._stopMPGame = function() {
    if (currentGame) {
      try { currentGame.stopAudio(); } catch(e) {}
      try { currentGame.stop(); } catch(e) {}
      currentGame = null; window.currentGame = null;
    }
    if (window._stopPreview) window._stopPreview();
    window._isMultiplayerGame = false;
    
    const playScreen = document.getElementById('screen-play');
    if (playScreen) playScreen.classList.remove('active');
    const pauseOverlay = document.getElementById('pauseOverlay');
    if (pauseOverlay) pauseOverlay.classList.remove('show');
    const stageHeader = document.querySelector('.stage-header');
    if (stageHeader) stageHeader.style.display = '';
    // เปิด MP screen ถ้ายังไม่ได้อยู่ที่นั่น
    const mpScreen = document.getElementById('screen-multiplayer');
    if (mpScreen && !mpScreen.classList.contains('active')) {
      mpScreen.style.display = 'flex';
      mpScreen.classList.add('active');
    }
    if (window.MusicPlayer) { try { window.MusicPlayer.onGameEnd(); } catch(e) {} }
  };

  
  loadSettings(null);

  btnSettings.addEventListener('click', () => {
    stopPreview();
    applySettingsToUI();
    openSettingsModal();
  });

  if (musicVolSlider) musicVolSlider.addEventListener('input', () => {
    musicVolume = parseFloat(musicVolSlider.value);
    updateVolDisplays();
    if (currentGame && currentGame.audio) currentGame.audio.volume = musicVolume;
  });

  if (hitVolSlider) hitVolSlider.addEventListener('input', () => {
    hitVolume = parseFloat(hitVolSlider.value);
    updateVolDisplays();
    if (currentGame && currentGame.hitSound) currentGame.hitSound.setVolume(hitVolume);
  });

  if (offsetSlider) offsetSlider.addEventListener('input', () => {
    globalOffset = parseInt(offsetSlider.value);
    updateVolDisplays();
  });

  if (scrollSpeedSlider) scrollSpeedSlider.addEventListener('input', () => {
    scrollSpeed = parseFloat(scrollSpeedSlider.value);
    updateVolDisplays();
  });

  if (chkShowFPS) chkShowFPS.addEventListener('change', () => {
    showFPS = chkShowFPS.checked;
    if (currentGame) currentGame.showFPS = showFPS;
  });
  if (chkShowTimingLines) chkShowTimingLines.addEventListener('change', () => {
    showTimingLines = chkShowTimingLines.checked;
    if (currentGame) currentGame.showTimingLines = showTimingLines;
  });
  if (chkShowKeySpeed) chkShowKeySpeed.addEventListener('change', () => {
    showKeySpeed = chkShowKeySpeed.checked;
    if (currentGame) currentGame.showKeySpeed = showKeySpeed;
  });
  if (chkShowLaneSep) chkShowLaneSep.addEventListener('change', () => {
    showLaneSep = chkShowLaneSep.checked;
    if (currentGame) currentGame.showLaneSep = showLaneSep;
  });

  if (chkBgEnabled) chkBgEnabled.addEventListener('change', () => {
    bgEnabled = chkBgEnabled.checked;
    applyVisualSettings();
  });
  if (bgBlurSlider) bgBlurSlider.addEventListener('input', () => {
    bgBlur = parseFloat(bgBlurSlider.value);
    if (bgBlurVal) bgBlurVal.textContent = bgBlur + 'px';
    applyVisualSettings();
  });
  if (bgDimSlider) bgDimSlider.addEventListener('input', () => {
    bgDim = parseFloat(bgDimSlider.value);
    if (bgDimVal) bgDimVal.textContent = bgDim + '%';
    applyVisualSettings();
  });
  if (chkBloomEnabled) chkBloomEnabled.addEventListener('change', () => {
    bloomEnabled = chkBloomEnabled.checked;
    applyVisualSettings();
  });
  if (bloomIntensitySlider) bloomIntensitySlider.addEventListener('input', () => {
    bloomIntensity = parseFloat(bloomIntensitySlider.value);
    if (bloomIntensityVal) bloomIntensityVal.textContent = String(bloomIntensity);
    applyVisualSettings();
  });
  if (chkParticlesEnabled) chkParticlesEnabled.addEventListener('change', () => {
    particlesEnabled = chkParticlesEnabled.checked;
    if (currentGame) currentGame.particlesEnabled = particlesEnabled;
  });
  if (chkBeatPulseEnabled) chkBeatPulseEnabled.addEventListener('change', () => {
    beatPulseEnabled = chkBeatPulseEnabled.checked;
    if (currentGame) currentGame.beatPulseEnabled = beatPulseEnabled;
    if (!beatPulseEnabled && beatGlowBorder) beatGlowBorder.style.setProperty('--beat-glow-alpha', '0');
  });
  if (chkComboFlashEnabled) chkComboFlashEnabled.addEventListener('change', () => {
    comboFlashEnabled = chkComboFlashEnabled.checked;
    if (currentGame) currentGame.comboFlashEnabled = comboFlashEnabled;
  });
  if (chkShakeEnabled) chkShakeEnabled.addEventListener('change', () => {
    shakeEnabled = chkShakeEnabled.checked;
    if (currentGame) currentGame.shakeEnabled = shakeEnabled;
  });

  document.querySelectorAll('.note-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      noteStyle = btn.dataset.style;
      document.querySelectorAll('.note-style-btn').forEach(b => b.classList.toggle('active', b === btn));
      if (currentGame) currentGame.noteStyle = noteStyle;
    });
  });

  
  const skinSwatchGrid = document.getElementById('skinSwatchGrid');
  function renderSkinSwatches() {
    if (!skinSwatchGrid) return;
    const skins = window.NOTE_COLOR_SKINS || [];
    skinSwatchGrid.innerHTML = '';
    skins.forEach(skin => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'skin-swatch-btn' + (skin.id === noteColorSkin ? ' active' : '');
      btn.dataset.skin = skin.id;
      btn.title = skin.name;

      const dots = document.createElement('div');
      dots.className = 'skin-swatch-dots';
      skin.colors.slice(0, 4).forEach(c => {
        const dot = document.createElement('span');
        dot.className = 'skin-swatch-dot';
        dot.style.background = c;
        dot.style.color = c;
        dots.appendChild(dot);
      });

      const label = document.createElement('span');
      label.className = 'skin-swatch-name';
      label.textContent = skin.name;

      btn.appendChild(dots);
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        noteColorSkin = skin.id;
        document.querySelectorAll('.skin-swatch-btn').forEach(b => b.classList.toggle('active', b === btn));
        if (currentGame) currentGame.noteColorSkin = noteColorSkin;
      });
      skinSwatchGrid.appendChild(btn);
    });
  }
  renderSkinSwatches();
  window._renderSkinSwatches = renderSkinSwatches;

  
  let activeKeyMode = 4;   
  let listeningCell = null; 

  function renderKeybindGrid(mode) {
    const container = document.getElementById('keybindGrid');
    if (!container) return;
    const bindings = getBindingsForMode(mode);
    container.innerHTML = '';
    bindings.forEach((code, i) => {
      const btn = document.createElement('button');
      btn.className = 'keybind-btn';
      btn.dataset.mode = mode;
      btn.dataset.col = i;
      const codeToLbl = window.codeToLabel || (c => c.replace(/^Key/,''));
      btn.textContent = codeToLbl(code);
      btn.title = `Column ${i+1}: ${code}`;
      btn.addEventListener('click', () => startListening(mode, i, btn));
      container.appendChild(btn);
    });
  }

  function startListening(mode, colIndex, btn) {
    
    if (listeningCell) {
      listeningCell.btn.classList.remove('listening');
    }
    listeningCell = { mode, colIndex, btn };
    btn.classList.add('listening');
    btn.textContent = '...';
  }

  function stopListening() {
    if (listeningCell) {
      listeningCell.btn.classList.remove('listening');
      listeningCell = null;
    }
  }

  
  document.addEventListener('keydown', (e) => {
    if (!listeningCell) return;
    
    if (['Control','Alt','Shift','Meta','CapsLock','Tab','Escape'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();

    const { mode, colIndex } = listeningCell;
    if (!keyBindingsMap[mode]) {
      keyBindingsMap[mode] = [...getBindingsForMode(mode)];
    }
    keyBindingsMap[mode][colIndex] = e.code;
    syncKeyBindingsToGame();
    stopListening();
    renderKeybindGrid(mode);
  });

  
  document.addEventListener('click', (e) => {
    if (listeningCell && !e.target.classList.contains('keybind-btn')) {
      stopListening();
      renderKeybindGrid(listeningCell ? listeningCell.mode : activeKeyMode);
    }
  });

  
  document.querySelectorAll('.keybind-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      stopListening();
      activeKeyMode = parseInt(tab.dataset.mode);
      document.querySelectorAll('.keybind-mode-tab').forEach(t => t.classList.toggle('active', t === tab));
      renderKeybindGrid(activeKeyMode);
    });
  });

  
  const btnResetKeybinds = document.getElementById('btnResetKeybinds');
  if (btnResetKeybinds) {
    btnResetKeybinds.addEventListener('click', () => {
      stopListening();
      delete keyBindingsMap[activeKeyMode];
      syncKeyBindingsToGame();
      renderKeybindGrid(activeKeyMode);
    });
  }

  
  window._renderKeybindGrid = () => renderKeybindGrid(activeKeyMode);

  btnSaveSettings.addEventListener('click', () => {
    if (currentGame) {
      currentGame.globalOffset = globalOffset || 0;
      currentGame.audio.volume = musicVolume;
      currentGame.hitSound.setVolume(hitVolume);
      currentGame.scrollSpeed = scrollSpeed;
      currentGame.showFPS = showFPS;
      currentGame.showTimingLines = showTimingLines;
      currentGame.showKeySpeed = showKeySpeed;
      currentGame.showLaneSep = showLaneSep;
      currentGame.noteStyle = noteStyle;
      currentGame.noteColorSkin = noteColorSkin;
      currentGame.particlesEnabled = particlesEnabled;
      currentGame.beatPulseEnabled = beatPulseEnabled;
      currentGame.comboFlashEnabled = comboFlashEnabled;
      currentGame.shakeEnabled = shakeEnabled;
      if (!beatPulseEnabled && beatGlowBorder) beatGlowBorder.style.setProperty('--beat-glow-alpha', '0');
    }
    const uid = (window.Auth && Auth.user) ? Auth.user.uid : null;
    saveSettings(uid);
    
    
    stopPreview();
    
    
    if (chkBGM && window.MusicPlayer) {
      if (currentGame) {
        window.MusicPlayer.setEnabled(chkBGM.checked);
        window.MusicPlayer.pause(); 
      } else {
        window.MusicPlayer.setEnabled(chkBGM.checked);
      }
    }
    closeSettingsModal();
  });

  btnCloseSettings.addEventListener('click', closeSettingsModal);

  
  
  
  
  

  
  if (window.Auth) {
    Auth.onUserChange((user) => {
      loadSettings(user ? user.uid : null);
    });
  } else {
    
    const _authPoll = setInterval(() => {
      if (window.Auth) {
        clearInterval(_authPoll);
        Auth.onUserChange((user) => {
          loadSettings(user ? user.uid : null);
        });
      }
    }, 200);
  }

  
  
  
  (function setupKeyboardNav() {
    const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

    function isTypingTarget() {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }

    
    let libFocusIndex = -1;
    function visibleLibraryCards() {
      return Array.from(libraryGrid.querySelectorAll('.library-card')).filter(c => c.style.display !== 'none');
    }
    function focusLibraryCard(idx) {
      const cards = visibleLibraryCards();
      if (cards.length === 0) return;
      idx = Math.max(0, Math.min(cards.length - 1, idx));
      cards.forEach(c => c.classList.remove('kbd-focus'));
      libFocusIndex = idx;
      cards[idx].classList.add('kbd-focus');
      cards[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });

      
      clearTimeout(_previewHoverTimer);
      stopPreview();
      const focusedCard = cards[idx];
      const entryId = focusedCard.dataset.entryId;
      const allEntries = window._getLibraryEntries ? window._getLibraryEntries() : [];
      const entry = allEntries.find(e => String(e.id) === String(entryId));
      if (entry && entry._preview && entry._preview.previewAudioUrl) {
        _previewHoverTimer = setTimeout(() => playPreview(entry._preview.previewAudioUrl), 400);
      }
    }
    function libraryGridCols(cards) {
      
      if (cards.length === 0) return 1;
      const refTop = cards[0].offsetTop;
      let cols = 0;
      for (const c of cards) {
        if (Math.abs(c.offsetTop - refTop) < 4) cols++; else break;
      }
      return Math.max(1, cols);
    }
    function handleLibraryArrow(code) {
      const cards = visibleLibraryCards();
      if (cards.length === 0) return;
      if (libFocusIndex === -1) { focusLibraryCard(0); return; }
      const cols = libraryGridCols(cards);
      let next = libFocusIndex;
      if (code === 'ArrowRight') next++;
      else if (code === 'ArrowLeft') next--;
      else if (code === 'ArrowDown') next += cols;
      else if (code === 'ArrowUp') next -= cols;
      focusLibraryCard(next);
    }

    
    function diffCards() { return Array.from(diffList.querySelectorAll('.diff-card')); }
    function handleDiffArrow(code) {
      const cards = diffCards();
      if (cards.length === 0) return;
      let idx = cards.findIndex(c => c.classList.contains('selected'));
      if (idx === -1) idx = 0;
      if (code === 'ArrowDown' || code === 'ArrowRight') idx = Math.min(cards.length - 1, idx + 1);
      else if (code === 'ArrowUp' || code === 'ArrowLeft') idx = Math.max(0, idx - 1);
      cards[idx].click(); 
      cards[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    
    function pauseButtons() {
      return Array.from(pauseOverlay.querySelectorAll('button')).filter(b => b.offsetParent !== null);
    }
    function handlePauseArrow(code) {
      const btns = pauseButtons();
      if (btns.length === 0) return;
      let idx = btns.indexOf(document.activeElement);
      if (idx === -1) idx = 0;
      if (code === 'ArrowRight' || code === 'ArrowDown') idx = (idx + 1) % btns.length;
      else if (code === 'ArrowLeft' || code === 'ArrowUp') idx = (idx - 1 + btns.length) % btns.length;
      btns[idx].focus();
    }
    
    new MutationObserver(() => {
      if (pauseOverlay.classList.contains('show')) {
        const btns = pauseButtons();
        if (btns.length) btns[0].focus();
      }
    }).observe(pauseOverlay, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('keydown', (e) => {
      if (!ARROW_KEYS.includes(e.code) && e.code !== 'Enter') return;
      if (isTypingTarget()) return; 

      
      if (pauseOverlay.classList.contains('show')) {
        if (ARROW_KEYS.includes(e.code)) { e.preventDefault(); handlePauseArrow(e.code); }
        
        return;
      }

      
      if (screens.upload.classList.contains('active')) {
        if (ARROW_KEYS.includes(e.code)) {
          e.preventDefault();
          handleLibraryArrow(e.code);
        } else if (e.code === 'Enter' && libFocusIndex !== -1) {
          e.preventDefault();
          const cards = visibleLibraryCards();
          if (cards[libFocusIndex]) cards[libFocusIndex].click();
        }
        return;
      }

      
      if (screens.select.classList.contains('active')) {
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          e.preventDefault();
          handleDiffArrow(e.code);
        } else if (e.code === 'Enter') {
          e.preventDefault();
          document.getElementById('btnStartGame').click();
        }
        return;
      }
    });
  })();

  
  
  
  const btnMultiplayer = document.getElementById('btnMultiplayer');
  if (btnMultiplayer) {
    btnMultiplayer.addEventListener('click', () => { stopPreview(); });
  }

  
  
  window._startMultiplayerGame = async function (songInfo, preloadedEntry) {
    const mpScreen = document.getElementById('screen-multiplayer');
    if (mpScreen) { mpScreen.style.display = 'none'; mpScreen.classList.remove('active'); }

    
    const allEntries = window._getLibraryEntries ? window._getLibraryEntries() : [];
    let entry = preloadedEntry || null;

    if (!entry && songInfo.entryId) {
      entry = allEntries.find(e => String(e.id) === String(songInfo.entryId));
    }
    if (!entry && songInfo.songId) {
      const numId = String(songInfo.songId).replace(/\D/g, '');
      if (numId) {
        entry = allEntries.find(e =>
          String(e.beatmapSetId) === numId ||
          (e.source === 'mirror' && (e.name || '').startsWith(numId))
        );
      }
    }
    if (!entry && songInfo.title) {
      const tl = songInfo.title.toLowerCase();
      entry = allEntries.find(e => (e._preview?.title || e.name || '').toLowerCase() === tl);
    }

    if (!entry) {
      alert(`ไม่พบเพลง "${songInfo.title}" ในคลังของคุณ\nกรุณาดาวน์โหลดเพลงนี้ก่อน`);
      if (mpScreen) { mpScreen.style.display = 'flex'; mpScreen.classList.add('active'); }
      return;
    }

    
    gloShow('กำลังโหลดเพลง', songInfo.title || '');
    gloSetProgress(20);

    try {
      const pack = await window.SongLibrary.loadPack(entry);
      if (!pack || !pack.maps || pack.maps.length === 0) throw new Error('ไม่พบ beatmap ในไฟล์นี้');

      gloSetProgress(70);
      pack.maps.forEach(m => { m._starRating = calcStarRating(m); });

      // ใช้ diff ที่หัวห้องเลือกไว้ตรงๆ ถ้ามี (songInfo.version) — ถ้าไม่พบหรือไม่ได้ระบุมา (ห้องเก่า/กรณีฉุกเฉิน)
      // ค่อย fallback ไปเลือก diff ที่ยากที่สุดเหมือนพฤติกรรมเดิม
      let map = null;
      if (songInfo.version) {
        map = pack.maps.find(m => m.version === songInfo.version) || null;
      }
      if (!map) {
        map = pack.maps.reduce((best, m) =>
          (m._starRating ?? 0) > (best._starRating ?? 0) ? m : best
        , pack.maps[0]);
      }

      // ถ้าเป็นแมพที่แปลงจาก osu!standard และ host เลือกคีย์ไม่ใช่ค่า default (4K) ที่โหลดมาตอนแรก
      // ต้องแปลงใหม่ให้ตรงกับคีย์ที่ host เลือกจริงก่อนเริ่มเกม ไม่งั้นทุกคนจะเล่นเป็น 4K เสมอ
      // ไม่ว่า host จะเลือกคีย์ไหนไว้ในหน้า diff picker ก็ตาม
      if (map && map.convertedFromStandard && songInfo.keyCount != null
          && songInfo.keyCount !== map.keyCount && map.stdSourceText) {
        try {
          const reconverted = window.StdToManiaBridge.convertStdOsuToMania(map.stdSourceText, songInfo.keyCount);
          if (reconverted && reconverted.hitObjects.length > 0) {
            map.beatmap = reconverted;
            map.keyCount = reconverted.keyCount;
            map.noteCount = reconverted.hitObjects.length;
            map.lnCount = reconverted.hitObjects.filter(h => h.isLongNote).length;
            map.duration = reconverted.hitObjects.length > 0 ? Math.max(...reconverted.hitObjects.map(h => h.endTime)) : 0;
            map.stdCurrentColumns = songInfo.keyCount;
            map._starRating = calcStarRating(map);
          }
        } catch (e) {
          console.warn('[MP] แปลงคีย์ตามที่ host เลือกไม่สำเร็จ ใช้ค่า default แทน', e);
        }
      }

      selectedMap = map;
      gloSetProgress(100);
      await new Promise(r => setTimeout(r, 100));
      gloHide();
      window._isMultiplayerGame = true;
      _updatePauseMode(true);
      startGame(map);
    } catch (err) {
      gloHide();
      console.warn('[MP] _startMultiplayerGame error:', err);
      alert(`โหลดเพลงไม่สำเร็จ: ${err.message || songInfo.title}`);
      if (mpScreen) { mpScreen.style.display = 'flex'; mpScreen.classList.add('active'); }
    }
  };

  
  

  
  window._isMultiplayerGame = false;
  _updatePauseMode(false);
  showScreen('upload');

  
  (function setupAudioUnlock() {
    const overlay = document.getElementById('audioUnlockOverlay');
    if (!overlay) return;

    let unlocked = false;

    function unlock() {
      if (unlocked) return;
      unlocked = true;

      overlay.style.pointerEvents = 'none';

      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
      } catch (_) {}

      if (window._hitsoundUnlock) window._hitsoundUnlock();

      overlay.classList.add('au-hidden');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });

      overlay.removeEventListener('touchstart', onOverlayTouch);
      document.removeEventListener('click',     onDocClick);
      document.removeEventListener('keydown',   unlock);
    }

    
    
    function onOverlayTouch(e) {
      e.preventDefault();
      unlock();
    }

    
    function onDocClick(e) {
      
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      unlock();
    }

    overlay.addEventListener('touchstart', onOverlayTouch, { passive: false });
    document.addEventListener('click',     onDocClick);
    document.addEventListener('keydown',   unlock);
  })();

  
  
  
  (function initMobileTouch() {
    const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

    
    const mobilePauseBtn = document.getElementById('mobilePauseBtn');
    if (mobilePauseBtn) {
      mobilePauseBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (window._togglePause) window._togglePause();
      }, { passive: false });
      mobilePauseBtn.addEventListener('click', () => {
        if (window._togglePause) window._togglePause();
      });
    }

    
    
    window._setupMobileTouchZones = function(game) {
      if (!isTouchDevice()) return;
      const container = document.getElementById('mobileTouchZones');
      if (!container) return;

      const keyCount = game.keyCount;

      
      
      function syncContainerToField() {
        const fieldX = game.fieldX;
        const fieldW = game.fieldWidth;
        container.style.left   = fieldX + 'px';
        container.style.width  = fieldW + 'px';
        container.style.top    = '0';
        container.style.bottom = '0';
        container.style.height = '';   // let CSS top:0/bottom:0 stretch it
        container.style.transform = 'none';
      }

      
      container.innerHTML = '';
      for (let c = 0; c < keyCount; c++) {
        const zone = document.createElement('div');
        zone.className = 'mobile-touch-zone';
        zone.dataset.col = c;
        zone.style.width = (100 / keyCount) + '%';
        zone.style.left  = (c * 100 / keyCount) + '%';
        container.appendChild(zone);
      }

      
      const touchColMap = new Map();

      
      
      
      
      
      
      
      let _cachedRect = null;
      function refreshRect() { _cachedRect = container.getBoundingClientRect(); }

      function colFromTouch(touch) {
        const rect = _cachedRect || container.getBoundingClientRect();
        const relX = touch.clientX - rect.left;
        const col  = Math.floor(relX / (rect.width / keyCount));
        return Math.max(0, Math.min(keyCount - 1, col));
      }

      
      
      let _pendingZoneAdd = null;
      let _pendingZoneRemove = null;
      function queueZoneActive(col) {
        if (!_pendingZoneAdd) _pendingZoneAdd = new Set();
        _pendingZoneAdd.add(col);
      }
      function queueZoneInactive(col) {
        if (!_pendingZoneRemove) _pendingZoneRemove = new Set();
        _pendingZoneRemove.add(col);
      }
      function flushZoneClasses() {
        if (_pendingZoneRemove) {
          for (const c of _pendingZoneRemove) {
            const z = container.children[c];
            if (z) z.classList.remove('active');
          }
          _pendingZoneRemove = null;
        }
        if (_pendingZoneAdd) {
          for (const c of _pendingZoneAdd) {
            const z = container.children[c];
            if (z) z.classList.add('active');
          }
          _pendingZoneAdd = null;
        }
      }

      function pressCol(col) {
        if (game.finished || game.paused) return;
        
        
        if (game.keyState[col]) {
          game.keyState[col] = false;
          if (game._releaseTimers[col]) {
            clearTimeout(game._releaseTimers[col]);
            game._releaseTimers[col] = null;
          }
          game._tryReleaseColumn(col);
        }
        game.keyState[col] = true;
        game.keyPressVisual[col] = 1;
        game._spawnKeyTapParticles(col);
        const now = performance.now();
        game._keyPressLog.push(now);
        game._keyPressLog = game._keyPressLog.filter(t => now - t <= 1000);
        game._keySpeed = game._keyPressLog.length;
        game._tryHitColumn(col);
        queueZoneActive(col);
      }

      function releaseCol(col) {
        if (!game.keyState[col]) return;
        game.keyState[col] = false;
        
        
        if (game._releaseTimers[col]) clearTimeout(game._releaseTimers[col]);
        game._releaseTimers[col] = setTimeout(() => {
          game._releaseTimers[col] = null;
          if (game.keyState[col]) return;
          game._tryReleaseColumn(col);
        }, 20);
        queueZoneInactive(col);
      }

      container.addEventListener('touchstart', (e) => {
        e.preventDefault();
        refreshRect(); 
        for (const touch of e.changedTouches) {
          const col = colFromTouch(touch);
          
          if (touchColMap.has(touch.identifier)) {
            releaseCol(touchColMap.get(touch.identifier));
          }
          touchColMap.set(touch.identifier, col);
          pressCol(col);
        }
        flushZoneClasses(); 
      }, { passive: false });

      container.addEventListener('touchmove', (e) => {
        e.preventDefault();
        refreshRect();
        for (const touch of e.changedTouches) {
          const newCol = colFromTouch(touch);
          const oldCol = touchColMap.get(touch.identifier);
          if (oldCol !== undefined && oldCol !== newCol) {
            releaseCol(oldCol);
            touchColMap.set(touch.identifier, newCol);
            pressCol(newCol);
          }
        }
        flushZoneClasses();
      }, { passive: false });

      container.addEventListener('touchend', (e) => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
          const col = touchColMap.get(touch.identifier);
          if (col !== undefined) {
            releaseCol(col);
            touchColMap.delete(touch.identifier);
          }
        }
        flushZoneClasses();
      }, { passive: false });

      container.addEventListener('touchcancel', (e) => {
        for (const touch of e.changedTouches) {
          const col = touchColMap.get(touch.identifier);
          if (col !== undefined) {
            releaseCol(col);
            touchColMap.delete(touch.identifier);
          }
        }
        flushZoneClasses();
      }, { passive: false });

      
      syncContainerToField();

      
      window.addEventListener('resize', () => {
        requestAnimationFrame(syncContainerToField);
      }, { passive: true });
    };

    
    document.addEventListener('touchstart', (e) => {
      const playScreen = document.getElementById('screen-play');
      if (playScreen && playScreen.classList.contains('active') && e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });

  })(); 
})();