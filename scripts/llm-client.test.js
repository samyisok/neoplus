// NEO fork — the local chat client shared by Rephrase and Grammar (adr-017)
//
// One loopback-only POST path: endpoint resolution, redirect refusal, timeout,
// status mapping, and an empty answer. It never logs the prompt or the text.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const client = require('../neo-ext/llm-client.js');

function stub(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

const lookup = async () => [{ address: '127.0.0.1', family: 4 }];

test('llm-client: one POST carries the model, messages, and key', async () => {
  let seen = null;
  const { server, base } = await stub((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'clean' } }] }));
    });
  });
  try {
    const out = await client.postChat({
      endpoint: base + '/v1', model: 'qwen', key: 'secret', system: 'S', user: 'U',
      temperature: 0.2, maxTokens: 900, timeoutMs: 2000, lookup
    });
    assert.equal(out.ok, true);
    assert.equal(out.text, 'clean');
    assert.match(seen.url, /\/v1\/chat\/completions$/);
    assert.equal(seen.auth, 'Bearer secret');
    assert.equal(seen.body.model, 'qwen');
    assert.equal(seen.body.temperature, 0.2);
    assert.equal(seen.body.max_tokens, 900);
    assert.equal(seen.body.stream, false);
    assert.deepEqual(seen.body.messages, [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' }
    ]);
  } finally { server.close(); }
});

test('llm-client: a redirect is not followed', async () => {
  let hits = 0;
  const { server, base } = await stub((req, res) => {
    hits += 1;
    res.writeHead(307, { Location: 'http://127.0.0.1:1/elsewhere' });
    res.end();
  });
  try {
    const out = await client.postChat({
      endpoint: base + '/v1', model: 'qwen', system: 'S', user: 'U', timeoutMs: 2000, lookup
    });
    assert.equal(out.reason, 'endpoint');
    assert.equal(hits, 1);
  } finally { server.close(); }
});

test('llm-client: a final URL outside loopback is refused', () => {
  assert.equal(client.finalEndpointAllowed('http://127.0.0.1:8080/v1/chat/completions'), true);
  assert.equal(client.finalEndpointAllowed('http://[::1]:8080/v1'), true);
  assert.equal(client.finalEndpointAllowed('http://example.com/v1'), false);
  assert.equal(client.finalEndpointAllowed('http://0.0.0.0:8080/v1'), false);
});

test('llm-client: a non-loopback localhost lookup is refused', async () => {
  const out = await client.resolveEndpoint('http://localhost:8080/v1', async () => [{ address: '203.0.113.9' }]);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'host');
});

test('llm-client: a stalled answer times out', async () => {
  const { server, base } = await stub(() => { /* never answers */ });
  try {
    const out = await client.postChat({
      endpoint: base + '/v1', model: 'qwen', system: 'S', user: 'U', timeoutMs: 60, lookup
    });
    assert.equal(out.reason, 'timeout');
  } finally { server.close(); }
});

test('llm-client: headers followed by a stalled body still time out', async () => {
  const { server, base } = await stub((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"choices":[');
  });
  try {
    const out = await client.postChat({ endpoint: base + '/v1', model: 'q', system: 'S', user: 'U', timeoutMs: 80, lookup });
    assert.equal(out.reason, 'timeout');
  } finally { server.close(); }
});

test('llm-client: 401, an empty answer, and a closed port map to reasons', async () => {
  const { server, base } = await stub((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  try {
    const auth = await client.postChat({ endpoint: base + '/v1', model: 'q', system: 'S', user: 'U', timeoutMs: 2000, lookup });
    assert.equal(auth.reason, 'auth');
  } finally { server.close(); }

  const { server: emptyServer, base: emptyBase } = await stub((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '   ' } }] }));
  });
  try {
    const empty = await client.postChat({ endpoint: emptyBase + '/v1', model: 'q', system: 'S', user: 'U', timeoutMs: 2000, lookup });
    assert.equal(empty.reason, 'empty');
  } finally { emptyServer.close(); }

  const network = await client.postChat({ endpoint: 'http://127.0.0.1:1/v1', model: 'q', system: 'S', user: 'U', timeoutMs: 500, lookup });
  assert.equal(network.reason, 'network');
});

test('llm-client: a body over the cap is refused before parsing', async () => {
  const { server, base } = await stub((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': String(client.MAX_RESPONSE + 1)
    });
    res.end('{}');
  });
  try {
    const out = await client.postChat({ endpoint: base + '/v1', model: 'q', system: 'S', user: 'U', timeoutMs: 2000, lookup });
    assert.equal(out.reason, 'large');
  } finally { server.close(); }
});

test('llm-client: an external abort cancels the request', async () => {
  const { server, base } = await stub(() => { /* never answers */ });
  try {
    const controller = new AbortController();
    const pending = client.postChat({
      endpoint: base + '/v1', model: 'q', system: 'S', user: 'U', timeoutMs: 5000, lookup,
      signal: controller.signal
    });
    setTimeout(() => controller.abort(), 30);
    const out = await pending;
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'cancelled');
  } finally { server.close(); }
});

test('llm-client: test connection uses the same endpoint rule and a typed key', async () => {
  let auth = '';
  const { server, base } = await stub((req, res) => {
    auth = req.headers.authorization || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  try {
    assert.equal((await client.probe({ endpoint: base, key: 'typed', lookup })).ok, true);
    assert.equal(auth, 'Bearer typed');
    assert.equal((await client.probe({ endpoint: 'https://api.example.com/v1', key: 'typed', lookup })).reason, 'endpoint');
  } finally { server.close(); }
});
