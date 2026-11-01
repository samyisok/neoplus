// NEO fork — the local rewriting service (adr-012)
//
// Reads the AI settings and the encrypted key, snapshots one rephrase window,
// and makes one loopback request per profile. The page never sees the key, and
// manuscript text never leaves this function except in a loopback request.

'use strict';

const crypto = require('crypto');
const client = require('./llm-client.js');
const promptRules = require('./lib/rephrase-prompt.js');

const SECRET = 'rephrase-key';
const SESSION_TTL = 5 * 60 * 1000;

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
  try { deps.logError && deps.logError('rephrase', new Error(reason)); } catch { /* logging is a nicety */ }
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

async function runOne(session, request_) {
  const profile = session.profiles[request_.profileId];
  if (!profile) return fail('profile');
  if (typeof request_.text !== 'string' || request_.text.length > promptRules.MAX_SELECTION) return fail('limits');
  const text = request_.text;
  const before = cleanText(request_.before, promptRules.MAX_REFERENCE);
  const after = cleanText(request_.after, promptRules.MAX_REFERENCE);
  if ((typeof request_.before === 'string' && request_.before.length > promptRules.MAX_REFERENCE)
    || (typeof request_.after === 'string' && request_.after.length > promptRules.MAX_REFERENCE)) return fail('limits');
  if (!text.trim()) return fail('empty');
  const messages = promptRules.buildMessages({ settings: session, profile, text, before, after });
  return client.postChat({
    endpoint: session.endpoint,
    model: session.model,
    key: keyOf(),
    system: messages.system,
    user: messages.user,
    temperature: 0.3,
    maxTokens: 1200,
    timeoutMs: deps.timeoutMs,
    lookup: deps.lookup,
    logReason
  });
}

function expiry() {
  const now = deps && typeof deps.now === 'function' ? deps.now() : Date.now();
  for (const [id, session] of sessions) if (now - session.at > SESSION_TTL) sessions.delete(id);
}

function create(dependencies) {
  deps = dependencies || {};
  return { start, run, end, validate, testConnection, get, save };
}

async function start() {
  expiry();
  const settings = safeSettings();
  const endpoint = await client.resolveEndpoint(settings.endpoint, deps.lookup);
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
  if (value && typeof value.model === 'string' && !value.model.trim()) return fail('modelId');
  if (value && typeof value.model === 'string' && value.model.length > promptRules.MAX_MODEL) return fail('limits');
  if (value && typeof value.endpoint === 'string' && !value.endpoint.trim()) return fail('endpoint');
  if (value && typeof value.prompt === 'string' && value.prompt.length > promptRules.MAX_PROMPT) return fail('limits');
  if (value && typeof value.endpoint === 'string' && value.endpoint.length > 200) return fail('limits');
  const rawProfiles = value && Array.isArray(value.profiles) ? value.profiles : [];
  for (const profile of rawProfiles) {
    if (profile && typeof profile.label === 'string' && profile.label.length > promptRules.MAX_LABEL) return fail('limits');
    if (profile && typeof profile.instruction === 'string' && profile.instruction.length > promptRules.MAX_INSTRUCTION) return fail('limits');
  }
  const settings = promptRules.normalizeSettings(value);
  const endpoint = await client.resolveEndpoint(settings.endpoint, deps.lookup);
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
  // A corrupt settings.json reads as {}, and writing {} + rephrase would forget the
  // chosen library folder.
  try {
    if (typeof deps.settingsBroken === 'function' && deps.settingsBroken()) {
      logReason('save');
      return fail('save');
    }
  } catch { /* an unknown state is not a broken file */ }
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
  return { ok: true, settings: safeSettings(), hasKey: hasKey(), secureStorage: secureStorage(), secret: SECRET };
}

async function testConnection(input) {
  const settings = safeSettings();
  const endpoint = input && typeof input.endpoint === 'string' && input.endpoint ? input.endpoint : settings.endpoint;
  const key = input && typeof input.key === 'string' && input.key ? input.key : keyOf();
  return client.probe({ endpoint, key, lookup: deps.lookup, timeoutMs: 5000 });
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
