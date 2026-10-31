// NEO fork — the local endpoint rule (adr-012)
//
// Pure: protocol, host allowlist, no userinfo, path joining, loopback answers.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const ep = require('../neo-ext/lib/rephrase-endpoint.js');

test('rephrase-endpoint: literal loopback is accepted and localhost asks for lookup', () => {
  assert.equal(ep.checkEndpoint('http://127.0.0.1:8080/v1').ok, true);
  assert.equal(ep.checkEndpoint('http://[::1]:8080/v1').ok, true);
  const local = ep.checkEndpoint('http://localhost:8080/v1');
  assert.equal(local.ok, true);
  assert.equal(local.needsLookup, true);
});

test('rephrase-endpoint: remote hosts, bind-all, userinfo and other schemes are refused', () => {
  for (const bad of ['https://api.example.com/v1', 'http://0.0.0.0:8080/v1', 'http://[::]:8080', 'ftp://127.0.0.1/v1', 'not a url', 'http://user:pw@127.0.0.1:8080/v1', 'http://127.0.0.1:8080/v1?key=1', 'http://127.0.0.1:8080/v1#x']) {
    assert.equal(ep.checkEndpoint(bad).ok, false, bad);
  }
});

test('rephrase-endpoint: loopback answers and path joining', () => {
  assert.equal(ep.isLoopbackAddress('127.0.0.1'), true);
  assert.equal(ep.isLoopbackAddress('127.1.2.3'), true);
  assert.equal(ep.isLoopbackAddress('::1'), true);
  assert.equal(ep.isLoopbackAddress('192.168.1.4'), false);
  assert.equal(ep.joinEndpoint('http://127.0.0.1:8080/v1', '/chat/completions'), 'http://127.0.0.1:8080/v1/chat/completions');
  assert.equal(ep.joinEndpoint('http://127.0.0.1:8080/v1/', '/models'), 'http://127.0.0.1:8080/v1/models');
});
