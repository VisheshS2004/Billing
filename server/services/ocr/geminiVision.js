/**
 * Gemini Vision — Step 2
 *
 * Sends the preprocessed image to Gemini 2.5 Flash with a carefully
 * crafted prompt that instructs it to:
 *   - Transcribe EXACTLY what is written (no interpretation)
 *   - Return one entry per physical line
 *   - Preserve the original script (Hindi/English)
 *   - Output structured JSON only
 *
 * Falls back to GPT-4o-mini if Gemini fails.
 */

const TRANSCRIPTION_PROMPT = `You are a grocery list OCR assistant for an Indian grocery store billing system.

Your ONLY job is to transcribe exactly what is handwritten in this image, line by line.

STRICT RULES:
1. Transcribe EXACTLY as written — do NOT fix spelling, do NOT interpret abbreviations
2. Each physical handwritten line = one entry in your output
3. Preserve original script: keep Hindi/Devanagari as Devanagari, English as English
4. Keep ALL numbers and symbols exactly as written (e.g., "10×10", "3.5", "2/")
5. Do NOT add units, quantities, or any information not visible in the image
6. Output ONLY a valid JSON array — no markdown, no explanations, no code blocks

Output format (strict):
[{"line":1,"text":"<exactly what line 1 says>"},{"line":2,"text":"<exactly what line 2 says>"}]

If the image contains no readable text, return: []`;

// ─── Gemini Vision ────────────────────────────────────────────────────────
async function callGeminiVision(base64Image, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [
        { text: TRANSCRIPTION_PROMPT },
        { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
      ],
    }],
    generationConfig: {
      temperature: 0.05,
      topP: 0.8,
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
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('[Gemini] Non-JSON response:', rawText.slice(0, 200));
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[Gemini] Transcribed ${parsed.length} lines`);
    return parsed;
  } catch (e) {
    console.warn('[Gemini] JSON parse failed:', e.message);
    return [];
  }
}

// ─── GPT-4o-mini Vision Fallback ─────────────────────────────────────────
// Uses the same prompt and returns the same [{line, text}] shape.
// gpt-4o-mini is cheaper and reads Hindi handwriting better than Cloud Vision.
async function callGPT4oVision(base64Image, apiKey) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const payload = {
    model: 'gpt-4o-mini',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'text',      text: TRANSCRIPTION_PROMPT },
        {
          type: 'image_url',
          image_url: {
            url:    `data:image/jpeg;base64,${base64Image}`,
            detail: 'high',   // high detail = better handwriting recognition
          },
        },
      ],
    }],
    temperature: 0.05,
  };

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 30000);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  clearTimeout(tid);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GPT-4o-mini error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '[]';

  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('[GPT4o] Non-JSON response:', rawText.slice(0, 200));
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[GPT4o] Transcribed ${parsed.length} lines`);
    return parsed;
  } catch (e) {
    console.warn('[GPT4o] JSON parse failed:', e.message);
    return [];
  }
}

module.exports = { callGeminiVision, callGPT4oVision };




