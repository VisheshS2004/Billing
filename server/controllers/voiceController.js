/**
 * Voice Controller
 * Route:  POST /api/voice
 *
 * Takes a raw speech transcript (Hinglish / Hindi / English mix)
 * and uses Gemini to convert it into structured billing items —
 * identical in shape to the OCR pipeline's output so the same
 * frontend review panel works without any changes.
 *
 * Expected request body:
 *   { transcript: "बेसन 5 किलो | हल्दी 2 किलो | ढोलक 2 पीस" }
 *
 * Response:
 *   { success: true, items: [ ...same shape as /api/ocr list mode... ] }
 */

// ─── Prompt ────────────────────────────────────────────────────────────────
// Uses a show-don't-tell approach with concrete Hindi examples
// so Gemini doesn't get confused by abstract templates.
const VOICE_GEMINI_PROMPT = `You are a grocery billing assistant for an Indian retail store.

The input is a spoken grocery list in Hinglish (mixed Hindi + English).
Items are separated by " | " (pipe character).

YOUR TASK:
1. Split the input by " | " to get individual segments.
2. Parse each segment as ONE grocery item (name, quantity, unit, mrp).
3. Return a JSON array — one object per segment, in order.

PARSING RULES:
- Hindi numbers: एक=1, दो=2, तीन=3, चार=4, पांच=5, छह=6, सात=7, आठ=8, नौ=9, दस=10
- "X vale Y" / "X wale Y" / "X ke Y" after a number = MRP is X, quantity is Y
- Unit words: किलो/kilo=kg, ग्राम/gram=gm, पीस/piece/pcs=piece, लड़ी/ladi=ladi,
  पैकेट/packet=packet, लीटर/litre=litre, दर्जन/dozen=dozen, बोतल/bottle=bottle,
  टीन/teen=teen, कट्टा/katta=katta, बॉक्स/box=box, कार्टन/carton=carton

WORKED EXAMPLE:
Input: "बेसन 5 किलो | हल्दी 2 किलो | ढोलक दो पीस | दिलबाग तीन | इलायची दाना 2 किलो"
Output:
[
  {"raw":"बेसन 5 किलो","parsed":{"item":"बेसन","qty":5,"unit":"kg","mrp":null,"pattern":"item+qty+unit"}},
  {"raw":"हल्दी 2 किलो","parsed":{"item":"हल्दी","qty":2,"unit":"kg","mrp":null,"pattern":"item+qty+unit"}},
  {"raw":"ढोलक दो पीस","parsed":{"item":"ढोलक","qty":2,"unit":"piece","mrp":null,"pattern":"item+qty+unit"}},
  {"raw":"दिलबाग तीन","parsed":{"item":"दिलबाग","qty":3,"unit":"","mrp":null,"pattern":"item+qty"}},
  {"raw":"इलायची दाना 2 किलो","parsed":{"item":"इलायची दाना","qty":2,"unit":"kg","mrp":null,"pattern":"item+qty+unit"}}
]

ANOTHER EXAMPLE (with MRP):
Input: "chips 10 vale 2 ladi | parle g 5 ke 10"
Output:
[
  {"raw":"chips 10 vale 2 ladi","parsed":{"item":"chips","qty":2,"unit":"ladi","mrp":10,"pattern":"mrp×qty"}},
  {"raw":"parle g 5 ke 10","parsed":{"item":"parle g","qty":10,"unit":"","mrp":5,"pattern":"mrp×qty"}}
]

OUTPUT RULES:
- Return ONLY the JSON array. No markdown. No explanation. No code fences.
- If a segment has no readable grocery item, skip it (do not include in output).
- "unit" must be one of: kg, gm, litre, ml, piece, dozen, ladi, packet, bottle, box, carton, tin, bag, teen, katta, set, patty — or empty string "" if no unit.
- "mrp" is null if no price was mentioned.
- "qty" is always a number (use Hindi word translation when needed).`;

