/**
 * Whisper Controller
 * Route: POST /api/whisper
 *
 * Receives a base64-encoded audio clip from the browser (MediaRecorder output)
 * and sends it to Groq's Whisper large-v3 model for transcription.
 * Returns the transcribed text — optimised for Hindi / Hinglish.
 *
 * Falls back to OpenAI Whisper if GROQ_API_KEY is not set.
 */

// ─── Manual multipart/form-data builder ───────────────────────────────────
// Avoids needing 'form-data' npm package or Node 20+ File global.
function buildMultipart(boundary, audioBuffer, mimeType) {
  const CRLF = '\r\n';

  const field = (name, value) =>
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`);

  return Buffer.concat([
    field('model', 'whisper-large-v3'),
    field('language', 'en'),
    field('response_format', 'text'),
    field('prompt', 'जीरा, मुंग साबुत, छोले, मखाना, दाल, चावल, आटा, चीनी, तेल, किलो, ग्राम, पैकेट, लीटर, पीस, दो किलो, एक किलो, पांच किलो, आधा किलो, पाव'),
    Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="audio.webm"${CRLF}` +
      `Content-Type: ${mimeType}${CRLF}${CRLF}`
    ),
    audioBuffer,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  ]);
}

// ─── Groq Whisper ──────────────────────────────────────────────────────────
async function transcribeWithGroq(audioBuffer, mimeType, apiKey) {
  const boundary = '----AutoBillingBoundary' + Date.now().toString(36);
  const body = buildMultipart(boundary, audioBuffer, mimeType);

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq Whisper ${response.status}: ${err.slice(0, 200)}`);
  }

  return (await response.text()).trim();  // response_format: text → plain string
}

// ─── OpenAI Whisper fallback ───────────────────────────────────────────────
async function transcribeWithOpenAI(audioBuffer, mimeType, apiKey) {
  const boundary = '----AutoBillingOpenAI' + Date.now().toString(36);

  // OpenAI uses same multipart format but different model name
  const CRLF = '\r\n';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}whisper-1${CRLF}`),
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="language"${CRLF}${CRLF}hi${CRLF}`),
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="response_format"${CRLF}${CRLF}text${CRLF}`),
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="prompt"${CRLF}${CRLF}जीरा, मुंग साबुत, छोले, मखाना, दाल, चावल, आटा, चीनी, किलो, ग्राम, पैकेट, लीटर, दो किलो, एक किलो, पांच किलो, आधा किलो, पाव${CRLF}`),
    Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="audio.webm"${CRLF}` +
      `Content-Type: ${mimeType}${CRLF}${CRLF}`
    ),
    audioBuffer,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  ]);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Whisper ${response.status}: ${err.slice(0, 200)}`);
  }

  return (await response.text()).trim();
}

// ─── Controller ───────────────────────────────────────────────────────────
exports.transcribeAudio = async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ success: false, message: 'No audio data provided' });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!groqKey && !openaiKey) {
      return res.status(500).json({ success: false, message: 'No Whisper API key configured (need GROQ_API_KEY or OPENAI_API_KEY)' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    if (audioBuffer.length < 500) {
      // Too small to be meaningful speech — return empty
      return res.json({ success: true, text: '' });
    }

    console.log(`[Whisper] Transcribing ${(audioBuffer.length / 1024).toFixed(1)}KB audio (${mimeType})`);

    let text = '';
    let source = '';

    // Try Groq first (faster), fall back to OpenAI
    if (groqKey) {
      try {
        text = await transcribeWithGroq(audioBuffer, mimeType, groqKey);
        source = 'groq';
      } catch (err) {
        console.warn('[Whisper] Groq failed, trying OpenAI:', err.message);
      }
    }

    if (!text && openaiKey) {
      try {
        text = await transcribeWithOpenAI(audioBuffer, mimeType, openaiKey);
        source = 'openai';
      } catch (err) {
        throw new Error('Both Groq and OpenAI Whisper failed: ' + err.message);
      }
    }

    console.log(`[Whisper] (${source}) → "${text.slice(0, 80)}"`);
    return res.json({ success: true, text, source });

  } catch (error) {
    console.error('[Whisper] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
