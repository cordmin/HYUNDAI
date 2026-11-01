const assert = require('node:assert/strict');
const { test } = require('node:test');
const { handleRelay } = require('../lib/relay');

const ENV = { NEIS_API_KEY: 'neis-secret', TOUR_API_KEY: 'tour+secret/key==' };

function fakeRes() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };
}

function fakeFetcher(body, ok = true) {
  const fetcher = async url => {
    fetcher.url = url;
    return { ok, text: async () => body, headers: new Headers({ 'content-type': 'application/json' }) };
  };
  return fetcher;
}

async function call(url, { method = 'GET', env = ENV, fetcher = fakeFetcher('{}') } = {}) {
  const res = fakeRes();
  await handleRelay({ method, url }, res, env, fetcher);
  return res;
}

test('나이스 요청에 서버의 키를 붙이고 라우팅 값은 넘기지 않는다', async () => {
  const fetcher = fakeFetcher('{"ok":true}');
  const res = await call('/api/relay?source=neis&service=schoolInfo&Type=json&SCHUL_NM=%EB%AA%A9%ED%8F%AC', { fetcher });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '{"ok":true}');
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  const upstream = new URL(fetcher.url);
  assert.equal(upstream.origin + upstream.pathname, 'https://open.neis.go.kr/hub/schoolInfo');
  assert.equal(upstream.searchParams.get('KEY'), 'neis-secret');
  assert.equal(upstream.searchParams.get('SCHUL_NM'), '목포');
  assert.equal(upstream.searchParams.has('source'), false);
  assert.equal(upstream.searchParams.has('service'), false);
});

test('요청에 키를 끼워 넣어도 서버의 키만 쓴다', async () => {
  const fetcher = fakeFetcher('{}');
  await call('/api/relay?source=neis&service=schoolInfo&KEY=stolen', { fetcher });
  assert.deepEqual(new URL(fetcher.url).searchParams.getAll('KEY'), ['neis-secret']);
});

test('관광공사 키는 한 번만 인코딩한다', async () => {
  const plain = fakeFetcher('{}');
  await call('/api/relay?source=tour&service=searchKeyword2&keyword=a', { fetcher: plain });
  assert.ok(plain.url.includes('serviceKey=tour%2Bsecret%2Fkey%3D%3D'));

  const encoded = fakeFetcher('{}');
  const env = { TOUR_API_KEY: 'tour%2Bsecret' };
  await call('/api/relay?source=tour&service=searchKeyword2&keyword=a', { env, fetcher: encoded });
  assert.ok(encoded.url.endsWith('serviceKey=tour%2Bsecret'));
});

test('허용하지 않은 창구는 막는다', async () => {
  const fetcher = fakeFetcher('{}');
  assert.equal((await call('/api/relay?source=neis&service=other', { fetcher })).statusCode, 404);
  assert.equal((await call('/api/relay?source=other&service=schoolInfo', { fetcher })).statusCode, 404);
  assert.equal(fetcher.url, undefined);
});

test('GET 말고는 막는다', async () => {
  assert.equal((await call('/api/relay?source=neis&service=schoolInfo', { method: 'POST' })).statusCode, 405);
});

test('키가 없으면 알려 준다', async () => {
  const res = await call('/api/relay?source=neis&service=schoolInfo', { env: {} });
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(res.body).error, 'key_not_set');
});

test('응답에 키가 섞여 나오면 지운다', async () => {
  const res = await call('/api/relay?source=neis&service=schoolInfo', { fetcher: fakeFetcher('url=neis-secret') });
  assert.equal(res.body, 'url=');
});

test('창구 오류는 저장해 두지 않는다', async () => {
  const res = await call('/api/relay?source=neis&service=schoolInfo', { fetcher: fakeFetcher('down', false) });
  assert.equal(res.statusCode, 502);
  assert.equal(res.headers['Cache-Control'], undefined);
});

test('연결이 끊기면 키 없이 실패를 알린다', async () => {
  const fetcher = async () => { throw new Error('neis-secret'); };
  const res = await call('/api/relay?source=neis&service=schoolInfo', { fetcher });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.includes('neis-secret'), false);
});
