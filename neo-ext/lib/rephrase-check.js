// NEO fork — which rephrase replies may be shown (adr-012)
//
// Pure: a reply is shown only when it is a rewrite of the selection, not a
// continuation, not the reference pasted back, and not wildly the wrong size.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoRephraseCheck = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const QUOTES = [['“', '”'], ['"', '"'], ['‘', '’'], ['«', '»']];
  const WORDS = 6;

  function norm(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function stripQuotes(reply, selection) {
    const text = norm(reply);
    if (/^["“«‘]/.test(norm(selection))) return text;
    for (const [open, close] of QUOTES) {
      if (text.startsWith(open) && text.endsWith(close) && text.length > 2) return text.slice(1, -1).trim();
    }
    return text;
  }

  function stripLabel(reply, label) {
    if (!label) return reply;
    try {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return reply.replace(new RegExp('^\\s*' + escaped + '\\s*[:—–-]\\s*', 'i'), '');
    } catch { return reply; }
  }

  function shingles(text) {
    const words = norm(text).split(' ').filter(Boolean);
    const out = [];
    for (let i = 0; i + WORDS <= words.length; i += 1) out.push(words.slice(i, i + WORDS).join(' '));
    return out;
  }

  function checkReply({ reply, text, before, after, label }) {
    if (typeof reply !== 'string') return { ok: false, reason: 'empty' };
    let body = stripLabel(reply, label).trim();
    body = stripQuotes(body, text).trim();
    if (!body) return { ok: false, reason: 'empty' };

    const source = norm(text);
    const candidate = norm(body);
    const length = source.length;
    const floor = Math.max(4, Math.min(length * 0.25, 40));

    if (candidate.startsWith(source) && candidate.length > length + 8) return { ok: false, reason: 'continuation' };
    if (candidate.endsWith(source) && candidate.length > length + 8) return { ok: false, reason: 'continuation' };

    const selectionShingles = new Set(shingles(source));
    const contextShingles = new Set([...shingles(before), ...shingles(after)]);
    for (const shingle of shingles(candidate)) {
      if (contextShingles.has(shingle) && !selectionShingles.has(shingle)) return { ok: false, reason: 'context' };
    }

    if (body.length > length * 2.5) return { ok: false, reason: 'long' };
    if (body.length < floor) return { ok: false, reason: 'short' };
    return { ok: true, text: body };
  }

  return { checkReply, norm, stripQuotes, stripLabel };
});
