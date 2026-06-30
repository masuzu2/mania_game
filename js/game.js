


const DEFAULT_KEY_BINDINGS = {
  4:  ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
  5:  ['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'],
  6:  ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
  7:  ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'],
  8:  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  9:  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  10: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyV', 'KeyN', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
};


function codeToLabel(code) {
  if (!code) return '?';
  if (code === 'Space') return 'SPC';
  if (code === 'Semicolon') return ';';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return ({ ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→' })[code] || code.slice(5);
  return code.replace(/^(Key|Digit)/, '').slice(0, 3);
}

// Active bindings (อ้างอิงจาก window.KEY_BINDINGS_MAP ที่ set จาก app.js)
function getActiveKeyBindings(keyCount) {
  const map = window.KEY_BINDINGS_MAP;
  if (map && map[keyCount]) return map[keyCount];
  return DEFAULT_KEY_BINDINGS[keyCount] || DEFAULT_KEY_BINDINGS[4];
}

// compat: ไว้ใช้ภายใน game instance (set ตอน constructor)
let KEY_BINDINGS = DEFAULT_KEY_BINDINGS[4];
let KEY_LABELS = KEY_BINDINGS.map(codeToLabel);

// note ใช้เวลาเดินทางจากบนจอถึง hit line กี่ ms (ปรับได้ผ่าน scroll speed)
const BASE_TRAVEL_TIME_MS = 850; // ที่ speed = 1.0x

// หน้าต่างเวลาตัดสิน (ms) อิงคร่าวๆจาก osu!mania (OD กลางๆ)
const JUDGE_WINDOWS = {
  PERFECT: 30,
  GREAT: 60,
  GOOD: 100,
  BAD: 130,
  MISS: 160,
};

const JUDGE_SCORE = {
  PERFECT: 320,
  GREAT: 300,
  GOOD: 200,
  BAD: 50,
  MISS: 0,
};
// อันเก่า
// const JUDGE_SCORE = {
//   PERFECT: 320,
//   GREAT: 300,
//   GOOD: 200,
//   BAD: 100,
//   MISS: 0,
// };

// ช่วงผ่อนผัน (ms) ก่อนตัดสินว่าการปล่อยปุ่มเป็นการปล่อยจริง
// กัน keyup ที่กระตุก/หลุดสั้นๆ ทำให้โน้ตยาว (LN) หลุดก่อนเวลา
const RELEASE_GRACE_MS = 55;

// ===== Color skins (สกินสีของโน้ต/เลน) =====
// แต่ละสกินมีชุดสี เวียนใช้ตามจำนวนคีย์ (4K-10K) ด้วย modulo ทำให้ดูมีลายต่างกันชัดเจนทุกโหมด
const NOTE_COLOR_SKINS = [
  { id: 'classic',   name: 'คลาสสิก',      colors: ['#ff5d8f', '#ffd166', '#6ee7e0', '#a78bfa', '#ff8c42', '#5dd9ff'] },
  { id: 'cyberpunk', name: 'ไซเบอร์พังก์', colors: ['#00f0ff', '#ff00aa', '#fffc00', '#00ff85', '#ff5500', '#bd00ff'] },
  { id: 'sunset',    name: 'พระอาทิตย์ตก', colors: ['#ff6b6b', '#ffa45b', '#ffd93d', '#ff8fa3', '#ff4f81', '#ffb347'] },
  { id: 'ocean',     name: 'มหาสมุทร',     colors: ['#00c2d1', '#0090ff', '#7df9ff', '#3a86ff', '#00e5ff', '#80ffea'] },
  { id: 'forest',    name: 'ป่าเขียว',      colors: ['#2ecc71', '#27ae60', '#a3ff8c', '#00b894', '#55efc4', '#10ac84'] },
  { id: 'royal',     name: 'ม่วงราชวงศ์',   colors: ['#9b5de5', '#c77dff', '#7209b7', '#b388ff', '#5a189a', '#e0aaff'] },
  { id: 'fire',      name: 'เปลวเพลิง',     colors: ['#ff0044', '#ff4d00', '#ff7700', '#ffae00', '#ff1d58', '#ff6b35'] },
  { id: 'pastel',    name: 'พาสเทล',       colors: ['#ffd6e8', '#d6e8ff', '#e8ffd6', '#fff3d6', '#e8d6ff', '#d6fff0'] },
  { id: 'mono',      name: 'โมโนโครม',     colors: ['#f5f5f5', '#bdbdbd', '#9e9e9e', '#e0e0e0', '#cfd8dc', '#90a4ae'] },
  { id: 'rainbow',   name: 'เรนโบว์',       colors: ['#ff3b3b', '#ff9d3b', '#ffe33b', '#3bff6e', '#3bb4ff', '#a13bff'] },
  { id: 'sakura',    name: 'ซากุระ',        colors: ['#ffb7c5', '#ff85a1', '#ff4d79', '#ffc4d4', '#e8a0b4', '#ff6b95'] },
  { id: 'galaxy',    name: 'กาแล็กซี่',     colors: ['#1a1aff', '#8000ff', '#00e5ff', '#ff00ff', '#4400cc', '#00ccff'] },
];

function getColorSkinById(id) {
  return NOTE_COLOR_SKINS.find(s => s.id === id) || NOTE_COLOR_SKINS[0];
}

class ManiaGame {
    constructor(canvas, mapData, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    
    
    
    
    
    
    
    this._isMobile = (typeof window !== 'undefined' && window.matchMedia)
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    this._lowFx = this._isMobile; 
    
    
    this._maxParticles = this._isMobile ? 90 : 280;

    
    this.glowCanvas = canvas.parentElement ? canvas.parentElement.querySelector('#gameCanvasGlow') : null;
    this.glowCtx = this.glowCanvas ? this.glowCanvas.getContext('2d') : null;
    this.bloomEnabled = true;
    this.mapData = mapData;
    this.beatmap = mapData.beatmap;
    this.keyCount = this.beatmap.keyCount || 4;
    this.callbacks = callbacks;

    
    this._judgeWindows = { ...JUDGE_WINDOWS };

    
    this.keyBindings = getActiveKeyBindings(this.keyCount);
    this.keyLabels = this.keyBindings.map(codeToLabel);

    this.audio = new Audio(mapData.audioUrl);
    this.audio.preload = 'auto';
    this.audio.volume = 0.8; 

    
    
    
    
    
    
    
    
    
    
    
    
    
    this._audioOpToken = 0;
    this._onAudioSeeked = () => {
      if (this._resyncTargetMs == null) return;
      if (this._seekOpToken !== this._audioOpToken) return; 
      this._resyncGameClockFromAudio();
      this._resyncTargetMs = null;
    };
    this._onAudioPlaying = () => {
      if (this._playOpToken !== this._audioOpToken) return; 
      if (!this._audioStarted) return;
      
      
      
      
      this._resyncGameClockFromAudio();
    };
    this._resyncTargetMs = null; 
    this._seekOpToken = -1; 
    this._playOpToken = -1; 
    this.audio.addEventListener('seeked', this._onAudioSeeked);
    this.audio.addEventListener('playing', this._onAudioPlaying);

    this.hitSound = new window.HitSound();

    this.scrollSpeed = 1.0; 
    this.globalOffset = -25; 

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.judgeCounts = { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 };
    this.totalNotes = this.beatmap.hitObjects.length;

    this.started = false;
    this.finished = false;
    this.paused = false;

    this.rafId = null;
    this.startPerfTime = 0; 
    this._clockDriftDebtMs = 0; 
    this.leadInMs = 1500; 

    
    this.notes = this.beatmap.hitObjects.map((ho, idx) => ({
      id: idx,
      column: ho.column,
      time: ho.time,
      endTime: ho.endTime,
      isLongNote: ho.isLongNote,
      hit: false,      
      tailHit: false,  
      missed: false,
      holding: false,  
      judgement: null,
    }));

    
    
    this.activeNoteIndexByColumn = new Array(this.keyCount).fill(0);
    
    
    
    
    
    this._drawNoteIndexByColumn = new Array(this.keyCount).fill(0);
    
    
    this._pulseNoteIndexByColumn = new Array(this.keyCount).fill(0);
    this.notesByColumn = [];
    for (let c = 0; c < this.keyCount; c++) {
      this.notesByColumn.push(this.notes.filter(n => n.column === c));
    }

    
    
    this._firstNoteTime = this.totalNotes > 0 ? Math.min(...this.notes.map(n => n.time)) : Infinity;
    this._lastNoteEnd = this.totalNotes > 0 ? Math.max(...this.notes.map(n => n.endTime)) : 0;
    this._introSkipUsed = false;
    this._pendingSeekMs = null; 
    this._prevCanSkipIntro = false;
    this._skipReadyAt = null;   

    this.keyState = new Array(this.keyCount).fill(false);
    this.keyPressVisual = new Array(this.keyCount).fill(0); 
    this._releaseTimers = new Array(this.keyCount).fill(null); 

    
    this.showFPS = true;
    this.showTimingLines = true;
    this.showKeySpeed = true;
    this.showLaneSep = false;
    this.noteStyle = 'bar'; 
    this.noteColorSkin = 'classic'; 

    
    this._fpsLastTime = 0;
    this._fpsFrameCount = 0;
    this._fpsDisplay = 0;
    this._msDisplay = 0;

    
    this._keyPressLog = []; 
    this._keySpeed = 0; 

    
    
    this._particles = [];
    
    this._rings = [];
    
    this._beatPulse = 0; 
    this._lastBeatIndex = -1;
    this._beatFlashAlpha = 0; 
    
    this._notePulse = 0; 
    this._lastNotePassKey = -1; 
    
    this._shakeAmount = 0;
    this._shakeX = 0;
    this._shakeY = 0;
    
    this._comboFlashAlpha = 0;
    this._lastComboMilestone = 0;

    
    this.particlesEnabled = true;   
    this.beatPulseEnabled = true;   
    this.comboFlashEnabled = true;  
    this.shakeEnabled = true;       

    this._handleKeyDown = this._onKeyDown.bind(this);
    this._handleKeyUp = this._onKeyUp.bind(this);
    this._boundLoop = this._loop.bind(this);

    this._resize();
    
    
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
        this._resizeRaf = requestAnimationFrame(() => this._resize());
      });
      this._resizeObserver.observe(this.canvas.parentElement || this.canvas);
    } else {
      this._resizeHandler = () => this._resize();
      window.addEventListener('resize', this._resizeHandler);
    }
  }

  _resize() {
    
    
    
    const rawDpr = window.devicePixelRatio || 1;
    const dpr = this._isMobile ? Math.min(2, rawDpr) : rawDpr;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.glowCanvas && this.glowCtx) {
      this.glowCanvas.width = this.canvas.width;
      this.glowCanvas.height = this.canvas.height;
      this.glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.width = w;
    this.height = h;
    this.topMargin = 0;
    const bottomMargin = Math.min(130, Math.max(64, Math.round(this.height * 0.15)));
    this.hitLineY = Math.max(this.topMargin + 80, this.height - bottomMargin);

    
    const isMobilePortrait = window.matchMedia('(pointer: coarse) and (max-width: 600px)').matches;
    if (isMobilePortrait) {
      this.laneWidth = Math.round(w / this.keyCount);
      this.fieldWidth = w;
      this.fieldX = 0;
    } else {
      const laneByHeight = this.height * 0.112;
      const laneByWidth = this.width / this.keyCount;
      this.laneWidth = Math.max(52, Math.min(130, laneByHeight, laneByWidth));
      this.fieldWidth = this.laneWidth * this.keyCount;
      this.fieldX = (this.width - this.fieldWidth) / 2;
    }
  }

    _shadowBlur(ctx, value) {
    ctx.shadowBlur = this._lowFx ? 0 : value;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.hitSound.ensureContext();
    window.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('keyup', this._handleKeyUp);

    
    
    
    
    this.startPerfTime = performance.now() + this.leadInMs + this.globalOffset;
    this._audioStarted = false;
    this._skipReadyAt = performance.now() + 1500; 
    this.rafId = requestAnimationFrame(this._boundLoop);
  }

    stop(keepAudio = false) {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    window.removeEventListener('keydown', this._handleKeyDown);
    window.removeEventListener('keyup', this._handleKeyUp);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    if (!keepAudio) {
      this.audio.pause();
      this.audio.removeEventListener('seeked', this._onAudioSeeked);
      this.audio.removeEventListener('playing', this._onAudioPlaying);
    }
    for (let c = 0; c < this._releaseTimers.length; c++) {
      if (this._releaseTimers[c]) {
        clearTimeout(this._releaseTimers[c]);
        this._releaseTimers[c] = null;
      }
    }
  }

    stopAudio() {
    this.audio.pause();
    this.audio.removeEventListener('seeked', this._onAudioSeeked);
    this.audio.removeEventListener('playing', this._onAudioPlaying);
  }

  togglePause() {
    if (this.finished || !this.started) return this.paused;
    this.paused = !this.paused;
    if (this.paused) {
      this.audio.pause();
      
      this._pausedAtGameTime = this.getCurrentTimeMs();
      this._pauseStartPerfTime = performance.now();
    } else {
      
      
      this._audioOpToken++;
      if (this._audioStarted) this.audio.play().catch(() => {});
      
      const pausedDuration = performance.now() - this._pauseStartPerfTime;
      this.startPerfTime += pausedDuration;
    }
    return this.paused;
  }

  getCurrentTimeMs() {
    return (performance.now() - this.startPerfTime);
  }

    _resyncGameClockFromAudio() {
    if (!this._audioStarted) return;
    const audioMs = this.audio.currentTime * 1000;
    const targetStartPerfTime = performance.now() - audioMs - this.globalOffset;
    const drift = targetStartPerfTime - this.startPerfTime;

    const SNAP_NOW_MS = 40; 
    if (Math.abs(drift) <= SNAP_NOW_MS) {
      this.startPerfTime = targetStartPerfTime;
      return;
    }
    
    this._clockDriftDebtMs = (this._clockDriftDebtMs || 0) + drift;
  }

  _onKeyDown(e) {
    if (e.code === 'Enter') {
      
      if (this.paused || this.finished) return;
      e.preventDefault();
      
      if (window._isMultiplayerGame && window.mpVoteSkip) {
        window.mpVoteSkip();
      } else {
        this.trySkip();
      }
      return;
    }
    if (this.paused || this.finished) return;
    const col = this.keyBindings.indexOf(e.code);
    if (col === -1) return;
    if (this.keyState[col]) return; 
    this.keyState[col] = true;
    this.keyPressVisual[col] = 1;
    this._spawnKeyTapParticles(col);

    
    const now = performance.now();
    this._keyPressLog.push(now);
    
    this._keyPressLog = this._keyPressLog.filter(t => now - t <= 1000);
    this._keySpeed = this._keyPressLog.length;

    this._tryHitColumn(col);
  }

  _onKeyUp(e) {
    const col = this.keyBindings.indexOf(e.code);
    if (col === -1) return;
    this.keyState[col] = false;

    
    
    
    
    if (this._releaseTimers[col]) {
      clearTimeout(this._releaseTimers[col]);
    }
    this._releaseTimers[col] = setTimeout(() => {
      this._releaseTimers[col] = null;
      if (this.keyState[col]) return; 
      this._tryReleaseColumn(col);
    }, RELEASE_GRACE_MS);
  }

    _isNoteResolved(n) {
    if (n.missed) return true;
    if (!n.hit) return false;
    return n.isLongNote ? n.tailHit : true;
  }

    _isNoteDrawDone(n) {
    if (n.isLongNote) return n.tailHit && n.hit;
    return n.hit || n.missed;
  }

    _advanceActiveIndex(col) {
    const list = this.notesByColumn[col];
    let i = this.activeNoteIndexByColumn[col];
    while (i < list.length && this._isNoteResolved(list[i])) i++;
    this.activeNoteIndexByColumn[col] = i;
    return i;
  }

    _advanceDrawIndex(col) {
    const list = this.notesByColumn[col];
    let i = this._drawNoteIndexByColumn[col];
    while (i < list.length && this._isNoteDrawDone(list[i])) i++;
    this._drawNoteIndexByColumn[col] = i;
    return i;
  }

    _advancePulseIndex(col) {
    const list = this.notesByColumn[col];
    let i = this._pulseNoteIndexByColumn[col];
    while (i < list.length && (list[i].hit || list[i].missed)) i++;
    this._pulseNoteIndexByColumn[col] = i;
    return i;
  }

    _tryHitColumn(col) {
    const now = this.getCurrentTimeMs();
    const list = this.notesByColumn[col];
    const startIdx = this._advanceActiveIndex(col);

    
    
    let candidate = null;
    for (let i = startIdx; i < list.length; i++) {
      const n = list[i];
      if (n.hit || n.missed) continue;
      candidate = n;
      break;
    }
    if (!candidate) return;

    const diff = now - candidate.time;
    const absDiff = Math.abs(diff);

    if (absDiff > this._judgeWindows.BAD) {
      
      return;
    }

    const judgement = this._diffToJudgement(absDiff);
    candidate.hit = true;
    candidate.judgement = judgement;

    if (candidate.isLongNote) {
      candidate.holding = true;
      this.hitSound.playHoldStart();
    } else {
      this.hitSound.playTap();
    }

    this._applyJudgement(judgement, col, candidate);
    this._advanceActiveIndex(col); 
  }

  _tryReleaseColumn(col) {
    const now = this.getCurrentTimeMs();
    const list = this.notesByColumn[col];
    const startIdx = this._advanceActiveIndex(col);

    
    
    let holding = null;
    for (let i = startIdx; i < list.length; i++) {
      const n = list[i];
      if (n.isLongNote && n.holding && !n.tailHit) { holding = n; break; }
    }
    if (!holding) return;

    const diff = now - holding.endTime;
    const absDiff = Math.abs(diff);
    holding.holding = false;

    if (diff >= -this._judgeWindows.GOOD) {  
      
      const judgement = this._diffToJudgement(absDiff);
      holding.tailHit = true;
      this.hitSound.playHoldEnd();
      this._applyJudgement(judgement, col, holding, true);
    } else {
      
      holding.tailHit = true;
      holding.missed = true;
      this.hitSound.playMiss();
      this._applyJudgement('MISS', col, holding, true);
    }
    this._advanceActiveIndex(col); 
  }

  _diffToJudgement(absDiff) {
    if (absDiff <= this._judgeWindows.PERFECT) return 'PERFECT';
    if (absDiff <= this._judgeWindows.GREAT) return 'GREAT';
    if (absDiff <= this._judgeWindows.GOOD) return 'GOOD';
    return 'BAD';
  }

  _applyJudgement(judgement, col, note, isTail = false) {
    this.judgeCounts[judgement]++;
    this.score += JUDGE_SCORE[judgement];

    const judgeColors = {
      PERFECT: '#6ee7e0',
      GREAT: '#ffd166',
      GOOD: '#b9a6ff',
      BAD: '#ff9d6c',
      MISS: '#ff4d6d',
    };

    if (judgement === 'MISS') {
      this.combo = 0;
      this._lastComboMilestone = 0;
      
      this._triggerShake(isTail ? 8 : 14);
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      
      const particleCount = judgement === 'PERFECT' ? 14 : judgement === 'GREAT' ? 10 : judgement === 'GOOD' ? 6 : 4;
      this._spawnHitParticles(col, judgeColors[judgement], particleCount, judgement);

      
      const milestone = Math.floor(this.combo / 50) * 50;
      if (milestone > 0 && milestone !== this._lastComboMilestone) {
        this._lastComboMilestone = milestone;
        if (this.comboFlashEnabled) {
          this._comboFlashAlpha = 0.9; 
          if (this.callbacks.onComboFlash) this.callbacks.onComboFlash(milestone);
        }
      }
    }

    if (this.callbacks.onJudge) {
      this.callbacks.onJudge(judgement, col);
    }
    if (this.callbacks.onScoreUpdate) {
      this.callbacks.onScoreUpdate(this.getScoreSnapshot());
    }
  }

  getScoreSnapshot() {
    const totalJudged = Object.values(this.judgeCounts).reduce((a, b) => a + b, 0);
    const maxPossible = totalJudged * JUDGE_SCORE.PERFECT;
    const accuracy = maxPossible > 0 ? (this.score / maxPossible) * 100 : 100;
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      accuracy,
      judgeCounts: { ...this.judgeCounts },
      totalNotes: this.totalNotes,
      judgedNotes: totalJudged,
    };
  }

  _loop() {
    if (this.finished) return;

    if (!this.paused) {
      const perfNow = performance.now();

      
      if (this._fpsLastTime === 0) this._fpsLastTime = perfNow;
      const delta = perfNow - this._fpsLastTime;
      this._fpsLastTime = perfNow;
      this._msDisplay = Math.round(delta * 10) / 10;
      this._fpsFrameCount++;
      
      this._fpsDisplay = delta > 0 ? Math.round(1000 / delta) : this._fpsDisplay;

      
      
      if (this._clockDriftDebtMs) {
        const MAX_EASE_PER_FRAME_MS = 4; 
        const ease = Math.max(-MAX_EASE_PER_FRAME_MS, Math.min(MAX_EASE_PER_FRAME_MS, this._clockDriftDebtMs));
        this.startPerfTime += ease;
        this._clockDriftDebtMs -= ease;
        if (Math.abs(this._clockDriftDebtMs) < 0.01) this._clockDriftDebtMs = 0;
      }

      const now = this.getCurrentTimeMs();

      
      if (!this._audioStarted && now >= 0) {
        this._audioStarted = true;
        
        
        
        const startAudioMs = this._pendingSeekMs != null
          ? Math.max(0, this._pendingSeekMs / 1000)
          : Math.max(0, -this.globalOffset / 1000);
        this._pendingSeekMs = null;
        this.audio.currentTime = startAudioMs;
        this._audioOpToken++;
        this._playOpToken = this._audioOpToken;
        this.audio.play().catch(() => {});
      }

      this._updateMisses(now);
      this._render(now);

      
      const skipReady = this._skipReadyAt !== null && performance.now() >= this._skipReadyAt;
      const canSkipIntro = skipReady && this.totalNotes > 0 && !this._introSkipUsed
        && (this._firstNoteTime - now) > 1500;
      if (canSkipIntro !== this._prevCanSkipIntro) {
        this._prevCanSkipIntro = canSkipIntro;
        if (this.callbacks.onSkipState) this.callbacks.onSkipState({ canSkipIntro });
      }

      if (this.callbacks.onProgress) {
        const dur = (this.audio.duration || this.mapData.duration / 1000 || 1) * 1000;
        this.callbacks.onProgress(Math.max(0, now), dur);
      }

      
      const lastNoteEnd = this._lastNoteEnd;
      if (now > lastNoteEnd + 800 && (this.audio.ended || this._audioStarted && this.audio.paused === false && now > lastNoteEnd + 2000) ) {
        this._finish();
        return;
      }
      if (this._audioStarted && this.audio.ended && now > lastNoteEnd) {
        this._finish();
        return;
      }
    } else {
      
      
      this._render(this._pausedAtGameTime);
    }

    this.rafId = requestAnimationFrame(this._boundLoop);
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    
    
    if (this.callbacks.onFinish) {
      this.callbacks.onFinish(this.getScoreSnapshot());
    }
  }

    trySkip(force = false) {
    if (this.finished || this.paused) return;
    if (!force && (this._skipReadyAt === null || performance.now() < this._skipReadyAt)) return;
    const now = this.getCurrentTimeMs();
    if (this.totalNotes > 0 && !this._introSkipUsed
        && (force || (this._firstNoteTime - now) > 1500)) {
      this._introSkipUsed = true;
      this._skipToTime(Math.max(0, this._firstNoteTime - 1200));
    }
  }

    _skipToTime(ms) {
    
    
    this.startPerfTime = performance.now() - ms - this.globalOffset;
    
    
    this._audioOpToken++;
    if (this._audioStarted) {
      
      this._resyncTargetMs = ms;
      this._seekOpToken = this._audioOpToken;
      this.audio.currentTime = Math.max(0, ms / 1000);
    } else {
      
      
      
      
      
      this._pendingSeekMs = 0;
    }
  }


    _updateMisses(now) {
    for (let c = 0; c < this.keyCount; c++) {
      const list = this.notesByColumn[c];
      
      const startIdx = this._advanceActiveIndex(c);

      
      for (let i = startIdx; i < list.length; i++) {
        const n = list[i];
        if (n.hit || n.missed) continue;
        if (now - n.time > this._judgeWindows.MISS) {
          n.missed = true;
          n.judgement = 'MISS';
          this.hitSound.playMiss();
          this._applyJudgement('MISS', c, n);
        }
      }

      
      for (let i = startIdx; i < list.length; i++) {
        const n = list[i];
        if (!n.isLongNote || !n.hit || n.tailHit) continue;

        const timeSinceEnd = now - n.endTime;

        if (n.holding) {
          
          if (timeSinceEnd >= 0) {
            n.tailHit = true;
            n.holding = false;

            
            const judgement = timeSinceEnd < 50 ? 'PERFECT' : 'GREAT';
            
            this.hitSound.playHoldEnd();
            this._applyJudgement(judgement, c, n, true);
          }
        } else {
          
          if (timeSinceEnd > this._judgeWindows.MISS) {
            
            n.tailHit = true;
            n.missed = true;
            this.hitSound.playMiss();
            this._applyJudgement('MISS', c, n, true);
          }
        }
      }
      this._advanceActiveIndex(c); 
    }
  }

    _updateBeatPulse(now) {
    const timingPoints = this.beatmap && this.beatmap.timingPoints;
    if (!timingPoints || timingPoints.length === 0) { this._beatPulse = 0; return; }

    
    let active = null;
    for (let i = 0; i < timingPoints.length; i++) {
      const tp = timingPoints[i];
      if (tp.uninherited === false || tp.beatLength <= 0) continue;
      if (tp.time <= now) active = tp;
      else break;
    }
    if (!active) { this._beatPulse = 0; return; }

    const beatMs = active.beatLength;
    const elapsed = now - active.time;
    const beatIndex = Math.floor(elapsed / beatMs);
    const phase = (elapsed - beatIndex * beatMs) / beatMs; 

    
    this._beatPulse = Math.max(0, 1 - phase * 3.2);

    
    if (beatIndex !== this._lastBeatIndex) {
      this._lastBeatIndex = beatIndex;
      const isMeasure = (beatIndex % 4) === 0;
      this._beatFlashAlpha = isMeasure ? 0.22 : 0.10;
    }
    
    this._beatFlashAlpha = Math.max(0, this._beatFlashAlpha - 0.02);
  }

    _updateNotePulse(now) {
    
    this._notePulse = Math.max(0, this._notePulse - 0.08);

    
    const windowMs = 40;
    for (let c = 0; c < this.keyCount; c++) {
      const list = this.notesByColumn[c];
      const startIdx = this._advancePulseIndex(c);
      for (let i = startIdx; i < list.length; i++) {
        const n = list[i];
        if (n.hit || n.missed) continue;
        const dt = now - n.time; 
        if (dt >= -windowMs && dt <= windowMs) {
          
          const key = c * 1000000 + Math.round(n.time);
          if (key !== this._lastNotePassKey) {
            this._lastNotePassKey = key;
            this._notePulse = 1.0; 
          }
        }
      }
    }
  }

    _spawnKeyTapParticles(col) {
    if (!this.particlesEnabled) return;
    const x = this.fieldX + col * this.laneWidth + this.laneWidth / 2;
    const y = this.hitLineY;
    for (let i = 0; i < 4; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.5;
      const speed = 0.8 + Math.random() * 0.9;
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.7,
        decay: 0.05 + Math.random() * 0.02,
        size: 1.4 + Math.random() * 1.2,
        rotation: 0,
        spin: 0,
        shape: 'orb',
        color: 'rgba(255,255,255,0.9)',
      });
    }
    if (this._particles.length > this._maxParticles) this._particles.splice(0, this._particles.length - this._maxParticles);
  }

    _spawnHitParticles(col, color, count, judgement) {
    if (!this.particlesEnabled) return;
    const x = this.fieldX + col * this.laneWidth + this.laneWidth / 2;
    const y = this.hitLineY;
    const big = judgement === 'PERFECT' || judgement === 'GREAT';

    for (let i = 0; i < count; i++) {
      
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const speed = (big ? 2.6 : 1.7) + Math.random() * (big ? 2.6 : 1.6);
      const isSpark = i % 3 === 0; 
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: isSpark ? (0.028 + Math.random() * 0.02) : (0.018 + Math.random() * 0.016),
        size: isSpark ? (big ? 7 : 5) + Math.random() * 4 : (big ? 2.8 : 2) + Math.random() * 1.8,
        rotation: Math.atan2(Math.sin(angle), Math.cos(angle)),
        spin: (Math.random() - 0.5) * 0.3,
        shape: isSpark ? 'spark' : 'orb',
        color,
      });
    }

    
    this._rings.push({ x, y, r: 4, alpha: big ? 0.6 : 0.42, growth: big ? 6.5 : 4.6, color, width: 2.5 });
    this._rings.push({ x, y, r: 2, alpha: big ? 0.4 : 0.26, growth: big ? 4.2 : 3, color, width: 1.4, delay: 3 });

    
    if (this._particles.length > this._maxParticles) this._particles.splice(0, this._particles.length - this._maxParticles);
  }

  _updateParticles() {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; 
      p.vx *= 0.97;
      p.rotation += p.spin;
      p.life -= p.decay;
      if (p.life <= 0) {
        const last = this._particles.pop();
        if (i < this._particles.length) this._particles[i] = last;
      }
    }
    for (let i = this._rings.length - 1; i >= 0; i--) {
      const r = this._rings[i];
      if (r.delay > 0) { r.delay--; continue; } 
      r.r += r.growth;
      r.alpha -= 0.04;
      if (r.alpha <= 0) {
        const last = this._rings.pop();
        if (i < this._rings.length) this._rings[i] = last;
      }
    }
  }

  _drawParticles(ctx) {
    for (const p of this._particles) {
      const alpha = Math.max(0, p.life);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = p.color;

      if (p.shape === 'spark') {
        
        this._shadowBlur(ctx, 8);
        const len = p.size * (0.6 + alpha * 0.6);
        const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.5, p.color);
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(1, p.size * 0.18);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-len / 2, 0);
        ctx.lineTo(len / 2, 0);
        ctx.stroke();
      } else {
        
        this._shadowBlur(ctx, 7);
        const r = p.size * (0.7 + alpha * 0.5);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, p.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    for (const r of this._rings) {
      if (r.delay > 0) continue;
      ctx.globalAlpha = Math.max(0, r.alpha);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width || 2.5;
      ctx.shadowColor = r.color;
      this._shadowBlur(ctx, 10);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * 1.6, r.r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

    _triggerShake(amount) {
    if (!this.shakeEnabled) return;
    this._shakeAmount = Math.max(this._shakeAmount, amount);
  }

  _updateShake() {
    if (this._shakeAmount > 0.01) {
      this._shakeX = (Math.random() - 0.5) * this._shakeAmount;
      this._shakeY = (Math.random() - 0.5) * this._shakeAmount * 0.6;
      this._shakeAmount *= 0.82;
    } else {
      this._shakeX = 0;
      this._shakeY = 0;
      this._shakeAmount = 0;
    }
  }

  
  _render(now) {
    const ctx = this.ctx;

    
    if (this.beatPulseEnabled) this._updateNotePulse(now);
    else { this._notePulse = 0; }
    this._updateParticles();
    this._updateShake();
    this._updateComboFlash();

    
    if (this.callbacks.onBeatPulse) {
      this.callbacks.onBeatPulse(this._notePulse, 0);
    }

    ctx.clearRect(0, 0, this.width, this.height);

    
    ctx.save();
    ctx.translate(this._shakeX, this._shakeY);

    this._drawLanes(ctx);
    if (this.showTimingLines) this._drawTimingLines(ctx, now);
    this._drawHitLine(ctx);
    this._drawNotes(ctx, now);
    this._drawParticles(ctx);
    this._drawKeyOverlay(ctx);
    this._drawComboFlash(ctx); 

    ctx.restore();

    
    if (this.showFPS) this._drawFPSOverlay(ctx);
    if (this.showKeySpeed) this._drawKeySpeedOverlay(ctx);

    
    
    
    
    
    if (this.bloomEnabled && this.glowCtx && !this._lowFx) {
      const gctx = this.glowCtx;
      gctx.clearRect(0, 0, this.width, this.height);
      gctx.save();
      gctx.translate(this._shakeX, this._shakeY);
      this._drawHitLine(gctx);
      this._drawNotes(gctx, now);
      this._drawParticles(gctx);
      gctx.restore();
    } else if (this.glowCtx) {
      this.glowCtx.clearRect(0, 0, this.width, this.height);
    }

    
    for (let c = 0; c < this.keyCount; c++) {
      if (this.keyPressVisual[c] > 0) {
        this.keyPressVisual[c] = Math.max(0, this.keyPressVisual[c] - 0.06);
      }
    }
  }

  _updateComboFlash() {
    if (this._comboFlashAlpha > 0) this._comboFlashAlpha = Math.max(0, this._comboFlashAlpha - 0.018);
  }

    _drawComboFlash(ctx) {
    if (this._comboFlashAlpha <= 0.002) return;
    ctx.save();

    const a = this._comboFlashAlpha;
    const borderW = 3; 
    const glowSize = 10 + a * 14; 
    const color = `80, 180, 255`; 

    const x0 = this.fieldX;          
    const x1 = this.fieldX + this.fieldWidth; 
    const yTop = this.topMargin;
    const yBot = this.height;

    
    ctx.shadowColor = `rgba(${color}, ${a * 0.9})`;
    this._shadowBlur(ctx, glowSize);
    ctx.strokeStyle = `rgba(${color}, ${a})`;
    ctx.lineWidth = borderW;
    ctx.lineCap = 'round';

    
    ctx.beginPath();
    ctx.moveTo(x0, yTop);
    ctx.lineTo(x0, yBot);
    ctx.stroke();

    
    ctx.beginPath();
    ctx.moveTo(x1, yTop);
    ctx.lineTo(x1, yBot);
    ctx.stroke();

    
    this._shadowBlur(ctx, glowSize * 1.6);
    ctx.strokeStyle = `rgba(${color}, ${a * 0.25})`;
    ctx.lineWidth = borderW * 2;

    ctx.beginPath();
    ctx.moveTo(x0, yTop);
    ctx.lineTo(x0, yBot);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, yTop);
    ctx.lineTo(x1, yBot);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _drawLanes(ctx) {
    
    ctx.fillStyle = 'rgba(8, 8, 10, 0.6)';
    ctx.fillRect(this.fieldX, this.topMargin, this.fieldWidth, this.height - this.topMargin);

    
    if (this.showLaneSep) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= this.keyCount; c++) {
        const x = this.fieldX + c * this.laneWidth;
        ctx.beginPath();
        ctx.moveTo(x, this.topMargin);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }
    }

    
    
    const colColors = this._palette();
    for (let c = 0; c < this.keyCount; c++) {
      const x = this.fieldX + c * this.laneWidth;
      const pressAlpha = this.keyPressVisual[c] * 0.35;
      if (pressAlpha > 0.003) {
        const grad = ctx.createLinearGradient(0, this.hitLineY, 0, this.topMargin);
        grad.addColorStop(0, colColors[c % colColors.length] + 'aa');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = Math.min(1, pressAlpha);
        ctx.fillRect(x, this.topMargin, this.laneWidth, this.hitLineY - this.topMargin);
        ctx.globalAlpha = 1;
      }
    }
  }

  _palette() {
    return getColorSkinById(this.noteColorSkin).colors;
  }

  _drawHitLine(ctx) {
    
    
    const style = this.noteStyle || 'bar';
    if (style === 'circle' || style === 'arrow') return;

    const accent = this._palette()[0];
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.shadowColor = accent;
    this._shadowBlur(ctx, 12);
    ctx.beginPath();
    ctx.moveTo(this.fieldX, this.hitLineY);
    ctx.lineTo(this.fieldX + this.fieldWidth, this.hitLineY);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  _timeToY(noteTime, now) {
    const travel = BASE_TRAVEL_TIME_MS / this.scrollSpeed;
    const dt = noteTime - now;
    const progress = 1 - dt / travel; 
    return this.topMargin + progress * (this.hitLineY - this.topMargin);
  }

  _drawNotes(ctx, now) {
    const travel = BASE_TRAVEL_TIME_MS / this.scrollSpeed;
    const noteColors = this._palette();
    const noteHeight = 20;

    for (let c = 0; c < this.keyCount; c++) {
      const x = this.fieldX + c * this.laneWidth;
      const color = noteColors[c % noteColors.length];
      const list = this.notesByColumn[c];
      const startIdx = this._advanceDrawIndex(c);

      for (let li = startIdx; li < list.length; li++) {
        const n = list[li];
        if (n.isLongNote) {
          
          if (n.tailHit && n.hit) continue; 
          const headVisible = !n.hit || n.holding;
          const startY = this._timeToY(n.time, now);
          const endY = this._timeToY(n.endTime, now);

          
          
          const bodyTopY = n.holding ? Math.min(this.hitLineY, endY) : Math.min(startY, endY);
          
          
          const bodyBottomY = n.holding ? this.hitLineY : Math.max(startY, endY);
          const lnStyle = this.noteStyle || 'bar';

          
          if (Math.max(bodyTopY, this.topMargin - 50) < Math.min(bodyBottomY, this.height + 50)) {
            const bodyAlpha = n.holding ? 'cc' : '66';
            this._drawNoteBody(ctx, x, bodyTopY, bodyBottomY, this.laneWidth, color + bodyAlpha, c);
          }

          
          
          if (headVisible && !n.hit && startY > this.topMargin - 40 && startY < this.height + 40) {
            this._drawNoteBlock(ctx, x, startY, this.laneWidth, noteHeight, color, c);
          }
          
          if (lnStyle === 'bar' && !n.tailHit && endY > this.topMargin - 40 && endY < this.height + 40) {
            ctx.fillStyle = color;
            ctx.fillRect(x + 4, endY - 4, this.laneWidth - 8, 8);
          }
        } else {
          if (n.hit || n.missed) continue;
          const y = this._timeToY(n.time, now);
          if (y < this.topMargin - 40 || y > this.height + 40) continue;
          this._drawNoteBlock(ctx, x, y, this.laneWidth, noteHeight, color, c);
        }
      }
    }
  }

  _drawNoteBlock(ctx, x, centerY, w, h, color, column) {
    const style = this.noteStyle || 'bar';
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    this._shadowBlur(ctx, 8);

    if (style === 'circle') {
      // โหมดวงกลม
      const pad = 8;
      const r = (w - pad * 2) / 2;
      const cx = x + w / 2;
      ctx.beginPath();
      ctx.arc(cx, centerY, r, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

    } else if (style === 'arrow') {
      // โหมดลูกศร
      const arrowColors = this._palette();
      const arrowColor = arrowColors[column % arrowColors.length];
      const dirs = ['left', 'down', 'up', 'right'];
      const dir = dirs[column % 4];

      const cx = x + w / 2;
      const cy = centerY;
      const size = (w - 16) / 2 * 0.90 

      // draw arrow directly without function closure allocation
      ctx.beginPath();
      if (dir === 'right') {
        ctx.moveTo(cx + size, cy);
        ctx.lineTo(cx, cy - size);
        ctx.lineTo(cx, cy - size * 0.28);
        ctx.lineTo(cx - size, cy - size * 0.28);
        ctx.lineTo(cx - size, cy + size * 0.28);
        ctx.lineTo(cx, cy + size * 0.28);
        ctx.lineTo(cx, cy + size);
      } else if (dir === 'left') {
        ctx.moveTo(cx - size, cy);
        ctx.lineTo(cx, cy - size);
        ctx.lineTo(cx, cy - size * 0.28);
        ctx.lineTo(cx + size, cy - size * 0.28);
        ctx.lineTo(cx + size, cy + size * 0.28);
        ctx.lineTo(cx, cy + size * 0.28);
        ctx.lineTo(cx, cy + size);
      } else if (dir === 'up') {
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx + size, cy);
        ctx.lineTo(cx + size * 0.28, cy);
        ctx.lineTo(cx + size * 0.28, cy + size);
        ctx.lineTo(cx - size * 0.28, cy + size);
        ctx.lineTo(cx - size * 0.28, cy);
        ctx.lineTo(cx - size, cy);
      } else { 
        ctx.moveTo(cx, cy + size);
        ctx.lineTo(cx + size, cy);
        ctx.lineTo(cx + size * 0.28, cy);
        ctx.lineTo(cx + size * 0.28, cy - size);
        ctx.lineTo(cx - size * 0.28, cy - size);
        ctx.lineTo(cx - size * 0.28, cy);
        ctx.lineTo(cx - size, cy);
      }
      ctx.closePath();
      
      ctx.shadowColor = arrowColor;
      this._shadowBlur(ctx, 14);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = size * 0.38;
      ctx.stroke();

      ctx.fillStyle = arrowColor;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = size * 0.12;
      ctx.stroke();

    } else {
      
      const pad = 6;
      roundRect(ctx, x + pad, centerY - h / 2, w - pad * 2, h, 5);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

    _drawNoteBody(ctx, x, topY, bottomY, w, fillColor, column) {
    const style = this.noteStyle || 'bar';
    const h = Math.max(2, bottomY - topY);
    ctx.fillStyle = fillColor;

    if (style === 'circle') {
      
      
      
      
      const pad = 8;
      const bw = w - pad * 2;
      const r = bw / 2;
      const extendedTop = topY - r;
      const extendedBottom = bottomY + r;
      roundRect(ctx, x + pad, extendedTop, bw, extendedBottom - extendedTop, r);
      ctx.fill();

    } else if (style === 'arrow') {
      
      
      const pad = 8;
      const bw = w - pad * 2;
      const left = x + pad;
      const right = x + pad + bw;
      const maxEach = Math.max(1, h * 0.45); 
      const peak = Math.min(maxEach, bw * 0.55); 
      
      
      
      const receptorSize = bw / 2 * 1.05;
      
      const extBottom = bottomY + receptorSize;
      const tailPeak = receptorSize * 0.65; 

      ctx.beginPath();
      ctx.moveTo(left, topY + peak);
      ctx.lineTo((left + right) / 2, topY);
      ctx.lineTo(right, topY + peak);
      ctx.lineTo(right, extBottom - tailPeak);
      ctx.lineTo((left + right) / 2, extBottom);
      ctx.lineTo(left, extBottom - tailPeak);
      ctx.closePath();

      
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = bw * 0.16;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = bw * 0.05;
      ctx.stroke();
      ctx.restore();

    } else {
      
      ctx.fillRect(x + 8, topY, w - 16, h);
    }
  }

  _drawKeyOverlay(ctx) {
    const palette = this._palette();
    const style = this.noteStyle || 'bar';
    for (let c = 0; c < this.keyCount; c++) {
      const x = this.fieldX + c * this.laneWidth;
      const pressed = this.keyState[c];
      const laneColor = palette[c % palette.length];

      if (style === 'circle' || style === 'arrow') {
        
        
        const list = this.notesByColumn[c];
        const startIdx = this.activeNoteIndexByColumn[c];
        let holdingLN = false;
        for (let i = startIdx; i < list.length; i++) {
          const n = list[i];
          if (n.isLongNote && n.holding && !n.tailHit) { holdingLN = true; break; }
        }
        if (!holdingLN) {
          this._drawReceptor(ctx, x, this.hitLineY, this.laneWidth, c, style);
        }
      } else {
        if (pressed) {
          const grad = ctx.createLinearGradient(0, this.hitLineY, 0, this.height);
          grad.addColorStop(0, laneColor + '55');
          grad.addColorStop(1, laneColor + '11');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
        }
        ctx.fillRect(x, this.hitLineY, this.laneWidth, this.height - this.hitLineY);

        ctx.fillStyle = pressed ? '#fff' : 'rgba(255,255,255,0.55)';
        ctx.font = '600 20px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.keyLabels[c], x + this.laneWidth / 2, this.hitLineY + (this.height - this.hitLineY) / 2);
      }
    }
  }

    _drawReceptor(ctx, x, hitLineY, w, column, style) {
    const flash = this.keyPressVisual[column] || 0; 
    const cx = x + w / 2;
    const cy = hitLineY;
    const baseAlpha = 0.85;
    const outlineAlpha = Math.min(1, baseAlpha + flash * 0.15);
    const fillAlpha = flash; 

    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(255,255,255,${outlineAlpha})`;
    if (flash > 0.01) {
      ctx.shadowColor = '#fff';
      this._shadowBlur(ctx, 14 * flash);
    }

    if (style === 'circle') {
      const pad = 8;
      const r = (w - pad * 2) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (fillAlpha > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${fillAlpha})`;
        ctx.fill();
      }
      ctx.stroke();

    } else if (style === 'arrow') {
      const dirs = ['left', 'down', 'up', 'right'];
      const dir = dirs[column % 4];
      const size = (w - 16) / 2 * 0.90;

      ctx.beginPath();
      if (dir === 'right') {
        ctx.moveTo(cx + size, cy);
        ctx.lineTo(cx, cy - size);
        ctx.lineTo(cx, cy - size * 0.28);
        ctx.lineTo(cx - size, cy - size * 0.28);
        ctx.lineTo(cx - size, cy + size * 0.28);
        ctx.lineTo(cx, cy + size * 0.28);
        ctx.lineTo(cx, cy + size);
      } else if (dir === 'left') {
        ctx.moveTo(cx - size, cy);
        ctx.lineTo(cx, cy - size);
        ctx.lineTo(cx, cy - size * 0.28);
        ctx.lineTo(cx + size, cy - size * 0.28);
        ctx.lineTo(cx + size, cy + size * 0.28);
        ctx.lineTo(cx, cy + size * 0.28);
        ctx.lineTo(cx, cy + size);
      } else if (dir === 'up') {
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx + size, cy);
        ctx.lineTo(cx + size * 0.28, cy);
        ctx.lineTo(cx + size * 0.28, cy + size);
        ctx.lineTo(cx - size * 0.28, cy + size);
        ctx.lineTo(cx - size * 0.28, cy);
        ctx.lineTo(cx - size, cy);
      } else { 
        ctx.moveTo(cx, cy + size);
        ctx.lineTo(cx + size, cy);
        ctx.lineTo(cx + size * 0.28, cy);
        ctx.lineTo(cx + size * 0.28, cy - size);
        ctx.lineTo(cx - size * 0.28, cy - size);
        ctx.lineTo(cx - size * 0.28, cy);
        ctx.lineTo(cx - size, cy);
      }
      ctx.closePath();
      if (fillAlpha > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${fillAlpha})`;
        ctx.fill();
      }
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _drawTimingLines(ctx, now) {
    const timingPoints = this.beatmap && this.beatmap.timingPoints;
    if (!timingPoints || timingPoints.length === 0) return;

    const travel = BASE_TRAVEL_TIME_MS / this.scrollSpeed;
    const fieldTop = this.topMargin;
    const fieldBottom = this.hitLineY;

    ctx.save();

    for (let tp = 0; tp < timingPoints.length; tp++) {
      const point = timingPoints[tp];
      if (point.uninherited === false || point.beatLength <= 0) continue;

      const beatMs = point.beatLength;
      const measureMs = beatMs * 4;

      const visibleStart = now - travel * 0.05;
      const visibleEnd = now + travel * 1.05;

      const tpStart = point.time;
      const tpEnd = tp + 1 < timingPoints.length ? timingPoints[tp + 1].time : visibleEnd + 10000;

      const start = Math.max(visibleStart, tpStart);
      const end = Math.min(visibleEnd, tpEnd);
      if (start > end) continue;

      const firstBeatOffset = Math.ceil((start - tpStart) / beatMs);
      let beatIndex = firstBeatOffset;

      while (true) {
        const beatTime = tpStart + beatIndex * beatMs;
        if (beatTime > end) break;
        const y = this._timeToY(beatTime, now);
        if (y >= fieldTop - 2 && y <= fieldBottom + 2) {
          
          const isMeasure = (beatIndex % 4) === 0;
          if (isMeasure) {
            ctx.strokeStyle = 'rgba(255,255,255,0.30)';
            ctx.lineWidth = 1.5;
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.lineWidth = 1;
          }
          ctx.beginPath();
          ctx.moveTo(this.fieldX, y);
          ctx.lineTo(this.fieldX + this.fieldWidth, y);
          ctx.stroke();
        }
        beatIndex++;
      }
    }
    ctx.restore();
  }

  _drawFPSOverlay(ctx) {
    
    const panelW = 110;
    const panelH = 50;
    const x = this.width - panelW - 18;
    const y = this.height - panelH - 18;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const fps = this._fpsDisplay;
    const fpsColor = fps >= 55 ? '#6ee7e0' : fps >= 30 ? '#ffd166' : '#ff5d8f';

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, x - 6, y - 6, panelW, panelH, 6);
    ctx.fill();

    ctx.font = 'bold 18px "Space Grotesk", monospace';
    ctx.fillStyle = fpsColor;
    ctx.fillText(`${fps} FPS`, x, y);

    ctx.font = '13px "Space Grotesk", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`${this._msDisplay} ms/frame`, x, y + 24);

    ctx.restore();
  }

  _drawKeySpeedOverlay(ctx) {
    
    const nowPerf = performance.now();
    this._keyPressLog = (this._keyPressLog || []).filter(t => nowPerf - t <= 1000);
    this._keySpeed = this._keyPressLog.length;

    const kps = this._keySpeed;
    const panelW = 110;
    const panelH = 70;
    const x = this.width - panelW - 18;
    const y = 18;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, x - 6, y - 6, panelW, panelH, 6);
    ctx.fill();

    ctx.font = 'bold 18px "Space Grotesk", monospace';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`${kps} KPS`, x, y);

    
    const barW = panelW - 20;
    const barH = 8;
    const barY = y + 28;
    const maxKps = 20;
    const fill = Math.min(1, kps / maxKps);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x, barY, barW, barH, 3);
    ctx.fill();

    const barColor = kps >= 15 ? '#ff5d8f' : kps >= 8 ? '#ffd166' : '#6ee7e0';
    ctx.fillStyle = barColor;
    roundRect(ctx, x, barY, Math.max(0, barW * fill), barH, 3);
    ctx.fill();

    ctx.font = '12px "Space Grotesk", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('keys / sec', x, barY + 14);

    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

window.ManiaGame = ManiaGame;
window.GAME_CONSTANTS = { DEFAULT_KEY_BINDINGS, codeToLabel, JUDGE_WINDOWS, JUDGE_SCORE };
window.DEFAULT_KEY_BINDINGS = DEFAULT_KEY_BINDINGS;
window.codeToLabel = codeToLabel;
window.NOTE_COLOR_SKINS = NOTE_COLOR_SKINS;
window.getColorSkinById = getColorSkinById;