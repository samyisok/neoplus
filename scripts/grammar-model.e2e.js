// NEO fork — grammar model benchmark (adr-017, tooling only)
//
// Not part of `npm test` or the packaged app. Runs the app's real grammar prompt
// and parser against a local model over a fixed corpus, so prompt changes can be
// measured. It skips cleanly when no local model is configured.
//
//   node scripts/grammar-model.e2e.js
//   node scripts/grammar-model.e2e.js --runs 3 --min 90
//   node scripts/grammar-model.e2e.js --prompt /tmp/grammar-system.txt
//   node scripts/grammar-model.e2e.js --category tense --limit 10 --verbose
//
// Endpoint: NEO_MODEL_ENDPOINT or http://127.0.0.1:8080/v1
// Model:    NEO_MODEL or qwen3.5-4b
// Key:      NEO_MODEL_KEY or ~/.config/local-llm/api-key

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prompt = require('../neo-ext/lib/grammar-prompt.js');
const rules = require('../neo-ext/lib/grammar-issues.js');

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0) return fallback;
  const value = process.argv[at + 1];
  return value === undefined || value.startsWith('--') ? true : value;
}

const ENDPOINT = process.env.NEO_MODEL_ENDPOINT || 'http://127.0.0.1:8080/v1';
const MODEL = arg('model', process.env.NEO_MODEL || 'qwen3.5-4b');
const RUNS = Math.max(1, Number(arg('runs', 1)) || 1);
const TEMPERATURE = Number(arg('temperature', 0.1));
const MIN = Number(arg('min', 0));
const LIMIT = Number(arg('limit', 0)) || 0;
const CATEGORY = String(arg('category', '') || '');
const VERBOSE = !!arg('verbose', false);
const REPORT = String(arg('report', '') || '');
const PROMPT_FILE = String(arg('prompt', '') || '');
const CORPUS = String(arg('corpus', '') || 'grammar-cases.json');

function readKey() {
  if (process.env.NEO_MODEL_KEY) return process.env.NEO_MODEL_KEY.trim();
  try {
    return fs.readFileSync(path.join(os.homedir(), '.config/local-llm/api-key'), 'utf8').trim();
  } catch {
    return '';
  }
}

const key = readKey();
const system = PROMPT_FILE ? fs.readFileSync(PROMPT_FILE, 'utf8').trim() : prompt.GRAMMAR_SYSTEM;
const corpus = JSON.parse(fs.readFileSync(
  path.isAbsolute(CORPUS) ? CORPUS : path.join(__dirname, 'fixtures', CORPUS), 'utf8'));
let cases = corpus.cases;
if (CATEGORY) cases = cases.filter((item) => item.category === CATEGORY);
if (LIMIT) cases = cases.slice(0, LIMIT);

