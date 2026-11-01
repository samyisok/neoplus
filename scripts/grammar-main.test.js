// NEO fork — the grammar service (adr-017)
//
// Settings, a 15-minute window, and one loopback request per pass. A stub server
// stands in for the local model; no request leaves 127.0.0.1.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const service = require('../neo-ext/grammar-main.js');

const at = 1_700_000_000_000;

function stub(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function room(endpoint, overrides = {}) {
  let stored = { rephrase: { endpoint, model: 'qwen3.5-4b' } };
  let clock = at;
  let reads = 0;
  const logs = [];
  const deps = {
    readSettings: () => stored,
    readSecret: () => { reads += 1; return 'secret-key'; },
    logError: (line) => logs.push(String(line)),
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    timeoutMs: 2000,
    now: () => clock,
    ...overrides
  };
  service.create(deps);
  return {
    deps,
    logs,
    stored: () => stored,
    setEndpoint: (value) => { stored = { rephrase: { endpoint: value, model: 'qwen3.5-4b' } }; },
    setModel: (value) => { stored = { rephrase: { ...stored.rephrase, model: value } }; },
    advance: (ms) => { clock += ms; },
    reads: () => reads
  };
}

test('grammar-main: start snapshots endpoint and model but not the key', async () => {
  const { server, base } = await stub((req, res) => { res.writeHead(200); res.end('{}'); });
  try {
    const r = room(base + '/v1');
    const started = await service.start();
    assert.equal(started.ok, true);
    assert.match(started.session, /^grammar-/);
    const session = service.sessions.get(started.session);
    assert.equal(session.endpoint, base + '/v1');
    assert.equal(session.model, 'qwen3.5-4b');
    assert.equal('key' in session, false);
    assert.equal('secret' in session, false);
    assert.equal(r.reads(), 0);
  } finally { server.close(); }
});

test('grammar-main: a grammar request returns the model text with its shape', async () => {
  let seen = null;
  const { server, base } = await stub((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"quote":"stand","fix":"stood","message":"past tense"}' } }] }));
    });
  });
  try {
    room(base + '/v1');
    const started = await service.start();
    const out = await service.runGrammar({
      session: started.session, text: 'He stand here.', before: 'B', after: 'A'
    });
    assert.equal(out.ok, true);
    assert.match(out.text, /stood/);
    assert.equal(seen.temperature, 0);
    assert.equal(seen.max_tokens, 900);
    assert.equal(seen.stream, false);
    assert.match(seen.messages[0].content, /CLEAN/);
    assert.match(seen.messages[1].content, /<selection>/);
  } finally { server.close(); }
});

test('grammar-main: a style request sends the original and corrected texts', async () => {
  let seen = null;
  const { server, base } = await stub((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"quote":"middle","example":"center","message":"word"}' } }] }));
    });
  });
  try {
    room(base + '/v1');
    const started = await service.start();
    const out = await service.runStyle({
      session: started.session, text: 'He stand in the midle.', corrected: 'He stood in the middle.',
      before: '', after: ''
    });
    assert.equal(out.ok, true);
    assert.equal(seen.temperature, 0.3);
    assert.equal(seen.max_tokens, 600);
    assert.match(seen.messages[1].content, /<reference side="corrected">\nHe stood in the middle\./);
    assert.match(seen.messages[1].content, /<selection>\nHe stand in the midle\./);
  } finally { server.close(); }
});

test('grammar-main: a missing session, a busy session, and caps are refused', async () => {
  const { server, base } = await stub((req, res) => {
    req.resume();
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'CLEAN' } }] }));
    }, 120);
  });
  try {
    room(base + '/v1');
    const started = await service.start();
    assert.equal((await service.runGrammar({ session: 'nope', text: 'a line' })).reason, 'session');
    assert.equal((await service.runGrammar({ session: started.session, text: 'x'.repeat(1201) })).reason, 'limits');
    assert.equal((await service.runGrammar({ session: started.session, text: 'a line', before: 'b'.repeat(701) })).reason, 'limits');
    assert.equal((await service.runStyle({ session: started.session, text: 'a line', corrected: 'x'.repeat(2001) })).reason, 'limits');
    assert.equal((await service.runStyle({ session: started.session, text: 'a line' })).reason, 'limits');
    const first = service.runGrammar({ session: started.session, text: 'a line' });
    const second = await service.runGrammar({ session: started.session, text: 'a line' });
    assert.equal(second.reason, 'busy');
    assert.equal((await first).ok, true);
  } finally { server.close(); }
});

test('grammar-main: an empty answer is a fixed reason, not a clean text', async () => {
  const { server, base } = await stub((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '   ' } }] }));
  });
  try {
    room(base + '/v1');
    const started = await service.start();
    assert.equal((await service.runGrammar({ session: started.session, text: 'a line' })).reason, 'empty');
  } finally { server.close(); }
});

