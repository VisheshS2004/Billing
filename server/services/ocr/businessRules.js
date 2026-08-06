/**
 * Business Rules — Step 7 & 8
 *
 * Grocery-domain validation rules applied AFTER parsing and matching.
 * Returns an array of human-readable warnings (empty = all OK).
 *
 * Rules implemented:
 *   R1. Quantity sanity — flags unreasonably large/small values per unit
 *   R2. MRP×Qty sanity — warns on suspiciously high total value
 *   R3. Unit–product mismatch — e.g., sugar in litres
 *   R4. Item-only parse — quantity not extracted (low confidence signal)
 */

// Reasonable quantity ranges per unit
const QTY_RANGES = {
  kg:     [0.1,  200],
  gm:     [10,  5000],
  ltr:    [0.1,   50],
  ml:     [50,  5000],
  pkt:    [1,    500],
  pcs:    [1,   2000],
  dozen:  [1,     50],
};

// Items that CANNOT be measured in certain units
// Key = substring of item name (lowercase), value = disallowed units
const UNIT_BLACKLIST = {
  sugar:  ['ltr', 'ml'],
  cheeni: ['ltr', 'ml'],
  salt:   ['ltr', 'ml'],
  namak:  ['ltr', 'ml'],
  atta:   ['ltr', 'ml'],
  flour:  ['ltr', 'ml'],
  rice:   ['ltr', 'ml'],
  chawal: ['ltr', 'ml'],
  dal:    ['ltr', 'ml'],
  oil:    ['kg', 'gm'],
  tel:    ['kg', 'gm'],
  milk:   ['kg', 'gm'],
  doodh:  ['kg', 'gm'],
};

/**
 * @param {object} parsed    - output of retailParser.parseLine()
 * @param {object|null} product - matched DB product (may be null)
 * @returns {string[]} array of warning strings
 */
function applyBusinessRules(parsed, product) {
  const warnings = [];

  // R1: Quantity sanity check
  if (parsed.unit && QTY_RANGES[parsed.unit]) {
    const [min, max] = QTY_RANGES[parsed.unit];
    if (parsed.qty < min || parsed.qty > max) {
      warnings.push(`Unusual quantity: ${parsed.qty} ${parsed.unit} — please verify`);
    }
  }

  // R2: MRP×Qty total sanity
  if (parsed.pattern === 'mrp×qty' && parsed.mrp && parsed.qty) {
    if (parsed.mrp * parsed.qty > 10000) {
      warnings.push(`High total: ₹${parsed.mrp} × ${parsed.qty} — please verify`);
    }
  }

  // R3: Unit–item domain mismatch
  if (parsed.unit) {
    const itemLower = (parsed.item || '').toLowerCase();
    for (const [keyword, badUnits] of Object.entries(UNIT_BLACKLIST)) {
      if (itemLower.includes(keyword) && badUnits.includes(parsed.unit)) {
        warnings.push(`"${parsed.item}" is unlikely to be measured in ${parsed.unit}`);
        break;
      }
    }
  }

  // R4: Unit mismatch with DB product
  if (product && parsed.unit && product.unit) {
    const dbUnit    = product.unit.toLowerCase().trim();
    const parsedUnit = parsed.unit.toLowerCase().trim();
    if (parsedUnit && dbUnit !== parsedUnit) {
      warnings.push(`Unit mismatch: written "${parsed.unit}", product DB says "${product.unit}"`);
    }
  }

  return warnings;
}

module.exports = { applyBusinessRules };
