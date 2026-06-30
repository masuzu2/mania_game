
(function () {
  
  const uploadedEntries = [];

    async function listFolderFileNames() {
    const names = new Set();

    
    try {
      const res = await fetch('songs/manifest.json', { cache: 'no-store' });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) list.forEach(n => names.add(n));
      }
    } catch (e) {  }

    
    try {
      const res = await fetch('songs/', { cache: 'no-store' });
      if (res.ok) {
        const html = await res.text();
        const re = /href="([^"]+\.osz)"/gi;
        let m;
        while ((m = re.exec(html))) {
          const decoded = decodeURIComponent(m[1]).split('/').pop();
          if (decoded) names.add(decoded);
        }
      }
    } catch (e) { /* server ไม่รองรับ listing ก็ไม่เป็นไร */ }

    return [...names];
  }

  /**
   * คืนรายชื่อ "เพลง" ทั้งหมดที่จะแสดงในหน้าหลัก (ยังไม่โหลดไฟล์จริง — โหลดแบบ lazy ตอนกดเล่น)
   * รูปแบบ: { id, name, source: 'folder'|'upload', url?, blob? }
   */
  async function listAll() {
    const folderNames = await listFolderFileNames();
    const folderEntries = folderNames.map(fname => ({
      id: 'folder:' + fname,
      name: fname.replace(/\.osz$/i, ''),
      source: 'folder',
      url: 'songs/' + fname.split('/').map(encodeURIComponent).join('/'),
    }));
    return [...folderEntries, ...uploadedEntries];
  }

    function addUploadedFile(file, source) {
    const src = source === 'mirror' ? 'mirror' : 'upload';
    const entry = {
      id: src + ':' + Date.now() + ':' + file.name,
      name: file.name.replace(/\.osz$/i, ''),
      source: src,
      file,
    };
    uploadedEntries.push(entry);
    return entry;
  }

  /**
   * โหลด SongPack จริงจาก entry (เรียกตอนผู้ใช้กดเข้าเพลงนั้น)
   * @param {object} entry
   * @param {AbortSignal} [signal]
   * @param {object} [options] - { stdConvertColumns: number[] } ถ้าแมพเป็น osu!standard จะแปลงเป็นคีย์ที่ระบุ
   *                              (default: [4, 7] - แปลงให้ทั้งสองแบบ ผู้เล่นเลือกได้)
   */
  async function loadPack(entry, signal, options) {
    if (entry.source === 'folder') {
      return window.OszLoader.loadOszFromUrl(entry.url, entry.name, signal, options);
    }
    return window.OszLoader.loadOszFile(entry.file, signal, options);
  }

  window.SongLibrary = {
    listAll,
    addUploadedFile,
    loadPack,
  };
})();