test('grammar-main: a window expires after fifteen minutes', async () => {
  const { server, base } = await stub((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'CLEAN' } }] }));
  });
  try {
    const r = room(base + '/v1');
    const started = await service.start();
    r.advance(14 * 60 * 1000);
    assert.equal((await service.runGrammar({ session: started.session, text: 'a line' })).ok, true);
    r.advance(2 * 60 * 1000);
    assert.equal((await service.runGrammar({ session: started.session, text: 'a line' })).reason, 'session');
  } finally { server.close(); }
});

test('grammar-main: eight windows are kept and the oldest is dropped', async () => {
  const { server, base } = await stub((req, res) => { res.writeHead(200); res.end('{}'); });
  try {
    room(base + '/v1');
    const ids = [];
    for (let i = 0; i < 9; i += 1) ids.push((await service.start()).session);
    assert.equal(service.sessions.size, 8);
    assert.equal(service.sessions.has(ids[0]), false);
    assert.equal(service.sessions.has(ids[8]), true);
  } finally { server.close(); }
});

test('grammar-main: the key is read per request and settings are fixed at start', async () => {
  const models = [];
  const { server, base } = await stub((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      models.push(parsed.model);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'CLEAN' } }] }));
    });
  });
  try {
    const r = room(base + '/v1');
    const started = await service.start();
    r.setModel('changed-after-open');
    assert.equal((await service.runGrammar({ session: started.session, text: 'a line' })).ok, true);
    assert.deepEqual(models, ['qwen3.5-4b']);
    assert.equal(r.reads(), 1);
    assert.equal(r.logs.some((line) => /a line|secret-key|qwen/i.test(line)), false);
  } finally { server.close(); }
});

test('grammar-main: a session belongs to its renderer and end aborts work', async () => {
  const { server, base } = await stub(() => { /* never answers */ });
  try {
    room(base + '/v1');
    const started = await service.start('7');
    assert.equal((await service.runGrammar({ session: started.session, text: 'a line' }, '8')).reason, 'session');
    const pending = service.runGrammar({ session: started.session, text: 'a line' }, '7');
    setTimeout(() => service.end({ session: started.session }, '7'), 30);
    const out = await pending;
    assert.equal(out.ok, false);
    assert.equal(service.sessions.has(started.session), false);
  } finally { server.close(); }
});

test('grammar-main: end from another renderer leaves the session alive', async () => {
  const { server, base } = await stub((req, res) => { res.writeHead(200); res.end('{}'); });
  try {
    room(base + '/v1');
    const started = await service.start('7');
    assert.equal(service.end({ session: started.session }, '8').ok, true);
    assert.equal(service.sessions.has(started.session), true);
    service.end({ session: started.session }, '7');
    assert.equal(service.sessions.has(started.session), false);
  } finally { server.close(); }
});

test('grammar-main: the menu item is built only for a grammar phrase', () => {
  const t = (s) => s;
  assert.deepEqual(service.menuItem({ grammar: true }, t), { label: 'Grammar…', action: 'grammar-open' });
  assert.equal(service.menuItem({ grammar: false }, t), null);
  assert.equal(service.menuItem({ rephrase: true }, t), null);
});

test('grammar-main: a pass waits longer than the client default when nothing is set', async () => {
  const client = require('../neo-ext/llm-client.js');
  const original = client.postChat;
  let seen = null;
  client.postChat = async (options) => { seen = options; return { ok: true, text: 'CLEAN' }; };
  try {
    const r = room('http://127.0.0.1:1/v1', { timeoutMs: undefined });
    const started = await service.start();
    assert.equal(started.ok, true);
    const out = await service.runGrammar({ session: started.session, text: 'He stood here.' }, r.owner || '');
    assert.equal(out.ok, true);
    assert.equal(seen.timeoutMs, service.GRAMMAR_TIMEOUT_MS);
    assert.ok(service.GRAMMAR_TIMEOUT_MS >= 90000, 'a 4B needs longer than 30 s for a 1,200-character answer');
  } finally {
    client.postChat = original;
  }
});

test('grammar-main: the Grammar settings supply endpoint, model, prompt, and its own key', async () => {
  const client = require('../neo-ext/llm-client.js');
  const original = client.postChat;
  let seen = null;
  client.postChat = async (options) => { seen = options; return { ok: true, text: 'CLEAN' }; };
  try {
    const r = room('http://127.0.0.1:8080/v1', {
      readSettings: () => ({
        rephrase: { endpoint: 'http://127.0.0.1:8080/v1', model: 'rewrite-model', prompt: 'rewrite' },
        grammar: { endpoint: 'http://127.0.0.1:8081/v1', model: 'grammar-model', prompt: 'MY OWN PROMPT' }
      }),
      readSecret: (name) => (name === 'grammar-key' ? 'grammar-secret' : 'rewrite-secret')
    });
    const started = await service.start();
    assert.equal(started.ok, true);
    await service.runGrammar({ session: started.session, text: 'He stood here.' }, r.owner || '');
    assert.equal(seen.endpoint, 'http://127.0.0.1:8081/v1');
    assert.equal(seen.model, 'grammar-model');
    assert.equal(seen.system, 'MY OWN PROMPT');
    assert.equal(seen.key, 'grammar-secret', 'Grammar prefers its own key');
  } finally {
    client.postChat = original;
  }
});

