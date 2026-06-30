
class SongPack {
  constructor(name) {
    this.name = name;
    this.maps = []; 
  }
}

async function loadOszFile(file, signal, options) {
  return loadOszBlob(file, file.name, signal, options);
}

async function loadOszFromUrl(url, displayName, signal, options) {
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) {
    throw new Error('โหลดไฟล์เพลงไม่สำเร็จ (HTTP ' + res.status + ')');
  }
  const blob = await res.blob();
  const name = displayName || url.split('/').pop();
  return loadOszBlob(blob, name, signal, options);
}

async function loadOszBlob(blob, displayName, signal, options) {
  if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const stdConvertColumns = (options && options.stdConvertColumns) || [4, 5, 6, 7];

  const zip = await JSZip.loadAsync(blob).catch(e => {
    throw new Error('ไฟล์เสียหายหรือไม่ใช่ไฟล์ .osz ที่ถูกต้อง (' + e.message + ')');
  });
  if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');

  
  const osuFiles = [];
  const audioCache = new Map(); 
  const imageCache = new Map();

  const entries = Object.values(zip.files);

  
  for (const entry of entries) {
    if (entry.dir) continue;
    const lowerName = entry.name.toLowerCase();
    if (lowerName.endsWith('.osu')) {
      osuFiles.push(entry);
    }
  }

  if (osuFiles.length === 0) {
    throw new Error('ไม่พบไฟล์ .osu ในไฟล์ที่อัปโหลด (ไม่ใช่ osz ที่ถูกต้อง หรือไม่มี beatmap ข้างใน)');
  }

  const packName = (displayName || 'เพลงไม่มีชื่อ').replace(/\.osz$/i, '');
  const songPack = new SongPack(packName);

  for (const osuEntry of osuFiles) {
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    let text;
    try {
      text = await osuEntry.async('text');
    } catch (e) {
      continue;
    }

    
    const modeMatch = text.match(/^Mode\s*:\s*(\d)/m);
    const rawMode = modeMatch ? modeMatch[1] : '0'; 

    if (rawMode === '3') {
      
      let beatmap;
      try {
        beatmap = window.OsuParser.parseOsuFile(text);
      } catch (e) {
        console.warn('parse error', osuEntry.name, e);
        continue;
      }
      if (beatmap.hitObjects.length === 0) continue;
      if (!beatmap.audioFilename) continue;

      const pushed = await pushMapFromBeatmap(beatmap, osuEntry.name, packName, entries, audioCache, imageCache);
      if (pushed) songPack.maps.push(pushed);
    } else if (rawMode === '0') {
      
      
      
      
      let stdCheck;
      try {
        stdCheck = window.StdOsuParser.parseStdOsuFile(text);
      } catch (e) {
        console.warn('std parse error', osuEntry.name, e);
        continue;
      }
      if (stdCheck.hitObjects.length === 0) continue;
      if (!stdCheck.audioFilename) continue;

      const defaultColumns = stdConvertColumns.includes(4) ? 4 : stdConvertColumns[0];
      let beatmap;
      try {
        beatmap = window.StdToManiaBridge.convertStdOsuToMania(text, defaultColumns);
      } catch (e) {
        console.warn('std->mania convert error', osuEntry.name, defaultColumns + 'K', e);
        continue;
      }
      if (!beatmap || beatmap.hitObjects.length === 0) continue;

      const pushed = await pushMapFromBeatmap(beatmap, osuEntry.name, packName, entries, audioCache, imageCache, true);
      if (pushed) {
        pushed.stdSourceText = text;
        pushed.stdCurrentColumns = defaultColumns;
        pushed.stdAvailableColumns = stdConvertColumns.slice().sort((a, b) => a - b);
        songPack.maps.push(pushed);
      }
    }
    
  }

  if (songPack.maps.length === 0) {
    throw new Error('ไฟล์นี้ไม่มี difficulty แบบ osu!mania หรือ osu!standard ที่ใช้งานได้ หรือหาไฟล์เสียงที่อ้างถึงไม่เจอ');
  }

  
  songPack.maps.sort((a, b) => a.noteCount - b.noteCount);

  return songPack;
}

async function pushMapFromBeatmap(beatmap, filename, packName, entries, audioCache, imageCache, convertedFromStandard) {
  
  const audioName = beatmap.audioFilename.trim();
  const audioEntry = findEntryByName(entries, audioName);
  if (!audioEntry) {
    console.warn('ไม่พบไฟล์เสียง', audioName, 'สำหรับ', filename);
    return null;
  }

  const audioKey = audioName.toLowerCase();
  if (!audioCache.has(audioKey)) {
    const blob = await audioEntry.async('blob');
    const url = URL.createObjectURL(blob);
    audioCache.set(audioKey, url);
  }

  
  let bgUrl = null;
  if (beatmap.backgroundFilename) {
    const bgKey = beatmap.backgroundFilename.trim().toLowerCase();
    if (imageCache.has(bgKey)) {
      bgUrl = imageCache.get(bgKey);
    } else {
      const bgEntry = findEntryByName(entries, beatmap.backgroundFilename.trim());
      if (bgEntry) {
        try {
          const blob = await bgEntry.async('blob');
          bgUrl = URL.createObjectURL(blob);
          imageCache.set(bgKey, bgUrl);
        } catch (e) {
          bgUrl = null;
        }
      }
    }
  }

  return {
    beatmap,
    audioUrl: audioCache.get(audioKey),
    backgroundUrl: bgUrl,
    filename,
    title: beatmap.metadata['Title'] || packName,
    titleUnicode: beatmap.metadata['TitleUnicode'] || beatmap.metadata['Title'] || packName,
    artist: beatmap.metadata['Artist'] || '',
    artistUnicode: beatmap.metadata['ArtistUnicode'] || beatmap.metadata['Artist'] || '',
    version: beatmap.metadata['Version'] || 'Normal',
    creator: beatmap.metadata['Creator'] || '',
    keyCount: beatmap.keyCount,
    noteCount: beatmap.hitObjects.length,
    lnCount: beatmap.hitObjects.filter(h => h.isLongNote).length,
    od: beatmap.difficulty['OverallDifficulty'] ?? 5,
    hp: beatmap.difficulty['HPDrainRate'] ?? 5,
    bpm: window.OsuParser.getMainBPM(beatmap),
    duration: beatmap.hitObjects.length > 0
      ? Math.max(...beatmap.hitObjects.map(h => h.endTime))
      : 0,
    convertedFromStandard: !!convertedFromStandard,
  };
}

function findEntryByName(entries, name) {
  const target = name.trim().toLowerCase();
  for (const entry of entries) {
    if (entry.dir) continue;
    const entryName = entry.name.trim().toLowerCase();
    
    if (entryName === target) return entry;
    const baseEntry = entryName.split('/').pop();
    const baseTarget = target.split('/').pop();
    if (baseEntry === baseTarget) return entry;
  }
  return null;
}

window.OszLoader = {
  loadOszFile,
  loadOszFromUrl,
  loadOszBlob,
};
