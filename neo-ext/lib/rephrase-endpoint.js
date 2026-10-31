// NEO fork — the local endpoint rule (adr-012)
//
// Pure: Save, Test, and the model call all ask this module whether an address
// may receive manuscript text. Only this machine, no userinfo, no redirects.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoRephraseEndpoint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function parse(raw) {
    try { return new URL(String(raw || '')); } catch { return null; }
  }

  function hostOf(url) {
    return String(url.hostname || '').toLowerCase();
  }

  function isLoopbackAddress(value) {
    const host = String(value || '').replace(/^\[|\]$/g, '').toLowerCase();
    if (!host) return false;
    if (host === '::1') return true;
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!v4) return false;
    return v4.slice(1).every((part) => Number(part) <= 255) && Number(v4[1]) === 127;
  }

  function checkEndpoint(raw) {
    const url = parse(raw);
    if (!url) return { ok: false, reason: 'url' };
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'scheme' };
    if (url.username || url.password) return { ok: false, reason: 'userinfo' };
    if (url.search || url.hash) return { ok: false, reason: 'url' };
    const host = hostOf(url);
    if (isLoopbackAddress(host)) return { ok: true, url: url.toString(), needsLookup: false };
    if (host === 'localhost') return { ok: true, url: url.toString(), needsLookup: true };
    return { ok: false, reason: 'host' };
  }

  function joinEndpoint(base, suffix) {
    const root = String(base || '').replace(/\/+$/, '');
    const tail = String(suffix || '');
    return root + (tail.startsWith('/') ? tail : '/' + tail);
  }

  return { checkEndpoint, joinEndpoint, isLoopbackAddress, hostOf };
});