test('grammar-main: an empty prompt keeps the built-in one and the Rewrite key still works', async () => {
  const client = require('../neo-ext/llm-client.js');
  const original = client.postChat;
  let seen = null;
  client.postChat = async (options) => { seen = options; return { ok: true, text: 'CLEAN' }; };
  try {
    const r = room('http://127.0.0.1:8080/v1', {
      readSettings: () => ({ rephrase: { endpoint: 'http://127.0.0.1:8080/v1', model: 'rewrite-model' }, grammar: { prompt: '' } }),
      readSecret: (name) => (name === 'grammar-key' ? '' : 'rewrite-secret')
    });
    const started = await service.start();
    await service.runGrammar({ session: started.session, text: 'He stood here.' }, r.owner || '');
    assert.equal(seen.system, require('../neo-ext/lib/grammar-prompt.js').GRAMMAR_SYSTEM);
    assert.equal(seen.key, 'rewrite-secret');
    assert.equal(seen.endpoint, 'http://127.0.0.1:8080/v1');
    assert.equal(seen.model, 'rewrite-model');
  } finally {
    client.postChat = original;
  }
});

test('grammar-main: saving writes a grammar block and an empty model keeps following Rewrite', async () => {
  const written = [];
  room('http://127.0.0.1:8080/v1', {
    readSettings: () => ({ libraryDir: '/books', rephrase: { endpoint: 'http://127.0.0.1:8080/v1', model: 'rewrite-model' } }),
    writeSettings: (value) => written.push(value)
  });
  const inherited = await service.validateSettings({ endpoint: '', model: '', prompt: '' });
  assert.equal(inherited.ok, true, 'an empty field is not an error, it follows Rewrite');
  assert.equal(inherited.resolved.model, 'rewrite-model');

  const ok = await service.saveSettings({ endpoint: 'http://127.0.0.1:8080/v1', model: 'qwen3.5-4b', prompt: 'be strict' });
  assert.equal(ok.ok, true);
  assert.equal(written.length, 1);
  assert.equal(written[0].grammar.model, 'qwen3.5-4b');
  assert.equal(written[0].grammar.prompt, 'be strict');
  assert.equal(written[0].libraryDir, '/books', 'the other settings survive');
});

test('grammar-main: a save refuses to overwrite a settings file that cannot be read', async () => {
  const written = [];
  let broken = false;
  room('http://127.0.0.1:8080/v1', {
    readSettings: () => (broken ? {} : { libraryDir: '/books', rephrase: { endpoint: 'http://127.0.0.1:8080/v1' } }),
    writeSettings: (value) => written.push(value),
    settingsBroken: () => broken
  });
  const first = await service.saveSettings({ endpoint: 'http://127.0.0.1:8080/v1', model: 'qwen3.5-4b' });
  assert.equal(first.ok, true);
  broken = true;
  const lost = await service.saveSettings({ endpoint: 'http://127.0.0.1:8080/v1', model: 'qwen3.5-4b' });
  assert.equal(lost.ok, false, 'a broken file must not be replaced by the grammar block');
  assert.equal(written.length, 1, 'nothing else was written');
});

test('grammar-main: a save reports failure when there is nowhere to write', async () => {
  room('http://127.0.0.1:8080/v1', { writeSettings: undefined });
  const out = await service.saveSettings({ endpoint: 'http://127.0.0.1:8080/v1', model: 'qwen3.5-4b' });
  assert.equal(out.ok, false, 'a missing writer is not a successful save');
});

test('grammar-main: clearing the grammar key does not silently borrow the Rewrite key', async () => {
  const client = require('../neo-ext/llm-client.js');
  const original = client.postChat;
  let seen = null;
  client.postChat = async (options) => { seen = options; return { ok: true, text: 'CLEAN' }; };
  try {
    const r = room('http://127.0.0.1:8080/v1', {
      readSettings: () => ({ grammar: { keyCleared: true } }),
      readSecret: (name) => (name === 'grammar-key' ? '' : 'rewrite-secret')
    });
    const started = await service.start();
    await service.runGrammar({ session: started.session, text: 'He stood here.' }, r.owner || '');
    assert.equal(seen.key, '', 'a cleared key stays cleared');
  } finally {
    client.postChat = original;
  }
});

test('grammar-main: Test connection cannot aim the stored key at another port', async () => {
  const client = require('../neo-ext/llm-client.js');
  const original = client.probe;
  let seen = null;
  client.probe = async (options) => { seen = options; return { ok: true }; };
  try {
    room('http://127.0.0.1:8080/v1', {
      readSettings: () => ({ grammar: { endpoint: 'http://127.0.0.1:8080/v1' } }),
      readSecret: (name) => (name === 'grammar-key' ? 'grammar-secret' : 'rewrite-secret')
    });
    await service.testConnection({ endpoint: 'http://127.0.0.1:9999/v1' });
    assert.equal(seen.endpoint, 'http://127.0.0.1:8080/v1', 'the stored endpoint is used when no key is typed');
    assert.equal(seen.key, 'grammar-secret');
  } finally {
    client.probe = original;
  }
});
