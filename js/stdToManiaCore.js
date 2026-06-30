(function (global) {
  'use strict';

  

  class Vector2 {
    constructor(x, y) {
      this.x = x;
      this.y = Number.isFinite(y) ? y : x;
    }
    get floatX() { return Math.fround(this.x); }
    get floatY() { return Math.fround(this.y); }
    fadd(vec) {
      return new Vector2(Math.fround(this.floatX + vec.floatX), Math.fround(this.floatY + vec.floatY));
    }
    fsubtract(vec) {
      return new Vector2(Math.fround(this.floatX - vec.floatX), Math.fround(this.floatY - vec.floatY));
    }
    fscale(multiplier) {
      const m = Math.fround(multiplier);
      return new Vector2(Math.fround(this.floatX * m), Math.fround(this.floatY * m));
    }
    fdivide(divisor) {
      const d = Math.fround(divisor);
      return new Vector2(Math.fround(this.floatX / d), Math.fround(this.floatY / d));
    }
    fdot(vec) {
      return Math.fround(Math.fround(this.floatX * vec.floatX) + Math.fround(this.floatY * vec.floatY));
    }
    flength() {
      return Math.fround(Math.sqrt(Math.fround(Math.fround(this.floatX * this.floatX) + Math.fround(this.floatY * this.floatY))));
    }
    fnormalize() {
      const scale = Math.fround(1 / this.flength());
      return new Vector2(Math.fround(this.floatX * scale), Math.fround(this.floatY * scale));
    }
    equals(vec) {
      return this.x === vec.x && this.y === vec.y;
    }
    clone() {
      return new Vector2(this.x, this.y);
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  

  class FastRandom {
    constructor(seed) {
      this._y = 842502087 >>> 0;
      this._z = 3579807591 >>> 0;
      this._w = 273326509 >>> 0;
      this._x = seed >>> 0;
      this._bitBuffer = 0;
      this._bitIndex = 32;
    }
    _next() {
      const t = (this._x ^ ((this._x << 11) >>> 0)) >>> 0;
      this._x = this._y >>> 0;
      this._y = this._z >>> 0;
      this._z = this._w >>> 0;
      this._w = (this._w ^ (this._w >>> 19)) >>> 0;
      this._w = (this._w ^ t) >>> 0;
      this._w = (this._w ^ (t >>> 8)) >>> 0;
      return this._w;
    }
    next() {
      return (FastRandom.INT_MASK & this._next()) >> 0;
    }
    nextInt(lowerBound = 0, upperBound = FastRandom.MAX_INT32) {
      return (lowerBound + this.nextDouble() * (upperBound - lowerBound)) >> 0;
    }
    nextDouble() {
      return FastRandom.INT_TO_REAL * this.next();
    }
  }
  FastRandom.MAX_INT32 = 2147483647;
  FastRandom.INT_MASK = 0x7fffffff >> 0;
  FastRandom.INT_TO_REAL = 1 / (FastRandom.MAX_INT32 + 1);

  

  function roundToEven(x) {
    const isAtMidPoint = Math.abs(0.5 - Math.abs(x - Math.trunc(x))) <= 1e-15;
    return isAtMidPoint ? 2 * Math.round(x / 2) : Math.round(x);
  }

  

  const PathType = { Catmull: 'C', Bezier: 'B', Linear: 'L', PerfectCurve: 'P' };

  class PathPoint {
    constructor(position, type) {
      this.position = position || new Vector2(0, 0);
      this.type = type || null;
    }
  }

  

  const PathApproximator = {
    BEZIER_TOLERANCE: Math.fround(0.25),
    CIRCULAR_ARC_TOLERANCE: Math.fround(0.1),
    CATMULL_DETAIL: 50,

    approximateBezier(controlPoints) {
      return PathApproximator.approximateBSpline(controlPoints, 0);
    },

    approximateBSpline(controlPoints, p) {
      p = p || 0;
      const output = [];
      const n = controlPoints.length - 1;
      if (n < 0) return output;

      const toFlatten = [];
      const freeBuffers = [];
      const points = controlPoints.slice();

      if (p > 0 && p < n) {
        for (let i = 0; i < n - p; ++i) {
          const subBezier = [points[i]];
          for (let j = 0; j < p - 1; ++j) {
            subBezier[j + 1] = points[i + 1];
            for (let k = 1; k < p - j; ++k) {
              const l = Math.min(k, n - p - i);
              points[i + k] = points[i + k].fscale(l).fadd(points[i + k + 1]).fdivide(l + 1);
            }
          }
          subBezier[p] = points[i + 1];
          toFlatten.push(subBezier);
        }
        toFlatten.push(points.slice(n - p));
        toFlatten.reverse();
      } else {
        p = n;
        toFlatten.push(points);
      }

      const subdivisionBuffer1 = [];
      const subdivisionBuffer2 = [];
      const leftChild = subdivisionBuffer2;

      while (toFlatten.length > 0) {
        const parent = toFlatten.pop() || [];
        if (PathApproximator._bezierIsFlatEnough(parent)) {
          PathApproximator._bezierApproximate(parent, output, subdivisionBuffer1, subdivisionBuffer2, p + 1);
          freeBuffers.push(parent);
          continue;
        }
        const rightChild = freeBuffers.pop() || [];
        PathApproximator._bezierSubdivide(parent, leftChild, rightChild, subdivisionBuffer1, p + 1);
        for (let i = 0; i < p + 1; ++i) parent[i] = leftChild[i];
        toFlatten.push(rightChild);
        toFlatten.push(parent);
      }

      output.push(controlPoints[n]);
      return output;
    },

    approximateCatmull(controlPoints) {
      const output = [];
      const len = controlPoints.length;
      for (let i = 0; i < len - 1; i++) {
        const v1 = i > 0 ? controlPoints[i - 1] : controlPoints[i];
        const v2 = controlPoints[i];
        const v3 = i < len - 1 ? controlPoints[i + 1] : v2.fadd(v2).fsubtract(v1);
        const v4 = i < len - 2 ? controlPoints[i + 2] : v3.fadd(v3).fsubtract(v2);
        for (let c = 0; c < PathApproximator.CATMULL_DETAIL; c++) {
          output.push(PathApproximator._catmullFindPoint(v1, v2, v3, v4, Math.fround(Math.fround(c) / PathApproximator.CATMULL_DETAIL)));
          output.push(PathApproximator._catmullFindPoint(v1, v2, v3, v4, Math.fround(Math.fround(c + 1) / PathApproximator.CATMULL_DETAIL)));
        }
      }
      return output;
    },

    approximateCircularArc(controlPoints) {
      const pr = PathApproximator._circularArcProperties(controlPoints);
      if (!pr.isValid) return PathApproximator.approximateBezier(controlPoints);

      let amountPoints = 2;
      if (2 * pr.radius > PathApproximator.CIRCULAR_ARC_TOLERANCE) {
        let angle = Math.fround(PathApproximator.CIRCULAR_ARC_TOLERANCE / pr.radius);
        angle = Math.fround(1 - angle);
        angle = Math.fround(2 * Math.fround(Math.acos(angle)));
        const points = Math.ceil(Math.fround(pr.thetaRange / angle));
        const validPoints = !isFinite(points) ? -(2 ** 31) : points;
        amountPoints = Math.max(2, validPoints);
      }

      const output = [];
      for (let i = 0; i < amountPoints; ++i) {
        const fract = i / (amountPoints - 1);
        const theta = pr.thetaStart + pr.direction * fract * pr.thetaRange;
        const vec = new Vector2(Math.fround(Math.cos(theta)), Math.fround(Math.sin(theta)));
        output.push(vec.fscale(pr.radius).fadd(pr.centre));
      }
      return output;
    },

    approximateLinear(controlPoints) {
      return controlPoints.slice();
    },

    _circularArcProperties(controlPoints) {
      const a = controlPoints[0], b = controlPoints[1], c = controlPoints[2];
      const sideLength = Math.fround(
        Math.fround(b.floatY - a.floatY) * Math.fround(c.floatX - a.floatX) -
        Math.fround(b.floatX - a.floatX) * Math.fround(c.floatY - a.floatY)
      );
      if (Math.abs(sideLength) < Math.fround(0.001)) {
        return { isValid: false, thetaStart: 0, thetaRange: 0, direction: 0, radius: 0, centre: new Vector2(0, 0) };
      }
      const d = Math.fround(2 * Math.fround(
        Math.fround(a.floatX * b.fsubtract(c).floatY) +
        Math.fround(b.floatX * c.fsubtract(a).floatY) +
        Math.fround(c.floatX * a.fsubtract(b).floatY)
      ));
      const aSq = Math.fround(Math.fround(a.floatX * a.floatX) + Math.fround(a.floatY * a.floatY));
      const bSq = Math.fround(Math.fround(b.floatX * b.floatX) + Math.fround(b.floatY * b.floatY));
      const cSq = Math.fround(Math.fround(c.floatX * c.floatX) + Math.fround(c.floatY * c.floatY));
      const centre = new Vector2(
        Math.fround(Math.fround(Math.fround(aSq * b.fsubtract(c).floatY) + Math.fround(bSq * c.fsubtract(a).floatY)) + Math.fround(cSq * a.fsubtract(b).floatY)),
        Math.fround(Math.fround(Math.fround(aSq * c.fsubtract(b).floatX) + Math.fround(bSq * a.fsubtract(c).floatX)) + Math.fround(cSq * b.fsubtract(a).floatX))
      ).fdivide(d);
      const dA = a.fsubtract(centre);
      const dC = c.fsubtract(centre);
      const radius = dA.flength();
      const thetaStart = Math.atan2(dA.floatY, dA.floatX);
      let thetaEnd = Math.atan2(dC.floatY, dC.floatX);
      while (thetaEnd < thetaStart) thetaEnd += 2 * Math.PI;
      let direction = 1;
      let thetaRange = thetaEnd - thetaStart;
      let orthoAtoC = c.fsubtract(a);
      orthoAtoC = new Vector2(orthoAtoC.floatY, -orthoAtoC.floatX);
      if (orthoAtoC.fdot(b.fsubtract(a)) < 0) {
        direction = -direction;
        thetaRange = 2 * Math.PI - thetaRange;
      }
      return { isValid: true, thetaStart, thetaRange, direction, radius, centre };
    },

    _bezierIsFlatEnough(controlPoints) {
      for (let i = 1, len = controlPoints.length; i < len - 1; i++) {
        const vec = controlPoints[i - 1].fsubtract(controlPoints[i].fscale(2)).fadd(controlPoints[i + 1]);
        if (vec.flength() ** 2 > PathApproximator.BEZIER_TOLERANCE ** 2 * 4) return false;
      }
      return true;
    },

    _bezierSubdivide(controlPoints, l, r, subdivisionBuffer, count) {
      const midpoints = subdivisionBuffer;
      for (let i = 0; i < count; ++i) midpoints[i] = controlPoints[i];
      for (let i = 0; i < count; ++i) {
        l[i] = midpoints[0];
        r[count - i - 1] = midpoints[count - i - 1];
        for (let j = 0; j < count - i - 1; j++) {
          midpoints[j] = midpoints[j].fadd(midpoints[j + 1]).fdivide(2);
        }
      }
    },

    _bezierApproximate(controlPoints, output, subdivisionBuffer1, subdivisionBuffer2, count) {
      const l = subdivisionBuffer2;
      const r = subdivisionBuffer1;
      PathApproximator._bezierSubdivide(controlPoints, l, r, subdivisionBuffer1, count);
      for (let i = 0; i < count - 1; ++i) l[count + i] = r[i + 1];
      output.push(controlPoints[0]);
      for (let i = 1; i < count - 1; ++i) {
        const index = 2 * i;
        const p = l[index - 1].fadd(l[index].fscale(2)).fadd(l[index + 1]).fscale(Math.fround(0.25));
        output.push(p);
      }
    },

    _catmullFindPoint(vec1, vec2, vec3, vec4, t) {
      const t2 = Math.fround(t * t);
      const t3 = Math.fround(t * t2);
      const coords = [];
      for (let i = 0; i <= 1; ++i) {
        const value1 = i === 0 ? vec1.floatX : vec1.floatY;
        const value2 = i === 0 ? vec2.floatX : vec2.floatY;
        const value3 = i === 0 ? vec3.floatX : vec3.floatY;
        const value4 = i === 0 ? vec4.floatX : vec4.floatY;
        const v1 = Math.fround(2 * value2);
        const v2 = Math.fround(value3 - value1);
        const v31 = Math.fround(2 * value1);
        const v32 = Math.fround(5 * value2);
        const v33 = Math.fround(4 * value3);
        const v41 = Math.fround(3 * value2);
        const v42 = Math.fround(3 * value3);
        const v5 = Math.fround(v2 * t);
        const v61 = Math.fround(v31 - v32);
        const v62 = Math.fround(v61 + v33);
        const v63 = Math.fround(v62 - value4);
        const v6 = Math.fround(v63);
        const v71 = Math.fround(v41 - value1);
        const v72 = Math.fround(v71 - v42);
        const v7 = Math.fround(v72 + value4);
        const v8 = Math.fround(v6 * t2);
        const v9 = Math.fround(v7 * t3);
        const v101 = Math.fround(v1 + v5);
        const v102 = Math.fround(v101 + v8);
        const v10 = Math.fround(v102 + v9);
        coords.push(Math.fround(Math.fround(0.5) * v10));
      }
      return new Vector2(coords[0], coords[1]);
    },
  };

  

  class SliderPath {
    constructor(curveType, controlPoints, expectedDistance) {
      this._curveType = curveType || PathType.Linear;
      this._controlPoints = controlPoints || [];
      this._expectedDistance = expectedDistance || 0;
      this._calculatedLength = 0;
      this._calculatedPath = [];
      this._cumulativeLength = [];
      this._isCached = false;
    }
    get controlPoints() { return this._controlPoints; }
    get expectedDistance() { return this._expectedDistance; }
    get distance() {
      this._ensureValid();
      if (this._cumulativeLength.length) return this._cumulativeLength[this._cumulativeLength.length - 1];
      return 0;
    }
    _ensureValid() {
      if (this._isCached) return;
      this._calculatePath();
      this._calculateLength();
      this._isCached = true;
    }
    _calculatePath() {
      this._calculatedPath = [];
      const len = this.controlPoints.length;
      if (len === 0) return;
      const vertices = [];
      for (let i = 0; i < len; i++) vertices[i] = this.controlPoints[i].position;

      let start = 0;
      for (let i = 0; i < len; ++i) {
        if (!this.controlPoints[i].type && i < len - 1) continue;
        const segmentVertices = vertices.slice(start, i + 1);
        const segmentType = this.controlPoints[start].type || PathType.Linear;
        for (const t of this._calculateSubPath(segmentVertices, segmentType)) {
          const last = this._calculatedPath[this._calculatedPath.length - 1];
          if (this._calculatedPath.length === 0 || !last.equals(t)) {
            this._calculatedPath.push(t);
          }
        }
        start = i;
      }
    }
    _calculateSubPath(subControlPoints, type) {
      switch (type) {
        case PathType.Linear:
          return PathApproximator.approximateLinear(subControlPoints);
        case PathType.PerfectCurve:
          if (subControlPoints.length !== 3) break;
          return PathApproximator.approximateCircularArc(subControlPoints);
        case PathType.Catmull:
          return PathApproximator.approximateCatmull(subControlPoints);
      }
      return PathApproximator.approximateBezier(subControlPoints);
    }
    _calculateLength() {
      this._calculatedLength = 0;
      this._cumulativeLength = [0];
      for (let i = 0, l = this._calculatedPath.length - 1; i < l; ++i) {
        const diff = this._calculatedPath[i + 1].fsubtract(this._calculatedPath[i]);
        this._calculatedLength += diff.flength();
        this._cumulativeLength.push(this._calculatedLength);
      }
      if (this.expectedDistance && this._calculatedLength !== this.expectedDistance) {
        const cps = this.controlPoints;
        const lastPoint = cps[cps.length - 1];
        const preLastPoint = cps[cps.length - 2];
        const pointsAreEqual = cps.length >= 2 && lastPoint.position.equals(preLastPoint.position);

        if (pointsAreEqual && this.expectedDistance > this._calculatedLength) {
          this._cumulativeLength.push(this._calculatedLength);
          return;
        }

        this._cumulativeLength.pop();
        let pathEndIndex = this._calculatedPath.length - 1;

        if (this._calculatedLength > this.expectedDistance) {
          while (
            this._cumulativeLength.length > 0 &&
            this._cumulativeLength[this._cumulativeLength.length - 1] >= this.expectedDistance
          ) {
            this._cumulativeLength.pop();
            this._calculatedPath.splice(pathEndIndex--, 1);
          }
        }

        if (pathEndIndex <= 0) {
          this._cumulativeLength.push(0);
          return;
        }

        const direction = this._calculatedPath[pathEndIndex].fsubtract(this._calculatedPath[pathEndIndex - 1]).fnormalize();
        const distance = Math.fround(this.expectedDistance - this._cumulativeLength[this._cumulativeLength.length - 1]);
        this._calculatedPath[pathEndIndex] = this._calculatedPath[pathEndIndex - 1].fadd(direction.fscale(distance));
        this._cumulativeLength.push(this.expectedDistance);
      }
    }
  }

  

  global.StdToManiaCore = {
    Vector2,
    FastRandom,
    roundToEven,
    clamp,
    clamp01,
    PathType,
    PathPoint,
    PathApproximator,
    SliderPath,
  };
})(typeof window !== 'undefined' ? window : global);
