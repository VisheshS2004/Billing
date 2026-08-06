/**
 * Transliterates Roman/Hinglish text to Hindi Devanagari script
 * using Google Input Tools API (no API key required).
 *
 * Examples:
 *   chawal          → चावल
 *   aata            → आटा
 *   sarso tel       → सरसो तेल
 *   basmati chawal  → बासमती चावल
 *
 * @param {string} text - Romanized Hindi (Hinglish) text
 * @returns {Promise<string>} - Devanagari transliteration
 */
const transliterateToHindi = async (text) => {
  if (!text || typeof text !== 'string') return text;

  const trimmed = text.trim();
  if (!trimmed) return text;

  try {
    const url =
      'https://inputtools.google.com/request?text=' +
      encodeURIComponent(trimmed) +
      '&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8';

    const response = await fetch(url);

    if (!response.ok) {
      console.warn('Transliteration API returned', response.status, '— storing as-is');
      return text;
    }

    const data = await response.json();

    // Response shape: ["SUCCESS", [["original", ["result1", ...], {}, {}]]]
    const result = data[1]?.[0]?.[1]?.[0];

    if (result) {
      console.log(`Transliterate: "${trimmed}" → "${result}"`);
      return result;
    }

    console.warn('Transliteration: no result for', trimmed, '— storing as-is');
    return text;
  } catch (err) {
    console.error('transliterateToHindi error:', err.message, '— storing as-is');
    return text; // graceful fallback: store original if API is unreachable
  }
};

module.exports = transliterateToHindi;
