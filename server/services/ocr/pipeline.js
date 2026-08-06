/**
 * OCR Pipeline Orchestrator — Main entry point for list scanning
 *
 * Executes all 9 stages in order for each item on the list:
 *
 *   1. Preprocess image  (sharp: grayscale, contrast, sharpen)
 *   2. Transcribe        (Gemini 1.5 Flash → JSON lines, falls back to Cloud Vision)
 *   3. Normalize         (unit variants → standard forms, × symbol)
 *   4. Parse             (deterministic retail grammar → structured object)
 *   5. Match product     (name fuzzy + MRP/unit hints — 3-tier strategy)
 *   6. Business rules    (qty sanity, unit domain checks, MRP validation)
 *   7. Confidence score  (0–1 score + status: high / medium / low)
 *
 * Returns structured JSON consumed directly by the frontend.
 */

const { preprocessImage }       = require('./preprocessImage');
const { callGeminiVision, callGPT4oVision } = require('./geminiVision');
const { normalizeText }          = require('./normalizer');
const { expandAbbreviations }    = require('./abbreviationExpander');
const { parseLine }              = require('./retailParser');
const { matchProduct }           = require('./productMatcher');
const { applyBusinessRules }     = require('./businessRules');
const { scoreItem }              = require('./confidenceScorer');

/**
 * @param {string} base64Image  - raw base64 (may be data URL or plain base64)
 * @param {object} keys         - { geminiKey, visionKey }
 * @returns {Promise<{ success, items, transcriptionSource }>}
 */
async function runOCRPipeline(base64Image, keys) {
  const { geminiKey, openaiKey } = keys;

  // ── Step 1: Image preprocessing ──────────────────────────────────────────
  console.log('[Pipeline] Step 1: Preprocessing image...');
  const processedBase64 = await preprocessImage(base64Image);

  // ── Step 2: Transcription ─────────────────────────────────────────────────
  let transcribedLines = [];
  let transcriptionSource = 'none';

  // Try Gemini first (if key available)
  if (geminiKey) {
    try {
      console.log('[Pipeline] Step 2: Calling Gemini Vision...');
      transcribedLines = await callGeminiVision(processedBase64, geminiKey);
      transcriptionSource = 'gemini';
      console.log(`[Pipeline] Gemini returned ${transcribedLines.length} lines`);
    } catch (err) {
      console.warn('[Pipeline] Gemini failed, falling back to Cloud Vision:', err.message);
    }
  }

  // Fallback to GPT-4o-mini if Gemini failed or returned nothing
  if (transcribedLines.length === 0 && openaiKey) {
    try {
      console.log('[Pipeline] Step 2 (fallback): Calling GPT-4o-mini Vision...');
      transcribedLines = await callGPT4oVision(processedBase64, openaiKey);
      transcriptionSource = 'gpt-4o-mini';
      console.log(`[Pipeline] GPT-4o-mini returned ${transcribedLines.length} lines`);
    } catch (err) {
      console.error('[Pipeline] GPT-4o-mini also failed:', err.message);
      return { success: false, message: 'Both Gemini and GPT-4o-mini failed: ' + err.message };
    }
  }

  if (transcribedLines.length === 0) {
    return { success: true, items: [], transcriptionSource, message: 'No text found in image' };
  }

  // ── Steps 3–7: Process each line ─────────────────────────────────────────
  console.log(`[Pipeline] Processing ${transcribedLines.length} transcribed lines...`);
  const items = [];

  for (const { line, text } of transcribedLines) {
    if (!text || !text.trim()) continue;

    // Step 3: Normalize
    const normalized = normalizeText(text);

    // Step 3.5: Expand abbreviations (c.p → Clinic Plus, s.t → Sarso Tel)
    const expanded = await expandAbbreviations(normalized);

    // Step 4: Parse
    const parsed = parseLine(expanded);
    if (!parsed) {
      console.log(`[Pipeline] Line ${line}: skipped (no parseable content) — "${text}"`);
      continue;
    }

    // Step 5: Match product
    // Pass mrp + unit + packetSize + quality as hints so the matcher can apply Tier 1 (name+MRP),
    // Tier 1.5 (name+packetSize) and Tier 2 (name+unit) strategies before falling back to name-only.
    const matchResult = await matchProduct(parsed.item, {
      mrp:  parsed.mrp  || null,
      unit: parsed.unit || null,
      packetSize: parsed.packetSize || null,
      quality: parsed.quality || null,
    });

    // Step 6: Business rules
    const warnings = applyBusinessRules(parsed, matchResult?.product || null);

    // Step 7: Confidence score
    const { score, status } = scoreItem({ matchResult, parsed, warnings });

    console.log(
      `[Pipeline] Line ${line}: "${parsed.item}" → ${matchResult?.product?.name || 'NO MATCH'} ` +
      `(conf:${score} status:${status} by:${matchResult?.matchedBy || 'none'} pattern:${parsed.pattern})`
    );

    items.push({
      line,
      raw: text,
      normalized: expanded,   // post-abbreviation-expansion text
      parsed,                          // { item, qty, unit, mrp?, packaging?, pattern }
      matched: matchResult ? {
        product:      matchResult.product,
        confidence:   matchResult.confidence,
        alternatives: matchResult.alternatives,
      } : null,
      warnings,
      confidence: score,
      status,                          // 'high' | 'medium' | 'low'
    });
  }

  console.log(`[Pipeline] Done: ${items.length} items (${transcriptionSource})`);
  return { success: true, items, transcriptionSource };
}

module.exports = { runOCRPipeline };
