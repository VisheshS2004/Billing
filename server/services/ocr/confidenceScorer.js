/**
 * Confidence Scorer — Step 9
 *
 * Produces a 0–1 confidence score for each processed line.
 * Every stage in the pipeline contributes to the final score.
 *
 * Scoring factors:
 *   - Product match confidence (Fuse.js score)    → weight 0.55
 *   - Parse quality (pattern type)                → weight 0.25
 *   - Business rule warnings                      → −0.12 each
 *
 * Thresholds:
 *   high   ≥ 0.72  → bill immediately
 *   medium ≥ 0.45  → show with ⚠️ warning to user
 *   low    < 0.45  → flag for review / optional rescan
 */

const HIGH_THRESHOLD   = 0.72;
const MEDIUM_THRESHOLD = 0.45;

// Score contribution by parse pattern
const PATTERN_SCORES = {
  'mrp×qty':              1.00,   // very explicit — high confidence
  'item+qty+unit':        0.95,
  'item+qty+packaging':   0.90,
  'item+qty':             0.80,
  'item-only':            0.55,   // no quantity found
};

/**
 * @param {object} opts
 * @param {object|null} opts.matchResult   - output of productMatcher
 * @param {object}      opts.parsed        - output of retailParser
 * @param {string[]}    opts.warnings      - output of businessRules
 * @returns {{ score: number, status: 'high'|'medium'|'low' }}
 */
function scoreItem({ matchResult, parsed, warnings }) {
  // Base: product match confidence (0 if no match)
  const matchScore   = matchResult ? matchResult.confidence : 0;

  // Parse quality
  const patternScore = PATTERN_SCORES[parsed.pattern] || 0.5;

  // Weighted combination
  let score = (matchScore * 0.55) + (patternScore * 0.25) + 0.20;
  // ^ The 0.20 is a base "it was transcribed" contribution

  // Deduct for each business rule warning
  score -= warnings.length * 0.12;

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));
  score = Math.round(score * 100) / 100;

  const status =
    score >= HIGH_THRESHOLD   ? 'high'   :
    score >= MEDIUM_THRESHOLD ? 'medium' : 'low';

  return { score, status };
}

module.exports = { scoreItem };
