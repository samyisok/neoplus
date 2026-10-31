// NEO fork — the local rewriting service (adr-012)
//
// Reads the AI settings and the encrypted key, snapshots one rephrase window,
// and makes one loopback request per profile. The page never sees the key, and
// manuscript text never leaves this function except in a loopback request.

'use strict';

const crypto = require('crypto');
const dns = require('dns');
const endpointRules = require('./lib/rephrase-endpoint.js');
const promptRules = require('./lib/rephrase-prompt.js');

const SECRET = 'rephrase-key';
const SESSION_TTL = 5 * 60 * 1000;
const TIMEOUT = 30000;

let deps = null;
const sessions = new Map();

function fail(reason) {
  return { ok: false, reason };
}

function safeSettings() {
  try {
    const all = deps && typeof deps.readSettings === 'function' ? deps.readSettings() : {};
    return promptRules.normalizeSettings(all && all.rephrase);
  } catch {
    return promptRules.defaultSettings();
  }
}

function secureStorage() {
  try {
    const { safeStorage } = require('electron');
    return !!(safeStorage && safeStorage.isEncryptionAvailable());
  } catch { return false; }
}

function hasKey() {
  try { return !!(deps && typeof deps.readSecret === 'function' && deps.readSecret(SECRET)); } catch { return false; }
}

function keyOf() {
  try { return deps && typeof deps.readSecret === 'function' ? deps.readSecret(SECRET) : ''; } catch { return ''; }
}

function logReason(reason) {
  try { deps.logError && deps.logError('rephrase: ' + reason); } catch { /* logging is a nicety */ }
}

