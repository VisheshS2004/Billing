/**
 * OCR Controller
 * Routes:
 *   POST /api/ocr — list mode (full pipeline: Gemini primary, GPT-4o-mini fallback)
 */
const { runOCRPipeline } = require('../services/ocr/pipeline');

exports.recognizeText = async (req, res) => {
  try {
    const { imageBase64, mode = 'single' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ success: false, message: 'No image data provided' });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      return res.status(500).json({ success: false, message: 'No OCR API key configured (need GEMINI_API_KEY or OPENAI_API_KEY)' });
    }

    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    // ── LIST MODE: full 9-stage pipeline (Gemini → GPT-4o-mini fallback) ────
    if (mode === 'list') {
      const result = await runOCRPipeline(base64Data, { geminiKey, openaiKey });
      return res.json(result);
    }

    // ── SINGLE MODE: retired — use list mode ─────────────────────────────────
    return res.status(400).json({
      success: false,
      message: 'Single mode is retired. Use mode: "list" for all scans.',
    });

  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ success: false, message: 'OCR timed out. Try with a clearer image.' });
    }
    console.error('OCR Controller Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

