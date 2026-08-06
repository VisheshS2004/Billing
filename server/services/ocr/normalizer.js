/**
 * Normalization Layer — Step 4
 *
 * Standardises common handwriting variations before parsing:
 *   KG, Kg, k.g. → kg
 *   GM, grams     → gm
 *   liter, litre  → ltr
 *   x, X, ×      → ×  (multiplication separator)
 *
 * Also detects and flags packaging terms.
 */

const UNIT_MAP = {
  // kg
  KG: 'kg', Kg: 'kg', kG: 'kg', 'k.g.': 'kg', 'k.g': 'kg',
  Kgs: 'kg', KGS: 'kg', kgs: 'kg',
  // gm
  GM: 'gm', Gm: 'gm', grams: 'gm', gram: 'gm',
  Grams: 'gm', Gram: 'gm', GMS: 'gm', gms: 'gm', g: 'gm',
  // ltr -> litre
  CONVERT_LITRE: 'litre', // dummy to avoid replacing standard key if matching
  LTR: 'litre', Ltr: 'litre', liter: 'litre', litre: 'litre',
  Liter: 'litre', Litre: 'litre', LITRE: 'litre', LITER: 'litre',
  ltr: 'litre', L: 'litre',
  // ml
  ML: 'ml', Ml: 'ml', mL: 'ml', milliliter: 'ml', millilitre: 'ml',
  // pkt -> packet (and added पै, पुड़े/पुडे)
  PKT: 'packet', Pkt: 'packet', packet: 'packet', pack: 'packet',
  PACKET: 'packet', PACK: 'packet', packets: 'packet', pkt: 'packet', पै: 'packet',
  पुडा: 'packet', 'पै0': 'packet', 'पैO': 'packet', 'पै०': 'packet',
  पुड़े: 'packet', पुडे: 'packet',
  // pcs -> piece
  PCS: 'piece', Pcs: 'piece', piece: 'piece', pieces: 'piece',
  Pieces: 'piece', pc: 'piece', PC: 'piece', pcs: 'piece',
  // dozen
  Dozen: 'dozen', DOZEN: 'dozen', doz: 'dozen', DOZ: 'dozen',
  // ladi
  ladi: 'ladi', LADI: 'ladi', Ladi: 'ladi', लड़ी: 'ladi',
  // set
  set: 'set', SET: 'set', Set: 'set', सेट: 'set', सैट: 'set',
  // katta
  katta: 'katta', KATTA: 'katta', Katta: 'katta', कट्टे: 'katta', कट्टा: 'katta',
  KT: 'katta', Kt: 'katta', kt: 'katta',
  // patty (and added pati, पेटी)
  patty: 'patty', PATTY: 'patty', Patty: 'patty',
  pati: 'patty', PATI: 'patty', Pati: 'patty',
  पेटी: 'patty',
  PT: 'patty', Pt: 'patty', pt: 'patty',
  // box
  box: 'box', BOX: 'box', Box: 'box', जार: 'box',
  // teen
  teen: 'teen', TEEN: 'teen', Teen: 'teen', टीन: 'teen',
  // M
  M: 'M', m: 'M',
  // cane
  cane: 'cane', CANE: 'cane', Cane: 'cane',
};

// Known packaging terms (treated separately from quantity units)
const PACKAGING_TERMS = new Set([
  'petty', 'carton', 'box', 'case', 'bundle', 'strip', 'dozen',
  'bora', 'bag', 'tin', 'can', 'jar', 'bottle', 'sachet', 'pouch',
]);

// All valid quantity units after normalisation
const VALID_UNITS = new Set(['kg', 'gm', 'litre', 'ml', 'packet', 'piece', 'dozen', 'ladi', 'set', 'katta', 'patty', 'box', 'teen', 'M', 'cane']);

/**
 * Normalise a single transcribed line.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  if (!text) return '';

  let s = text.normalize('NFC').trim();

  // Strip out hyphens as they act as false separators (e.g. "Item - 5x5")
  s = s.replace(/-/g, ' ');

  // Convert leading decimal notation like ".5 kg" -> "0.5 kg"
  s = s.replace(/(?<=\s|^)\.(\d+)/g, '0.$1');

  // Remove all dots '.' EXCEPT when between digits (e.g. 2.5, 4.5)
  s = s.replace(/(?<!\d)\.|\.(?!\d)/g, '');

  // Normalise multiplication symbol (x, X, ×, α with optional spaces)
  s = s.replace(/\s*[xX×α]\s*/g, '×');

  // Normalise units — only at word boundaries
  for (const [variant, standard] of Object.entries(UNIT_MAP)) {
    // Escape special regex chars in variant
    const escaped = variant.replace(/\./g, '\\.');
    const re = new RegExp(`(?<=[\\d\\s])${escaped}(?=\\s|$|[,./])`, 'g');
    s = s.replace(re, standard);
  }

  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

module.exports = { normalizeText, PACKAGING_TERMS, VALID_UNITS, UNIT_MAP };
