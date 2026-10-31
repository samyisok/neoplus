// NEO fork — the Interface Size setting (adr-015)
//
// The group's rules are pure; the preview only publishes the size the rest of
// the interface already reads. The applyFonts slice proves Simple NEO asks the
// fork rather than deciding for itself.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const snap = (v) => {
  const n = v === null || v === '' ? NaN : Number(v);
  const base = Number.isFinite(n) ? n : 1;
  return Math.round(Math.min(3, Math.max(0.9, base)) * 10) / 10;
};
const step = (current, dir) => (dir === 0 ? 1 : snap(snap(current) + (dir > 0 ? 0.1 : -0.1)));
const snapText = (v) => {
  const n = v === null || v === '' ? NaN : Number(v);
  const base = Number.isFinite(n) ? n : 1;
  return Math.round(Math.min(2, Math.max(0.9, base)) * 10) / 10;
};
const stepText = (current, dir) => (dir === 0 ? 1 : snapText(snapText(current) + (dir > 0 ? 0.1 : -0.1)));

function loadInterfaceSize() {
  const vars = {};
  const states = [];
  const classes = {};
  const calls = [];
  const callsText = [];
  let group = null;
  let stored = 1;
  let storedText = 1;
  const context = {
    console,
    Promise,
    document: {
      documentElement: {
        style: { setProperty: (key, value) => { vars[key] = String(value); } },
        classList: { toggle: (name, on) => { classes[name] = !!on; } }
      }
    },
    NeoExt: { x: (s) => s },
    NeoExtApi: {
      uiZoom: () => snap(stored),
      snapUiZoom: (v) => snap(v),
      stepUiZoom: (v, dir) => step(v, dir),
      setUiZoom: async (v) => { calls.push(v); return { ok: true, value: snap(v) }; },
      uiText: () => snapText(storedText),
      snapUiText: (v) => snapText(v),
      stepUiText: (v, dir) => stepText(v, dir),
      setUiText: async (v) => { callsText.push(v); return { ok: true, value: snapText(v) }; }
    },
    NeoSettings: { registerGroup: (g) => { group = g; } },
    neo: { uiZoomState: (z) => states.push(z) }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('neo-ext/interface-size.js'), context);
  return {
    api: context.NeoInterfaceSize,
    group: () => group,
    control: (key = 'uiZoom') => (group && typeof group.controls === 'function' ? group.controls().find((c) => c.type === 'zoom' && c.key === key) : null),
    vars,
    states,
    classes,
    calls,
    callsText,
    context,
    settle: (value) => { stored = value; },
    settleText: (value) => { storedText = value; }
  };
}

test('interface-size: the percentage reads as a tenth above 100', () => {
  const h = loadInterfaceSize();
  const format = h.control().format;
  assert.equal(format(1), '100%');
  assert.equal(format(1.25), '130%');
  assert.equal(format(0.5), '90%');
  assert.equal(format(9), '300%');
});

test('interface-size: steps move a tenth and stop at the ends', () => {
  const h = loadInterfaceSize();
  const step = h.control().step;
  assert.equal(step(1, 1), 1.1);
  assert.equal(step(1, -1), 0.9);
  assert.equal(step(0.9, -1), 0.9);
  assert.equal(step(3, 1), 3);
  assert.equal(step(2.4, 0), 1);
});

test('interface-size: the group is registered on General with a zoom control', () => {
  const h = loadInterfaceSize();
  const group = h.group();
  assert.ok(group, 'registerGroup was called');
  assert.equal(group.id, 'interface-size');
  assert.equal(group.tab, 'General');
  const controls = typeof group.controls === 'function' ? group.controls() : group.controls;
  const zooms = controls.filter((c) => c.type === 'zoom');
  assert.deepEqual(zooms.map((c) => c.key), ['uiZoom', 'uiText']);
  assert.equal(controls[0].key, 'uiZoom');
  assert.equal(typeof controls[0].step, 'function');
  assert.equal(typeof controls[0].format, 'function');
  assert.equal(controls[controls.length - 1].type, 'note', 'the scope is explained under the rows');
});

test('interface-size: load reads the snapped stored size and remembers where it started', () => {
  const h = loadInterfaceSize();
  h.settle(1.25);
  assert.deepEqual(h.group().load(), { uiZoom: 1.3, uiText: 1 });
});

test('interface-size: preview publishes the size every surface reads', () => {
  const h = loadInterfaceSize();
  h.control().preview(1.4);
  assert.equal(h.vars['--ui-zoom'], '1.4');
  assert.equal(h.classes['ui-zoomed'], true);
  assert.deepEqual(h.states, [1.4]);
  h.control().preview(1);
  assert.equal(h.classes['ui-zoomed'], false);
});

test('interface-size: Cancel previews the size stored at that moment', () => {
  const h = loadInterfaceSize();
  h.settle(1.4);
  h.group().onClose({ uiZoom: 2 }, false);
  assert.equal(h.vars['--ui-zoom'], '1.4');
  assert.deepEqual(h.states, [1.4]);
});

