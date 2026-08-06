const dotenv = require('dotenv');
dotenv.config();

async function test() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const visionKey = process.env.GOOGLE_VISION_KEY;

  // ── Test Gemini with enough tokens for a thinking model ─────────────────
  console.log('=== GEMINI 2.5 FLASH ===');
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + geminiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say exactly: READY' }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048   // enough room for thinking + output
          }
        })
      }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const finish = data?.candidates?.[0]?.finishReason;
    console.log('HTTP:', res.status, '| finishReason:', finish);
    if (text) {
      console.log('✅ GEMINI WORKING — Reply:', text.trim());
    } else {
      console.log('⚠️  No text in response. Finish reason:', finish);
      console.log('Thoughts used:', data?.usageMetadata?.thoughtsTokenCount, 'tokens');
    }
  } catch(e) {
    console.log('❌ ERROR:', e.message);
  }

  // ── Test Cloud Vision ────────────────────────────────────────────────────
  console.log('\n=== CLOUD VISION ===');
  try {
    // A proper 1x1 white pixel PNG (valid base64)
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
    const res = await fetch(
      'https://vision.googleapis.com/v1/images:annotate?key=' + visionKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: pixel },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
          }]
        })
      }
    );
    const data = await res.json();
    console.log('HTTP:', res.status);
    if (res.ok) {
      console.log('✅ CLOUD VISION WORKING');
    } else {
      console.log('❌ CLOUD VISION FAILED:', data?.error?.message);
      console.log('Reason:', data?.error?.status);
    }
  } catch(e) {
    console.log('❌ ERROR:', e.message);
  }

  console.log('\n=== SUMMARY ===');
}

test().catch(e => console.error(e.message));
