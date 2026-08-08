const https = require('https');

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
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { sporsmal, svar, sted } = body;
  if (!sporsmal) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Mangler sporsmal' }) };

  const systemPrompt = `Du hjelper til med å researche norsk lokalhistorie for reisenettstedet SofaTravels.
En bruker stilte guiden "Hilde" et spørsmål hun ikke kunne svare på, om stedet "${sted || 'ukjent'}".

Spørsmål: "${sporsmal}"
Hildes opprinnelige (utilstrekkelige) svar: "${svar || '(ingen)'}"

Oppgave: Søk på nettet etter pålitelige norske kilder (Store norske leksikon, lokalhistoriewiki.no, kommune-/museumssider, Wikipedia, Digitaltmuseum) som kan svare på spørsmålet. Skriv deretter et kort, faktabasert utkast til kunnskapsbase-tekst — norsk, 3-6 setninger, nøktern stil, ingen uverifiserte påstander eller gjetning presentert som fakta.

Hvis du IKKE finner pålitelige kilder som faktisk svarer på spørsmålet: si det tydelig i stedet for å gjette. Skriv da "INGEN PÅLITELIGE KILDER FUNNET" etterfulgt av en kort forklaring på hva du prøvde å søke etter og hvorfor det ikke ga svar.

Avslutt alltid med en egen linje som starter med "KILDER:" etterfulgt av URL-ene du faktisk brukte, kommaseparert. Ikke finn på kilder.`;

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Research spørsmålet og lag et KB-forslag nå.' }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
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
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            resolve({ statusCode: 200, headers, body: JSON.stringify({ error: parsed.error.message || 'API-feil' }) });
            return;
          }
          const textBlocks = (parsed.content || [])
            .filter(b => b.type === 'text')
            .map(b => b.text);
          const forslag = textBlocks.join('\n\n').trim();
          resolve({
            statusCode: 200,
            headers,
            body: JSON.stringify({ forslag: forslag || '(Ingen tekst generert — prøv igjen)' }),
          });
        } catch (e) {
          resolve({ statusCode: 500, headers, body: JSON.stringify({ error: 'Kunne ikke tolke svar fra API', detalj: e.message }) });
        }
      });
    });

    req.on('error', (e) => resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }));
    req.write(payload);
    req.end();
  });
};
