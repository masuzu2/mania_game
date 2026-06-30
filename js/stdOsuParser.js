(function (global) {
  'use strict';

  const Core = global.StdToManiaCore;
  const { Vector2, PathType, PathPoint, SliderPath, roundToEven } = Core;

  const MAX_COORDINATE_VALUE = 131072;

  function parseIntSafe(input, limit) {
    limit = limit === undefined ? 2147483647 : limit;
    let v = parseInt(input, 10);
    if (Number.isNaN(v)) v = 0;
    if (v < -limit) v = -limit;
    if (v > limit) v = limit;
    return v;
  }
  function parseFloatSafe(input, limit, allowNaN) {
    limit = limit === undefined ? 2147483647 : limit;
    let v = parseFloat(input);
    if (Number.isNaN(v)) return allowNaN ? NaN : 0;
    if (v < -limit) v = -limit;
    if (v > limit) v = limit;
    return v;
  }

  

  const HitType = {
    Normal: 1, Slider: 2, NewCombo: 4, Spinner: 8,
    ComboSkip1: 16, ComboSkip2: 32, ComboSkip3: 64, ComboOffset: 112, Hold: 128,
  };
  const HitSound = { None: 0, Normal: 1, Whistle: 2, Finish: 4, Clap: 8 };
  const EffectType = { None: 0, Kiai: 1, OmitFirstBarLine: 8 };

  

  class TimingPoint {
    constructor() {
      this.pointType = 'timing';
      this._beatLength = 1000;
      this.timeSignature = 4;
      this.startTime = 0;
    }
    get beatLength() { return Core.clamp(this._beatLength, 6, 60000); }
    set beatLength(v) { this._beatLength = v; }
  }
  class DifficultyPoint {
    constructor() {
      this.pointType = 'difficulty';
      this.startTime = 0;
      this.bpmMultiplier = 1;
      this._sliderVelocity = 1;
      this.generateTicks = true;
      this.isLegacy = false;
    }
    get sliderVelocity() { return Core.clamp(this._sliderVelocity, 0.1, 10); }
    set sliderVelocity(v) { this._sliderVelocity = v; }
    isRedundant(existing) {
      return existing instanceof DifficultyPoint &&
        existing.sliderVelocity === this.sliderVelocity &&
        existing.generateTicks === this.generateTicks;
    }
  }
  class EffectPoint {
    constructor() {
      this.pointType = 'effect';
      this.startTime = 0;
      this.kiai = false;
      this.omitFirstBarLine = false;
    }
    isRedundant(existing) {
      return !this.omitFirstBarLine &&
        existing instanceof EffectPoint &&
        this.kiai === existing.kiai &&
        this.omitFirstBarLine === existing.omitFirstBarLine;
    }
  }
  class SamplePoint {
    constructor() {
      this.pointType = 'sample';
      this.startTime = 0;
      this.sampleSet = 'Normal';
      this.customIndex = 0;
      this.volume = 100;
    }
    isRedundant(existing) {
      return existing instanceof SamplePoint &&
        this.volume === existing.volume &&
        this.customIndex === existing.customIndex &&
        this.sampleSet === existing.sampleSet;
    }
  }

  function findControlPointIndex(arr, time) {
    if (!arr.length) return -1;
    if (time < arr[0].startTime) return -1;
    if (time >= arr[arr.length - 1].startTime) return arr.length - 1;
    let l = 0, r = arr.length - 2;
    while (l < r) {
      const mid = l + ((r - l + 1) >> 1);
      if (arr[mid].startTime <= time) l = mid;
      else r = mid - 1;
    }
    return l;
  }
  function findControlPoint(arr, time) {
    const i = findControlPointIndex(arr, time);
    return i === -1 ? null : arr[i];
  }

  class ControlPointInfo {
    constructor() {
      this.timingPoints = [];
      this.difficultyPoints = [];
      this.effectPoints = [];
      this.samplePoints = [];
    }
    timingPointAt(time) {
      return findControlPoint(this.timingPoints, time) || this.timingPoints[0] || new TimingPoint();
    }
    effectPointAt(time) {
      return findControlPoint(this.effectPoints, time) || new EffectPoint();
    }
    difficultyPointAt(time) {
      return findControlPoint(this.difficultyPoints, time) || new DifficultyPoint();
    }
    samplePointAt(time) {
      return findControlPoint(this.samplePoints, time) || new SamplePoint();
    }
    _listFor(point) {
      switch (point.pointType) {
        case 'timing': return this.timingPoints;
        case 'difficulty': return this.difficultyPoints;
        case 'effect': return this.effectPoints;
        case 'sample': return this.samplePoints;
      }
      throw new Error('Unknown control point type');
    }
    add(point, time) {
      point.startTime = time;
      const list = this._listFor(point);
      let existing = null;
      switch (point.pointType) {
        case 'timing': existing = findControlPoint(this.timingPoints, time); break;
        case 'difficulty': existing = this.difficultyPointAt(time); break;
        case 'effect': existing = this.effectPointAt(time); break;
        case 'sample': existing = findControlPoint(this.samplePoints, time); break;
      }
      if (point.isRedundant && point.isRedundant(existing)) return false;
      const idx = findControlPointIndex(list, time);
      list.splice(idx + 1, 0, point);
      return true;
    }
  }

  

  class HitSample {
    constructor(hitSound, sampleSet) {
      this.hitSound = hitSound || HitSound.None;
      this.sampleSet = sampleSet || 'Normal';
    }
    clone() { return new HitSample(this.hitSound, this.sampleSet); }
  }

  class HitObjectBase {
    constructor() {
      this.startTime = 0;
      this.hitType = HitType.Normal;
      this.hitSound = HitSound.None;
      this.samples = [];
      this.startPosition = new Vector2(0, 0);
      this.kiai = false;
    }
    get startX() { return this.startPosition.floatX; }
    get startY() { return this.startPosition.floatY; }
  }

  class HittableObject extends HitObjectBase {
    constructor() {
      super();
      this.isNewCombo = false;
      this.comboOffset = 0;
    }
  }

  class SlidableObject extends HitObjectBase {
    constructor() {
      super();
      this.repeats = 0;
      this.velocity = 1;
      this.path = new SliderPath();
      this.isNewCombo = false;
      this.comboOffset = 0;
      this.nodeSamples = [];
    }
    get spans() { return this.repeats + 1; }
    get distance() { return this.path.distance; }
    get spanDuration() { return this.distance / this.velocity; }
    get duration() { return this.spans * this.spanDuration; }
    get endTime() { return this.startTime + this.duration; }
    applyVelocity(controlPoints, difficulty) {
      const timingPoint = controlPoints.timingPointAt(this.startTime);
      const difficultyPoint = controlPoints.difficultyPointAt(this.startTime);
      const BASE_SCORING_DISTANCE = 100;
      const scoringDistance = BASE_SCORING_DISTANCE * difficulty.sliderMultiplier * difficultyPoint.sliderVelocity;
      this.velocity = scoringDistance / timingPoint.beatLength;
    }
  }

  class SpinnableObject extends HitObjectBase {
    constructor() {
      super();
      this.endTime = 0;
      this.isNewCombo = false;
      this.comboOffset = 0;
    }
    get duration() { return this.endTime - this.startTime; }
  }

  

  function convertPathType(typeChar) {
    switch (typeChar) {
      case 'B': return PathType.Bezier;
      case 'L': return PathType.Linear;
      case 'P': return PathType.PerfectCurve;
      case 'C':
      default: return PathType.Catmull;
    }
  }

  function readPoint(pointStr, offset) {
    const coords = pointStr.split(':').map((v) => Math.trunc(parseFloatSafe(v, MAX_COORDINATE_VALUE)));
    const pos = new Vector2(coords[0], coords[1]).fsubtract(offset);
    return new PathPoint(pos);
  }

  function isLinear(p) {
    const yx = (p[1].position.y - p[0].position.y) * (p[2].position.x - p[0].position.x);
    const xy = (p[1].position.x - p[0].position.x) * (p[2].position.y - p[0].position.y);
    return Math.abs(yx - xy) < 0.001;
  }

  function convertPathString(pathString, offset) {
    const pathSplit = pathString.split('|').map((p) => p.trim());
    const controlPoints = [];
    let startIndex = 0;
    let endIndex = 0;
    let isFirst = true;

    function convertPoints(points, endPoint, isFirstSeg) {
      const out = [];
      const readOffset = isFirstSeg ? 1 : 0;
      const vertices = [];
      if (readOffset === 1) vertices[0] = new PathPoint();
      for (let i = 1; i < points.length; ++i) {
        vertices[readOffset + i - 1] = readPoint(points[i], offset);
      }
      if (endPoint !== null) {
        vertices[vertices.length - 1] = readPoint(endPoint, offset);
      }
      let type = convertPathType(points[0]);
      if (type === PathType.PerfectCurve) {
        if (vertices.length !== 3) type = PathType.Bezier;
        else if (isLinear(vertices)) type = PathType.Linear;
      }
      vertices[0].type = type;

      let sIdx = 0, eIdx = 0;
      const endPointLength = endPoint !== null ? 1 : 0;
      while (++eIdx < vertices.length - endPointLength) {
        if (!vertices[eIdx].position.equals(vertices[eIdx - 1].position)) continue;
        if (eIdx === vertices.length - endPointLength - 1) continue;
        vertices[eIdx - 1].type = type;
        out.push(vertices.slice(sIdx, eIdx));
        sIdx = eIdx + 1;
      }
      out.push(vertices.slice(sIdx));
      return out;
    }

    while (++endIndex < pathSplit.length) {
      if (pathSplit[endIndex].length > 1) continue;
      const points = pathSplit.slice(startIndex, endIndex);
      const endPoint = endIndex < pathSplit.length - 1 ? pathSplit[endIndex + 1] : null;
      const segs = convertPoints(points, endPoint, isFirst);
      for (const seg of segs) controlPoints.push(...seg);
      startIndex = endIndex;
      isFirst = false;
    }
    if (endIndex > startIndex) {
      const points = pathSplit.slice(startIndex, endIndex);
      const segs = convertPoints(points, null, isFirst);
      for (const seg of segs) controlPoints.push(...seg);
    }
    return controlPoints;
  }

  

  class StdBeatmap {
    constructor() {
      this.general = {};
      this.metadata = {};
      this.difficulty = {
        circleSize: 5, drainRate: 5, overallDifficulty: 5, approachRate: null,
        sliderMultiplier: 1, sliderTickRate: 1,
      };
      this.controlPoints = new ControlPointInfo();
      this.hitObjects = [];
      this.mode = 0;
      this.totalBreakTime = 0;
    }
    getApproachRate() {
      return this.difficulty.approachRate == null ? this.difficulty.overallDifficulty : this.difficulty.approachRate;
    }
  }

  

  function readCustomSampleBanks(hitSampleStr, hitSound) {
    
    
    return new HitSample(hitSound, 'Normal');
  }

  function convertSoundType(hitSound) {
    if (hitSound === HitSound.None) {
      return [new HitSample(HitSound.Normal)];
    }
    const samples = [new HitSample(HitSound.Normal)];
    if (hitSound & HitSound.Finish) samples.push(new HitSample(HitSound.Finish));
    if (hitSound & HitSound.Whistle) samples.push(new HitSample(HitSound.Whistle));
    if (hitSound & HitSound.Clap) samples.push(new HitSample(HitSound.Clap));
    return samples;
  }

  function parseHitObjectLine(line, beatmap, comboState) {
    const data = line.split(',').map((v) => v.trim());
    const hitType = parseIntSafe(data[3]);

    let hitObject;
    if (hitType & HitType.Spinner) hitObject = new SpinnableObject();
    else if (hitType & HitType.Slider) hitObject = new SlidableObject();
    else hitObject = new HittableObject();

    hitObject.startPosition = new Vector2(
      Math.trunc(parseFloatSafe(data[0], MAX_COORDINATE_VALUE)),
      Math.trunc(parseFloatSafe(data[1], MAX_COORDINATE_VALUE))
    );
    hitObject.startTime = parseFloatSafe(data[2]);
    hitObject.hitType = hitType;
    hitObject.hitSound = parseIntSafe(data[4]);

    const extras = data.slice(5);

    if (hitType & HitType.Slider) {
      const pathString = extras[0];
      const offset = hitObject.startPosition;
      const repeats = parseIntSafe(extras[1]);
      hitObject.repeats = Math.max(0, repeats - 1);
      const controlPoints = convertPathString(pathString, offset);
      const curveType = controlPoints[0].type;
      let expectedDistance = 0;
      if (extras.length > 2 && extras[2] !== '') {
        expectedDistance = Math.max(0, parseFloatSafe(extras[2], MAX_COORDINATE_VALUE));
      }
      hitObject.path = new SliderPath(curveType, controlPoints, expectedDistance);
      hitObject.samples = convertSoundType(hitObject.hitSound);
      // node samples (per-repeat hitsounds) — only need hitSound bits, used for
      // generateHoldAndNormalNotes' "ignoreHead" hitsound check
      const nodes = hitObject.repeats + 2;
      const nodeSoundTypes = new Array(nodes).fill(hitObject.hitSound);
      if (extras.length > 3 && extras[3].length > 0) {
        const adds = extras[3].split('|');
        for (let i = 0; i < nodes && i < adds.length; i++) {
          nodeSoundTypes[i] = parseInt(adds[i], 10) || HitSound.None;
        }
      }
      hitObject.nodeSamples = nodeSoundTypes.map((s) => convertSoundType(s));
    } else if (hitType & HitType.Spinner) {
      hitObject.endTime = parseFloatSafe(extras[0]);
      hitObject.samples = convertSoundType(hitObject.hitSound);
    } else {
      hitObject.samples = convertSoundType(hitObject.hitSound);
    }

    
    
    return hitObject;
  }

  

  function parseStdOsuFile(text) {
    const beatmap = new StdBeatmap();
    const lines = text.split(/\r?\n/);
    let section = null;

    
    let pendingTime = 0;
    let pendingPoints = [];
    let pendingTypes = [];
    function flushPending() {
      let i = pendingPoints.length;
      while (--i >= 0) {
        if (pendingTypes.includes(pendingPoints[i].pointType)) continue;
        pendingTypes.push(pendingPoints[i].pointType);
        beatmap.controlPoints.add(pendingPoints[i], pendingTime);
      }
      pendingPoints = [];
      pendingTypes = [];
    }
    function addControlPoint(point, time, timingChange) {
      if (time !== pendingTime) flushPending();
      if (timingChange) pendingPoints.unshift(point);
      else pendingPoints.push(point);
      pendingTime = time;
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;
      const sectionMatch = line.match(/^\[(.+)\]$/);
      if (sectionMatch) { section = sectionMatch[1]; continue; }

      switch (section) {
        case 'General': {
          const idx = line.indexOf(':');
          if (idx === -1) break;
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          beatmap.general[key] = value;
          if (key === 'Mode') beatmap.mode = parseIntSafe(value);
          if (key === 'AudioFilename') beatmap.audioFilename = value;
          break;
        }
        case 'Metadata': {
          const idx = line.indexOf(':');
          if (idx === -1) break;
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          beatmap.metadata[key] = value;
          break;
        }
        case 'Difficulty': {
          const idx = line.indexOf(':');
          if (idx === -1) break;
          const key = line.slice(0, idx).trim();
          const value = parseFloat(line.slice(idx + 1).trim());
          switch (key) {
            case 'CircleSize': beatmap.difficulty.circleSize = value; break;
            case 'HPDrainRate': beatmap.difficulty.drainRate = value; break;
            case 'OverallDifficulty': beatmap.difficulty.overallDifficulty = value; break;
            case 'ApproachRate': beatmap.difficulty.approachRate = value; break;
            case 'SliderMultiplier': beatmap.difficulty.sliderMultiplier = value; break;
            case 'SliderTickRate': beatmap.difficulty.sliderTickRate = value; break;
          }
          break;
        }
        case 'Events': {
          const parts = line.split(',');
          if (parts.length >= 3 && (parts[0] === '0' || parts[0] === 'Video' || parts[0] === '1')) {
            let fname = parts[2].replace(/^"|"$/g, '');
            if (!beatmap.backgroundFilename && parts[0] === '0') beatmap.backgroundFilename = fname;
          }
          
          if (parts[0] === '2') {
            const bs = parseFloatSafe(parts[1]);
            const be = parseFloatSafe(parts[2]);
            beatmap.totalBreakTime += Math.max(0, be - bs);
          }
          break;
        }
        case 'TimingPoints': {
          const data = line.split(',');
          if (data.length < 2) break;
          let timeSignature = 4, sampleSet = 'None', customIndex = 0, volume = 100, timingChange = true, effects = EffectType.None;
          if (data.length > 2) {
            if (data.length >= 8) effects = parseIntSafe(data[7]);
            if (data.length >= 7) timingChange = data[6] === '1';
            if (data.length >= 6) volume = parseIntSafe(data[5]);
            if (data.length >= 5) customIndex = parseIntSafe(data[4]);
            if (data.length >= 4) sampleSet = data[3];
            if (data.length >= 3) timeSignature = parseIntSafe(data[2]);
          }
          const startTime = parseFloatSafe(data[0]);
          const beatLength = parseFloatSafe(data[1], 2147483647, true);
          let bpmMultiplier = 1, speedMultiplier = 1;
          if (beatLength < 0) {
            speedMultiplier = 100 / -beatLength;
            bpmMultiplier = Math.min(Math.fround(-beatLength), 10000);
            bpmMultiplier = Math.max(10, bpmMultiplier) / 100;
          }
          if (timingChange) {
            const tp = new TimingPoint();
            tp.beatLength = beatLength;
            tp.timeSignature = timeSignature;
            addControlPoint(tp, startTime, true);
          }
          const dp = new DifficultyPoint();
          dp.bpmMultiplier = bpmMultiplier;
          dp.sliderVelocity = speedMultiplier;
          dp.generateTicks = !Number.isNaN(beatLength);
          dp.isLegacy = true;
          addControlPoint(dp, startTime, timingChange);

          const ep = new EffectPoint();
          ep.kiai = (effects & EffectType.Kiai) > 0;
          ep.omitFirstBarLine = (effects & EffectType.OmitFirstBarLine) > 0;
          addControlPoint(ep, startTime, timingChange);

          const sp = new SamplePoint();
          sp.sampleSet = sampleSet;
          sp.customIndex = customIndex;
          sp.volume = volume;
          addControlPoint(sp, startTime, timingChange);
          break;
        }
        case 'HitObjects': {
          const ho = parseHitObjectLine(line, beatmap);
          beatmap.hitObjects.push(ho);
          break;
        }
        default:
          break;
      }
    }
    flushPending();

    beatmap.hitObjects.sort((a, b) => a.startTime - b.startTime);

    
    for (const ho of beatmap.hitObjects) {
      ho.kiai = beatmap.controlPoints.effectPointAt(ho.startTime + 1).kiai;
      if (ho instanceof SlidableObject) {
        ho.applyVelocity(beatmap.controlPoints, beatmap.difficulty);
      }
    }

    return beatmap;
  }

  global.StdOsuParser = {
    parseStdOsuFile,
    HitType, HitSound, EffectType,
    HittableObject, SlidableObject, SpinnableObject,
    ControlPointInfo, TimingPoint, DifficultyPoint, EffectPoint, SamplePoint,
  };
})(typeof window !== 'undefined' ? window : global);
