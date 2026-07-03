const https = require('https');
const { getStore } = require('@netlify/blobs');

const USIKKER_MARKORER = [
  'vet ikke', 'usikker', 'stopper kunnskapen', 'ikke godt nok',
  'kan ikke svare', 'er jeg ikke sikker', 'har jeg ikke',
  'kjenner jeg ikke', 'vil ikke gjette', 'bør du sjekke',
  'ikke nøyaktig', 'hull i det jeg',
];

function erUsikkert(tekst) {
  return USIKKER_MARKORER.some(m => tekst.toLowerCase().includes(m));
}

async function loggOppforing(sted, sporsmal, svar, type) {
  try {
    const store = getStore({
      name: 'hilde-logg',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const nokkel = `logg-${Date.now()}`;
    await store.set(nokkel, JSON.stringify({
      tidspunkt: new Date().toISOString(),
      sted: sted || 'ukjent',
      sporsmal,
      svar,
      type,
    }));
    console.log('Logg lagret:', type, sted, nokkel);
  } catch (e) {
    console.log('Logg-feil:', e.message);
  }
}

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

  const sisteMelding = body.messages?.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  const sted = body.sted || 'ukjent';

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: body.system,
      messages: body.messages,
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
          const svar = parsed.content?.[0]?.text || '';
          const usikker = erUsikkert(svar);
          const kort = svar.length < 80;
          if (usikker || kort) {
            await loggOppforing(sted, sisteMelding, svar, usikker ? 'vet-ikke' : 'kort-svar');
          }
        } catch(e) {
          console.log('Logg-feil:', e.message);
        }
        resolve({ statusCode: 200, headers, body: data });
      });
    });

    req.on('error', (e) => resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }));
    req.write(payload);
    req.end();
  });
};