async function ask(text, before, after) {
  const messages = prompt.grammarMessages({ text, before, after });
  const res = await fetch(`${ENDPOINT.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: 'Bearer ' + key } : {})
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: messages.user }
      ],
      temperature: TEMPERATURE,
      top_p: 0.9,
      max_tokens: 700,
      stream: false
    }),
    signal: AbortSignal.timeout(90000)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content : '';
}

// The card must point at the wrong words, not the whole sentence: when the case
// names its `quote`, the one applied issue has to cover exactly those words.
function bare(text) {
  return String(text || '').trim().replace(/[.,;:!?]+$/, '');
}

function placeOf(item, applied) {
  if (item.clean || item.quote === undefined || item.quote === '') return { ok: true, got: '' };
  const issue = applied[0];
  const got = issue && Number.isInteger(issue.start) && Number.isInteger(issue.end)
    ? item.text.slice(issue.start, issue.end) : '';
  const want = bare(item.quote);
  const have = bare(got);
  // The card may point at the whole wrong phrase or at the wrong word inside it;
  // it may not point somewhere else, and it may not cover more than the error.
  const ok = have !== '' && (have === want || want.includes(have));
  return { ok, got };
}

function judge(item, raw) {
  const parsed = rules.parse(raw, item.text);
  const applied = parsed.issues.filter((issue) => !issue.reason);
  const corrected = rules.apply(parsed.issues, item.text).text;
  const noise = parsed.issues.length - applied.length;
  const place = placeOf(item, applied);
  if (item.clean) {
    return {
      ok: parsed.status === 'clean' && applied.length === 0,
      corrected,
      status: parsed.status,
      applied: applied.length,
      noise,
      place,
      expected: item.text
    };
  }
  // A few cases have more than one correct repair ("Despite of" -> "Despite" or
  // "In spite of"); the corpus lists those as `accept`.
  const accept = Array.isArray(item.accept) ? item.accept : [];
  return {
    ok: applied.length === 1 && noise === 0 && place.ok
      && (corrected === item.expected || accept.includes(corrected)),
    corrected,
    status: parsed.status,
    applied: applied.length,
    noise,
    place,
    expected: item.expected
  };
}

async function main() {
  if (!key) {
    console.log('No local model key (NEO_MODEL_KEY or ~/.config/local-llm/api-key); skipping grammar benchmark.');
    return 0;
  }
  const started = Date.now();
  const failures = [];
  const byCategory = new Map();
  let passed = 0;
  console.log(`Grammar model benchmark (${corpus.corpus || CORPUS}): ${cases.length} cases x ${RUNS} run(s) against ${MODEL} at ${ENDPOINT}`);
  for (const item of cases) {
    const bucket = byCategory.get(item.category) || { passed: 0, total: 0 };
    bucket.total += 1;
    let wins = 0;
    let last = null;
    for (let run = 1; run <= RUNS; run += 1) {
      try {
        const raw = await ask(item.text, item.before || '', item.after || '');
        last = { raw, ...judge(item, raw) };
        if (last.ok) wins += 1;
      } catch (err) {
        last = { raw: '', ok: false, corrected: '', status: 'error', applied: 0, noise: 0, expected: item.expected, error: String(err && err.message || err) };
      }
    }
    const ok = wins >= Math.ceil(RUNS / 2);
    if (ok) { passed += 1; bucket.passed += 1; }
    else failures.push({ item, wins, last });
    byCategory.set(item.category, bucket);
    if (VERBOSE || !ok) {
      const mark = ok ? 'PASS' : 'FAIL';
      console.log(`${mark} ${item.id} (${wins}/${RUNS}) ${JSON.stringify(item.text)}`);
      if (!ok && last) {
        console.log(`     expected: ${JSON.stringify(item.expected)}`);
        console.log(`     got:      ${JSON.stringify(last.corrected)} status=${last.status} applied=${last.applied} noise=${last.noise}`);
        if (last.place && !last.place.ok) {
          console.log(`     place:    ${JSON.stringify(last.place.got)} expected ${JSON.stringify(item.quote)}`);
        }
        console.log(`     raw:      ${JSON.stringify(last.raw)}`);
      }
    }
  }
  const score = cases.length ? Math.round((passed / cases.length) * 100) : 0;
  console.log(`\nOverall: ${passed}/${cases.length} (${score}%) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const [name, bucket] of [...byCategory.entries()].sort()) {
    console.log(`  ${name.padEnd(12)} ${bucket.passed}/${bucket.total}`);
  }
  if (failures.length && !VERBOSE) {
    console.log('\nFailures:');
    for (const { item, wins, last } of failures) {
      console.log(`  ${item.id} (${wins}/${RUNS}) expected=${JSON.stringify(item.expected)} got=${JSON.stringify(last && last.corrected)}`);
    }
  }
  if (REPORT) {
    fs.writeFileSync(REPORT, JSON.stringify({
      corpus: corpus.corpus || CORPUS,
      model: MODEL, runs: RUNS, temperature: TEMPERATURE, score,
      passed, total: cases.length,
      categories: Object.fromEntries(byCategory),
      failures: failures.map(({ item, wins, last }) => ({ item, wins, last }))
    }, null, 2) + '\n');
    console.log(`Report: ${REPORT}`);
  }
  return score >= MIN ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
