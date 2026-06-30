
(function () {
  'use strict';

  let audio = null;
  let entries = [];         
  let currentIndex = -1;
  let isEnabled = true;
  let volume = 0.05; 
  let audioUrlCache = {};   
  let failedEntries = new Set(); 
  let uiEl = null;
  let miniEl = null;
  let _isLoading = false;
  let _pendingIndex = null;
  let _userGestured = false; 
  let playGeneration = 0; 
  let _duckLevel = null; 
  let _fadeInOnNextPlay = false; 
  let _tabIsHidden = false; 

  
  
  
  
  function effectiveVolume() {
    return _tabIsHidden ? volume * 0.1 : volume;
  }

  

  async function loadEntries() {
    try {
      if (window.SongLibrary) {
        entries = await window.SongLibrary.listAll();
      }
    } catch (e) {
      entries = [];
    }
  }

  function nextRandom() {
    if (entries.length === 0) return -1;
    
    const available = entries.map((_, i) => i).filter(i => !failedEntries.has(entries[i].id) && i !== currentIndex);
    if (available.length === 0) {
      
      failedEntries.clear();
      return entries.length > 1 ? (currentIndex + 1) % entries.length : 0;
    }
    return available[Math.floor(Math.random() * available.length)];
  }

  

  async function playAt(index) {
    if (!_userGestured) return; 
    if (_isLoading) { _pendingIndex = index; return; }
    if (entries.length === 0) return;

    index = ((index % entries.length) + entries.length) % entries.length;
    currentIndex = index;
    const entry = entries[currentIndex];

    setUILoading(true);
    _isLoading = true;

    try {
      let audioUrl = audioUrlCache[entry.id];

      if (!audioUrl) {
        
        const pack = await window.SongLibrary.loadPack(entry);
        if (!pack || !pack.maps || pack.maps.length === 0) {
          throw new Error('pack empty');
        }
        const seen = new Set();
        const uniqueMaps = pack.maps.filter(m => {
          if (!m.audioUrl || seen.has(m.audioUrl)) return false;
          seen.add(m.audioUrl);
          return true;
        });
        if (uniqueMaps.length === 0) throw new Error('no audioUrl in pack');

        
        audioUrl = uniqueMaps[0].audioUrl;
        audioUrlCache[entry.id] = audioUrl;
        entry._displayName = (uniqueMaps[0].artist ? uniqueMaps[0].artist + ' - ' : '') + (uniqueMaps[0].title || entry.name);

        // map ที่เหลือ → สร้าง sub-entry แทรกเข้า entries[] ถัดไปทันที
        if (uniqueMaps.length > 1) {
          const newEntries = uniqueMaps.slice(1).map((m, i) => {
            const subId = entry.id + ':track' + (i + 1);
            audioUrlCache[subId] = m.audioUrl;
            return {
              id: subId,
              name: entry.name + ' (' + (m.title || ('Track ' + (i + 2))) + ')',
              source: entry.source,
              url: entry.url,
              file: entry.file,
              _displayName: (m.artist ? m.artist + ' - ' : '') + (m.title || entry.name),
              _preloaded: true,
            };
          });
          entries.splice(currentIndex + 1, 0, ...newEntries);
          renderList();
        }
      }

      if (audio) {
        // ลบ listener เก่าก่อนทิ้ง element — ไม่งั้นตอน src='' มันจะยิง
        // error event ของเพลงเก่าออกมา แล้วไปสั่งข้ามเพลงซ้ำซ้อนกับที่เรา
        // กำลังจะเล่นเพลงใหม่อยู่แล้ว ทำให้เกิดลูปข้ามเพลงไม่หยุด
        audio.removeEventListener('ended', audio._mpEndedHandler);
        audio.removeEventListener('error', audio._mpErrorHandler);
        audio.pause();
        audio.src = '';
        audio.load();
      }

      // ใช้ generation token กันไม่ให้ callback ของ audio element เก่า
      // (ที่อาจหลุดมาทำงานช้าๆ) ไปกระทบ audio element ตัวใหม่ปัจจุบัน
      const myGeneration = ++playGeneration;

      audio = new Audio(audioUrl);
      // ตั้ง volume เริ่มต้นของเพลงใหม่ — ต้องเช็ค _tabIsHidden ด้วย ไม่งั้นพอเปลี่ยนเพลง
      // (กดข้ามเอง หรือเพลงจบแล้วเล่นเพลงถัดไปอัตโนมัติ) ตอนแท็บถูกซ่อนอยู่ เสียงจะดังเต็มขึ้นมาทันที
      // ทั้งที่ก่อนหน้านี้ถูกหรี่ไว้จาก visibilitychange (เพลงเก่าถูกทิ้งไปพร้อม audio element เก่า
      // ระดับเสียงที่หรี่ไว้จึงไม่ติดมาด้วย ต้องคำนวณใหม่จาก state ปัจจุบันเสมอ)
      const baseVolume = effectiveVolume();
      audio.volume = _duckLevel !== null ? _duckLevel : (_fadeInOnNextPlay ? 0 : baseVolume);
      audio.loop = false;

      const endedHandler = () => {
        if (myGeneration !== playGeneration) return; // เพลงนี้ถูกเปลี่ยนไปแล้ว ไม่ต้องทำอะไร
        playAt(nextRandom());
      };
      const errorHandler = () => {
        if (myGeneration !== playGeneration) return; // ตัวนี้ถูกแทนที่ไปแล้ว ไม่ใช่ error ของเพลงที่เล่นอยู่จริง
        console.warn('[MusicPlayer] audio error, skipping:', entry.name);
        failedEntries.add(entry.id);
        const next = nextRandom();
        if (next !== -1) setTimeout(() => playAt(next), 800);
      };
      audio._mpEndedHandler = endedHandler;
      audio._mpErrorHandler = errorHandler;
      audio.addEventListener('ended', endedHandler);
      audio.addEventListener('error', errorHandler);
      await audio.play().catch(() => {});
      if (_fadeInOnNextPlay && _duckLevel === null) {
        _fadeInOnNextPlay = false;
        fadeTo(effectiveVolume(), 1800, false);
      }
      updateUI();
    } catch (e) {
      console.warn('[MusicPlayer] failed to load entry, skipping:', entry.name, e.message);
      failedEntries.add(entry.id); 
      const next = nextRandom();
      if (next !== -1) setTimeout(() => playAt(next), 800);
    } finally {
      _isLoading = false;
      setUILoading(false);
      if (_pendingIndex !== null) {
        const p = _pendingIndex;
        _pendingIndex = null;
        playAt(p);
      }
    }
  }

  function pause() {
    if (audio) audio.pause();
    updateUI();
  }

  function resume() {
    if (!_userGestured) return;
    if (audio) {
      if (_duckLevel === null) audio.volume = effectiveVolume(); 
      audio.play().catch(() => {});
    } else if (entries.length > 0) {
      playAt(nextRandom());
    }
    updateUI();
  }

  function togglePlay() {
    if (!audio || audio.paused) resume();
    else pause();
  }

  function next() {
    let idx = currentIndex + 1;
    if (idx >= entries.length) idx = 0;
    playAt(idx);
  }
  function prev() {
    let idx = currentIndex - 1;
    if (idx < 0) idx = entries.length - 1;
    playAt(idx);
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (audio) audio.volume = volume;
    saveSettings();
  }

  let _fadeInterval = null;
    function fadeTo(target, durationMs, persist) {
    if (_fadeInterval) { clearInterval(_fadeInterval); _fadeInterval = null; }
    target = Math.max(0, Math.min(1, target));
    if (!audio) {
      if (persist) { volume = target; saveSettings(); }
      return;
    }
    const start = audio.volume;
    const steps = Math.max(1, Math.round(durationMs / 40));
    let step = 0;
    const fadingEl = audio;
    _fadeInterval = setInterval(() => {
      step++;
      if (fadingEl !== audio) { clearInterval(_fadeInterval); _fadeInterval = null; return; }
      const t = step / steps;
      fadingEl.volume = start + (target - start) * t;
      if (step >= steps) {
        clearInterval(_fadeInterval);
        _fadeInterval = null;
        fadingEl.volume = target;
        if (persist) { volume = target; saveSettings(); }
      }
    }, 40);
  }

  function setEnabled(val) {
    isEnabled = val;
    if (!isEnabled) { pause(); }
    else if (_userGestured) {
      if (!audio || audio.paused) {
        if (currentIndex === -1) playAt(nextRandom());
        else resume();
      }
    }
    updateUI();
    saveSettings();
  }

  function getCurrentEntry() {
    return entries[currentIndex] || null;
  }

  
  
  function cleanName(name) {
    if (!name) return name;
    return name.replace(/^\d+\s+/, '').trim();
  }

  function getCurrentName() {
    const e = getCurrentEntry();
    if (!e) return '—';
    return cleanName(e._displayName || e.name) || '—';
  }

  function isPlaying() {
    return audio && !audio.paused;
  }

  // ========== UI Helpers ==========

  function setUILoading(v) {
    if (miniEl) {
      const t = miniEl.querySelector('.mp-mini-title');
      if (t && v) t.textContent = 'กำลังโหลด...';
    }
    if (uiEl) {
      const t = uiEl.querySelector('.mp-title');
      if (t && v) t.textContent = 'กำลังโหลด...';
    }
  }

  function updateUI() {
    const name = getCurrentName();
    const playing = isPlaying();
    if (miniEl) {
      const t = miniEl.querySelector('.mp-mini-title');
      const b = miniEl.querySelector('.mp-mini-play');
      if (t) t.textContent = name;
      if (b) b.innerHTML = playing ? pauseIcon() : playIcon();
      miniEl.classList.toggle('is-playing', playing);
    }
    if (uiEl) {
      const t = uiEl.querySelector('.mp-title');
      const b = uiEl.querySelector('.mp-play');
      const eq = uiEl.querySelector('.mp-eq');
      if (t) t.textContent = name;
      if (b) b.innerHTML = playing ? pauseIcon() : playIcon();
      if (eq) eq.classList.toggle('is-playing', playing);
      
      uiEl.querySelectorAll('.mp-list-item').forEach((el, i) => {
        el.classList.toggle('active', i === currentIndex);
      });
    }
  }

  function playIcon()  { return `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`; }
  function pauseIcon() { return `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`; }
  function nextIcon()  { return `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 15,12 5,21"/><rect x="16" y="3" width="3" height="18" rx="1"/></svg>`; }
  function prevIcon()  { return `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,3 9,12 19,21"/><rect x="5" y="3" width="3" height="18" rx="1"/></svg>`; }
  
  function waveIcon()  { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="14" x2="4" y2="20"/><line x1="9" y1="9" x2="9" y2="20"/><line x1="14" y1="4" x2="14" y2="20"/><line x1="19" y1="11" x2="19" y2="20"/></svg>`; }
  function listIcon()  { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg>`; }
  function closeIcon() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`; }
  function volIcon()   { return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>`; }

  

  function renderList() {
    if (!uiEl) return;
    const list = uiEl.querySelector('.mp-list');
    const header = uiEl.querySelector('.mp-list-header');
    if (!list) return;
    if (header) header.textContent = `รายการเพลงทั้งหมด (${entries.length} เพลง)`;
    list.innerHTML = '';
    entries.forEach((e, i) => {
      const li = document.createElement('div');
      li.className = 'mp-list-item' + (i === currentIndex ? ' active' : '');
      li.textContent = cleanName(e._displayName || e.name);
      li.addEventListener('click', () => playAt(i));
      list.appendChild(li);
    });
  }

  function openPanel() {
    if (!uiEl) createPanel();
    renderList();
    updateUI();
    uiEl.style.display = 'flex';
  }

  function closePanel() {
    if (uiEl) uiEl.style.display = 'none';
  }

  

  function createMiniPlayer() {
    miniEl = document.createElement('div');
    miniEl.id = 'musicMiniPlayer';
    miniEl.innerHTML = `
      <span class="mp-mini-wave">${waveIcon()}</span>
      <div class="mp-mini-title">—</div>
      <button class="mp-mini-btn mp-mini-prev" title="เพลงก่อนหน้า">${prevIcon()}</button>
      <button class="mp-mini-btn mp-mini-play" title="เล่น/หยุด">${playIcon()}</button>
      <button class="mp-mini-btn mp-mini-next" title="เพลงถัดไป">${nextIcon()}</button>
      <button class="mp-mini-btn mp-mini-list" title="รายการเพลง">${listIcon()}</button>
    `;
    miniEl.querySelector('.mp-mini-play').addEventListener('click', () => {
      onUserGesture();
      togglePlay();
    });
    miniEl.querySelector('.mp-mini-next').addEventListener('click', () => { onUserGesture(); next(); });
    miniEl.querySelector('.mp-mini-prev').addEventListener('click', () => { onUserGesture(); prev(); });
    miniEl.querySelector('.mp-mini-list').addEventListener('click', openPanel);

    
    
    
    
    
    
    
    
    
    
    const brandEl = document.getElementById('btnBrandHome');
    if (brandEl && brandEl.parentNode) {
      const leftWrap = document.createElement('div');
      leftWrap.id = 'headerLeftWrap';
      brandEl.parentNode.insertBefore(leftWrap, brandEl);
      leftWrap.appendChild(brandEl); 
      leftWrap.appendChild(miniEl);  
    } else {
      
      const authContainer = document.getElementById('authContainer');
      const headerRight = authContainer ? authContainer.parentNode : document.querySelector('.stage-header > div:last-child');
      if (headerRight) headerRight.insertBefore(miniEl, headerRight.firstChild);
    }
  }

  function createPanel() {
    uiEl = document.createElement('div');
    uiEl.id = 'musicPanel';
    uiEl.innerHTML = `
      <div class="mp-panel-inner">
        <div class="mp-panel-glow"></div>
        <div class="mp-panel-header">
          <span class="mp-panel-title">${waveIcon()}<span>เครื่องเล่นเพลง</span></span>
          <button class="mp-close-btn" title="ปิด">${closeIcon()}</button>
        </div>
        <div class="mp-now">
          <div class="mp-eq" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <div class="mp-title">—</div>
          <div class="mp-controls">
            <button class="mp-btn mp-btn--ghost mp-prev" title="เพลงก่อนหน้า">${prevIcon()}</button>
            <button class="mp-btn mp-btn--main mp-play" title="เล่น/หยุด">${playIcon()}</button>
            <button class="mp-btn mp-btn--ghost mp-next" title="เพลงถัดไป">${nextIcon()}</button>
          </div>
          <div class="mp-vol-row">
            <span class="mp-vol-icon">${volIcon()}</span>
            <input type="range" class="mp-vol" min="0" max="100" value="${Math.round(volume * 100)}">
          </div>
        </div>
        <div class="mp-list-wrap">
          <div class="mp-list-header">รายการเพลงทั้งหมด (${entries.length} เพลง)</div>
          <div class="mp-list"></div>
        </div>
      </div>
    `;
    uiEl.querySelector('.mp-play').addEventListener('click', () => { onUserGesture(); togglePlay(); });
    uiEl.querySelector('.mp-next').addEventListener('click', () => { onUserGesture(); next(); });
    uiEl.querySelector('.mp-prev').addEventListener('click', () => { onUserGesture(); prev(); });
    uiEl.querySelector('.mp-close-btn').addEventListener('click', closePanel);
    uiEl.querySelector('.mp-vol').addEventListener('input', e => setVolume(e.target.value / 100));
    uiEl.addEventListener('click', e => { if (e.target === uiEl) closePanel(); });
    document.body.appendChild(uiEl);
  }

  
  

  function onUserGesture() {
    if (_userGestured) return;
    _userGestured = true;
    
    if (window._hitsoundUnlock) window._hitsoundUnlock();
    if (isEnabled && entries.length > 0 && (!audio || audio.paused)) {
      _fadeInOnNextPlay = true; 
      if (currentIndex === -1) playAt(nextRandom());
      else resume();
    }
  }

  function attachGestureListeners() {
    const startOnGesture = () => {
      onUserGesture();
      
      ['click', 'keydown', 'touchstart'].forEach(ev =>
        document.removeEventListener(ev, startOnGesture, { capture: true })
      );
    };
    ['click', 'keydown', 'touchstart'].forEach(ev =>
      document.addEventListener(ev, startOnGesture, { capture: true, once: true })
    );
  }


  

  const TAB_FADE_MS = 1200;

  function setupTabVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (_duckLevel !== null) return; 
      _tabIsHidden = document.hidden;
      fadeTo(effectiveVolume(), TAB_FADE_MS, false);
    });
  }

  

  function saveSettings() {
    try {
      localStorage.setItem('ks_music_player', JSON.stringify({ enabled: isEnabled })); 
    } catch (e) {}
  }

  function loadPersistedSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('ks_music_player') || '{}');
      if (saved.enabled !== undefined) isEnabled = saved.enabled;
      volume = 0.05; 
    } catch (e) {
      volume = 0.05;
    }
  }

  

  function injectCSS() {
    if (document.getElementById('mp-style')) return;
    const style = document.createElement('style');
    style.id = 'mp-style';
    style.textContent = `
      #headerLeftWrap {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex-shrink: 1;
        overflow: hidden;
      }
      #musicMiniPlayer {
        flex-shrink: 1;
        min-width: 0;
      }
      #musicMiniPlayer {
        display: flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03));
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 999px;
        padding: 5px 6px 5px 12px;
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        box-shadow: 0 2px 10px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06);
      }
      .mp-mini-wave {
        display: flex; align-items: center; color: var(--accent-teal, #6ee7e0);
        opacity: 0.55; flex-shrink: 0;
      }
      #musicMiniPlayer.is-playing .mp-mini-wave { opacity: 0.95; }
      .mp-mini-wave svg line { transform-origin: center bottom; }
      #musicMiniPlayer.is-playing .mp-mini-wave line:nth-child(1) { animation: mp-eq-bounce 0.9s ease-in-out infinite; }
      #musicMiniPlayer.is-playing .mp-mini-wave line:nth-child(2) { animation: mp-eq-bounce 0.7s ease-in-out infinite 0.1s; }
      #musicMiniPlayer.is-playing .mp-mini-wave line:nth-child(3) { animation: mp-eq-bounce 1.05s ease-in-out infinite 0.2s; }
      #musicMiniPlayer.is-playing .mp-mini-wave line:nth-child(4) { animation: mp-eq-bounce 0.8s ease-in-out infinite 0.05s; }
      .mp-mini-title {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 11.5px;
        font-weight: 500;
        color: rgba(255,255,255,0.78);
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 130px;
        letter-spacing: 0.01em;
      }
      .mp-mini-btn {
        background: none; border: none;
        color: rgba(255,255,255,0.65);
        cursor: pointer; padding: 5px; border-radius: 999px;
        display: flex; align-items: center; justify-content: center;
        transition: color 0.15s, background 0.15s, transform 0.1s;
      }
      .mp-mini-btn:hover { color:#fff; background:rgba(255,255,255,0.12); }
      .mp-mini-btn:active { transform: scale(0.9); }
      .mp-mini-play { color: var(--accent-magenta, #ff5d8f); }
      .mp-mini-play:hover { color: #fff; background: var(--accent-magenta, #ff5d8f); }

      #musicPanel {
        display: none; position: fixed; inset: 0;
        z-index: 9000; background: rgba(8,6,12,0.55);
        backdrop-filter: blur(2px);
        align-items: center; justify-content: center;
        animation: mp-overlay-in 0.18s ease-out;
      }
      @keyframes mp-overlay-in { from { opacity: 0; } to { opacity: 1; } }

      .mp-panel-inner {
        position: relative;
        background: linear-gradient(160deg, rgba(40,32,56,0.72), rgba(18,14,26,0.78));
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 22px; width: 380px; max-height: 80vh;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09);
        backdrop-filter: blur(28px) saturate(150%);
        -webkit-backdrop-filter: blur(28px) saturate(150%);
        animation: mp-panel-in 0.22s cubic-bezier(.2,.9,.25,1.1);
      }
      @keyframes mp-panel-in { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: none; } }

      .mp-panel-glow {
        position: absolute; top: -60%; left: -20%; width: 140%; height: 140%;
        background:
          radial-gradient(circle at 25% 15%, rgba(255,93,143,0.18), transparent 55%),
          radial-gradient(circle at 80% 0%, rgba(110,231,224,0.14), transparent 50%);
        pointer-events: none; z-index: 0;
      }

      .mp-panel-header {
        position: relative; z-index: 1;
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 18px; border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .mp-panel-title {
        display: flex; align-items: center; gap: 9px;
        font-family: var(--font-display, 'Space Grotesk', sans-serif);
        font-weight: 600; font-size: 14.5px; color: var(--text-main, #f0edf8);
        letter-spacing: 0.01em;
      }
      .mp-panel-title svg { color: var(--accent-teal, #6ee7e0); flex-shrink: 0; }
      .mp-close-btn {
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.6);
        cursor: pointer; padding: 7px; border-radius: 999px;
        display: flex; align-items: center; justify-content: center;
        transition: color 0.15s, background 0.15s, border-color 0.15s;
      }
      .mp-close-btn:hover { color:#fff; background: rgba(255,93,143,0.25); border-color: rgba(255,93,143,0.4); }

      .mp-now {
        position: relative; z-index: 1;
        padding: 18px 18px 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .mp-eq {
        display: flex; align-items: flex-end; justify-content: center; gap: 4px;
        height: 20px; margin-bottom: 10px; opacity: 0.35;
      }
      .mp-eq span {
        width: 3px; border-radius: 2px;
        background: linear-gradient(180deg, var(--accent-teal, #6ee7e0), var(--accent-magenta, #ff5d8f));
        height: 6px; transform-origin: bottom;
      }
      .mp-eq.is-playing { opacity: 1; }
      .mp-eq.is-playing span:nth-child(1) { animation: mp-eq-bar 0.9s ease-in-out infinite; }
      .mp-eq.is-playing span:nth-child(2) { animation: mp-eq-bar 0.65s ease-in-out infinite 0.12s; }
      .mp-eq.is-playing span:nth-child(3) { animation: mp-eq-bar 1.1s ease-in-out infinite 0.22s; }
      .mp-eq.is-playing span:nth-child(4) { animation: mp-eq-bar 0.8s ease-in-out infinite 0.05s; }
      @keyframes mp-eq-bar { 0%, 100% { height: 5px; } 50% { height: 18px; } }
      @keyframes mp-eq-bounce { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }

      .mp-title {
        font-family: var(--font-display, 'Space Grotesk', sans-serif);
        font-size: 14px; font-weight: 600;
        text-align: center;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        margin-bottom:16px; color: var(--text-main, #f0edf8);
      }
      .mp-controls {
        display:flex; gap:10px; justify-content:center; align-items: center; margin-bottom:16px;
      }
      .mp-btn {
        border: 1px solid rgba(255,255,255,0.14);
        color:#fff; cursor:pointer;
        display:flex; align-items:center; justify-content: center;
        transition: all 0.15s;
      }
      .mp-btn--ghost {
        background: rgba(255,255,255,0.07);
        width: 38px; height: 38px; border-radius: 50%;
      }
      .mp-btn--ghost:hover { background: rgba(255,255,255,0.14); }
      .mp-btn--main {
        background: linear-gradient(135deg, var(--accent-magenta, #ff5d8f), #ff8aab);
        width: 50px; height: 50px; border-radius: 50%;
        border-color: transparent;
        box-shadow: 0 6px 20px rgba(255,93,143,0.35);
      }
      .mp-btn--main:hover { filter: brightness(1.08); transform: translateY(-1px); }
      .mp-btn:active { transform: scale(0.92); }

      .mp-vol-row { display:flex; align-items:center; gap:10px; padding: 0 2px; }
      .mp-vol-icon { display:flex; color: rgba(255,255,255,0.45); flex-shrink: 0; }
      .mp-vol {
        flex:1; cursor:pointer; -webkit-appearance: none; appearance: none;
        height: 4px; border-radius: 999px;
        background: rgba(255,255,255,0.14);
        accent-color: var(--accent-teal, #6ee7e0);
      }
      .mp-vol::-webkit-slider-thumb {
        -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%;
        background: var(--accent-teal, #6ee7e0);
        box-shadow: 0 0 0 3px rgba(110,231,224,0.2);
        cursor: pointer;
      }
      .mp-vol::-moz-range-thumb {
        width: 13px; height: 13px; border-radius: 50%; border: none;
        background: var(--accent-teal, #6ee7e0);
        box-shadow: 0 0 0 3px rgba(110,231,224,0.2);
        cursor: pointer;
      }

      .mp-list-wrap {
        position: relative; z-index: 1;
        flex:1; overflow-y:auto; padding:10px 0;
      }
      .mp-list-wrap::-webkit-scrollbar { width: 6px; }
      .mp-list-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 999px; }
      .mp-list-header {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 10.5px; color: rgba(255,255,255,0.38);
        padding: 4px 18px 10px; text-transform:uppercase; letter-spacing:0.08em;
        font-weight: 600;
      }
      .mp-list-item {
        padding: 10px 18px; font-size: 13px; cursor: pointer;
        transition: background 0.12s, color 0.12s;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        color: rgba(255,255,255,0.72);
        border-left: 2px solid transparent;
      }
      .mp-list-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
      .mp-list-item.active {
        background: linear-gradient(90deg, rgba(255,93,143,0.16), transparent);
        color: var(--accent-magenta, #ff5d8f);
        font-weight: 600;
        border-left-color: var(--accent-magenta, #ff5d8f);
      }
    `;
    document.head.appendChild(style);
  }

  

  async function init() {
    loadPersistedSettings();
    injectCSS();
    await loadEntries();

    
    window.addEventListener('songLibraryUpdated', async () => {
      await loadEntries();
      renderList();
      if (isEnabled && _userGestured && !isPlaying() && entries.length > 0) {
        playAt(nextRandom());
      }
    });

    createMiniPlayer();
    attachGestureListeners();
    setupTabVisibility();

    
  }

  

  window.MusicPlayer = {
    init,
    play: () => { onUserGesture(); if (entries.length > 0 && (!audio || audio.paused)) { if (currentIndex === -1) playAt(nextRandom()); else resume(); } },
    pause,
    resume: () => { if (_userGestured) resume(); },
    next:  () => { onUserGesture(); next(); },
    prev:  () => { onUserGesture(); prev(); },
    togglePlay: () => { onUserGesture(); togglePlay(); },
    setVolume,
    fadeTo,
    setEnabled,
    getEnabled: () => isEnabled,
    getVolume:  () => volume,
    openPanel,
    closePanel,
    isPlaying,
    onGameStart: () => { _duckLevel = null; pause(); },
    onGameEnd:   () => { _duckLevel = null; if (isEnabled && _userGestured) { if (!audio || audio.paused) { if (currentIndex === -1) playAt(nextRandom()); else resume(); } } },
    
    duck: (durationMs = 600, level = 0) => { _duckLevel = level; fadeTo(level, durationMs, false); },
    
    unduck: (durationMs = 600) => { _duckLevel = null; fadeTo(effectiveVolume(), durationMs, false); },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
