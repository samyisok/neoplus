// NEO fork — the grammar answer's rules (adr-017)
//
// Pure: the model answers in one JSON object per line, or CLEAN. This module owns
// that contract. It never touches the DOM, the manuscript, or the network.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoGrammarIssues = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_ISSUES = 40;
  const MAX_STYLE = 3;
  const MAX_CORRECTED = 2000;
  const MAX_FIX = 2000;
  const MAX_MESSAGE = 300;
  const MAX_EXAMPLE = 400;
  const MAX_QUOTE = 2000;
  const NO_MESSAGE = 'The model gave no explanation.';

  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

  // One answer can be JSONL, a one-line array, or a mix with prose around it. A
  // line with braces that does not parse is flagged so the caller can retry; a
  // line with no braces is prose and is ignored.
  function readObjects(text) {
    const objects = [];
    let malformed = false;
    const trimmed = text.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const value = JSON.parse(trimmed);
        if (Array.isArray(value)) {
          for (const item of value) {
            if (isObject(item)) objects.push(item);
            else malformed = true;
          }
          return { objects, malformed };
        }
      } catch { /* fall through to the line reader */ }
    }
    for (const source of text.split(/\r?\n/)) {
      const first = source.indexOf('{');
      const last = source.lastIndexOf('}');
      if (first < 0 && last < 0) continue;
      if (first < 0 || last <= first) { malformed = true; continue; }
      let value = null;
      try { value = JSON.parse(source.slice(first, last + 1)); } catch { malformed = true; continue; }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isObject(item)) objects.push(item);
          else malformed = true;
        }
      } else if (isObject(value)) objects.push(value);
      else malformed = true;
    }
    return { objects, malformed };
  }

  // The model sometimes lowercases the first word it quotes ("the both" for
  // "The both"). An exact match wins; a case-insensitive match is the fallback.
  function nextIndex(quote, selection, seen) {
    const from = seen.has(quote) ? seen.get(quote) : 0;
    let at = selection.indexOf(quote, from);
    if (at < 0) {
      const lower = selection.toLowerCase();
      const want = quote.toLowerCase();
      const alt = lower.indexOf(want, from);
      if (alt >= 0 && alt + quote.length <= selection.length) at = alt;
    }
    // The same words quoted again (the model reports one error twice) fall back to
    // the first occurrence, so the overlap rule can recognise the twin instead of
    // showing a "not applied" card.
    if (at < 0) at = selection.toLowerCase().indexOf(quote.toLowerCase());
    if (at >= 0) seen.set(quote, at + quote.length);
    return at;
  }

  function sentenceStart(text, at) {
    const before = text.slice(0, at).trimEnd();
    return before === '' || /[.!?]["'\u2019\u201d)\]]$/.test(before);
  }

  function overlaps(a, b) {
    return !!a && !!b && a.start < b.end && b.start < a.end;
  }

  // The model often quotes a whole sentence and returns the whole sentence with one
  // word changed. Keep the anchored location but show and apply only the differing
  // characters, so a one-word fix is not a sentence-wide green/red span.
  function trimChange(quote, fix) {
    const a = String(quote);
    const b = String(fix);
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < a.length - prefix && suffix < b.length - prefix
      && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;
    // Expand a change inside a word to the whole word, so `stand -> stood` is not
    // shown as `an -> oo`; a change at a word boundary (an inserted article) stays
    // an insertion.
    const word = (ch) => /[A-Za-z0-9\u00C0-\u024F]/.test(ch || '');
    let start = prefix;
    let end = a.length - suffix;
    while (start > 0 && word(a[start - 1]) && word(a[start])) start -= 1;
    while (end < a.length && word(a[end - 1]) && word(a[end])) end += 1;
    if (start === end && start > 0 && word(a[start - 1]) && (!a[start] || !word(a[start]))) {
      while (start > 0 && word(a[start - 1])) start -= 1;
    }
    return {
      prefix: start,
      quote: a.slice(start, end),
      fix: b.slice(start, b.length - (a.length - end))
    };
  }

  // Assigns start/end to each issue. A missing fix or message, a quote that is
  // not in the selection, and a span that overlaps an earlier accepted one are
  // marked with a reason; they are shown, never applied.
  function locate(issues, selection) {
    const text = typeof selection === 'string' ? selection : '';
    const seen = new Map();
    for (const issue of issues) {
      if (!issue.message) { issue.message = NO_MESSAGE; issue.reason = 'unusable'; }
      if (issue.fix === null || issue.fix === undefined) { issue.reason = 'unusable'; continue; }
      if (/[\r\n]/.test(issue.fix)) { issue.reason = 'unusable'; continue; }
      if (issue.reason) continue;
      const at = nextIndex(issue.quote, text, seen);
      if (at < 0) { issue.reason = 'unlocatable'; continue; }
      issue.start = at;
      issue.end = at + issue.quote.length;
      // Keep the writer's own characters, so a quote the model lowercased still
      // shows and compares against the text as written.
      issue.quote = text.slice(issue.start, issue.end);
    }
    // Trim first: the model reports one error twice, once as a wide quote and once
    // as the narrow one ("smirk at his good-looking face" and "at his good-looking
    // face"). Both trim to the same change, so the second is not a second card.
    for (const issue of issues) {
      if (issue.reason) continue;
      const change = trimChange(issue.quote, issue.fix);
      // A lowercase fix that opens a sentence takes the capital, so a quote the
      // model lowercased does not drop the sentence's capital. Inside a sentence
      // the writer's case is kept ("Qi Crystals" -> "Qi crystals").
      if (change.fix && change.quote && sentenceStart(text, issue.start + change.prefix)
        && /[A-Z]/.test(change.quote[0]) && /[a-z]/.test(change.fix[0])) {
        change.fix = change.fix[0].toUpperCase() + change.fix.slice(1);
      }
      issue.anchorStart = issue.start;
      issue.anchorEnd = issue.end;
      issue.start += change.prefix;
      issue.end = issue.start + change.quote.length;
      issue.quote = change.quote;
      issue.fix = change.fix;
    }
    const located = issues
      .filter((issue) => !issue.reason && Number.isInteger(issue.start))
      .sort((a, b) => a.anchorStart - b.anchorStart || a.order - b.order);
    const kept = [];
    let end = -1;
    for (const issue of located) {
      if (issue.anchorStart < end) {
        // The same words fixed the same way: one error, one card. A different fix
        // over the same span is a real conflict and stays on the board.
        const twin = kept.find((other) => other.start === issue.start
          && other.end === issue.end && other.fix === issue.fix);
        issue.reason = twin ? 'duplicate' : 'overlap';
        continue;
      }
      end = Math.max(end, issue.anchorEnd);
      kept.push(issue);
    }
    const out = issues.filter((issue) => issue.reason !== 'duplicate');
    for (const issue of out) issue.applied = !issue.reason;
    return out;
  }

  // The reference paragraphs are context, never a target. A weak model sometimes
  // fixes a sentence there; such an issue cannot be located in the selection, so it
  // is recognised by the context and dropped instead of becoming a not-applied card.
  function inReference(quote, context) {
    if (!context || typeof quote !== 'string' || !quote) return false;
    const needle = quote.trim().toLowerCase();
    // A single common word ("was", "the", "a") is not diagnostic: it will also
    // appear in the reference paragraphs by chance, so only a phrase long enough
    // to name a real sentence, matched on whole-word boundaries, counts as the
    // model drifting into the context.
    if (needle.length < 4) return false;
    const haystack = [context.before, context.after]
      .filter((part) => typeof part === 'string')
      .join('\n')
      .toLowerCase();
    if (!haystack) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u');
    return re.test(haystack);
  }

  // The answer is one of three outcomes. A clean answer is a CLEAN line with no
  // usable issue; a no-op fix is dropped before the outcome is decided.
  function parse(answer, selection, context) {
    const text = typeof answer === 'string' ? answer : '';
    const clean = text.split(/\r?\n/).some((source) => source.trim() === 'CLEAN');
    if (!text.trim()) return { status: 'unreadable', issues: [], malformed: false, retry: true, clean: false };
    const read = readObjects(text);
    let issues = [];
    let noop = false;
    for (const object of read.objects) {
      if (typeof object.quote !== 'string') {
        read.malformed = true;
        continue;
      }
      // The model says "nothing to fix" as an empty object as often as it says
      // CLEAN; an empty quote with no replacement is that same answer.
      if (!object.quote) {
        if (typeof object.fix === 'string' && object.fix === '') noop = true;
        else read.malformed = true;
        continue;
      }
      if (typeof object.fix === 'string' && object.fix === object.quote) { noop = true; continue; }
      const fix = typeof object.fix === 'string' ? object.fix : null;
      issues.push({
        quote: object.quote.slice(0, MAX_QUOTE),
        fix: fix !== null && fix.length > MAX_FIX ? null : fix,
        message: typeof object.message === 'string' && object.message.trim()
          ? object.message.slice(0, MAX_MESSAGE) : '',
        order: issues.length,
        start: null,
        end: null,
        reason: '',
        applied: false
      });
    }
    issues.length = Math.min(issues.length, MAX_ISSUES);
    const located = locate(issues, typeof selection === 'string' ? selection : '');
    const kept = located.filter((issue) => issue.reason !== 'unlocatable' || !inReference(issue.quote, context));
    const fromContext = located.length - kept.length;
    issues = kept;
    const usable = issues.some((issue) => !issue.reason);
    if (!issues.length) {
      // Everything the model reported lived in the reference paragraphs: this
      // selection has nothing to fix, and asking again would only invite the same.
      if (clean || noop || fromContext > 0) {
        return { status: 'clean', issues: [], malformed: read.malformed, retry: read.malformed, clean: true };
      }
      return { status: 'unreadable', issues: [], malformed: read.malformed, retry: true, clean: false };
    }
    if (clean && !usable) {
      return { status: 'clean', issues: [], malformed: read.malformed, retry: read.malformed, clean: true };
    }
    return {
      status: 'issues',
      issues,
      malformed: read.malformed,
      retry: read.malformed || issues.some((issue) => issue.reason),
      clean: false
    };
  }

  // Right-to-left so an earlier offset stays valid. A recorded span to the right
  // shifts by the delta of every later (further left) fix.
  function apply(issues, selection) {
    const text = typeof selection === 'string' ? selection : '';
    const usable = (Array.isArray(issues) ? issues : [])
      .filter((issue) => issue && !issue.reason && Number.isInteger(issue.start) && Number.isInteger(issue.end) && typeof issue.fix === 'string')
      .sort((a, b) => b.start - a.start || b.order - a.order);
    const isWord = (ch) => /[A-Za-z0-9\u00C0-\u024F]/.test(ch || '');
    const isUpper = (ch) => typeof ch === 'string' && /[A-Z]/.test(ch);
    const isLower = (ch) => typeof ch === 'string' && /[a-z]/.test(ch);
    // A deleted word would otherwise leave two spaces ("dinner  already" ->
    // "dinner ."): the replacement takes one neighbouring space with the word.
    // The reported span stays on the word, so the highlight is unchanged.
    const deletion = (issue) => {
      let start = issue.start;
      let end = issue.end;
      let fix = issue.fix;
      if (fix !== '' || end <= start) return { start, end, fix };
      const whole = !isWord(text[start - 1]) && !isWord(text[end]);
      if (whole) {
        if (text[end] === ' ') end += 1;
        else if (text[start - 1] === ' ') start -= 1;
      }
      // Deleting the capital that opened a sentence leaves the next word in lower
      // case: "The both of them" -> "Both of them".
      if (sentenceStart(text, start) && isUpper(text[start])
        && isLower(text[end]) && !isWord(text[start - 1])) {
        fix = text[end].toUpperCase();
        end += 1;
      }
      return { start, end, fix };
    };
    let out = text;
    const spans = [];
    for (const issue of usable) {
      const { start, end, fix } = deletion(issue);
      const delta = fix.length - (end - start);
      for (const span of spans) {
        if (span.start >= end) { span.start += delta; span.end += delta; }
      }
      out = out.slice(0, start) + fix + out.slice(end);
      if (fix.length) spans.push({ start, end: start + fix.length });
    }
    spans.sort((a, b) => a.start - b.start);
    return { text: out, spans };
  }

  // Style answers use the same JSONL shape, with `example` instead of `fix`.
  // Nothing is applied; the caller filters these against the original.
  function parseStyle(answer) {
    const text = typeof answer === 'string' ? answer : '';
    const clean = text.split(/\r?\n/).some((source) => source.trim() === 'CLEAN');
    if (!text.trim()) return { status: 'unreadable', suggestions: [], malformed: false, retry: true };
    const read = readObjects(text);
    const suggestions = [];
    let noop = false;
    for (const object of read.objects) {
      if (typeof object.quote !== 'string') {
        read.malformed = true;
        continue;
      }
      const example = typeof object.example === 'string' ? object.example : '';
      if (!object.quote) {
        if (!example) noop = true;
        else read.malformed = true;
        continue;
      }
      if (example && example === object.quote) { noop = true; continue; }
      suggestions.push({
        quote: object.quote.slice(0, MAX_QUOTE),
        example: example.slice(0, MAX_EXAMPLE),
        message: typeof object.message === 'string' ? object.message.slice(0, MAX_MESSAGE) : ''
      });
    }
    if (!suggestions.length) {
      const quiet = clean || noop;
      return {
        status: quiet ? 'clean' : 'unreadable',
        suggestions: [],
        malformed: read.malformed,
        retry: quiet ? read.malformed : true
      };
    }
    return {
      status: 'suggestions',
      suggestions,
      malformed: read.malformed,
      retry: read.malformed
    };
  }

  // Style advice is anchored to the original and never to the corrected text. A
  // quote that exists only in the correction, or that covers a grammar span, is
  // dropped; the first three in text order survive.
  function filterStyle(suggestions, original, grammarIssues) {
    const text = typeof original === 'string' ? original : '';
    const grammar = (Array.isArray(grammarIssues) ? grammarIssues : [])
      .filter((issue) => issue && !issue.reason && Number.isInteger(issue.start) && Number.isInteger(issue.end));
    const seen = new Map();
    const kept = [];
    for (const suggestion of Array.isArray(suggestions) ? suggestions : []) {
      if (!suggestion || typeof suggestion.quote !== 'string' || !suggestion.quote) continue;
      if (typeof suggestion.example === 'string' && suggestion.example === suggestion.quote) continue;
      const at = nextIndex(suggestion.quote, text, seen);
      if (at < 0) continue;
      const anchor = { start: at, end: at + suggestion.quote.length };
      if (grammar.some((issue) => overlaps(anchor, issue))) continue;
      if (kept.some((issue) => overlaps(anchor, { start: issue.anchorStart, end: issue.anchorEnd }))) continue;
      const change = trimChange(suggestion.quote, typeof suggestion.example === 'string' ? suggestion.example : '');
      kept.push({
        quote: change.quote,
        example: change.fix,
        message: typeof suggestion.message === 'string' ? suggestion.message : '',
        start: at + change.prefix,
        end: at + change.prefix + change.quote.length,
        anchorStart: anchor.start,
        anchorEnd: anchor.end
      });
    }
    kept.sort((a, b) => a.start - b.start);
    return kept.slice(0, MAX_STYLE);
  }

  return {
    MAX_ISSUES, MAX_STYLE, MAX_CORRECTED, MAX_FIX, MAX_MESSAGE, MAX_EXAMPLE, MAX_QUOTE, NO_MESSAGE,
    parse, parseStyle, locate, apply, overlaps, filterStyle, trimChange
  };
});
