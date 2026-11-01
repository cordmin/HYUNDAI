// 인증키를 서버에만 두고, 앱과 미리보기의 요청에 키를 붙여 공공 자료 창구로 넘긴다.
const TIMEOUT_MS = 8000;
const MAX_QUERY_LENGTH = 1000;

const SOURCES = {
  neis: {
    baseUrl: 'https://open.neis.go.kr/hub/',
    keyEnv: 'NEIS_API_KEY',
    keyParam: 'KEY',
    services: new Set(['schoolInfo', 'classInfo', 'elsTimetable', 'misTimetable', 'hisTimetable', 'mealServiceDietInfo', 'SchoolSchedule'])
  },
  tour: {
    baseUrl: 'https://apis.data.go.kr/B551011/KorService2/',
    keyEnv: 'TOUR_API_KEY',
    keyParam: 'serviceKey',
    services: new Set(['searchKeyword2'])
  }
};

// 포털은 인코딩된 키와 원래 키를 함께 준다. 어느 쪽을 넣어도 한 번만 인코딩되게 한다.
function encodedKey(key) {
  return key.includes('%') ? key : encodeURIComponent(key);
}

function upstreamUrl(source, service, query, key) {
  const params = new URLSearchParams(query);
  params.delete('source');
  params.delete('service');
  params.delete(source.keyParam);
  return `${source.baseUrl}${service}?${params.toString()}&${source.keyParam}=${encodedKey(key)}`;
}

function hideKey(body, key) {
  return body.split(key).join('').split(encodedKey(key)).join('');
}

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', contentType);
  if (status === 200) res.setHeader('Cache-Control', 'public, s-maxage=600');
  res.end(body);
}

function sendError(res, status, code) {
  send(res, status, JSON.stringify({ error: code }));
}

async function handleRelay(req, res, env = process.env, fetcher = fetch) {
  if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed');

  const url = new URL(req.url, 'http://relay');
  const source = SOURCES[url.searchParams.get('source')];
  const service = url.searchParams.get('service');
  if (!source || !source.services.has(service)) return sendError(res, 404, 'unknown_service');
  if (url.search.length > MAX_QUERY_LENGTH) return sendError(res, 414, 'query_too_long');

  const key = (env[source.keyEnv] || '').trim();
  if (!key) return sendError(res, 503, 'key_not_set');

  try {
    const response = await fetcher(upstreamUrl(source, service, url.search, key), {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const body = hideKey(await response.text(), key);
    return send(res, response.ok ? 200 : 502, body, response.headers.get('content-type') || undefined);
  } catch (e) {
    console.log('Relay error:', e.name);
    return sendError(res, 502, 'upstream_failed');
  }
}

module.exports = { handleRelay };
