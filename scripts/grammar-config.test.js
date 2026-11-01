// NEO fork — Grammar's own AI settings (adr-018)

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const config = require('../neo-ext/lib/grammar-config.js');

test('grammar-config: the defaults point at the local model and keep the built-in prompt', () => {
  const settings = config.defaultSettings();
  assert.equal(settings.endpoint, 'http://127.0.0.1:8080/v1');
  assert.equal(settings.model, 'qwen3.5-4b');
  assert.equal(settings.prompt, '');
});

test('grammar-config: grammar values win, and an empty one falls back to Rewrite', () => {
  const rephrase = { endpoint: 'http://127.0.0.1:9090/v1', model: 'other-model', prompt: 'rewrite' };
  const own = config.normalizeSettings({ endpoint: '', model: 'grammar-model', prompt: 'be strict' }, rephrase);
  assert.equal(own.endpoint, 'http://127.0.0.1:9090/v1');
  assert.equal(own.model, 'grammar-model');
  assert.equal(own.prompt, 'be strict');

  const empty = config.normalizeSettings({}, rephrase);
  assert.equal(empty.endpoint, 'http://127.0.0.1:9090/v1');
  assert.equal(empty.model, 'other-model');
  assert.equal(empty.prompt, '', 'an empty prompt means the built-in one');
});

test('grammar-config: values are capped and control characters are removed', () => {
  const out = config.normalizeSettings({
    endpoint: 'http://127.0.0.1:8080/v1' + 'x'.repeat(400),
    model: 'm'.repeat(200),
    prompt: 'p'.repeat(9000)
  });
  assert.equal(out.endpoint.length, config.MAX_ENDPOINT);
  assert.equal(out.model.length, config.MAX_MODEL);
  assert.equal(out.prompt.length, config.MAX_PROMPT);
  const cleaned = config.normalizeSettings({ prompt: 'a' + String.fromCharCode(0) + 'b' });
  assert.equal(cleaned.prompt, 'ab');
});

test('grammar-config: a custom prompt wins, an empty one uses the built-in', () => {
  assert.equal(config.systemFor({ prompt: '  You check grammar.  ' }, 'built-in'), 'You check grammar.');
  assert.equal(config.systemFor({ prompt: '   ' }, 'built-in'), 'built-in');
  assert.equal(config.systemFor({}, 'built-in'), 'built-in');
  assert.equal(config.systemFor(null, 'built-in'), 'built-in');
});
