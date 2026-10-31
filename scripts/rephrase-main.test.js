// NEO fork — the local rewriting service (adr-012)
//
// Settings validation, one rephrase session, and one loopback HTTP call per
// profile. A stub server stands in for the local model.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const service = require('../neo-ext/rephrase-main.js');
const prompt = require('../neo-ext/lib/rephrase-prompt.js');

const at = 1_700_000_000_000;

function stub(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function room(overrides = {}) {
  let stored = {};
  const logs = [];
  const deps = {
    readSettings: () => stored,
    writeSettings: (value) => { stored = value; },
    readSecret: (name) => (name === service.SECRET ? 'secret-key' : ''),
    logError: (line) => logs.push(String(line)),
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    timeoutMs: 2000,
    ...overrides
  };
  service.create(deps);
  return { deps, logs, stored: () => stored };
}

function good(extra = {}) {
  const settings = prompt.defaultSettings();
  return { ...settings, ...extra };
}

test('rephrase-main: defaults, key presence and storage mode', () => {
  room({ readSecret: () => '' });
  const got = service.get();
  assert.equal(got.ok, true);
  assert.equal(got.hasKey, false);
  assert.equal(got.settings.profiles.length, 5);
  room();
  assert.equal(service.get().hasKey, true);
});

test('rephrase-main: save validates the endpoint, profiles and prompt before storing', async () => {
  const r = room();
  assert.equal((await service.save(good({ endpoint: 'https://api.example.com/v1' }))).ok, false);
  const few = { ...good(), profiles: [good().profiles[0]] };
  assert.equal((await service.save(few)).reason, 'profiles');
  const dup = { ...good(), profiles: [good().profiles[0], { ...good().profiles[0] }] };
  assert.equal((await service.save(dup)).reason, 'profiles');
  assert.equal((await service.save(good({ prompt: '' }))).reason, 'prompt');
  assert.equal(Object.keys(r.stored()).length, 0, 'nothing was written');
  const saved = await service.save(good({ endpoint: 'http://localhost:8080/v1' }));
  assert.equal(saved.ok, true);
  assert.equal(r.stored().rephrase.endpoint, 'http://localhost:8080/v1');
});

test('rephrase-main: a localhost lookup that is not loopback is refused', async () => {
  const r = room({ lookup: async () => [{ address: '203.0.113.9', family: 4 }] });
  assert.equal((await service.save(good({ endpoint: 'http://localhost:8080/v1' }))).reason, 'host');
  assert.equal(Object.keys(r.stored()).length, 0);
});

test('rephrase-main: a window keeps the snapshot it opened with, and caps are enforced', async () => {
  const seen = [];
  const { server, base } = await stub((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen.push({ url: req.url, header: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'A better line.' } }] }));
    });
  });
  try {
    const r = room();
    await service.save(good({ endpoint: base + '/v1', profiles: [
      { label: 'Polite', instruction: 'OLD instruction' },
      { label: 'Terse', instruction: 'short' }
    ] }));
    const started = await service.start();
    assert.equal(started.ok, true);
    assert.deepEqual(started.profiles.map((p) => p.label), ['Polite', 'Terse']);
    await service.save(good({ endpoint: base + '/v1', profiles: [
      { label: 'Polite', instruction: 'NEW instruction' },
      { label: 'Terse', instruction: 'short' }
    ] }));
    const out = await service.run({ session: started.session, profileId: 0, text: 'a line', before: 'b', after: 'c' });
    assert.equal(out.ok, true);
    assert.equal(out.text, 'A better line.');
    assert.equal(seen[0].header, 'Bearer secret-key');
    assert.match(seen[0].url, /\/v1\/chat\/completions$/);
    assert.match(JSON.stringify(seen[0].body), /OLD instruction/);
    assert.equal((await service.run({ session: started.session, profileId: 9, text: 'a line' })).reason, 'profile');
    assert.equal((await service.run({ session: 'nope', profileId: 0, text: 'a line' })).reason, 'session');
    assert.equal((await service.run({ session: started.session, profileId: 0, text: 'x'.repeat(1201) })).reason, 'limits');
    service.end({ session: started.session });
    assert.equal((await service.run({ session: started.session, profileId: 0, text: 'a line' })).reason, 'session');
    assert.equal(r.logs.some((line) => /a line|secret-key/.test(line)), false);
  } finally { server.close(); }
});

