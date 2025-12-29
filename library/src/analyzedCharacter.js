import SubStroke from './subStroke';
import AnalyzedStroke from './analyzedStroke';

const MIN_SEGMENT_LENGTH = 12.5;
const MAX_LOCAL_LENGTH_RATIO = 1.1;
const MAX_RUNNING_LENGTH_RATIO = 1.09;

// Gets distance between two points
function dist(a, b) {
  var dx = a[0] - b[0];
  var dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Gets direction, in radians, from point a to b
function dir(a, b) {
  var dx = a[0] - b[0];
  var dy = a[1] - b[1];
  var dir = Math.atan2(dy, dx);
  return Math.PI - dir;
}

export default class AnalyzedCharacter {
  constructor(rawStrokes) {
    this._top = Number.MAX_SAFE_INTEGER;
    this._bottom = Number.MIN_SAFE_INTEGER;
    this._left = Number.MAX_SAFE_INTEGER;
    this._right = Number.MIN_SAFE_INTEGER;

    this._analyzedStrokes = [];
    this._subStrokeCount = 0;

    // Calculate bounding rectangle
    this._getBoundingRect(rawStrokes);
    // Build analyzed strokes
    this._buildAnalyzedStrokes(rawStrokes);

    // Result
    this.top = this._top <= 256 ? this._top : 0;
    this.bottom = this._bottom >= 0 ? this._bottom : 256;
    this.left = this._left <= 256 ? this._left : 0;
    this.right = this._right >= 0 ? this._right : 256;
    this.analyzedStrokes = this._analyzedStrokes;
    this.subStrokeCount = this._subStrokeCount;
  }

  _getBoundingRect(rawStrokes) {
    for (var i = 0; i != rawStrokes.length; ++i) {
      for (var j = 0; j != rawStrokes[i].length; ++j) {
        var pt = rawStrokes[i][j];
        if (pt[0] < this._left) this._left = pt[0];
        if (pt[0] > this._right) this._right = pt[0];
        if (pt[1] < this._top) this._top = pt[1];
        if (pt[1] > this._bottom) this._bottom = pt[1];
      }
    }
  }

  _normDist(a, b) {
    var width = this._right - this._left;
    var height = this._bottom - this._top;
    var dimensionSquared = width > height ? width * width : height * height;
    var normalizer = Math.sqrt(dimensionSquared + dimensionSquared);
    var distanceNormalized = dist(a, b) / normalizer;
    return Math.min(distanceNormalized, 1);
  }

  _getPivotIndexes(points) {
    var markers = [];
    for (var i = 0; i != points.length; ++i) markers.push(false);

    var prevPtIx = 0;
    var firstPtIx = 0;
    var pivotPtIx = 1;

    markers[0] = true;

    var localLength = dist(points[firstPtIx], points[pivotPtIx]);
    var runningLength = localLength;

    for (var i = 2; i < points.length; ++i) {
      var nextPoint = points[i];
      var pivotLength = dist(points[pivotPtIx], nextPoint);
      localLength += pivotLength;
      runningLength += pivotLength;

      var distFromPrevious = dist(points[prevPtIx], nextPoint);
      var distFromFirst = dist(points[firstPtIx], nextPoint);
      if (localLength > MAX_LOCAL_LENGTH_RATIO * distFromPrevious ||
        runningLength > MAX_RUNNING_LENGTH_RATIO * distFromFirst) {
        if (markers[prevPtIx] && dist(points[prevPtIx], points[pivotPtIx]) < MIN_SEGMENT_LENGTH) {
          markers[prevPtIx] = false;
        }
        markers[pivotPtIx] = true;
        runningLength = pivotLength;
        firstPtIx = pivotPtIx;
      }
      localLength = pivotLength;
      prevPtIx = pivotPtIx;
      pivotPtIx = i;
    }

    markers[pivotPtIx] = true;
    if (markers[prevPtIx] && dist(points[prevPtIx], points[pivotPtIx]) < MIN_SEGMENT_LENGTH && prevPtIx != 0) {
      markers[prevPtIx] = false;
    }

    var res = [];
    for (var i = 0; i != markers.length; ++i) {
      if (markers[i]) res.push(i);
    }
    return res;
  }

  _getNormCenter(a, b) {
    var x = (a[0] + b[0]) / 2;
    var y = (a[1] + b[1]) / 2;
    var side;
    if (this._right - this._left > this._bottom - this._top) {
      side = this._right - this._left;
      var height = this._bottom - this._top;
      x = x - this._left;
      y = y - this._top + (side - height) / 2;
    }
    else {
      side = this._bottom - this._top;
      var width = this._right - this._left;
      x = x - this._left + (side - width) / 2;
      y = y - this._top;
    }
    return [x / side, y / side];
  }

  _buildSubStrokes(points, pivotIndexes) {
    var res = [];
    var prevIx = 0;
    for (var i = 0; i != pivotIndexes.length; ++i) {
      var ix = pivotIndexes[i];
      if (ix == prevIx) continue;
      var direction = dir(points[prevIx], points[ix]);
      direction = Math.round(direction * 256.0 / Math.PI / 2.0);
      if (direction == 256) direction = 0;
      var normLength = this._normDist(points[prevIx], points[ix]);
      normLength = Math.round(normLength * 255);
      var center = this._getNormCenter(points[prevIx], points[ix]);
      center[0] = Math.round(center[0] * 15);
      center[1] = Math.round(center[1] * 15);
      res.push(new SubStroke(direction, normLength, center[0], center[1]));
      prevIx = ix;
    }
    return res;
  }

  _buildAnalyzedStrokes(rawStrokes) {
    for (var i = 0; i != rawStrokes.length; ++i) {
      var pivotIndexes = this._getPivotIndexes(rawStrokes[i]);
      var subStrokes = this._buildSubStrokes(rawStrokes[i], pivotIndexes);
      this._subStrokeCount += subStrokes.length;
      this._analyzedStrokes.push(new AnalyzedStroke(rawStrokes[i], pivotIndexes, subStrokes));
    }
  }
}