test('interface-size: Save leaves the preview alone', () => {
  const h = loadInterfaceSize();
  h.settle(1.1);
  h.group().onClose({ uiZoom: 2 }, true);
  assert.deepEqual(h.states, []);
});

test('interface-size: the text control formats, steps, and previews', () => {
  const h = loadInterfaceSize();
  const text = h.control('uiText');
  assert.equal(text.format(1), '100%');
  assert.equal(text.format(1.25), '130%');
  assert.equal(text.step(1, 1), 1.1);
  assert.equal(text.step(2, 1), 2);
  assert.equal(text.step(0.9, -1), 0.9);
  assert.equal(text.step(1.8, 0), 1);
  text.preview(1.4);
  assert.equal(h.vars['--ui-text'], '1.4');
});

test('interface-size: text load, save, and Cancel use the stored text size', async () => {
  const h = loadInterfaceSize();
  h.settleText(1.3);
  assert.deepEqual(h.group().load(), { uiZoom: 1, uiText: 1.3 });
  await h.group().save({ uiZoom: 1, uiText: 1.4, __touched_uiText: true });
  assert.deepEqual(h.callsText, [1.4]);
  h.settleText(1.4);
  h.group().onClose({ uiZoom: 1, uiText: 2 }, false);
  assert.equal(h.vars['--ui-text'], '1.4', 'Cancel restores the stored text size too');
});

test('interface-size: save writes the choice and passes a failure through', async () => {
  const h = loadInterfaceSize();
  const ok = await h.group().save({ uiZoom: 1.2, __touched_uiZoom: true });
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(h.calls, [1.2]);

  h.context.NeoExtApi.setUiZoom = async () => ({ ok: false, reason: 'write' });
  const failed = await h.group().save({ uiZoom: 1.4, __touched_uiZoom: true });
  assert.deepEqual(failed, { ok: false, reason: 'The interface settings could not be saved.' });
});

test('interface-size: a View-menu step while the window is open is not undone by Save', async () => {
  const h = loadInterfaceSize();
  h.settle(1.2);
  const values = h.group().load();
  h.settle(1.4); // the menu stepped it while the dialog stayed untouched
  await h.group().save(values);
  assert.deepEqual(h.calls, [1.4], 'Save keeps the stored size, not the one the window opened with');

  const picked = { uiZoom: 1.3, __touched_uiZoom: true };
  h.settle(1.4);
  await h.group().save(picked);
  assert.deepEqual(h.calls, [1.4, 1.3], 'a pressed step still wins');
});

test('interface-size: the fork returns the stored size whatever the mode', () => {
  const h = loadInterfaceSize();
  assert.equal(h.api.uiZoomFor({ uiZoom: 1.3 }), 1.3);
  assert.equal(h.api.uiZoomFor({ uiZoom: 2.8 }), 2.8);
  assert.equal(h.api.uiZoomFor({}), 1);
  assert.equal(h.api.uiZoomFor(null), 1);
});

function applyFontsSlice() {
  const app = read('app.js');
  const from = app.indexOf('function applyFonts()');
  // The next column-zero close brace is the end of applyFonts; no unrelated
  // comment can shorten the slice.
  const close = app.indexOf('\n}\n', from);
  assert.ok(from > 0 && close > from, 'applyFonts is where the test expects it');
  return { code: app.slice(from, close + 3), from, to: close + 3 };
}

function runApplyFonts({ fork, more }) {
  const { code } = applyFontsSlice();
  const vars = {};
  const classes = {};
  const states = [];
  const context = {
    console,
    library: { uiZoom: 1.3, fonts: {}, pageTheme: 'night' },
    moreOn: () => more,
    snapZoom: snap,
    EDITOR_SIZE_MIN: 8,
    EDITOR_SIZE_MAX: 22,
    DROPCAP_FONTS: {},
    BODY_FONTS: {},
    applyBright: () => {},
    applyPageZoom: () => {},
    queueSoftHyphenTicks: () => {},
    document: {
      documentElement: { style: { setProperty: (key, value) => { vars[key] = String(value); } }, classList: { toggle: (name, on) => { classes[name] = !!on; } } },
      body: { classList: { toggle: () => {} } }
    },
    window: { neo: { uiZoomState: (z) => states.push(z) } }
  };
  if (fork) {
    context.NeoExt = { uiZoom: (lib) => snap(lib.uiZoom) };
    context.window.NeoExt = context.NeoExt;
  }
  vm.createContext(context);
  vm.runInContext(code, context);
  context.applyFonts();
  return { vars, states, context };
}

test('interface-size: Simple NEO honors the fork size instead of forcing 100%', () => {
  const h = runApplyFonts({ fork: true, more: false });
  assert.equal(h.vars['--ui-zoom'], '1.3');
  assert.deepEqual(h.states, [1.3]);
});

test('interface-size: without the fork module, the legacy rule still applies', () => {
  const h = runApplyFonts({ fork: false, more: false });
  assert.equal(h.vars['--ui-zoom'], '1');
  const full = runApplyFonts({ fork: false, more: true });
  assert.equal(full.vars['--ui-zoom'], '1.3');
});