async function resolveEndpoint(raw, lookup = dns.promises.lookup) {
  const rule = endpointRules.checkEndpoint(raw);
  if (!rule.ok) return rule;
  if (!rule.needsLookup) return rule;
  try {
    const answers = await lookup('localhost', { all: true });
    const list = Array.isArray(answers) ? answers : [answers];
    if (!list.length || !list.every((a) => endpointRules.isLoopbackAddress(a && a.address))) {
      return fail('host');
    }
  } catch {
    return fail('host');
  }
  return rule;
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

async function request(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function reasonForStatus(status, body) {
  if (status === 401 || status === 403) return 'auth';
  const detail = String((body && body.error && (body.error.code || body.error.message)) || '');
  if (/model/i.test(detail)) return 'model';
  if (status === 404) return 'endpoint';
  return 'http';
}

async function runOne(session, request_) {
  const rule = await resolveEndpoint(session.endpoint, deps.lookup);
  if (!rule.ok) return fail('endpoint');
  const profile = session.profiles[request_.profileId];
  if (!profile) return fail('profile');
  if (typeof request_.text !== 'string' || request_.text.length > promptRules.MAX_SELECTION) return fail('long');
  const text = request_.text;
  const before = cleanText(request_.before, promptRules.MAX_REFERENCE);
  const after = cleanText(request_.after, promptRules.MAX_REFERENCE);
  if ((typeof request_.before === 'string' && request_.before.length > promptRules.MAX_REFERENCE)
    || (typeof request_.after === 'string' && request_.after.length > promptRules.MAX_REFERENCE)) return fail('long');
  if (!text.trim()) return fail('empty');
  const ruleUrl = endpointRules.joinEndpoint(rule.url, '/chat/completions');
  const messages = promptRules.buildMessages({ settings: session, profile, text, before, after });
  const key = keyOf();
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = 'Bearer ' + key;
  const body = JSON.stringify({
    model: session.model,
    messages: [{ role: 'system', content: messages.system }, { role: 'user', content: messages.user }],
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 1200,
    stream: false
  });
  let res;
  try {
    res = await request(ruleUrl, {
      method: 'POST', headers, body, redirect: 'manual'
    }, deps.timeoutMs);
  } catch (err) {
    const reason = err && err.name === 'AbortError' ? 'timeout' : 'network';
    logReason(reason);
    return fail(reason);
  }
  if (res.status >= 300 && res.status < 400) return fail('endpoint');
  try {
    const finalUrl = new URL(res.url);
    if (!endpointRules.checkEndpoint(finalUrl.toString()).ok) return fail('endpoint');
  } catch { return fail('endpoint'); }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const reason = reasonForStatus(res.status, data);
    logReason(reason);
    return fail(reason);
  }
  const value = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content : '';
  if (typeof value !== 'string' || !value.trim()) return fail('empty');
  return { ok: true, text: value.trim() };
}

function expiry() {
  const now = deps && typeof deps.now === 'function' ? deps.now() : Date.now();
  for (const [id, session] of sessions) if (now - session.at > SESSION_TTL) sessions.delete(id);
}

function create(dependencies) {
  deps = dependencies || {};
  if (!deps.lookup) deps.lookup = dns.promises.lookup;
  return { start, run, end, validate, testConnection, get, save };
}

async function start() {
  expiry();
  const settings = safeSettings();
  const endpoint = await resolveEndpoint(settings.endpoint, deps.lookup);
  if (!endpoint.ok) return fail(endpoint.reason || 'endpoint');
  const id = 'rephrase-' + crypto.randomUUID();
  if (sessions.size >= 8) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
  sessions.set(id, {
    endpoint: settings.endpoint,
    model: settings.model,
    prompt: settings.prompt,
    profiles: settings.profiles.map((p) => ({ ...p })),
    at: deps && typeof deps.now === 'function' ? deps.now() : Date.now(),
    busy: false,
    lastAt: deps && typeof deps.now === 'function' ? deps.now() : Date.now()
  });
  return { ok: true, session: id, profiles: settings.profiles.map((p, index) => ({ id: index, label: p.label })) };
}

function run(payload) {
  expiry();
  const session = payload && sessions.get(payload.session);
  if (!session) return Promise.resolve(fail('session'));
  if (session.busy) return Promise.resolve(fail('busy'));
  const profileId = payload && payload.profileId;
  if (!Number.isInteger(profileId) || profileId < 0 || profileId >= session.profiles.length) {
    return Promise.resolve(fail('profile'));
  }
  session.busy = true;
  return runOne(session, payload).finally(() => { session.busy = false; });
}

function end(payload) {
  if (payload && payload.session) sessions.delete(payload.session);
  return { ok: true };
}

async function validate(value) {
  if (value && typeof value.prompt === 'string' && !value.prompt.trim()) return fail('prompt');
  if (value && typeof value.model === 'string' && value.model.length > promptRules.MAX_MODEL) return fail('limits');
  if (value && typeof value.prompt === 'string' && value.prompt.length > promptRules.MAX_PROMPT) return fail('limits');
  if (value && typeof value.endpoint === 'string' && value.endpoint.length > 200) return fail('limits');
  const rawProfiles = value && Array.isArray(value.profiles) ? value.profiles : [];
  for (const profile of rawProfiles) {
    if (profile && typeof profile.label === 'string' && profile.label.length > promptRules.MAX_LABEL) return fail('limits');
    if (profile && typeof profile.instruction === 'string' && profile.instruction.length > promptRules.MAX_INSTRUCTION) return fail('limits');
  }
  const settings = promptRules.normalizeSettings(value);
  const endpoint = await resolveEndpoint(settings.endpoint, deps.lookup);
  if (!endpoint.ok) return fail(endpoint.reason || 'endpoint');
  if (!settings.model.trim()) return fail('modelId');
  if (!settings.prompt.trim()) return fail('prompt');
  const list = Array.isArray(value && value.profiles) ? value.profiles : [];
  if (list.length < 2 || list.length > promptRules.MAX_PROFILES) return fail('profiles');
  const seen = new Set();
  for (const profile of list) {
    const label = String((profile && profile.label) || '').trim().toLowerCase();
    const instruction = String((profile && profile.instruction) || '').trim();
    if (!label || !instruction) return fail('profiles');
    if (seen.has(label)) return fail('profiles');
    seen.add(label);
  }
  if (!settings.endpoint) return fail('endpoint');
  return { ok: true, settings };
}

async function save(value) {
  const checked = await validate(value);
  if (!checked.ok) return checked;
  try {
    const all = deps.readSettings ? deps.readSettings() : {};
    deps.writeSettings({ ...all, rephrase: checked.settings });
    return { ok: true, settings: checked.settings };
  } catch {
    logReason('save');
    return fail('save');
  }
}

function get() {
  return { ok: true, settings: safeSettings(), hasKey: hasKey(), secureStorage: secureStorage() };
}

async function testConnection(input) {
  const settings = safeSettings();
  const raw = input && typeof input.endpoint === 'string' && input.endpoint ? input.endpoint : settings.endpoint;
  const rule = await resolveEndpoint(raw, deps.lookup);
  if (!rule.ok) return fail('endpoint');
  const key = input && typeof input.key === 'string' && input.key ? input.key : keyOf();
  const headers = {};
  if (key) headers.Authorization = 'Bearer ' + key;
  try {
    const res = await request(endpointRules.joinEndpoint(rule.url, '/models'), { method: 'GET', headers, redirect: 'manual' }, 5000);
    if (res.status >= 300 && res.status < 400) return fail('endpoint');
    try {
      if (!endpointRules.checkEndpoint(new URL(res.url).toString()).ok) return fail('endpoint');
    } catch { return fail('endpoint'); }
    if (res.status === 401 || res.status === 403) return fail('auth');
    if (!res.ok) return fail('http');
    return { ok: true };
  } catch (err) {
    return fail(err && err.name === 'AbortError' ? 'timeout' : 'network');
  }
}

function init(dependencies, ipcMain) {
  create(dependencies);
  if (!ipcMain || typeof ipcMain.handle !== 'function') return;
  ipcMain.handle('neo-ext:get-rephrase-settings', () => get());
  ipcMain.handle('neo-ext:save-rephrase-settings', (_e, value) => save(value));
  ipcMain.handle('neo-ext:validate-rephrase-settings', (_e, value) => validate(value));
  ipcMain.handle('neo-ext:test-rephrase', (_e, input) => testConnection(input));
  ipcMain.handle('neo-ext:rephrase-start', () => start());
  ipcMain.handle('neo-ext:rephrase-run', (_e, payload) => run(payload));
  ipcMain.handle('neo-ext:rephrase-end', (_e, payload) => end(payload));
}

function menuItem(info, t) {
  if (!info || !info.rephrase) return null;
  return { label: t('Rephrase…'), action: 'rephrase-open' };
}

module.exports = { init, create, start, run, end, validate, save, get, testConnection, menuItem, SECRET, sessions };
