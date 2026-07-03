const https = require('https');
const { getStore } = require('@netlify/blobs');

// Usikkerhetsmarkører — Hilde flagges når hun sier disse
const USIKKER_MARKORER = [
  'vet ikke',
  'usikker',
  'stopper kunnskapen',
  'ikke godt nok',
  'kan ikke svare',
  'er jeg ikke sikker',
  'har jeg ikke',
  'kjenner jeg ikke',
  'vil ikke gjette',
  'bør du sjekke',
  'ikke nøyaktig',
  'hull i det jeg',
];

// Sjekk om svaret inneholder usikkerhet
function erUsikkert(tekst) {
  const lavt = tekst.toLowerCase();
  return USIKKER_MARKORER.some(m => lavt.includes(m));
}

// Lagre loggoppføring til Netlify Blobs
async function loggOppforing(sted, sporsmal, svar) {
  try {
    const store = getStore('hilde-logg');
    const nokkel = `logg-${Date.now()}`;
    const oppforing = {
      tidspunkt: new Date().toISOString(),
      sted: sted || 'ukjent',
      sporsmal,
      svar,
      type: erUsikkert(svar) ? 'vet-ikke' : 'kort-svar',
    };
    await store.set(nokkel, JSON.stringify(oppforing));
  } catch (e) {
    console.log('Logg-feil (ikke kritisk):', e.message);
  }
}

exports.handler = async function(event) {

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('ERROR: ANTHROPIC_API_KEY is not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured on server' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // Hent siste brukermelding og sted fra systemprompt
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
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', async () => {
        try {
          const parsed = JSON.parse(data);
          const svar = parsed.content?.[0]?.text || '';

          // Logg hvis Hilde er usikker eller svaret er veldig kort
          if (erUsikkert(svar) || svar.length < 80) {
            await loggOppforing(sted, sisteMelding, svar);
          }
        } catch(e) {
          console.log('Logg-parsing feil:', e.message);
        }

        resolve({
          statusCode: 200,
          headers,
          body: data,
        });
      });
    });

    req.on('error', (e) => {
      resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message }) });
    });

    req.write(payload);
    req.end();
  });
};
