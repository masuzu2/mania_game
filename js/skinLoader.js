(function () {

  const DB_NAME = 'garage_stage_skins_db';
  const DB_VERSION = 1;
  const STORE = 'skins';
  const ACTIVE_KEY = 'gs_active_skin_id';

  let skinList = [];          
  let activeSkinId = null;
  try { activeSkinId = localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { activeSkinId = null; }

  
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB ไม่รองรับในเบราว์เซอร์นี้')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbDelete(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  
  function parseSkinIni(text) {
    const sections = [];
    let current = null;
    const lines = (text || '').split(/\r?\n/);
    for (let raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      const sectionMatch = line.match(/^\[(.+)\]$/);
      if (sectionMatch) {
        current = { name: sectionMatch[1].trim(), props: {} };
        sections.push(current);
        continue;
      }
      if (!current) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      current.props[key] = val;
    }
    return sections;
  }

  function parseColorCss(str, fallback) {
    if (!str) return fallback;
    const parts = str.split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return fallback;
    return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
  }

  
  async function buildSkinFromZip(zip, fileName) {
    const entries = Object.values(zip.files).filter(e => !e.dir);

    function findByBaseName(base) {
      const target = base.toLowerCase();
      return entries.find(e => {
        const bn = e.name.toLowerCase().split('/').pop();
        const dot = bn.lastIndexOf('.');
        const stem = dot === -1 ? bn : bn.slice(0, dot);
        return stem === target;
      }) || null;
    }

    async function loadImage(base) {
      const entry = findByBaseName(base + '@2x') || findByBaseName(base);
      if (!entry) return null;
      try {
        const blob = await entry.async('blob');
        const url = URL.createObjectURL(blob);
        return await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = url;
        });
      } catch (e) { return null; }
    }

    async function loadAudioUrl(base) {
      const entry = findByBaseName(base);
      if (!entry) return null;
      try {
        const blob = await entry.async('blob');
        return URL.createObjectURL(blob);
      } catch (e) { return null; }
    }

    
    let iniText = '';
    const iniEntry = findByBaseName('skin');
    if (iniEntry) {
      try { iniText = await iniEntry.async('text'); } catch (e) { iniText = ''; }
    }
    const sections = parseSkinIni(iniText);
    const general = sections.find(s => s.name.toLowerCase() === 'general');
    const maniaSec = sections.find(s => s.name.toLowerCase() === 'mania' && parseInt(s.props['Keys'], 10) === 4)
                   || sections.find(s => s.name.toLowerCase() === 'mania');

    const name = (general && general.props['Name']) ? general.props['Name'] : fileName.replace(/\.osk$/i, '');
    const author = (general && general.props['Author']) ? general.props['Author'] : '';

    const defaultLight = ['#ff5d8f', '#ffd166', '#6ee7e0', '#ff5d8f'];
    let lightColors = defaultLight.slice();
    let holdColor = null;
    if (maniaSec) {
      lightColors = [1, 2, 3, 4].map((n, idx) => parseColorCss(maniaSec.props['ColourLight' + n], defaultLight[idx]));
      holdColor = parseColorCss(maniaSec.props['ColourHold'], null);
    }

    const [
      note1, note2, noteS,
      note1H, note2H, noteSH,
      note1L, note2L, noteSL,
      note1T, note2T, noteST,
      key1, key2, keyS,
      key1D, key2D, keySD,
      stageLeft, stageRight, stageBottom, stageLight,
    ] = await Promise.all([
      loadImage('mania-note1'), loadImage('mania-note2'), loadImage('mania-noteS'),
      loadImage('mania-note1H'), loadImage('mania-note2H'), loadImage('mania-noteSH'),
      loadImage('mania-note1L'), loadImage('mania-note2L'), loadImage('mania-noteSL'),
      loadImage('mania-note1T'), loadImage('mania-note2T'), loadImage('mania-noteST'),
      loadImage('mania-key1'), loadImage('mania-key2'), loadImage('mania-keyS'),
      loadImage('mania-key1D'), loadImage('mania-key2D'), loadImage('mania-keySD'),
      loadImage('mania-stage-left'), loadImage('mania-stage-right'),
      loadImage('mania-stage-bottom'), loadImage('mania-stage-light'),
    ]);

    const [hitNormal, hitClap, hitWhistle, hitFinish, comboBreak] = await Promise.all([
      loadAudioUrl('normal-hitnormal'),
      loadAudioUrl('normal-hitclap'),
      loadAudioUrl('normal-hitwhistle'),
      loadAudioUrl('normal-hitfinish'),
      loadAudioUrl('combobreak'),
    ]);

    return {
      name,
      author,
      images: {
        note: { 1: note1, 2: note2, S: noteS },
        head: { 1: note1H || note1, 2: note2H || note2, S: noteSH || noteS },
        tail: { 1: note1L, 2: note2L, S: noteSL },
        body: { 1: note1T, 2: note2T, S: noteST },
        key: { 1: key1, 2: key2, S: keyS },
        keyDown: { 1: key1D || key1, 2: key2D || key2, S: keySD || keyS },
        stageLeft, stageRight, stageBottom, stageLight,
      },
      colors: { light: lightColors, hold: holdColor },
      sounds: { hitNormal, hitClap, hitWhistle, hitFinish, comboBreak },
    };
  }

  async function importSkinBlob(blob, fileName, source) {
    const zip = await JSZip.loadAsync(blob);
    const skin = await buildSkinFromZip(zip, fileName);
    skin.fileName = fileName;
    skin.source = source; 
    return skin;
  }

  
  async function listFolderFileNames() {
    const names = new Set();

    
    try {
      const res = await fetch('skins/manifest.json', { cache: 'no-store' });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) list.forEach(n => names.add(n));
      }
    } catch (e) {  }

    
    if (names.size === 0) {
      try {
        const res = await fetch('skins/', { cache: 'no-store' });
        if (res.ok) {
          const html = await res.text();
          const re = /href="([^"]+\.osk)"/gi;
          let m;
          while ((m = re.exec(html))) {
            const decoded = decodeURIComponent(m[1]).split('/').pop();
            if (decoded) names.add(decoded);
          }
        }
      } catch (e) {  }
    }

    return [...names];
  }

  async function scanSkinsFolder() {
    const fileNames = await listFolderFileNames();
    const results = [];
    for (const fname of fileNames) {
      try {
        const res = await fetch('skins/' + fname.split('/').map(encodeURIComponent).join('/'), { cache: 'no-store' });
        if (!res.ok) continue;
        const blob = await res.blob();
        const skin = await importSkinBlob(blob, fname, 'folder');
        skin.id = 'folder:' + fname;
        results.push(skin);
      } catch (e) {
        console.warn('โหลดสกินจากโฟลเดอร์ไม่สำเร็จ:', fname, e);
      }
    }
    return results;
  }

  
  async function init() {
    skinList = [];

    try {
      const folderSkins = await scanSkinsFolder();
      skinList.push(...folderSkins);
    } catch (e) {
      console.warn('สแกนโฟลเดอร์ skins/ ไม่สำเร็จ', e);
    }

    try {
      const records = await dbGetAll();
      for (const rec of records) {
        try {
          const skin = await importSkinBlob(rec.blob, rec.fileName, 'upload');
          skin.id = rec.id;
          skinList.push(skin);
        } catch (e) {
          console.warn('โหลดสกินที่เคยอัปโหลดไม่สำเร็จ:', rec.fileName, e);
        }
      }
    } catch (e) {
      
      console.warn('IndexedDB ไม่พร้อมใช้งาน', e);
    }

    return skinList.slice();
  }

  async function importFiles(fileList) {
    const added = [];
    for (const file of fileList) {
      if (!file.name.toLowerCase().endsWith('.osk')) continue;
      try {
        const id = 'upload:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
        const skin = await importSkinBlob(file, file.name, 'upload');
        skin.id = id;
        try { await dbPut({ id, fileName: file.name, blob: file }); } catch (e) {  }
        skinList.push(skin);
        added.push(skin);
      } catch (e) {
        console.warn('นำเข้าสกินไม่สำเร็จ:', file.name, e);
        added.push({ error: true, fileName: file.name, message: e.message });
      }
    }
    return added;
  }

  async function deleteSkin(id) {
    const skin = skinList.find(s => s.id === id);
    if (!skin) return;
    if (skin.source === 'upload') {
      try { await dbDelete(id); } catch (e) {  }
    }
    skinList = skinList.filter(s => s.id !== id);
    if (activeSkinId === id) setActiveSkin(null);
  }

  function getSkins() {
    return skinList.slice();
  }

  function setActiveSkin(id) {
    activeSkinId = id || null;
    try {
      if (activeSkinId) localStorage.setItem(ACTIVE_KEY, activeSkinId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch (e) {  }
  }

  function getActiveSkin() {
    if (!activeSkinId) return null;
    return skinList.find(s => s.id === activeSkinId) || null;
  }

  window.SkinManager = {
    init,
    importFiles,
    deleteSkin,
    getSkins,
    setActiveSkin,
    getActiveSkin,
  };
})();
