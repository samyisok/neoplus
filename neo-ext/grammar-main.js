// NEO fork — the grammar service (adr-017)
//
// Reads the AI settings and the encrypted key, snapshots one grammar window, and
// makes one loopback request per pass. The page never sees the key, and the
// manuscript never leaves this module except in a loopback request.

'use strict';

const crypto = require('crypto');
const client = require('./llm-client.js');
const settingsRules = require('./lib/rephrase-prompt.js');
const promptRules = require('./lib/grammar-prompt.js');

const SECRET = 'rephrase-key';
const SESSION_TTL = 15 * 60 * 1000;
const MAX_SESSIONS = 8;
// A 1,200-character passage can need a long JSONL answer, and a 4B on a laptop
// takes far longer than the client's 30-second default. Waiting beats saying the
// model did not answer.
const GRAMMAR_TIMEOUT_MS = 90 * 1000;

let deps = null;
const sessions = new Map();

function fail(reason) {
  return { ok: false, reason };
}

function safeSettings() {
  try {
    const all = deps && typeof deps.readSettings === 'function' ? deps.readSettings() : {};
    return settingsRules.normalizeSettings(all && all.rephrase);
  } catch {
    return settingsRules.defaultSettings();
  }
}

function keyOf() {
  try { return deps && typeof deps.readSecret === 'function' ? deps.readSecret(SECRET) : ''; } catch { return ''; }
}

function logReason(reason) {
  try { deps.logError && deps.logError('grammar', new Error(reason)); } catch { /* logging is a nicety */ }
}

function now() {
  return deps && typeof deps.now === 'function' ? deps.now() : Date.now();
}

function expiry() {
  const at = now();
  for (const [id, session] of sessions) if (at - session.at > SESSION_TTL) sessions.delete(id);
}

function clean(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function take(payload, owner) {
  expiry();
  const session = payload && sessions.get(payload.session);
  if (!session) return fail('session');
  if (session.owner !== (owner || '')) return fail('session');
  if (session.busy) return fail('busy');
  session.busy = true;
  session.controller = new AbortController();
  return { session };
}

async function start(owner) {
  expiry();
  const settings = safeSettings();
  const endpoint = await client.resolveEndpoint(settings.endpoint, deps.lookup);
  if (!endpoint.ok) return fail(endpoint.reason || 'endpoint');
  const id = 'grammar-' + crypto.randomUUID();
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
  sessions.set(id, {
    endpoint: settings.endpoint,
    model: settings.model,
    owner: owner || '',
    at: now(),
    busy: false,
    controller: null
  });
  return { ok: true, session: id };
}

async function runGrammarOne(session, payload) {
  const text = payload && payload.text;
  if (typeof text !== 'string' || text.length > promptRules.MAX_SELECTION) return fail('limits');
  if (typeof payload.before === 'string' && payload.before.length > promptRules.MAX_REFERENCE) return fail('limits');
  if (typeof payload.after === 'string' && payload.after.length > promptRules.MAX_REFERENCE) return fail('limits');
  if (!text.trim()) return fail('empty');
  const messages = promptRules.grammarMessages({
    text,
    before: clean(payload.before, promptRules.MAX_REFERENCE),
    after: clean(payload.after, promptRules.MAX_REFERENCE)
  });
  return client.postChat({
    endpoint: session.endpoint,
    model: session.model,
    key: keyOf(),
    system: messages.system,
    user: messages.user,
    // A checker should answer the same passage the same way twice, and the
    // grammar prompt scores better on the model benchmark at 0 than at 0.2.
    temperature: 0,
    maxTokens: 900,
    timeoutMs: deps.timeoutMs || GRAMMAR_TIMEOUT_MS,
    lookup: deps.lookup,
    signal: session.controller ? session.controller.signal : undefined,
    logReason
  });
}

function runGrammar(payload, owner) {
  const held = take(payload, owner);
  if (!held.session) return Promise.resolve(held);
  return runGrammarOne(held.session, payload).finally(() => {
    held.session.busy = false;
    held.session.controller = null;
  });
}

async function runStyleOne(session, payload) {
  const text = payload && payload.text;
  const corrected = payload && payload.corrected;
  if (typeof text !== 'string' || text.length > promptRules.MAX_SELECTION) return fail('limits');
  if (typeof corrected !== 'string' || corrected.length > promptRules.MAX_CORRECTED) return fail('limits');
  if (typeof payload.before === 'string' && payload.before.length > promptRules.MAX_REFERENCE) return fail('limits');
  if (typeof payload.after === 'string' && payload.after.length > promptRules.MAX_REFERENCE) return fail('limits');
  if (!text.trim()) return fail('empty');
  const messages = promptRules.styleMessages({
    text,
    corrected,
    before: clean(payload.before, promptRules.MAX_REFERENCE),
    after: clean(payload.after, promptRules.MAX_REFERENCE)
  });
  return client.postChat({
    endpoint: session.endpoint,
    model: session.model,
    key: keyOf(),
    system: messages.system,
    user: messages.user,
    temperature: 0.3,
    maxTokens: 600,
    timeoutMs: deps.timeoutMs || GRAMMAR_TIMEOUT_MS,
    lookup: deps.lookup,
    signal: session.controller ? session.controller.signal : undefined,
    logReason
  });
}

function runStyle(payload, owner) {
  const held = take(payload, owner);
  if (!held.session) return Promise.resolve(held);
  return runStyleOne(held.session, payload).finally(() => {
    held.session.busy = false;
    held.session.controller = null;
  });
}

function end(payload, owner) {
  if (payload && payload.session) {
    const session = sessions.get(payload.session);
    if (session && session.owner === (owner || '')) {
      if (session.controller) { try { session.controller.abort(); } catch { /* gone */ } }
      sessions.delete(payload.session);
    }
  }
  return { ok: true };
}

function menuItem(info, t) {
  if (!info || !info.grammar) return null;
  return { label: t('Grammar…'), action: 'grammar-open' };
}

function create(dependencies) {
  deps = dependencies || {};
  sessions.clear();
  return { start, runGrammar, runStyle, end, menuItem };
}

function senderId(event) {
  const id = event && event.sender && event.sender.id;
  return id === undefined || id === null ? '' : String(id);
}

function init(dependencies, ipcMain) {
  create(dependencies);
  if (!ipcMain || typeof ipcMain.handle !== 'function') return;
  ipcMain.handle('neo-ext:grammar-start', (event) => start(senderId(event)));
  ipcMain.handle('neo-ext:grammar-run', (event, payload) => runGrammar(payload, senderId(event)));
  ipcMain.handle('neo-ext:grammar-style', (event, payload) => runStyle(payload, senderId(event)));
  ipcMain.handle('neo-ext:grammar-end', (event, payload) => end(payload, senderId(event)));
}

module.exports = {
  init, create, start, runGrammar, runStyle, end, menuItem,
  SECRET, SESSION_TTL, MAX_SESSIONS, GRAMMAR_TIMEOUT_MS, sessions
};
