// NEO fork — Grammar's own AI settings (adr-018)
//
// Pure: the endpoint, model, and system prompt the grammar pass uses. Grammar
// keeps its own values and its own key; a missing value falls back to the Rewrite
// settings so a writer who already configured one model is not asked twice.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoGrammarConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ENDPOINT = 'http://127.0.0.1:8080/v1';
  const MODEL = 'qwen3.5-4b';
  const MAX_ENDPOINT = 200;
  const MAX_MODEL = 80;
  const MAX_PROMPT = 8000;
  const SECRET = 'grammar-key';

  function clean(value, max) {
    return typeof value === 'string' ? value.replaceAll(String.fromCharCode(0), '').slice(0, max) : '';
  }

  // An empty prompt means "use the prompt that ships with NEO", so the field can
  // stay blank for a writer who only wants to change the model.
  function defaultSettings() {
    return { endpoint: ENDPOINT, model: MODEL, prompt: '' };
  }

  // What is actually written in settings.json: an empty endpoint or model means
  // "follow the Rewrite setting", and an empty prompt means NEO's own prompt.
  function storedSettings(value) {
    const own = value && typeof value === 'object' ? value : {};
    return {
      endpoint: clean(own.endpoint, MAX_ENDPOINT).trim(),
      model: clean(own.model, MAX_MODEL).trim(),
      prompt: clean(own.prompt, MAX_PROMPT),
      // Set when the writer emptied the key on purpose, so an unset grammar key no
      // longer quietly borrows the Rewrite key.
      keyCleared: own.keyCleared === true
    };
  }

  function normalizeSettings(value, fallback) {
    const own = storedSettings(value);
    const other = fallback && typeof fallback === 'object' ? fallback : {};
    return {
      endpoint: own.endpoint || clean(other.endpoint, MAX_ENDPOINT).trim() || ENDPOINT,
      model: own.model || clean(other.model, MAX_MODEL).trim() || MODEL,
      prompt: own.prompt,
      keyCleared: own.keyCleared
    };
  }

  function systemFor(settings, builtin) {
    const custom = clean(settings && settings.prompt, MAX_PROMPT).trim();
    return custom || String(builtin || '');
  }

  return {
    ENDPOINT, MODEL, MAX_ENDPOINT, MAX_MODEL, MAX_PROMPT, SECRET,
    defaultSettings, storedSettings, normalizeSettings, systemFor
  };
});
