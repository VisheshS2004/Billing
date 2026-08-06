/**
 * Abbreviation Expander — Pipeline Step 3.5
 * Runs AFTER normalizeText() and BEFORE parseLine().
 *
 * Supports both single-word and multi-word abbreviations:
 *   "c.p"          → "Clinic Plus"
 *   "C.P"          → "Clinic Plus"   (case-insensitive for Latin)
 *   "cp"           → "Clinic Plus"   (dots stripped)
 *   "MDH मसाला"   → "MDH मसाला गरम" (multi-word, phrase match)
 *   "पंजाबी तड़का"  → "पंजाबी तड़का मसाला" (multi-word Hindi phrase)
 *
 * Two-phase matching:
 *   Phase 1 — Phrase-level: multi-word keys matched longest-first (greedy).
 *   Phase 2 — Token-level:  single-word keys matched token by token.
 *
 * Example:
 *   Input:  "MDH मसाला 5×10"
 *   Output: "MDH गरम मसाला 5×10"
 */

const Abbreviation = require('../../models/Abbreviation');

let abbrCache      = null;   // Map<string, string>
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAbbreviations() {
  const now = Date.now();
  if (abbrCache && now - cacheTimestamp < CACHE_TTL_MS) return abbrCache;

  const docs = await Abbreviation.find({}).lean();
  abbrCache = new Map();

  for (const d of docs) {
    // Normalize Unicode to NFC so Hindi characters match perfectly
    // (handles precomposed vs decomposed variants of characters like 'ड़')
    const abbr     = d.abbr.normalize('NFC');
    const fullName = d.fullName.normalize('NFC');

    // 1. Exact key (handles Hindi / Devanagari as-is)
    abbrCache.set(abbr, fullName);

    // 2. Lowercase variant (handles English case-insensitively)
    const lower = abbr.toLowerCase();
    if (lower !== abbr) abbrCache.set(lower, fullName);

    // 3. Dot-stripped variants (handles "c.p" → "cp")
    const noDots = abbr.replace(/\./g, '');
    if (noDots !== abbr) {
      abbrCache.set(noDots, fullName);
      const noDotsLower = noDots.toLowerCase();
      if (noDotsLower !== noDots) abbrCache.set(noDotsLower, fullName);
    }
  }

  cacheTimestamp = now;
  console.log(`[AbbrvExpander] Cache loaded: ${docs.length} abbreviation(s)`);
  return abbrCache;
}

/** Force refresh — called immediately after admin create/update/delete */
function invalidateAbbrCache() {
  abbrCache      = null;
  cacheTimestamp = 0;
  console.log('[AbbrvExpander] Cache invalidated — next scan will reload');
}

/**
 * Escape a string for use as a literal in a RegExp.
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Expand any abbreviation tokens in a normalized line.
 *
 * @param {string} text  - already normalised line text
 * @returns {string}     - text with abbreviations expanded
 */
async function expandAbbreviations(text) {
  if (!text || !text.trim()) return text;

  const map = await loadAbbreviations();
  if (map.size === 0) return text;

  let s = text;

  // ── Phase 1: phrase-level matching (multi-word abbreviations) ─────────────
  // Sort by descending key length so longer/more-specific phrases match first.
  // e.g. "पंजाबी तड़का" must be tried before "पंजाबी".
  const multiWordKeys = [...map.keys()]
    .filter(k => /\s/.test(k))
    .sort((a, b) => b.length - a.length);

  for (const key of multiWordKeys) {
    const fullName = map.get(key);
    const escaped  = escapeRegExp(key);
    // Match the phrase at word boundaries (start/end of string or whitespace / punctuation)
    const re = new RegExp(
      `(^|(?<=[\\s,./×]))${escaped}(?=[\\s,./×]|$)`,
      'gi'   // case-insensitive covers Latin; Devanagari has no case so it's a no-op
    );
    if (re.test(s)) {
      console.log(`  [Abbr phrase] "${key}" → "${fullName}"`);
      s = s.replace(re, fullName);
    }
  }

  // ── Phase 2: token-level matching (single-word abbreviations) ─────────────
  const tokens  = s.split(/(\s+)/);   // split preserving whitespace tokens
  const expanded = tokens.map(token => {
    // Exact match — covers Hindi / Devanagari keys as stored
    if (map.has(token)) {
      console.log(`  [Abbr token-exact] "${token}" → "${map.get(token)}"`);
      return map.get(token);
    }
    // Lowercase match — covers English keys case-insensitively
    const lower = token.toLowerCase();
    if (map.has(lower)) {
      console.log(`  [Abbr token-lower] "${token}" → "${map.get(lower)}"`);
      return map.get(lower);
    }
    return token;
  });

  return expanded.join('');
}

module.exports = { expandAbbreviations, invalidateAbbrCache };
