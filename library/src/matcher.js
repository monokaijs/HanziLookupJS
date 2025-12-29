import CharacterMatch from './characterMatch';
import MatchCollector from './matchCollector';
import CubicCurve2D from './cubicCurve2D';
import { data } from './dataStore';

// Magic constants
export const MAX_CHARACTER_STROKE_COUNT = 48;
export const MAX_CHARACTER_SUB_STROKE_COUNT = 64;
export const DEFAULT_LOOSENESS = 0.15;
export const AVG_SUBSTROKE_LENGTH = 0.33;
export const SKIP_PENALTY_MULTIPLIER = 1.75;
export const CORRECT_NUM_STROKES_BONUS = 0.1;
export const CORRECT_NUM_STROKES_CAP = 10;

export default class Matcher {
  constructor(dataName, looseness) {
    this._looseness = looseness || DEFAULT_LOOSENESS;
    this._repo = data[dataName].chars;
    this._sbin = data[dataName].substrokes;
    this._scoreMatrix = this._buildScoreMatrix();
    this._charsChecked = 0;
    this._subStrokesCompared = 0;

    this.DIRECTION_SCORE_TABLE = null;
    this.LENGTH_SCORE_TABLE = null;
    this.POS_SCORE_TABLE = null;

    // Init score tables
    this._initScoreTables();
  }

  match(analyzedChar, limit, ready) {
    this._doMatch(analyzedChar, limit, ready);
  }

  getCounters() {
    return {
      chars: this._charsChecked,
      subStrokes: this._subStrokesCompared
    };
  }

  _doMatch(inputChar, limit, ready) {
    // Diagnostic counters
    this._charsChecked = 0;
    this._subStrokesCompared = 0;

    // This will gather matches
    // MatchCollector is a function in previous step, so we call it.
    // If I converted it to class, I'd use `new MatchCollector`.
    // Wait, in previous step I converted MatchCollector to `export default function MatchCollector(limit) { ... }`
    // So `new MatchCollector(limit)` works if it returns object? 
    // Yes, a function called with `new` returns the object returned by the function if it returns an object.
    // Wait, `MatchCollector` logic:
    // `return { fileMatch: ..., getMatches: ... };`
    // So `new MatchCollector(limit)` will return that object. Correct.
    var matchCollector = new MatchCollector(limit);

    // Edge case: empty input should return no matches; but permissive lookup does find a few...
    if (inputChar.analyzedStrokes.length == 0)
      return matchCollector.getMatches();

    // Flat format: matching needs this. Only transform once.
    var inputSubStrokes = [];
    for (var i = 0; i != inputChar.analyzedStrokes.length; ++i) {
      var stroke = inputChar.analyzedStrokes[i];
      for (var j = 0; j != stroke.subStrokes.length; ++j) {
        inputSubStrokes.push(stroke.subStrokes[j]);
      }
    }

    // Some pre-computed looseness magic
    var strokeCount = inputChar.analyzedStrokes.length;
    var subStrokeCount = inputChar.subStrokeCount;

    var strokeRange = this._getStrokesRange(strokeCount);
    var minimumStrokes = Math.max(strokeCount - strokeRange, 1);
    var maximumStrokes = Math.min(strokeCount + strokeRange, MAX_CHARACTER_STROKE_COUNT);

    var subStrokesRange = this._getSubStrokesRange(subStrokeCount);
    var minSubStrokes = Math.max(subStrokeCount - subStrokesRange, 1);
    var maxSubStrokes = Math.min(subStrokeCount + subStrokesRange, MAX_CHARACTER_SUB_STROKE_COUNT);

    // Iterate over all characters in repo
    for (var cix = 0; cix != this._repo.length; ++cix) {
      var repoChar = this._repo[cix];
      var cmpStrokeCount = repoChar[1];
      var cmpSubStrokes = repoChar[2];
      if (cmpStrokeCount < minimumStrokes || cmpStrokeCount > maximumStrokes) continue;
      if (cmpSubStrokes.length < minSubStrokes || cmpSubStrokes.length > maxSubStrokes) continue;
      // Match against character in repo
      var match = this._matchOne(strokeCount, inputSubStrokes, subStrokesRange, repoChar);
      // File; collector takes care of comparisons and keeping N-best
      matchCollector.fileMatch(match);
    }
    // When done: just return collected matches
    // This is an array of CharacterMatch objects
    ready(matchCollector.getMatches());
  }

  _getStrokesRange(strokeCount) {
    if (this._looseness == 0) return 0;
    if (this._looseness == 1) return MAX_CHARACTER_STROKE_COUNT;

    var ctrl1X = 0.35;
    var ctrl1Y = strokeCount * 0.4;
    var ctrl2X = 0.6;
    var ctrl2Y = strokeCount;
    // CubicCurve2D is function returning object, or I should treat it as constructor?
    // In previous step: `export default function CubicCurve2D(...) { ... return { ... } }`
    // So `new CubicCurve2D(...)` returns the object.
    var curve = new CubicCurve2D(0, 0, ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, 1, MAX_CHARACTER_STROKE_COUNT);
    var t = curve.getFirstSolutionForX(this._looseness);
    return Math.round(curve.getYOnCurve(t));
  }

  _getSubStrokesRange(subStrokeCount) {
    if (this._looseness == 1.0) return MAX_CHARACTER_SUB_STROKE_COUNT;
    var y0 = subStrokeCount * 0.25;
    var ctrl1X = 0.4;
    var ctrl1Y = 1.5 * y0;
    var ctrl2X = 0.75;
    var ctrl2Y = 1.5 * ctrl1Y;
    var curve = new CubicCurve2D(0, y0, ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, 1, MAX_CHARACTER_SUB_STROKE_COUNT);
    var t = curve.getFirstSolutionForX(this._looseness);
    return Math.round(curve.getYOnCurve(t));
  }

