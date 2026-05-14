const https = require('https');

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
  
  // Log key status (not the actual key)
  if (!apiKey) {
    console.log('ERROR: ANTHROPIC_API_KEY is not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured on server' }) };
  }
  
  console.log('API key found, length:', apiKey.length, 'starts with:', apiKey.substring(0, 7));

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    console.log('ERROR: Invalid JSON body', e.message);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
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
      console.log('Anthropic response status:', res.statusCode);
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('Anthropic response:', data.substring(0, 200));
        resolve({
          statusCode: 200,
          headers,
          body: data,
        });
      });
    });

    req.on('error', (e) => {
      console.log('Request error:', e.message);
      resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message }) });
    });

    req.write(payload);
    req.end();
  });
};
