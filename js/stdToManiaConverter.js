(function (global) {
  'use strict';

  const Core = global.StdToManiaCore;
  const { Vector2, FastRandom, roundToEven } = Core;
  const StdParser = global.StdOsuParser;
  const { HitType, HitSound, SlidableObject, SpinnableObject, HittableObject } = StdParser;

  const MAX_STAGE_KEYS = 10;
  const MAX_NOTES_FOR_DENSITY = 7;

  const PatternType = {
    None: 0, ForceStack: 1, ForceNotStack: 2, KeepSingle: 4, LowProbability: 8,
    Alternate: 16, ForceSigSlider: 32, ForceNotSlider: 64, Gathered: 128,
    Mirror: 256, Reverse: 512, Cycle: 1024, Stair: 2048, ReverseStair: 4096,
  };

  

  class ManiaNote {
    constructor() {
      this.startTime = 0;
      this.column = 0;
      this.hitType = HitType.Normal;
      this.samples = [];
      this.endTime = null; 
    }
  }

  

  class Pattern {
    constructor() {
      this.hitObjects = [];
      this.containedColumns = new Set();
    }
    columnHasObject(column) { return this.containedColumns.has(column); }
    get columnsWithObjects() { return this.containedColumns.size; }
    addHitObject(ho) {
      this.hitObjects.push(ho);
      this.containedColumns.add(ho.column);
    }
    addPatternHitObjects(other) {
      this.hitObjects.push(...other.hitObjects);
      other.hitObjects.forEach((h) => this.containedColumns.add(h.column));
    }
    clear() {
      this.hitObjects.length = 0;
      this.containedColumns.clear();
    }
  }

  

  class PatternGenerator {
    constructor(hitObject, beatmapInfo, originalBeatmap, previousPattern, rng) {
      this._conversionDiff = null;
      this.hitObject = hitObject;
      this.beatmapInfo = beatmapInfo; 
      this.originalBeatmap = originalBeatmap;
      this.previousPattern = previousPattern;
      this.totalColumns = beatmapInfo.totalColumns;
      this.randomStart = beatmapInfo.totalColumns === 8 ? 1 : 0;
      this.rng = rng;
    }
    getColumn(position, allowSpecial) {
      if (allowSpecial && this.totalColumns === 8) {
        const divisor = Math.round((512 / 7) * 100000) / 100000;
        const x = Math.floor(position / divisor);
        return Math.max(0, Math.min(x, 6)) + 1;
      }
      const divisor = Math.round((512 / this.totalColumns) * 100000) / 100000;
      const x = Math.floor(position / divisor);
      return Math.max(0, Math.min(x, this.totalColumns - 1));
    }
    getRandomNoteCount(p2, p3, p4, p5, p6) {
      p4 = p4 || 0; p5 = p5 || 0; p6 = p6 || 0;
      const value = this.rng.nextDouble();
      if (value >= 1 - p6) return 6;
      if (value >= 1 - p5) return 5;
      if (value >= 1 - p4) return 4;
      if (value >= 1 - p3) return 3;
      return value >= 1 - p2 ? 2 : 1;
    }
    get conversionDifficulty() {
      if (this._conversionDiff !== null) return this._conversionDiff;
      const hitObjects = this.originalBeatmap.hitObjects;
      const firstObject = hitObjects[0];
      const lastObject = hitObjects[hitObjects.length - 1];
      const firstStartTime = firstObject.startTime || 0;
      const lastStartTime = lastObject.startTime || 0;
      const drain = lastStartTime - firstStartTime - this.originalBeatmap.totalBreakTime;
      let drainTime = Math.trunc(drain / 1000);
      if (drainTime === 0) drainTime = 10000;
      const difficulty = this.originalBeatmap.difficulty;
      let diff = Math.max(4, Math.min(this.originalBeatmap.getApproachRate(), 7));
      diff += difficulty.drainRate;
      diff /= 1.5;
      diff += (hitObjects.length / drainTime) * Math.fround(9);
      diff = Math.fround((diff / 38) * 5) / 1.15;
      diff = Math.min(diff, 12);
      this._conversionDiff = diff;
      return diff;
    }
    findAvailableColumn(column, options) {
      options = options || {};
      const patterns = options.patterns || [];
      const lowerBound = options.lowerBound !== undefined ? options.lowerBound : this.randomStart;
      const upperBound = options.upperBound !== undefined ? options.upperBound : this.totalColumns;
      const nextColumn = options.nextColumn || (() => this.getRandomColumn(lowerBound, upperBound));
      const validate = options.validate || (() => true);
      const isValid = (c) => validate(c) !== false && !patterns.find((p) => p.columnHasObject(c));

      if (isValid(column)) return column;

      let hasValidColumns = false;
      for (let i = lowerBound; i < upperBound; ++i) {
        hasValidColumns = isValid(i);
        if (hasValidColumns) break;
      }
      if (!hasValidColumns) {
        throw new Error('There were not enough columns to complete conversion.');
      }
      do {
        column = nextColumn(column);
      } while (!isValid(column));
      return column;
    }
    getRandomColumn(lowerBound, upperBound) {
      lowerBound = lowerBound !== undefined ? lowerBound : this.randomStart;
      upperBound = upperBound !== undefined ? upperBound : this.totalColumns;
      return this.rng.nextInt(lowerBound, upperBound);
    }
  }

  function hasSample(hitObject, hitSound) {
    return !!hitObject.samples.find((s) => s.hitSound === hitSound);
  }

  

  class DistanceObjectPatternGenerator extends PatternGenerator {
    constructor(hitObject, beatmapInfo, originalBeatmap, previousPattern, rng) {
      super(hitObject, beatmapInfo, originalBeatmap, previousPattern, rng);
      this.convertType = PatternType.None;
      const effectPoint = originalBeatmap.controlPoints.effectPointAt(hitObject.startTime);
      if (!effectPoint.kiai) this.convertType = PatternType.LowProbability;

      const slider = hitObject;
      const timingPoint = originalBeatmap.controlPoints.timingPointAt(hitObject.startTime);
      const difficultyPoint = originalBeatmap.controlPoints.difficultyPointAt(hitObject.startTime);
      const beatLength = timingPoint.beatLength * difficultyPoint.bpmMultiplier;
      this.spanCount = slider.repeats + 1 || 1;
      this.startTime = roundToEven(hitObject.startTime);
      const sliderMultiplier = originalBeatmap.difficulty.sliderMultiplier;
      this.endTime = ((slider.path.distance || 0) * beatLength * this.spanCount * 0.01) / sliderMultiplier;
      this.endTime = Math.trunc(Math.floor(this.startTime + this.endTime));
      const duration = this.endTime - this.startTime;
      this.segmentDuration = (duration / this.spanCount) >> 0;
    }
    *generate() {
      const originalPattern = this.generatePattern();
      if (originalPattern.hitObjects.length === 1) {
        yield originalPattern;
        return;
      }
      const intermediatePattern = new Pattern();
      const endTimePattern = new Pattern();
      for (const ho of originalPattern.hitObjects) {
        let endTime = ho.endTime;
        endTime = endTime === null || endTime === undefined ? ho.startTime : endTime;
        if (this.endTime !== roundToEven(endTime)) intermediatePattern.addHitObject(ho);
        else endTimePattern.addHitObject(ho);
      }
      yield intermediatePattern;
      yield endTimePattern;
    }
    generatePattern() {
      if (this.totalColumns === 1) {
        const pattern = new Pattern();
        this.addToPattern(pattern, 0, this.startTime, this.endTime);
        return pattern;
      }
      if (this.spanCount > 1) {
        if (this.segmentDuration <= 90) return this.generateRandomHoldNotes(this.startTime, 1);
        if (this.segmentDuration <= 120) {
          this.convertType |= PatternType.ForceNotStack;
          return this.generateRandomNotes(this.startTime, this.spanCount + 1);
        }
        if (this.segmentDuration <= 160) return this.generateStair(this.startTime);
        if (this.segmentDuration <= 200 && this.conversionDifficulty > 3) return this.generateRandomMultipleNotes(this.startTime);
        if (this.endTime - this.startTime >= 4000) return this.generateNRandomNotes(this.startTime, 0.23, 0, 0);
        const columns = this.totalColumns - 1 - this.randomStart;
        if (this.segmentDuration > 400 && this.spanCount < columns) return this.generateTiledHoldNotes(this.startTime);
        return this.generateHoldAndNormalNotes(this.startTime);
      }
      if (this.segmentDuration <= 110) {
        if (this.previousPattern.columnsWithObjects < this.totalColumns) this.convertType |= PatternType.ForceNotStack;
        else this.convertType &= ~PatternType.ForceNotStack;
        const noteCount = this.segmentDuration < 80 ? 1 : 2;
        return this.generateRandomNotes(this.startTime, noteCount);
      }
      if (this.conversionDifficulty > 6.5) {
        if (this.convertType & PatternType.LowProbability) return this.generateNRandomNotes(this.startTime, 0.78, 0.3, 0);
        return this.generateNRandomNotes(this.startTime, 0.85, 0.36, 0.03);
      }
      if (this.conversionDifficulty > 4) {
        if (this.convertType & PatternType.LowProbability) return this.generateNRandomNotes(this.startTime, 0.43, 0.08, 0);
        return this.generateNRandomNotes(this.startTime, 0.56, 0.18, 0);
      }
      if (this.conversionDifficulty > 2.5) {
        if (this.convertType & PatternType.LowProbability) return this.generateNRandomNotes(this.startTime, 0.3, 0, 0);
        return this.generateNRandomNotes(this.startTime, 0.37, 0.08, 0);
      }
      if (this.convertType & PatternType.LowProbability) return this.generateNRandomNotes(this.startTime, 0.17, 0, 0);
      return this.generateNRandomNotes(this.startTime, 0.27, 0, 0);
    }
    generateRandomHoldNotes(startTime, noteCount) {
      const pattern = new Pattern();
      const usableColumns = this.totalColumns - this.randomStart - this.previousPattern.columnsWithObjects;
      let column = this.getRandomColumn();
      for (let i = 0, len = Math.min(usableColumns, noteCount); i < len; ++i) {
        column = this.findAvailableColumn(column, { patterns: [pattern, this.previousPattern] });
        this.addToPattern(pattern, column, startTime, this.endTime);
      }
      for (let i = 0, len = noteCount - usableColumns; i < len; ++i) {
        column = this.findAvailableColumn(column, { patterns: [pattern] });
        this.addToPattern(pattern, column, startTime, this.endTime);
      }
      return pattern;
    }
    generateRandomNotes(startTime, noteCount) {
      const pattern = new Pattern();
      const startX = this.hitObject.startX;
      let column = this.getColumn(startX || 0, true);
      const isForceNotStack = !!(this.convertType & PatternType.ForceNotStack);
      const lessThanTotalColumns = this.previousPattern.columnsWithObjects < this.totalColumns;
      if (isForceNotStack && lessThanTotalColumns) {
        column = this.findAvailableColumn(column, { patterns: [this.previousPattern] });
      }
      let lastColumn = column;
      for (let i = 0; i < noteCount; ++i) {
        this.addToPattern(pattern, column, startTime, startTime);
        startTime += this.segmentDuration;
        column = this.findAvailableColumn(column, { validate: (c) => c !== lastColumn });
        lastColumn = column;
      }
      return pattern;
    }
    generateStair(startTime) {
      const pattern = new Pattern();
      let column = this.getColumn(this.hitObject.startX || 0, true);
      let increasing = this.rng.nextDouble() > 0.5;
      for (let i = 0; i <= this.spanCount; ++i) {
        this.addToPattern(pattern, column, startTime, startTime);
        startTime += this.segmentDuration;
        if (increasing) {
          if (column >= this.totalColumns - 1) { increasing = false; --column; }
          else ++column;
        } else {
          if (column <= this.randomStart) { increasing = true; ++column; }
          else --column;
        }
      }
      return pattern;
    }
    generateRandomMultipleNotes(startTime) {
      const pattern = new Pattern();
      const legacy = this.totalColumns >= 4 && this.totalColumns <= 8;
      const interval = this.rng.nextInt(1, this.totalColumns - (legacy ? 1 : 0));
      let column = this.getColumn(this.hitObject.startX || 0, true);
      for (let i = 0; i <= this.spanCount; ++i) {
        this.addToPattern(pattern, column, startTime, startTime);
        column += interval;
        if (column >= this.totalColumns - this.randomStart) {
          column = column - this.totalColumns - this.randomStart + (legacy ? 1 : 0);
        }
        column += this.randomStart;
        if (this.totalColumns > 2) this.addToPattern(pattern, column, startTime, startTime);
        column = this.getRandomColumn();
        startTime += this.segmentDuration;
      }
      return pattern;
    }
    generateNRandomNotes(startTime, p2, p3, p4) {
      switch (this.totalColumns) {
        case 2: p2 = 0; p3 = 0; p4 = 0; break;
        case 3: p2 = Math.min(p2, 0.1); p3 = 0; p4 = 0; break;
        case 4: p2 = Math.min(p2, 0.3); p3 = Math.min(p3, 0.04); p4 = 0; break;
        case 5: p2 = Math.min(p2, 0.34); p3 = Math.min(p3, 0.1); p4 = Math.min(p4, 0.03); break;
      }
      const isDoubleAtObject = hasSample(this.hitObject, HitSound.Clap) || hasSample(this.hitObject, HitSound.Finish);
      const isDoubleAtTime = this.hitSamplesAt(this.startTime).some((s) => s.hitSound === HitSound.Clap || s.hitSound === HitSound.Finish);
      const isLowProbability = this.convertType & PatternType.LowProbability;
      const canGenerateTwoNotes = !isLowProbability && (isDoubleAtObject || isDoubleAtTime);
      if (canGenerateTwoNotes) p2 = 1;
      const notes = this.getRandomNoteCount(p2, p3, p4);
      return this.generateRandomHoldNotes(startTime, notes);
    }
    generateTiledHoldNotes(startTime) {
      const pattern = new Pattern();
      const columnRepeat = Math.min(this.spanCount, this.totalColumns);
      const endTime = startTime + this.segmentDuration * this.spanCount;
      let column = this.getColumn(this.hitObject.startX || 0, true);
      const isForceNotStack = !!(this.convertType & PatternType.ForceNotStack);
      const lessThanTotalColumns = this.previousPattern.columnsWithObjects < this.totalColumns;
      if (isForceNotStack && lessThanTotalColumns) {
        column = this.findAvailableColumn(column, { patterns: [this.previousPattern] });
      }
      for (let i = 0; i < columnRepeat; ++i) {
        column = this.findAvailableColumn(column, { patterns: [pattern] });
        this.addToPattern(pattern, column, startTime, endTime);
        startTime += this.segmentDuration;
      }
      return pattern;
    }
    generateHoldAndNormalNotes(startTime) {
      const pattern = new Pattern();
      let holdColumn = this.getColumn(this.hitObject.startX || 0, true);
      const isForceNotStack = !!(this.convertType & PatternType.ForceNotStack);
      const lessThanTotalColumns = this.previousPattern.columnsWithObjects < this.totalColumns;
      if (isForceNotStack && lessThanTotalColumns) {
        holdColumn = this.findAvailableColumn(holdColumn, { patterns: [this.previousPattern] });
      }
      this.addToPattern(pattern, holdColumn, startTime, this.endTime);
      let column = this.getRandomColumn();
      let noteCount = 0;
      if (this.conversionDifficulty > 6.5) {
        noteCount = this.getRandomNoteCount(0.63, 0);
      } else if (this.conversionDifficulty > 4) {
        const p2 = this.totalColumns < 6 ? 0.12 : 0.45;
        noteCount = this.getRandomNoteCount(p2, 0);
      } else if (this.conversionDifficulty > 2.5) {
        const p2 = this.totalColumns < 6 ? 0 : 0.24;
        noteCount = this.getRandomNoteCount(p2, 0);
      }
      noteCount = Math.min(this.totalColumns - 1, noteCount);
      const headSamples = this.hitSamplesAt(startTime);
      const ignoreHead = !headSamples.some((s) => s.hitSound === HitSound.Whistle || s.hitSound === HitSound.Finish || s.hitSound === HitSound.Clap);
      const rowPattern = new Pattern();
      for (let i = 0; i <= this.spanCount; ++i) {
        if (!(ignoreHead && startTime === this.startTime)) {
          for (let j = 0; j < noteCount; ++j) {
            column = this.findAvailableColumn(column, { validate: (c) => c !== holdColumn, patterns: [rowPattern] });
            this.addToPattern(rowPattern, column, startTime, startTime);
          }
        }
        pattern.addPatternHitObjects(rowPattern);
        rowPattern.clear();
        startTime += this.segmentDuration;
      }
      return pattern;
    }
    hitSamplesAt(time) {
      const nodeSamples = this.nodeSamplesAt(time);
      return nodeSamples.length ? nodeSamples : this.hitObject.samples;
    }
    nodeSamplesAt(time) {
      if (!(this.hitObject.hitType & HitType.Slider)) return [];
      const slider = this.hitObject;
      let index = 0;
      if (this.segmentDuration) index = Math.floor((time - this.startTime) / this.segmentDuration);
      return index ? (slider.nodeSamples[index] || slider.nodeSamples[slider.nodeSamples.length - 1] || []) : (slider.nodeSamples[0] || []);
    }
    addToPattern(pattern, column, startTime, endTime) {
      const note = new ManiaNote();
      note.column = column;
      note.startTime = startTime;
      note.hitType = (startTime === endTime) ? HitType.Normal : HitType.Hold;
      note.samples = this.hitSamplesAt(startTime);
      note.endTime = (startTime === endTime) ? null : endTime;
      pattern.addHitObject(note);
    }
  }

  

  class EndTimeObjectPatternGenerator extends PatternGenerator {
    constructor(hitObject, beatmapInfo, originalBeatmap, previousPattern, rng) {
      super(hitObject, beatmapInfo, originalBeatmap, previousPattern, rng);
      this.endTime = Math.trunc(hitObject.endTime || 0);
      this.convertType = previousPattern.columnsWithObjects === this.totalColumns ? PatternType.None : PatternType.ForceNotStack;
    }
    *generate() {
      const pattern = new Pattern();
      const shouldGenerateHold = this.endTime - this.hitObject.startTime >= 100;
      if (this.totalColumns === 8) {
        const hasFinish = hasSample(this.hitObject, HitSound.Finish);
        if (hasFinish && this.endTime - this.hitObject.startTime < 1000) {
          this.addToPattern(pattern, 0, shouldGenerateHold);
        } else {
          this.addToPattern(pattern, this.getRandomColumnOverride(0), shouldGenerateHold);
        }
      } else {
        this.addToPattern(pattern, this.getRandomColumnOverride(0), shouldGenerateHold);
      }
      yield pattern;
    }
    getRandomColumnOverride(lowerBound) {
      const column = super.getRandomColumn(lowerBound);
      if (this.convertType & PatternType.ForceNotStack) {
        return this.findAvailableColumn(column, { lowerBound, patterns: [this.previousPattern] });
      }
      return this.findAvailableColumn(column, { lowerBound });
    }
    addToPattern(pattern, column, isHoldNote) {
      const note = new ManiaNote();
      note.column = column;
      note.startTime = this.hitObject.startTime;
      note.samples = this.hitObject.samples;
      if (isHoldNote) {
        note.hitType = HitType.Hold;
        note.endTime = this.endTime;
      } else {
        note.hitType = HitType.Normal;
        note.endTime = null;
      }
      pattern.addHitObject(note);
    }
  }

  

  class HitObjectPatternGenerator extends PatternGenerator {
    constructor(hitObject, beatmapInfo, originalBeatmap, previousPattern, rng, previousTime, previousPosition, density, lastStair) {
      super(hitObject, beatmapInfo, originalBeatmap, previousPattern, rng);
      this.stairType = lastStair;
      this.convertType = PatternType.None;

      const timingPoint = originalBeatmap.controlPoints.timingPointAt(hitObject.startTime);
      const effectPoint = originalBeatmap.controlPoints.effectPointAt(hitObject.startTime);
      const startPosition = hitObject.startPosition;
      const posSeparation = startPosition.fsubtract(previousPosition).flength();
      const timeSeparation = hitObject.startTime - previousTime;

      if (timeSeparation <= 80) {
        this.convertType |= PatternType.ForceNotStack | PatternType.KeepSingle;
      } else if (timeSeparation <= 95) {
        this.convertType |= PatternType.ForceNotStack | PatternType.KeepSingle | lastStair;
      } else if (timeSeparation <= 105) {
        this.convertType |= PatternType.ForceNotStack | PatternType.LowProbability;
      } else if (timeSeparation <= 125) {
        this.convertType |= PatternType.ForceNotStack;
      } else if (timeSeparation <= 135 && posSeparation < 20) {
        this.convertType |= PatternType.Cycle | PatternType.KeepSingle;
      } else if (timeSeparation <= 150 && posSeparation < 20) {
        this.convertType |= PatternType.ForceStack | PatternType.LowProbability;
      } else if (posSeparation < 20 && density >= timingPoint.beatLength / 2.5) {
        this.convertType |= PatternType.Reverse | PatternType.LowProbability;
      } else if (density < timingPoint.beatLength / 2.5 || effectPoint.kiai) {
        
      } else {
        this.convertType |= PatternType.LowProbability;
      }

      if (!(this.convertType & PatternType.KeepSingle)) {
        const isFinish = hasSample(hitObject, HitSound.Finish);
        const isClap = hasSample(hitObject, HitSound.Clap);
        if (isFinish && this.totalColumns !== 8) this.convertType |= PatternType.Mirror;
        else if (isClap) this.convertType |= PatternType.Gathered;
      }
    }
    *generate() {
      const p = this._generateCore();
      const isStair = !!(this.convertType & PatternType.Stair);
      const isReverseStair = !!(this.convertType & PatternType.ReverseStair);
      for (const ho of p.hitObjects) {
        if (isStair && ho.column === this.totalColumns - 1) this.stairType = PatternType.ReverseStair;
        if (isReverseStair && ho.column === this.randomStart) this.stairType = PatternType.Stair;
      }
      yield p;
    }
    _generateCore() {
      const pattern = new Pattern();
      if (this.totalColumns === 1) {
        this.addToPattern(pattern, 0);
        return pattern;
      }
      const lastColumn = this.previousPattern.hitObjects.length ? this.previousPattern.hitObjects[0].column : 0;
      const isReverse = !!(this.convertType & PatternType.Reverse);
      if (isReverse && this.previousPattern.hitObjects.length) {
        for (let i = this.randomStart; i < this.totalColumns; ++i) {
          if (this.previousPattern.columnHasObject(i)) {
            const column = this.randomStart + this.totalColumns - i - 1;
            this.addToPattern(pattern, column);
          }
        }
        return pattern;
      }
      const isCycle = !!(this.convertType & PatternType.Cycle);
      const isSingleObject = this.previousPattern.hitObjects.length === 1;
      const is7KPlus1 = this.totalColumns !== 8 || lastColumn !== 0;
      const isNotCenter = this.totalColumns % 2 === 0 || lastColumn !== this.totalColumns / 2;
      if (isCycle && isSingleObject && is7KPlus1 && isNotCenter) {
        const column = this.randomStart + this.totalColumns - lastColumn - 1;
        this.addToPattern(pattern, column);
        return pattern;
      }
      const isForceStack = !!(this.convertType & PatternType.ForceStack);
      if (isForceStack && this.previousPattern.hitObjects.length) {
        for (let i = this.randomStart; i < this.totalColumns; ++i) {
          if (this.previousPattern.columnHasObject(i)) this.addToPattern(pattern, i);
        }
        return pattern;
      }
      if (this.previousPattern.hitObjects.length === 1) {
        if (this.convertType & PatternType.Stair) {
          let targetColumn = lastColumn + 1;
          if (targetColumn === this.totalColumns) targetColumn = this.randomStart;
          this.addToPattern(pattern, targetColumn);
          return pattern;
        }
        if (this.convertType & PatternType.ReverseStair) {
          let targetColumn = lastColumn - 1;
          if (targetColumn === this.randomStart - 1) targetColumn = this.totalColumns - 1;
          this.addToPattern(pattern, targetColumn);
          return pattern;
        }
      }
      if (this.convertType & PatternType.KeepSingle) return this.generateRandomNotes(1);
      if (this.convertType & PatternType.Mirror) {
        if (this.conversionDifficulty > 6.5) return this.generateRandomPatternWithMirrored(0.12, 0.38, 0.12);
        if (this.conversionDifficulty > 4) return this.generateRandomPatternWithMirrored(0.12, 0.17, 0);
        return this.generateRandomPatternWithMirrored(0.12, 0, 0);
      }
      if (this.conversionDifficulty > 6.5) {
        if (this.convertType & PatternType.LowProbability) return this.generateRandomPattern(0.78, 0.42, 0, 0);
        return this.generateRandomPattern(1, 0.62, 0, 0);
      }
      if (this.conversionDifficulty > 4) {
        if (this.convertType & PatternType.LowProbability) return this.generateRandomPattern(0.35, 0.08, 0, 0);
        return this.generateRandomPattern(0.52, 0.15, 0, 0);
      }
      if (this.conversionDifficulty > 2) {
        if (this.convertType & PatternType.LowProbability) return this.generateRandomPattern(0.18, 0, 0, 0);
        return this.generateRandomPattern(0.45, 0, 0, 0);
      }
      return this.generateRandomPattern(0, 0, 0, 0);
    }
    generateRandomNotes(noteCount) {
      const getNextColumn = (last) => {
        if (this.convertType & PatternType.Gathered) {
          if (++last === this.totalColumns) last = this.randomStart;
        } else {
          last = this.getRandomColumn();
        }
        return last;
      };
      const pattern = new Pattern();
      const allowStacking = !(this.convertType & PatternType.ForceNotStack);
      if (!allowStacking) {
        const count = this.totalColumns - this.randomStart - this.previousPattern.columnsWithObjects;
        noteCount = Math.min(noteCount, count);
      }
      let column = this.getColumn(this.hitObject.startX || 0, true);
      for (let i = 0; i < noteCount; ++i) {
        if (allowStacking) {
          column = this.findAvailableColumn(column, { nextColumn: getNextColumn, patterns: [pattern] });
        } else {
          column = this.findAvailableColumn(column, { nextColumn: getNextColumn, patterns: [pattern, this.previousPattern] });
        }
        this.addToPattern(pattern, column);
      }
      return pattern;
    }
    hasSpecialColumn() {
      return hasSample(this.hitObject, HitSound.Clap) && hasSample(this.hitObject, HitSound.Finish);
    }
    generateRandomPattern(p2, p3, p4, p5) {
      const pattern = new Pattern();
      const noteCount = this.getRandomNoteCount(p2, p3, p4, p5);
      const randomNotes = this.generateRandomNotes(noteCount);
      pattern.addPatternHitObjects(randomNotes);
      if (this.randomStart > 0 && this.hasSpecialColumn()) this.addToPattern(pattern, 0);
      return pattern;
    }
    generateRandomPatternWithMirrored(centreProbability, p2, p3) {
      if (this.convertType & PatternType.ForceNotStack) {
        return this.generateRandomPattern(1 / Math.fround(2) + p2 / 2, p2, (p2 + p3) / 2, p3);
      }
      const pattern = new Pattern();
      const [noteCount, addToCentre] = this.getRandomNoteCountMirrored(centreProbability, p2, p3);
      const columnLimit = Math.trunc((this.totalColumns % 2 ? this.totalColumns - 1 : this.totalColumns) / 2);
      let column = this.getRandomColumn(this.randomStart, columnLimit);
      const options = { upperBound: columnLimit, patterns: [pattern] };
      for (let i = 0; i < noteCount; ++i) {
        column = this.findAvailableColumn(column, options);
        const mirroredColumn = this.randomStart + this.totalColumns - column - 1;
        this.addToPattern(pattern, column);
        this.addToPattern(pattern, mirroredColumn);
      }
      if (addToCentre) this.addToPattern(pattern, Math.trunc(this.totalColumns / 2));
      if (this.randomStart > 0 && this.hasSpecialColumn()) this.addToPattern(pattern, 0);
      return pattern;
    }
    getRandomNoteCount(p2, p3, p4, p5) {
      p4 = p4 || 0; p5 = p5 || 0;
      switch (this.totalColumns) {
        case 2: p2 = 0; p3 = 0; p4 = 0; p5 = 0; break;
        case 3: p2 = Math.min(p2, 0.1); p3 = 0; p4 = 0; p5 = 0; break;
        case 4: p2 = Math.min(p2, 0.23); p3 = Math.min(p3, 0.04); p4 = 0; p5 = 0; break;
        case 5: p3 = Math.min(p3, 0.15); p4 = Math.min(p4, 0.03); p5 = 0; break;
      }
      if (hasSample(this.hitObject, HitSound.Clap)) p2 = 1;
      return super.getRandomNoteCount(p2, p3, p4, p5);
    }
    getRandomNoteCountMirrored(centreProbability, p2, p3) {
      switch (this.totalColumns) {
        case 2: centreProbability = 0; p2 = 0; p3 = 0; break;
        case 3: centreProbability = Math.min(centreProbability, 0.03); p2 = 0; p3 = 0; break;
        case 4: centreProbability = 0; p2 = 1 - Math.max((1 - p2) * 2, 0.8); p3 = 0; break;
        case 5: centreProbability = Math.min(centreProbability, 0.03); p3 = 0; break;
        case 6: centreProbability = 0; p2 = 1 - Math.max((1 - p2) * 2, 0.5); p3 = 1 - Math.max((1 - p3) * 2, 0.85); break;
      }
      p2 = Math.max(0, Math.min(p2, 1));
      p3 = Math.max(0, Math.min(p3, 1));
      const centreVal = this.rng.nextDouble();
      const noteCount = super.getRandomNoteCount(p2, p3);
      const addToCentre = this.totalColumns % 2 === 1 && noteCount !== 3 && centreVal > 1 - centreProbability;
      return [noteCount, addToCentre];
    }
    addToPattern(pattern, column) {
      const note = new ManiaNote();
      note.column = column;
      note.startTime = this.hitObject.startTime;
      note.hitType = HitType.Normal;
      note.samples = this.hitObject.samples;
      note.endTime = null;
      pattern.addHitObject(note);
    }
  }

  

  class ManiaBeatmapConverter {
    constructor(originalBeatmap, targetColumns) {
      this.originalBeatmap = originalBeatmap;
      this.targetColumns = targetColumns || 0;
      this.isDual = false;
      this._prevNoteTimes = [];
      this._density = FastRandom.MAX_INT32;
      this._lastTime = 0;
      this._lastPosition = new Vector2(0, 0);
      this._lastPattern = new Pattern();
      this._lastStair = PatternType.Stair;
    }
    convert() {
      this._updateTargetColumns();
      const difficulty = this.originalBeatmap.difficulty;
      let seed = roundToEven(this.originalBeatmap.getApproachRate());
      seed += roundToEven(difficulty.drainRate + difficulty.circleSize) * 20;
      seed += Math.trunc(difficulty.overallDifficulty * 41.2);
      this.rng = new FastRandom(Math.trunc(seed));

      const beatmapInfo = { totalColumns: this.targetColumns };
      const output = [];
      for (const hitObject of this.originalBeatmap.hitObjects) {
        for (const obj of this._generateConverted(hitObject, beatmapInfo)) {
          output.push(obj);
        }
      }
      output.sort((a, b) => a.startTime - b.startTime);
      return { hitObjects: output, totalColumns: this.targetColumns };
    }
    *_generateConverted(hitObject, beatmapInfo) {
      const random = this.rng;
      const originalBeatmap = this.originalBeatmap;
      const pattern = this._lastPattern;
      let conversion = null;

      if (hitObject instanceof SlidableObject) {
        const generator = new DistanceObjectPatternGenerator(hitObject, beatmapInfo, originalBeatmap, pattern, random);
        const position = hitObject.startPosition;
        for (let i = 0; i <= generator.spanCount; ++i) {
          const time = hitObject.startTime + generator.segmentDuration * i;
          this._recordNote(time, position || new Vector2(0, 0));
          this._computeDensity(time);
        }
        conversion = generator;
      } else if (hitObject instanceof SpinnableObject) {
        const generator = new EndTimeObjectPatternGenerator(hitObject, beatmapInfo, originalBeatmap, pattern, random);
        this._recordNote(hitObject.endTime, new Vector2(256, 192));
        this._computeDensity(hitObject.endTime);
        conversion = generator;
      } else {
        this._computeDensity(hitObject.startTime);
        const lastTime = this._lastTime;
        const lastPosition = this._lastPosition;
        const density = this._density;
        const lastStair = this._lastStair;
        const generator = new HitObjectPatternGenerator(hitObject, beatmapInfo, originalBeatmap, pattern, random, lastTime, lastPosition, density, lastStair);
        this._recordNote(hitObject.startTime, hitObject.startPosition);
        conversion = generator;
      }

      if (conversion === null) return;

      for (const generated of conversion.generate()) {
        if (!(conversion instanceof EndTimeObjectPatternGenerator)) {
          this._lastPattern = generated;
        }
        if (conversion instanceof HitObjectPatternGenerator) {
          this._lastStair = conversion.stairType;
        }
        for (const obj of generated.hitObjects) yield obj;
      }
    }
    _updateTargetColumns() {
      
      
      
      if (this.targetColumns > MAX_STAGE_KEYS) {
        this.targetColumns = Math.trunc(this.targetColumns / 2);
        this.isDual = true;
      }
    }
    _computeDensity(newNoteTime) {
      if (this._prevNoteTimes.length === MAX_NOTES_FOR_DENSITY) this._prevNoteTimes.shift();
      this._prevNoteTimes.push(newNoteTime);
      if (this._prevNoteTimes.length >= 2) {
        this._density = (newNoteTime - this._prevNoteTimes[0]) / this._prevNoteTimes.length;
      }
    }
    _recordNote(time, position) {
      this._lastTime = time;
      this._lastPosition = position;
    }
  }

  global.StdToManiaConverter = {
    ManiaBeatmapConverter,
    PatternType,
  };
})(typeof window !== 'undefined' ? window : global);
