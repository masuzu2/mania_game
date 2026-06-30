
class OsuBeatmap {
  constructor() {
    this.general = {};
    this.metadata = {};
    this.difficulty = {};
    this.timingPoints = [];
    this.hitObjects = [];
    this.keyCount = 4;
    this.audioFilename = '';
    this.backgroundFilename = null;
  }
}

/**
 * แปลง section header เช่น [General] ให้เป็นชื่อ section
 */
function parseSectionName(line) {
  const m = line.match(/^\[(.+)\]$/);
  return m ? m[1] : null;
}

/**
 * แตก key:value (ใช้กับ General/Metadata/Difficulty/Editor)
 */
function parseKeyValue(line) {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  return [key, value];
}

/**
 * Parse เนื้อหาไฟล์ .osu ทั้งไฟล์ (string) -> OsuBeatmap
 */
function parseOsuFile(text) {
  const beatmap = new OsuBeatmap();
  // รองรับทั้ง \r\n และ \n
  const lines = text.split(/\r?\n/);

  let currentSection = null;

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith('//')) continue;
    const section = parseSectionName(line);
    if (section) {
      currentSection = section;
      continue;
    }

    switch (currentSection) {
      case 'General': {
        const kv = parseKeyValue(line);
        if (kv) {
          beatmap.general[kv[0]] = kv[1];
          if (kv[0] === 'AudioFilename') {
            beatmap.audioFilename = kv[1].trim();
          }
        }
        break;
      }
      case 'Metadata': {
        const kv = parseKeyValue(line);
        if (kv) beatmap.metadata[kv[0]] = kv[1];
        break;
      }
      case 'Difficulty': {
        const kv = parseKeyValue(line);
        if (kv) {
          beatmap.difficulty[kv[0]] = parseFloat(kv[1]);
          if (kv[0] === 'CircleSize') {
            beatmap.keyCount = Math.round(parseFloat(kv[1]));
          }
        }
        break;
      }
      case 'Events': {
        
        const parts = splitCsvLine(line);
        if (parts.length >= 3 && (parts[0] === '0' || parts[0] === 'Video')) {
          let fname = parts[2].replace(/^"|"$/g, '');
          if (!beatmap.backgroundFilename) beatmap.backgroundFilename = fname;
        }
        break;
      }
      case 'TimingPoints': {
        const tp = parseTimingPointLine(line);
        if (tp) beatmap.timingPoints.push(tp);
        break;
      }
      case 'HitObjects': {
        const ho = parseHitObjectLine(line, beatmap.keyCount);
        if (ho) beatmap.hitObjects.push(ho);
        break;
      }
      default:
        break;
    }
  }

  
  beatmap.hitObjects.sort((a, b) => a.time - b.time);
  beatmap.timingPoints.sort((a, b) => a.time - b.time);

  return beatmap;
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      current += c;
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

/**
 * Timing point: time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
 */
function parseTimingPointLine(line) {
  const parts = line.split(',');
  if (parts.length < 2) return null;
  const time = parseFloat(parts[0]);
  const beatLength = parseFloat(parts[1]);
  const uninherited = parts.length >= 7 ? parts[6] === '1' : true;
  return {
    time,
    beatLength,
    uninherited,
    // ถ้า beatLength บวก = timing point หลัก (กำหนด BPM)
    // ถ้า beatLength ลบ = inherited point (กำหนด SV เป็น -100/beatLength)
  };
}

/**
 * แปลง x position (0-512) เป็น column index สำหรับ mania
 * osu!mania คำนวณ column จาก: column = floor(x * keyCount / 512)
 */
function xToColumn(x, keyCount) {
  let col = Math.floor((x * keyCount) / 512);
  if (col < 0) col = 0;
  if (col > keyCount - 1) col = keyCount - 1;
  return col;
}

/**
 * Hit object line:
 * x,y,time,type,hitSound,objectParams...,hitSample
 *
 * สำหรับ mania:
 * - type bit 0 (1) = note ปกติ (circle)
 * - type bit 7 (128) = long note (hold) -> extra param แรกคือ endTime (รูปแบบ "endTime:hitSample")
 */
function parseHitObjectLine(line, keyCount) {
  const parts = line.split(',');
  if (parts.length < 4) return null;

  const x = parseFloat(parts[0]);
  const time = parseFloat(parts[2]);
  const type = parseInt(parts[3], 10);
  const column = xToColumn(x, keyCount);

  const isLongNote = (type & 128) !== 0;

  let endTime = time;
  if (isLongNote && parts.length >= 6) {
    
    const extra = parts[5];
    const endTimeStr = extra.split(':')[0];
    endTime = parseFloat(endTimeStr);
  }

  return {
    column,
    time,
    endTime: isLongNote ? endTime : time,
    isLongNote,
  };
}

function getMainBPM(beatmap) {
  const main = beatmap.timingPoints.find(tp => tp.uninherited && tp.beatLength > 0);
  if (!main) return 120;
  return 60000 / main.beatLength;
}


window.OsuParser = {
  parseOsuFile,
  getMainBPM,
};
