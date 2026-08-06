/**
 * Product Matcher — Step 6
 *
 * Matches a parsed grocery line against the product database.
 *
 * Matching strategy — 3 tiers (in priority order):
 *
 *  Tier 1 — Name + MRP exact:
 *    When a MRP×Qty pattern ("Butter Bite 10×10") is detected,
 *    first try to find a product where name ≈ "Butter Bite" AND mrp = 10.
 *    This is the most precise match — confidence boosted to min(1, nameScore + 0.25).
 *
 *  Tier 2 — Name + Unit exact:
 *    If a unit is provided (e.g. "चना 10 kg"), among fuzzy name matches
 *    prefer the one whose DB unit matches the scanned unit.
 *    Confidence boosted by +0.10.
 *
 *  Tier 3 — Name only (fuzzy fallback):
 *    Standard Fuse.js fuzzy match. Used when no MRP or unit hint is available.
 *    If Tier 1 was attempted but failed (MRP mismatch), confidence is penalised × 0.75.
 *
 * Product cache refreshes every 5 minutes to pick up admin edits.
 */

const Fuse = require('fuse.js');
const Product = require('../../models/Product');

let productCache  = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

/** Load products from DB with in-memory cache (includes mrp + unit now) */
async function getProducts() {
  const now = Date.now();
  if (productCache.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return productCache;
  }
  // Include mrp, unit, quality and packetSize so the matcher can filter on them
  productCache = await Product
    .find({}, 'name unit mrp priceRetail priceWholesale pricePurchase quality packetSize _id')
    .lean();
  cacheTimestamp = now;
  console.log(`Product cache refreshed: ${productCache.length} products`);
  return productCache;
}

/** Force-clear the cache (call after admin adds/edits products) */
function invalidateCache() {
  productCache  = [];
  cacheTimestamp = 0;
}

/**
 * Compares product packet sizes robustly, stripping spaces and units.
 */
function matchPacketSize(dbSize, hintSize) {
  if (!dbSize || !hintSize) return false;
  const dbClean = dbSize.toString().toLowerCase().replace(/\s+/g, '');
  const hintClean = hintSize.toString().toLowerCase().replace(/\s+/g, '');
  if (dbClean === hintClean) return true;
  
  // Strip units (gm, g, kg, ml, ltr, litre, liter) and compare numbers
  const dbNum = dbClean.replace(/(gm|g|kg|ml|ltr|litre|liter)/g, '');
  const hintNum = hintClean.replace(/(gm|g|kg|ml|ltr|litre|liter)/g, '');
  return dbNum === hintNum && dbNum !== '';
}

/**
 * Helper to compare units.
 */
function isUnitMatch(dbUnit, hintUnit) {
  if (!dbUnit || !hintUnit) return false;
  return dbUnit.toLowerCase().trim() === hintUnit.toLowerCase().trim();
}

/**
 * Sorts fuzzy search result candidates based on quality and unit hints.
 */
function sortCandidates(candidates, hints = {}) {
  const { unit = null, quality = null } = hints;
  const targetQuality = (quality || '').toUpperCase().trim();

  return candidates.sort((a, b) => {
    // 1. Sort by Quality match (highest priority)
    const aQual = (a.item.quality || '').toUpperCase().trim();
    const bQual = (b.item.quality || '').toUpperCase().trim();
    const aQualMatch = aQual === targetQuality;
    const bQualMatch = bQual === targetQuality;
    if (aQualMatch && !bQualMatch) return -1;
    if (!aQualMatch && bQualMatch) return 1;

    // 2. Sort by Unit match / Bulk unit demotion
    if (unit) {
      const aUnitMatch = isUnitMatch(a.item.unit, unit);
      const bUnitMatch = isUnitMatch(b.item.unit, unit);
      if (aUnitMatch && !bUnitMatch) return -1;
      if (!aUnitMatch && bUnitMatch) return 1;
    } else {
      const BULK_UNITS = ['katta', 'box', 'carton', 'bag', 'tin', 'teen'];
      const aIsBulk = BULK_UNITS.includes((a.item.unit || '').toLowerCase());
      const bIsBulk = BULK_UNITS.includes((b.item.unit || '').toLowerCase());
      if (aIsBulk && !bIsBulk) return 1;
      if (!aIsBulk && bIsBulk) return -1;
    }

    return 0;
  });
}

/**
 * Match a single parsed line against the product DB.
 *
 * @param {string} itemName  - extracted item name (Hindi or English)
 * @param {object} hints     - { mrp?: number|null, unit?: string, packetSize?: string|null, quality?: string|null }
 * @returns {{ product, confidence, matchedBy, alternatives } | null}
 */
