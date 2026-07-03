const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const store = getStore({
      name: 'hilde-logg',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    const { blobs } = await store.list();
    if (!blobs || blobs.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify([]) };
    }

    const oppforinger = await Promise.all(
      blobs.map(async (blob) => {
        try {
          const data = await store.get(blob.key);
          return JSON.parse(data);
        } catch { return null; }
      })
    );

    const sortert = oppforinger
      .filter(Boolean)
      .sort((a, b) => new Date(b.tidspunkt) - new Date(a.tidspunkt));

    return { statusCode: 200, headers, body: JSON.stringify(sortert) };
  } catch (e) {
    console.log('get-log feil:', e.message);
    return { statusCode: 200, headers, body: JSON.stringify([]) };
  }
};
