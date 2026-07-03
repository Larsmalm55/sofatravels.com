const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const store = getStore('hilde-logg');
    const { blobs } = await store.list();

    // Hent alle oppføringer og sorter nyeste først
    const oppforinger = await Promise.all(
      blobs.map(async (blob) => {
        const data = await store.get(blob.key);
        try {
          return JSON.parse(data);
        } catch {
          return null;
        }
      })
    );

    const sortert = oppforinger
      .filter(Boolean)
      .sort((a, b) => new Date(b.tidspunkt) - new Date(a.tidspunkt));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(sortert),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