async function matchProduct(itemName, hints = {}) {
  if (!itemName || !itemName.trim()) return null;

  const products = await getProducts();
  if (products.length === 0) return null;

  const { mrp = null, unit = null, packetSize = null, quality = null } = hints;

  // ── Prioritize exact name matches (case-insensitive) ────────────────────
  const exactMatches = products.filter(p => p.name.toLowerCase() === itemName.trim().toLowerCase());
  
  let nameResults = [];
  if (exactMatches.length > 0) {
    nameResults = exactMatches.map(p => ({ item: p, score: 0 }));
  } else {
    // Build Fuse index over all products
    const fuse = new Fuse(products, {
      keys: ['name'],
      threshold: 0.45,
      ignoreLocation: true,
      minMatchCharLength: 2,
      includeScore: true,
    });
    nameResults = fuse.search(itemName.trim());
  }

  // ── Tier 1: Name + MRP exact filter ─────────────────────────────────────
  // Only applies when the scanned line had the "10×10" MRP×Qty pattern.
  if (mrp !== null && mrp > 0) {
    // Accept any candidate with at least 30% name similarity
    const candidates = nameResults.filter(r => (1 - (r.score || 0)) >= 0.30);
    const mrpMatches = candidates.filter(r => r.item.mrp === mrp);

    if (mrpMatches.length > 0) {
      sortCandidates(mrpMatches, { unit, quality });

      const best = mrpMatches[0];
      const nameConf = 1 - (best.score || 0);
      const confidence = parseFloat(Math.min(1, nameConf + 0.25).toFixed(3));

      console.log(`  Tier1 (name+mrp): "${itemName}" + mrp=${mrp} → "${best.item.name}" conf=${confidence}`);
      return {
        product:    best.item,
        confidence,
        matchedBy:  'name+mrp',
        mrpMatched: true,
        alternatives: mrpMatches.slice(1, 3).map(r => ({
          product:    r.item,
          confidence: parseFloat(Math.min(1, 1 - (r.score || 0) + 0.25).toFixed(3)),
        })),
      };
    }

    // MRP provided but no DB product has that MRP → fall through with penalty
    if (nameResults.length > 0) {
      const best = nameResults[0];
      // Penalise: name matched but MRP didn't match any product
      const confidence = parseFloat(((1 - (best.score || 0)) * 0.75).toFixed(3));
      console.log(`  Tier1 MISS (mrp=${mrp} not in DB): "${itemName}" → "${best.item.name}" conf=${confidence} (penalised)`);
      return {
        product:    best.item,
        confidence,
        matchedBy:  'name-only (mrp mismatch)',
        mrpMatched: false,
        alternatives: nameResults.slice(1, 3).map(r => ({
          product:    r.item,
          confidence: parseFloat(((1 - (r.score || 0)) * 0.75).toFixed(3)),
        })),
      };
    }
    return null;
  }

  // ── Tier 1.5: Name + Packet Size exact filter ───────────────────────────
  if (packetSize !== null) {
    const candidates = nameResults.filter(r => (1 - (r.score || 0)) >= 0.30);
    const sizeMatches = candidates.filter(r => matchPacketSize(r.item.packetSize, packetSize));

    if (sizeMatches.length > 0) {
      sortCandidates(sizeMatches, { unit, quality });

      const best = sizeMatches[0];
      const nameConf = 1 - (best.score || 0);
      const confidence = parseFloat(Math.min(1, nameConf + 0.25).toFixed(3));

      console.log(`  Tier1.5 (name+packetSize): "${itemName}" + packetSize=${packetSize} → "${best.item.name}" conf=${confidence}`);
      return {
        product:    best.item,
        confidence,
        matchedBy:  'name+packetSize',
        alternatives: sizeMatches.slice(1, 3).map(r => ({
          product:    r.item,
          confidence: parseFloat(Math.min(1, 1 - (r.score || 0) + 0.25).toFixed(3)),
        })),
      };
    }
  }

  // ── Tier 2: Name + Unit preference ──────────────────────────────────────
  // When a unit is scanned, prefer DB products with a matching unit.
  if (nameResults.length > 0) {
    if (unit) {
      const unitMatches = nameResults.filter(r =>
        isUnitMatch(r.item.unit, unit)
      );

      if (unitMatches.length > 0) {
        sortCandidates(unitMatches, { unit, quality });
        const best = unitMatches[0];
        const confidence = parseFloat(
          Math.min(1, 1 - (best.score || 0) + 0.10).toFixed(3)
        );
        console.log(`  Tier2 (name+unit): "${itemName}" + unit=${unit} → "${best.item.name}" conf=${confidence}`);
        return {
          product:    best.item,
          confidence,
          matchedBy:  'name+unit',
          alternatives: unitMatches.slice(1, 3).map(r => ({
            product:    r.item,
            confidence: parseFloat(Math.min(1, 1 - (r.score || 0) + 0.10).toFixed(3)),
          })),
        };
      }
    }

    // ── Tier 3: Name-only fuzzy fallback ──────────────────────────────────
    let candidates = [...nameResults];
    sortCandidates(candidates, { unit, quality });

    const best = candidates[0];
    const confidence = parseFloat((1 - (best.score || 0)).toFixed(3));
    console.log(`  Tier3 (name-only): "${itemName}" → "${best.item.name}" conf=${confidence}`);
    return {
      product:    best.item,
      confidence,
      matchedBy:  'name-only',
      alternatives: candidates.slice(1, 3).map(r => ({
        product:    r.item,
        confidence: parseFloat((1 - (r.score || 0)).toFixed(3)),
      })),
    };
  }

  return null; // no match at all
}

module.exports = { matchProduct, invalidateCache };
