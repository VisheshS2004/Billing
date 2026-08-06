/**
 * Retail Parser — Step 5
 *
 * Deterministic parser that converts one normalised grocery line
 * into structured data. No AI — pure regex + grammar rules.
 *
 * Supported patterns (priority order):
 *
 *  P1: MRP×Qty [Packaging]
 *      "Butter Bite 10×10 Petty"  → {item, mrp:10, qty:10, packaging:"petty"}
 *      "Parle G 5×10"             → {item, mrp:5, qty:10}
 *
 *  P2: Item + Qty + Unit
 *      "चना 10 kg"               → {item, qty:10, unit:"kg"}
 *      "masala 5kg"               → {item, qty:5, unit:"kg"}
 *
 *  P3: Item + Qty (no unit)
 *      "दाल 5"                   → {item, qty:5, unit:""}
 *      "Sugar 2"                  → {item, qty:2}
 *
 *  P4: Item only
 *      "मसाला"                    → {item, qty:1, unit:""}
 *
 * IMPORTANT: 10×10 always means MRP=10, Qty=10. Never multiply.
 */

const { PACKAGING_TERMS, VALID_UNITS } = require('./normalizer');

/**
 * @param {string} normalizedText
 * @returns {{ item, qty, unit, mrp?, packaging?, pattern } | null}
 */
function parseLine(normalizedText) {
  const text = (normalizedText || '').trim();
  if (!text) return null;
  if (!/[\u0900-\u097Fa-zA-Z]/.test(text)) return null; // must have at least one letter

  let parsed = null;

  // ── P1.5: PacketSize×Qty ──────────────────────────────────────────────────
  //  Matches: "टाटा ऐलिची 250gm×4", "चना 1kg×5", "oil 2litre×2"
  const packetSizeQtyRe = /^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)×(\d+(?:\.\d+)?)\s*([\u0900-\u097Fa-zA-Z]+)?\s*$/;
  const m1_5 = text.match(packetSizeQtyRe);
  if (m1_5) {
    const item = m1_5[1].trim();
    const sizeVal = m1_5[2];
    const sizeUnit = m1_5[3];
    const qty = parseFloat(m1_5[4]);
    let word = (m1_5[5] || '').toLowerCase();
    if (word === 'm') word = 'M';

    let unit = 'piece'; // default unit for the pattern
    let packaging = '';

    if (word) {
      if (PACKAGING_TERMS.has(word) && !VALID_UNITS.has(word)) {
        packaging = word;
      } else {
        unit = word;
      }
    }

    parsed = { 
      item, 
      qty, 
      unit, 
      mrp: null, // explicitly null because it represents packet size, not MRP!
      packetSize: sizeVal + sizeUnit,
      packaging, 
      pattern: 'packetSize×qty' 
    };
  }

  // ── P1: MRP×Qty [Unit/Packaging] ─────────────────────────────────────────────
  //  Matches: "Butter Bite 10×10", "Parle G 5×10 Petty", "Item 10×12 packet"
  if (!parsed) {
    const mrpQtyRe = /^(.+?)\s+(\d+(?:\.\d+)?)×(\d+(?:\.\d+)?)\s*([\u0900-\u097Fa-zA-Z]+)?\s*$/;
    const m1 = text.match(mrpQtyRe);
    if (m1) {
      const item = m1[1].trim();
      const mrp  = parseFloat(m1[2]);
      const qty  = parseFloat(m1[3]);
      let word = (m1[4] || '').toLowerCase();
      if (word === 'm') word = 'M';

      let unit = 'piece'; // Default to piece for 10x12 pattern
      let packaging = '';

      if (word) {
        if (PACKAGING_TERMS.has(word) && !VALID_UNITS.has(word)) {
          packaging = word;
        } else {
          unit = word; // e.g. packet, patty, ladi, set
        }
      }

      parsed = { item, qty, unit, mrp, packaging, pattern: 'mrp×qty' };
    }
  }

  // ── P2: Item + Qty + Unit ───────────────────────────────────────────────
  //  Matches: "चना 10kg", "oil 2 ltr", "atta 5 kg"
  if (!parsed) {
    const qtyUnitRe = /^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*$/;
    const m2 = text.match(qtyUnitRe);
    if (m2) {
      const item     = m2[1].trim();
      const qty      = parseFloat(m2[2]);
      const rawUnit  = m2[3];
      let unitKey  = rawUnit.toLowerCase();
      if (unitKey === 'm') unitKey = 'M';

      if (PACKAGING_TERMS.has(unitKey)) {
        parsed = { item, qty, unit: '', packaging: unitKey, pattern: 'item+qty+packaging' };
      } else {
        // Accept known units AND unknown ones (grocery lists often have custom units)
        parsed = { item, qty, unit: unitKey, packaging: '', pattern: 'item+qty+unit' };
      }
    }
  }

  // ── P3: Item + Qty (no unit) ────────────────────────────────────────────
  //  Matches: "दाल 5", "Sugar 2"
  if (!parsed) {
    const qtyOnlyRe = /^(.+?)\s+(\d+(?:\.\d+)?)\s*$/;
    const m3 = text.match(qtyOnlyRe);
    if (m3 && /[\u0900-\u097Fa-zA-Z]/.test(m3[1])) {
      parsed = {
        item: m3[1].trim(),
        qty: parseFloat(m3[2]),
        unit: '',
        packaging: '',
        pattern: 'item+qty',
      };
    }
  }

  // ── P4: Item only ───────────────────────────────────────────────────────
  if (!parsed && /[\u0900-\u097Fa-zA-Z]/.test(text)) {
    parsed = { item: text, qty: 1, unit: '', packaging: '', pattern: 'item-only' };
  }

  if (parsed) {
    // Extract Roman numeral quality (I or II) from the end of the item name
    let quality = '';
    let item = parsed.item;
    
    // Match space followed by Roman I or II at the end of the item name (case-insensitive)
    const qualityMatch = item.match(/\s+(II|I)\s*$/i);
    if (qualityMatch) {
      quality = qualityMatch[1].toUpperCase();
      item = item.substring(0, qualityMatch.index).trim();
    }
    
    parsed.item = item;
    parsed.quality = quality;
    return parsed;
  }

  return null;
}

module.exports = { parseLine };
