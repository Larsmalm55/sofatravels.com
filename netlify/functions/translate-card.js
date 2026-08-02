const https = require('https');
const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { cacheKey, lang, title, subtitle, imgCap, sections } = body;
  if (!cacheKey || !lang || lang === 'no' || !title || !Array.isArray(sections)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
  }
  if (lang !== 'en' && lang !== 'de') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unsupported language' }) };
  }

  const store = getStore({
    name: 'card-translations',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_ACCESS_TOKEN,
  });

  const fullKey = `${cacheKey}-${lang}`;

  // Sjekk cache først — permanent lagring, aldri oversett samme kort/språk to ganger
  try {
    const cached = await store.get(fullKey);
    if (cached) {
      return { statusCode: 200, headers, body: cached };
    }
  } catch (e) {
    // ikke funnet i cache, fortsett til generering
  }

  const langName = lang === 'en' ? 'English' : 'German';
  const sourceData = { title, subtitle, imgCap, sections };
  const prompt = 'Translate the following Norwegian travel-guide content into ' + langName + '. '
    + 'This is content for an AI travel companion app about Senja, Norway. '
    + 'Keep Norwegian place names, personal names, and proper nouns UNTRANSLATED (e.g. Kaperdalen, Tranøya, Nikolai, Alvilde). '
    + 'Preserve tone: understated, factual, warm but not sentimental. '
    + 'Return ONLY valid JSON matching this exact structure, no markdown fences, no other text:\n\n'
    + JSON.stringify(sourceData);

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', async () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content?.[0]?.text || '';
          const clean = text.replace(/```json|```/g, '').trim();
          const translated = JSON.parse(clean);

          if (!translated.title || !Array.isArray(translated.sections)) {
            throw new Error('Unexpected translation shape');
          }

          const resultBody = JSON.stringify({ translated });
          try {
            await store.set(fullKey, resultBody);
          } catch (e) {
            console.log('Cache-lagring feilet (ikke kritisk):', e.message);
          }
          resolve({ statusCode: 200, headers, body: resultBody });
        } catch(e) {
          resolve({ statusCode: 500, headers, body: JSON.stringify({ error: 'Translation parse error: ' + e.message }) });
        }
      });
    });

    req.on('error', (e) => resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }));
    req.write(payload);
    req.end();
  });
};