test('rephrase-main: status answers map to reasons and a redirect is not followed', async () => {
  let hits = 0;
  const { server, base } = await stub((req, res) => {
    hits += 1;
    if (req.url.endsWith('/models')) { res.writeHead(200); res.end('{}'); return; }
    res.writeHead(307, { Location: 'http://127.0.0.1:1/elsewhere' });
    res.end();
  });
  try {
    room();
    await service.save(good({ endpoint: base + '/v1' }));
    const started = await service.start();
    const out = await service.run({ session: started.session, profileId: 0, text: 'a line' });
    assert.equal(out.reason, 'endpoint');
    assert.equal(hits, 1, 'the redirect target was never requested');
  } finally { server.close(); }
});

test('rephrase-main: auth, model, network and timeout reasons', async () => {
  const cases = [
    { status: 401, body: '{}', reason: 'auth' },
    { status: 404, body: JSON.stringify({ error: { message: 'model not found' } }), reason: 'model' },
    { status: 404, body: '{}', reason: 'notFound' }
  ];
  for (const item of cases) {
    const { server, base } = await stub((req, res) => { res.writeHead(item.status, { 'Content-Type': 'application/json' }); res.end(item.body); });
    try {
      room();
      await service.save(good({ endpoint: base + '/v1' }));
      const started = await service.start();
      assert.equal((await service.run({ session: started.session, profileId: 0, text: 'a line' })).reason, item.reason);
    } finally { server.close(); }
  }
  const { server, base } = await stub(() => { /* never answers */ });
  try {
    room({ timeoutMs: 60 });
    await service.save(good({ endpoint: base + '/v1' }));
    const started = await service.start();
    assert.equal((await service.run({ session: started.session, profileId: 0, text: 'a line' })).reason, 'timeout');
  } finally { server.close(); }
  room();
  await service.save(good({ endpoint: 'http://127.0.0.1:1/v1' }));
  const started = await service.start();
  assert.equal((await service.run({ session: started.session, profileId: 0, text: 'a line' })).reason, 'network');
});

test('rephrase-main: test connection uses a typed key, follows the endpoint rule, and stores nothing', async () => {
  let header = '';
  const { server, base } = await stub((req, res) => {
    header = req.headers.authorization || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  try {
    const r = room();
    const out = await service.testConnection({ endpoint: base, key: 'typed-key' });
    assert.equal(out.ok, true);
    assert.equal(header, 'Bearer typed-key');
    assert.equal(Object.keys(r.stored()).length, 0);
    assert.equal((await service.testConnection({ endpoint: 'https://api.example.com/v1' })).reason, 'endpoint');
  } finally { server.close(); }
});

test('rephrase-main: malformed profile ids are refused, one call per session at a time', async () => {
  const { server, base } = await stub((req, res) => {
    req.resume();
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'A better line.' } }] }));
    }, 150);
  });
  try {
    room();
    await service.save(good({ endpoint: base + '/v1' }));
    const started = await service.start();
    for (const bad of [null, '', true, [], 1.5, -1, 9]) {
      assert.equal((await service.run({ session: started.session, profileId: bad, text: 'a line' })).reason, 'profile', String(bad));
    }
    const first = service.run({ session: started.session, profileId: 0, text: 'a line' });
    const second = await service.run({ session: started.session, profileId: 1, text: 'a line' });
    assert.equal(second.reason, 'busy');
    assert.equal((await first).ok, true);
  } finally { server.close(); }
});

test('rephrase-main: a session expires five minutes after it opened', async () => {
  let clock = at;
  room({ now: () => clock, readSecret: () => '' });
  await service.save(good());
  const started = await service.start();
  clock += 4 * 60 * 1000;
  service.end({ session: started.session });
  const again = await service.start();
  clock += 6 * 60 * 1000;
  assert.equal((await service.run({ session: again.session, profileId: 0, text: 'a line' })).reason, 'session');
});

test('rephrase-main: an emptied model is refused, and a stalled body times out', async () => {
  room();
  assert.equal((await service.save({ ...good(), model: '   ' })).reason, 'modelId');

  const { server, base } = await stub((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"choices":[');
  });
  try {
    room({ timeoutMs: 80 });
    await service.save(good({ endpoint: base + '/v1' }));
    const started = await service.start();
    assert.equal((await service.run({ session: started.session, profileId: 0, text: 'a line' })).reason, 'timeout');
  } finally { server.close(); }
});

test('rephrase-main: over-long settings are refused, not truncated', async () => {
  room();
  const base = good();
  assert.equal((await service.save({ ...base, prompt: 'p'.repeat(4001) })).reason, 'limits');
  assert.equal((await service.save({ ...base, endpoint: 'http://127.0.0.1/' + 'x'.repeat(220) })).reason, 'limits');
  assert.equal((await service.save({ ...base, model: 'm'.repeat(81) })).reason, 'limits');
  assert.equal((await service.save({ ...base, profiles: [
    base.profiles[0],
    { label: 'Terse', instruction: 'i'.repeat(501) }
  ] })).reason, 'limits');
});
