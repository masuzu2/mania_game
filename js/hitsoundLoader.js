(function () {

  const BASE = 'hitsounds/';
  const FOLDERS = { N: BASE + 'N/', LN: BASE + 'LN/', Miss: BASE + 'Miss/' };
  const TYPES = ['N', 'LN', 'Miss'];

  let _ctx = null;
  let _ctxReady = false;

  function getCtx() {
    
    if (!_ctxReady) return null;
    if (!_ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) _ctx = new AC();
    }
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  }

  
  function unlockAudioContext() {
    _ctxReady = true;
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
    
    
    activateSelected().catch(() => {});
  }
  window._hitsoundUnlock = unlockAudioContext;

  const _bufferCache = {};

  async function loadBuffer(url) {
    if (_bufferCache[url]) return _bufferCache[url];
    const ctx = getCtx();
    if (!ctx) return null;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      _bufferCache[url] = buf;
      return buf;
    } catch (e) {
      return null;
    }
  }

  function playBuffer(buf, volume) {
    if (!buf) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(gain).connect(ctx.destination);
    src.start(ctx.currentTime);
  }

  let _files        = { N: [], LN: [], Miss: [] };
  let _selected     = { N: null, LN: null, Miss: null };
  let _activeBuffer = { N: null, LN: null, Miss: null };

  const STORAGE_KEY = 'ks_hitsound_selection';

  function loadSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      TYPES.forEach(t => { if (d[t] !== undefined) _selected[t] = d[t]; });
    } catch (e) {}
  }

  function saveSelection() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_selected));
    } catch (e) {}
  }

  async function activateSelected() {
    for (const type of TYPES) {
      if (_selected[type]) {
        _activeBuffer[type] = await loadBuffer(FOLDERS[type] + _selected[type]);
      } else {
        _activeBuffer[type] = null;
      }
    }
  }

    async function fetchFileList() {
    try {
      const res = await fetch('/api/hitsounds', { cache: 'no-store' });
      if (!res.ok) return { N: [], LN: [], Miss: [] };
      return await res.json();
    } catch (e) {
      return { N: [], LN: [], Miss: [] };
    }
  }

  async function init() {
    loadSelection();
    const lists = await fetchFileList();
    TYPES.forEach(t => { _files[t] = Array.isArray(lists[t]) ? lists[t] : []; });

    
    TYPES.forEach(t => {
      if (_selected[t] && !_files[t].includes(_selected[t])) _selected[t] = null;
    });

    await activateSelected();
  }

  async function select(type, filename) {
    _selected[type] = filename || null;
    saveSelection();
    if (filename) {
      _activeBuffer[type] = await loadBuffer(FOLDERS[type] + filename);
    } else {
      _activeBuffer[type] = null;
    }
  }

  function playN(volume)    { if (!_activeBuffer.N)    return false; playBuffer(_activeBuffer.N,    volume); return true; }
  function playLN(volume)   { if (!_activeBuffer.LN)   return false; playBuffer(_activeBuffer.LN,   volume); return true; }
  function playMiss(volume) { if (!_activeBuffer.Miss)  return false; playBuffer(_activeBuffer.Miss, volume); return true; }

  function unlock() { getCtx(); }

  window.HitsoundLoader = {
    init, select,
    playN, playLN, playMiss,
    unlock,
    getFiles:    () => ({ N: [..._files.N], LN: [..._files.LN], Miss: [..._files.Miss] }),
    getSelected: () => ({ ..._selected }),
  };
})();