// ─── Fallback: parse the transcript server-side without Gemini ─────────────
// Used when Gemini fails or returns garbage.
// Handles: "item qty unit" and "item qty vale/wale qty unit" patterns.
// Also handles common speech-recognition merges like "हल्दी2" → "हल्दी 2"
function preprocess(seg) {
  // Split digit-adjacent text: "हल्दी2किलो" → "हल्दी 2 किलो"
  // Also: "हल्दी2" → "हल्दी 2"
  return seg
    .replace(/([^\d\s])(\d)/g, '$1 $2')   // letter directly followed by digit
    .replace(/(\d)([^\d\s])/g, '$1 $2')   // digit directly followed by letter
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackParse(transcript) {

  const HINDI_NUMS = {
    एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5,
    छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
    ग्यारह: 11, बारह: 12, पंद्रह: 15, बीस: 20,
  };
  const UNIT_MAP = {
    किलो: 'kg', किलोग्राम: 'kg', kilo: 'kg', kg: 'kg',
    ग्राम: 'gm', gram: 'gm', gm: 'gm',
    पीस: 'piece', piece: 'piece', pcs: 'piece',
    लड़ी: 'ladi', ladi: 'ladi',
    पैकेट: 'packet', packet: 'packet', pkt: 'packet',
    लीटर: 'litre', litre: 'litre', liter: 'litre',
    दर्जन: 'dozen', dozen: 'dozen',
    बोतल: 'bottle', bottle: 'bottle',
    टीन: 'teen', teen: 'teen',
    कट्टा: 'katta', katta: 'katta',
    बॉक्स: 'box', box: 'box',
    कार्टन: 'carton', carton: 'carton',
    बैग: 'bag', bag: 'bag',
  };

  const segments = transcript.split('|').map(s => s.trim()).filter(Boolean);

  return segments.map(seg => {
    const cleanSeg = preprocess(seg);          // "हल्दी2किलो" → "हल्दी 2 किलो"
    const words = cleanSeg.split(/\s+/);
    let itemWords = [];
    let qty = 1;
    let unit = '';
    let mrp = null;
    let pattern = 'item-only';

    let i = 0;
    while (i < words.length) {
      const w = words[i];
      const wLow = w.toLowerCase();

      // Is this word a Hindi number?
      const hindiNum = HINDI_NUMS[w];
      // Is this word a digit?
      const digitNum = parseFloat(w.replace(/[^\d.]/g, ''));
      const num = hindiNum !== undefined ? hindiNum : (!isNaN(digitNum) && digitNum > 0 ? digitNum : null);

      if (num !== null) {
        const nextW = words[i + 1]?.toLowerCase();
        // Check for MRP pattern: "num vale/wale/ke num [unit]"
        if (nextW === 'vale' || nextW === 'वाले' || nextW === 'wale' || nextW === 'ke' || nextW === 'के') {
          mrp = num;
          i += 2; // skip "vale/ke"
          const qtyWord = words[i];
          if (qtyWord) {
            const qNum = HINDI_NUMS[qtyWord] ?? parseFloat(qtyWord.replace(/[^\d.]/g, ''));
            if (!isNaN(qNum) && qNum > 0) { qty = qNum; i++; }
          }
          const uWord = words[i]?.toLowerCase();
          if (uWord && UNIT_MAP[uWord]) { unit = UNIT_MAP[uWord]; i++; }
          pattern = 'mrp×qty';
        } else if (nextW && UNIT_MAP[nextW]) {
          qty = num;
          unit = UNIT_MAP[nextW];
          i += 2;
          pattern = 'item+qty+unit';
        } else {
          qty = num;
          i++;
          pattern = 'item+qty';
        }
      } else if (UNIT_MAP[wLow]) {
        unit = UNIT_MAP[wLow];
        i++;
      } else {
        itemWords.push(w);
        i++;
      }
    }

    const itemName = itemWords.join(' ').trim() || seg;
    if (qty !== 1) pattern = unit ? 'item+qty+unit' : 'item+qty';

    return {
      raw: seg,
      parsed: { item: itemName, qty, unit, mrp, pattern },
      matched: null,
      status: 'medium',
      confidence: 0.45,
      warnings: [],
    };
  }).filter(entry => entry.parsed.item);
}

// ─── Controller ────────────────────────────────────────────────────────────
exports.parseVoice = async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ success: false, message: 'No transcript provided' });
    }

    const cleanTranscript = transcript.trim();
    console.log(`\n[Voice] Transcript received: "${cleanTranscript}"`);

    const geminiKey = process.env.GEMINI_API_KEY;

    // ── If no Gemini key, fall back to local parser ──────────────────────
    if (!geminiKey) {
      console.warn('[Voice] No GEMINI_API_KEY — using fallback parser');
      const items = fallbackParse(cleanTranscript);
      return res.json({ success: true, items, source: 'fallback' });
    }

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

    const payload = {
      contents: [{
        parts: [
          { text: VOICE_GEMINI_PROMPT },
          { text: `Parse this grocery list:\n"${cleanTranscript}"` },
        ],
      }],
      generationConfig: {
        temperature: 0.0,      // fully deterministic — no hallucination
        topP: 1,
        maxOutputTokens: 2048,
      },
    };

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Voice] Gemini API error ${response.status}:`, errText.slice(0, 300));
      // Fall back to local parser on API error
      const items = fallbackParse(cleanTranscript);
      return res.json({ success: true, items, source: 'fallback' });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`[Voice] Gemini raw response: "${rawText.slice(0, 500)}"`);

    // ── Try parsing Gemini's JSON response ──────────────────────────────
    let parsed = null;

    if (rawText) {
      // 1. Try direct parse
      try { parsed = JSON.parse(rawText); } catch (_) {}

      // 2. Extract JSON array from text (handles markdown fences)
      if (!parsed) {
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {
            console.warn('[Voice] JSON.parse failed after regex:', e.message);
          }
        }
      }
    }

    // ── Fall back to local parser if Gemini returned nothing useful ──────
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      console.warn('[Voice] Gemini parse failed or empty — using fallback parser');
      const items = fallbackParse(cleanTranscript);
      console.log(`[Voice] Fallback parsed ${items.length} items`);
      return res.json({ success: true, items, source: 'fallback' });
    }

    // ── Shape Gemini items ───────────────────────────────────────────────
    const items = parsed.map((entry) => ({
      raw:        entry.raw     || '',
      parsed:     entry.parsed  || { item: '', qty: 1, unit: '', mrp: null, pattern: 'item-only' },
      matched:    null,
      status:     'medium',
      confidence: 0.5,
      warnings:   [],
    }));

    console.log(`[Voice] Gemini parsed ${items.length} items`);
    return res.json({ success: true, items, source: 'gemini' });

  } catch (error) {
    if (error.name === 'AbortError') {
      // Timeout — try fallback before giving up
      console.warn('[Voice] Gemini timed out — using fallback parser');
      const items = fallbackParse(req.body?.transcript || '');
      if (items.length > 0) return res.json({ success: true, items, source: 'fallback' });
      return res.status(504).json({ success: false, message: 'Voice parse timed out. Try again.' });
    }
    console.error('[Voice] Controller Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