  _buildScoreMatrix() {
    var dim = MAX_CHARACTER_SUB_STROKE_COUNT + 1;
    var res = [];
    for (var i = 0; i < dim; i++) {
      res.push([]);
      for (var j = 0; j < dim; j++) res[i].push(0);
    }
    for (var i = 0; i < dim; i++) {
      var penalty = -AVG_SUBSTROKE_LENGTH * SKIP_PENALTY_MULTIPLIER * i;
      res[i][0] = penalty;
      res[0][i] = penalty;
    }
    return res;
  }

  _matchOne(inputStrokeCount, inputSubStrokes, subStrokesRange, repoChar) {
    ++this._charsChecked;
    var score = this._computeMatchScore(inputStrokeCount, inputSubStrokes, subStrokesRange, repoChar);
    if (inputStrokeCount == repoChar[1] && inputStrokeCount < CORRECT_NUM_STROKES_CAP) {
      var bonus = CORRECT_NUM_STROKES_BONUS * Math.max(CORRECT_NUM_STROKES_CAP - inputStrokeCount, 0) / CORRECT_NUM_STROKES_CAP;
      score += bonus * score;
    }
    // CharacterMatch is class
    return new CharacterMatch(repoChar[0], score);
  }

  _computeMatchScore(strokeCount, inputSubStrokes, subStrokesRange, repoChar) {
    for (var x = 0; x < inputSubStrokes.length; x++) {
      var inputDirection = inputSubStrokes[x].direction;
      var inputLength = inputSubStrokes[x].length;
      var inputCenter = [inputSubStrokes[x].centerX, inputSubStrokes[x].centerY];
      for (var y = 0; y < repoChar[2]; y++) {
        var newScore = Number.NEGATIVE_INFINITY;
        if (Math.abs(x - y) <= subStrokesRange) {
          var compareDirection = this._sbin[repoChar[3] + y * 3];
          var compareLength = this._sbin[repoChar[3] + y * 3 + 1];
          var compareCenter = null;
          var bCenter = this._sbin[repoChar[3] + y * 3 + 2];
          if (bCenter > 0) compareCenter = [(bCenter & 0xf0) >>> 4, bCenter & 0x0f];

          var skip1Score = this._scoreMatrix[x][y + 1] - (inputLength / 256 * SKIP_PENALTY_MULTIPLIER);
          var skip2Score = this._scoreMatrix[x + 1][y] - (compareLength / 256 * SKIP_PENALTY_MULTIPLIER);
          var skipScore = Math.max(skip1Score, skip2Score);

          var matchScore = this._computeSubStrokeScore(inputDirection, inputLength, compareDirection, compareLength, inputCenter, compareCenter);
          var previousScore = this._scoreMatrix[x][y];
          newScore = Math.max(previousScore + matchScore, skipScore);
        }
        this._scoreMatrix[x + 1][y + 1] = newScore;
      }
    }
    return this._scoreMatrix[inputSubStrokes.length][repoChar[2]];
  }

  _computeSubStrokeScore(inputDir, inputLen, repoDir, repoLen, inputCenter, repoCenter) {
    ++this._subStrokesCompared;
    var directionScore = this._getDirectionScore(inputDir, repoDir, inputLen);
    var lengthScore = this._getLengthScore(inputLen, repoLen);
    var score = lengthScore * directionScore;

    if (repoCenter) {
      var dx = inputCenter[0] - repoCenter[0];
      var dy = inputCenter[1] - repoCenter[1];
      var closeness = this.POS_SCORE_TABLE[dx * dx + dy * dy];
      if (score > 0) score *= closeness;
      else score /= closeness;
    }
    return score;
  }

  _initScoreTables() {
    var dirCurve = new CubicCurve2D(0, 1.0, 0.5, 1.0, 0.25, -2.0, 1.0, 1.0);
    this.DIRECTION_SCORE_TABLE = this._initCubicCurveScoreTable(dirCurve, 256);

    var lenCurve = new CubicCurve2D(0, 0, 0.25, 1.0, 0.75, 1.0, 1.0, 1.0);
    this.LENGTH_SCORE_TABLE = this._initCubicCurveScoreTable(lenCurve, 129);

    this.POS_SCORE_TABLE = [];
    for (var i = 0; i <= 450; ++i) {
      this.POS_SCORE_TABLE.push(1 - Math.sqrt(i) / 22);
    }
  }

  _initCubicCurveScoreTable(curve, numSamples) {
    var x1 = curve.x1();
    var x2 = curve.x2();
    var range = x2 - x1;
    var x = x1;
    var xInc = range / numSamples;
    var scoreTable = [];
    for (var i = 0; i < numSamples; i++) {
      // Curve object returned by CubicCurve2D(...) has getFirstSolutionForX etc.
      var t = curve.getFirstSolutionForX(Math.min(x, x2));
      scoreTable.push(curve.getYOnCurve(t));
      x += xInc;
    }
    return scoreTable;
  }

  _getDirectionScore(direction1, direction2, inputLength) {
    var theta = Math.abs(direction1 - direction2);
    var directionScore = this.DIRECTION_SCORE_TABLE[theta];
    if (inputLength < 64) {
      var shortLengthBonusMax = Math.min(1.0, 1.0 - directionScore);
      var shortLengthBonus = shortLengthBonusMax * (1 - (inputLength / 64));
      directionScore += shortLengthBonus;
    }
    return directionScore;
  }

  _getLengthScore(length1, length2) {
    var ratio;
    if (length1 > length2) ratio = Math.round((length2 << 7) / length1);
    else ratio = Math.round((length1 << 7) / length2);
    return this.LENGTH_SCORE_TABLE[ratio];
  }
}
