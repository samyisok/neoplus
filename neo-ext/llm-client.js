// NEO fork — the local chat client shared by Rephrase and Grammar (adr-017)
//
// One loopback-only request path. It never logs the prompt, the manuscript, the
// URL, or the key: callers get a fixed reason and decide what to show.

'use strict';

const dns = require('dns');
const endpointRules = require('./lib/rephrase-endpoint.js');

const TIMEOUT = 30000;
const MAX_RESPONSE = 2 * 1024 * 1024;

function fail(reason) {
  return { ok: false, reason };
}

async function resolveEndpoint(raw, lookup = dns.promises.lookup) {
  const rule = endpointRules.checkEndpoint(raw);
  if (!rule.ok) return rule;
  if (!rule.needsLookup) return rule;
  try {
    const answers = await lookup('localhost', { all: true });
    const list = Array.isArray(answers) ? answers : [answers];
    if (!list.length || !list.every((answer) => endpointRules.isLoopbackAddress(answer && answer.address))) {
      return fail('host');
    }
  } catch {
    return fail('host');
  }
  return rule;
}

// The timeout covers the whole answer: a server that sends headers and then
// stalls cannot leave a window (and its session) hanging forever. The body is
// capped too; a loopback listener cannot make the main process allocate without
// bound.
async function readCapped(res, max) {
  const declared = Number(res.headers && res.headers.get ? res.headers.get('content-length') : 0);
  if (Number.isFinite(declared) && declared > max) {
    try { await res.body?.cancel?.(); } catch { /* gone */ }
    return { text: '', large: true };
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    return { text: '', large: true };
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > max) {
        try { await reader.cancel(); } catch { /* gone */ }
        return { text: '', large: true };
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try { reader.releaseLock(); } catch { /* gone */ }
  }
  return { text: Buffer.concat(chunks).toString('utf8'), large: false };
}

async function requestJson(url, options, timeoutMs, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || TIMEOUT);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await readCapped(res, MAX_RESPONSE);
    let data = null;
    if (!body.large) {
      try { data = JSON.parse(body.text); } catch { data = null; }
    }
    return { res, data, large: body.large };
  } finally {
    clearTimeout(timer);
    if (signal) { try { signal.removeEventListener('abort', onAbort); } catch { /* gone */ } }
  }
}

// A response URL is only trusted when the same loopback rule accepts it. This is
// checked even with redirect: 'manual', because a proxy or a test path can still
// answer from somewhere else.
function finalEndpointAllowed(url) {
  try {
    return endpointRules.checkEndpoint(new URL(url).toString()).ok;
  } catch {
    return false;
  }
}

function reasonForStatus(status, body) {
  if (status === 401 || status === 403) return 'auth';
  const detail = String((body && body.error && (body.error.code || body.error.message)) || '');
  if (/model/i.test(detail)) return 'model';
  if (status === 404) return 'notFound';
  return 'http';
}

async function postChat({
  endpoint, model, key, system, user,
  temperature = 0.2, maxTokens = 900, timeoutMs, lookup, signal, logReason
} = {}) {
  const rule = await resolveEndpoint(endpoint, lookup || dns.promises.lookup);
  if (!rule.ok) return fail('endpoint');
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = 'Bearer ' + key;
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature,
    top_p: 0.9,
    max_tokens: maxTokens,
    stream: false
  });
  let res;
  let data = null;
  let large = false;
  try {
    ({ res, data, large } = await requestJson(
      endpointRules.joinEndpoint(rule.url, '/chat/completions'),
      { method: 'POST', headers, body, redirect: 'manual' },
      timeoutMs,
      signal
    ));
  } catch (err) {
    const reason = err && err.name === 'AbortError'
      ? (signal && signal.aborted ? 'cancelled' : 'timeout')
      : 'network';
    if (logReason) logReason(reason);
    return fail(reason);
  }
  if (large) {
    if (logReason) logReason('large');
    return fail('large');
  }
  if (res.status >= 300 && res.status < 400) {
    if (logReason) logReason('endpoint');
    return fail('endpoint');
  }
  if (!finalEndpointAllowed(res.url)) {
    if (logReason) logReason('endpoint');
    return fail('endpoint');
  }
  if (!res.ok) {
    const reason = reasonForStatus(res.status, data);
    if (logReason) logReason(reason);
    return fail(reason);
  }
  const value = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content : '';
  if (typeof value !== 'string' || !value.trim()) {
    if (logReason) logReason('empty');
    return fail('empty');
  }
  return { ok: true, text: value.trim() };
}

async function probe({ endpoint, key, lookup, timeoutMs = 5000 } = {}) {
  const rule = await resolveEndpoint(endpoint, lookup || dns.promises.lookup);
  if (!rule.ok) return fail('endpoint');
  const headers = {};
  if (key) headers.Authorization = 'Bearer ' + key;
  try {
    const { res, large } = await requestJson(
      endpointRules.joinEndpoint(rule.url, '/models'),
      { method: 'GET', headers, redirect: 'manual' },
      timeoutMs
    );
    if (large) return fail('large');
    if (res.status >= 300 && res.status < 400) return fail('endpoint');
    if (!finalEndpointAllowed(res.url)) return fail('endpoint');
    if (res.status === 401 || res.status === 403) return fail('auth');
    if (!res.ok) return fail('http');
    return { ok: true };
  } catch (err) {
    return fail(err && err.name === 'AbortError' ? 'timeout' : 'network');
  }
}

module.exports = {
  TIMEOUT, MAX_RESPONSE, fail, resolveEndpoint, requestJson, finalEndpointAllowed, reasonForStatus, postChat, probe
};
