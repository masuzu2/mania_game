
(function (global) {
  'use strict';

  
  
  
  

  const QUICK_SORT_DEPTH_THRESHOLD = 32;

  function swap(keys, i, j) {
    if (i !== j) {
      const tmp = keys[i];
      keys[i] = keys[j];
      keys[j] = tmp;
    }
  }

  function swapIfGreater(keys, comparerFn, a, b) {
    if (a !== b && comparerFn(keys[a], keys[b]) > 0) {
      swap(keys, a, b);
    }
  }

  function downHeap(keys, i, n, lo, comparerFn) {
    const d = keys[lo + i - 1];
    while (i <= Math.floor(n / 2)) {
      let child = 2 * i;
      if (child < n && comparerFn(keys[lo + child - 1], keys[lo + child]) < 0) {
        child++;
      }
      if (comparerFn(d, keys[lo + child - 1]) >= 0) {
        break;
      }
      keys[lo + i - 1] = keys[lo + child - 1];
      i = child;
    }
    keys[lo + i - 1] = d;
  }

  function heapsort(keys, lo, hi, comparerFn) {
    const n = hi - lo + 1;
    for (let i = Math.floor(n / 2); i >= 1; --i) {
      downHeap(keys, i, n, lo, comparerFn);
    }
    for (let i = n; i > 1; --i) {
      swap(keys, lo, lo + i - 1);
      downHeap(keys, 1, i - 1, lo, comparerFn);
    }
  }

  function depthLimitedQuickSort(keys, left, right, comparerFn, depthLimit) {
    do {
      if (depthLimit === 0) {
        heapsort(keys, left, right, comparerFn);
        return;
      }

      let i = left;
      let j = right;
      const middle = i + ((j - i) >> 1);

      swapIfGreater(keys, comparerFn, i, middle);
      swapIfGreater(keys, comparerFn, i, j);
      swapIfGreater(keys, comparerFn, middle, j);

      const x = keys[middle];

      do {
        while (comparerFn(keys[i], x) < 0) i++;
        while (comparerFn(x, keys[j]) < 0) j--;

        if (i > j) break;
        if (i < j) swap(keys, i, j);
        i++;
        j--;
      } while (i <= j);

      depthLimit--;

      if (j - left <= right - i) {
        if (left < j) depthLimitedQuickSort(keys, left, j, comparerFn, depthLimit);
        left = i;
        continue;
      }

      if (i < right) depthLimitedQuickSort(keys, i, right, comparerFn, depthLimit);
      right = j;
    } while (left < right);
  }

  function depthSort(keys, comparerFn) {
    if (!keys || keys.length === 0) return keys;
    depthLimitedQuickSort(keys, 0, keys.length - 1, comparerFn, QUICK_SORT_DEPTH_THRESHOLD);
    return keys;
  }

  
  function roundToEven(x) {
    const isAtMidPoint = Math.abs(0.5 - Math.abs(x - Math.trunc(x))) <= 1e-15;
    return isAtMidPoint ? 2 * Math.round(x / 2) : Math.round(x);
  }

  
  const STAR_SCALING_FACTOR = 0.018;
  const INDIVIDUAL_DECAY_BASE = 0.125;
  const OVERALL_DECAY_BASE = 0.30;
  const RELEASE_THRESHOLD = 30; 
  const RELEASE_MULTIPLIER = 0.27; 
  const SECTION_LENGTH = 400;
  const DECAY_WEIGHT = 0.9;

  function applyDecay(value, deltaTime, decayBase) {
    return value * Math.pow(decayBase, deltaTime / 1000);
  }

  function logistic(x, midpointOffset, multiplier) {
    return 1.0 / (1 + Math.exp(multiplier * (midpointOffset - x)));
  }

    function calcManiaStarRating(hitObjectsRaw, totalColumns) {
    if (!hitObjectsRaw || hitObjectsRaw.length === 0) return 0;
    if (!totalColumns || totalColumns <= 0) totalColumns = 4;

    const sorted = hitObjectsRaw.slice();
    depthSort(sorted, (a, b) => roundToEven(a.startTime) - roundToEven(b.startTime));

    if (sorted.length < 2) return 0;

    
    
    
    const objects = [];
    const perColumnLast = new Array(totalColumns).fill(null);
    let prevHitObjectsCarry = new Array(totalColumns).fill(null);

    for (let i = 1; i < sorted.length; i++) {
      const base = sorted[i];
      const lastObject = sorted[i - 1];
      const idx = objects.length;

      const startTime = base.startTime;
      const deltaTime = base.startTime - lastObject.startTime;
      const endTime = (base.endTime !== undefined && base.endTime !== null) ? base.endTime : base.startTime;
      const column = base.column;

      const prevInColumn = perColumnLast[column];
      const columnStrainTime = startTime - (prevInColumn ? prevInColumn.startTime : startTime);

      const prevHitObjects = prevHitObjectsCarry.slice();
      if (idx > 0) {
        const prevNote = objects[idx - 1];
        prevHitObjects[prevNote.column] = prevNote;
      }

      const obj = {
        index: idx,
        startTime,
        endTime,
        deltaTime,
        column,
        columnStrainTime,
        prevHitObjects,
      };

      objects.push(obj);
      perColumnLast[column] = obj;
      prevHitObjectsCarry = prevHitObjects;
    }

    function previousOf(obj, backwardsIndex) {
      const idx = obj.index - (backwardsIndex + 1);
      return objects[idx] || null;
    }

    
    function individualStrainEvaluator(curr) {
      const startTime = curr.startTime;
      const endTime = curr.endTime;

      
      let withBonus = false;
      for (let c = 0; c < curr.prevHitObjects.length; c++) {
        const prev = curr.prevHitObjects[c];
        if (!prev) continue;
        if (prev.endTime > endTime + 1.0 && startTime > prev.startTime + 1.0) {
          withBonus = true;
          break;
        }
      }

      const holdFactor = withBonus ? 1.25 : 1.0;
      return 2.0 * holdFactor;
    }

    function overallStrainEvaluator(curr) {
      const startTime = curr.startTime;
      const endTime = curr.endTime;
      let isOverlapping = false;
      let closestEndTime = Math.abs(endTime - startTime);
      let holdFactor = 1.0;
      let holdAddition = 0.0;

      for (let c = 0; c < curr.prevHitObjects.length; c++) {
        const prev = curr.prevHitObjects[c];
        if (!prev) continue;

        if (
          prev.endTime > startTime + 1.0 &&
          endTime > prev.endTime + 1.0 &&
          startTime > prev.startTime + 1.0
        ) {
          isOverlapping = true;
        }

        if (prev.endTime > endTime + 1.0 && startTime > prev.startTime + 1.0) {
          holdFactor = 1.25;
        }

        closestEndTime = Math.min(closestEndTime, Math.abs(endTime - prev.endTime));
      }

      if (isOverlapping) {
        holdAddition = logistic(closestEndTime, RELEASE_THRESHOLD, RELEASE_MULTIPLIER);
      }

      return (1.0 + holdAddition) * holdFactor;
    }

    
    let currentStrain = 0;
    let highestIndividualStrain = 0;
    let overallStrain = 1;
    const individualStrains = new Array(totalColumns).fill(0);

    function strainValueOf(current) {
      individualStrains[current.column] = applyDecay(individualStrains[current.column], current.columnStrainTime, INDIVIDUAL_DECAY_BASE);
      individualStrains[current.column] += individualStrainEvaluator(current);

      highestIndividualStrain = current.deltaTime <= 1
        ? Math.max(highestIndividualStrain, individualStrains[current.column])
        : individualStrains[current.column];

      overallStrain = applyDecay(overallStrain, current.deltaTime, OVERALL_DECAY_BASE);
      overallStrain += overallStrainEvaluator(current);

      return highestIndividualStrain + overallStrain - currentStrain;
    }

    function strainValueAt(current) {
      
      currentStrain += strainValueOf(current);
      return currentStrain;
    }

    function calculateInitialStrain(time, current) {
      const prevStart = (previousOf(current, 0) || {}).startTime || 0;
      const decay1 = applyDecay(highestIndividualStrain, time - prevStart, INDIVIDUAL_DECAY_BASE);
      const decay2 = applyDecay(overallStrain, time - prevStart, OVERALL_DECAY_BASE);
      return decay1 + decay2;
    }

    
    let currentSectionPeak = 0;
    let currentSectionEnd = 0;
    const strainPeaks = [];

    for (let idx = 0; idx < objects.length; idx++) {
      const current = objects[idx];

      if (current.index === 0) {
        currentSectionEnd = Math.ceil(current.startTime / SECTION_LENGTH) * SECTION_LENGTH;
      }

      while (current.startTime > currentSectionEnd) {
        strainPeaks.push(currentSectionPeak);
        currentSectionPeak = calculateInitialStrain(currentSectionEnd, current);
        currentSectionEnd += SECTION_LENGTH;
      }

      currentSectionPeak = Math.max(strainValueAt(current), currentSectionPeak);
    }
    strainPeaks.push(currentSectionPeak);

    
    const peaks = strainPeaks.filter((p) => p > 0).sort((a, b) => b - a);
    let difficulty = 0;
    let weight = 1;
    for (let i = 0; i < peaks.length; i++) {
      difficulty += peaks[i] * weight;
      weight *= DECAY_WEIGHT;
    }

    return difficulty * STAR_SCALING_FACTOR;
  }

    function formatStarRating(star) {
    if (star == null || isNaN(star)) return '—';
    
    
    const EPSILON = 1e-9;
    const truncated = Math.floor((star + EPSILON) * 100) / 100;
    return truncated.toFixed(2);
  }

  global.ManiaStarRating = {
    calcManiaStarRating,
    formatStarRating,
  };
})(window);
