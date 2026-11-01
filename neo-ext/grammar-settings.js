// NEO fork — the Grammar tab in Settings (adr-018)
//
// Grammar keeps its own endpoint, model, key, and system prompt. An empty field
// falls back to the Rewrite settings (or NEO's built-in prompt), so a writer who
// already pointed NEO at a model is not asked to do it twice.

'use strict';

(function () {
  const bridge = () => window.NeoForkNative || null;
  const reasons = window.NeoRephraseReasons;
  const x = (s, vars) => (window.NeoExt && typeof window.NeoExt.x === 'function' ? window.NeoExt.x(s, vars) : s);
  function reasonText(reason) {
    return reasons && reasons.reasonText ? reasons.reasonText(reason, x) : x('That setting could not be saved.');
  }

  const compareForm = (text) => String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n').trim();

  function payload(values) {
    const prompt = String(values.grammarPrompt === undefined ? '' : values.grammarPrompt);
    return {
      // An empty field is stored empty, so the fallback to the Rewrite setting keeps
      // working after a save instead of being pinned to today's value.
      endpoint: String(values.grammarEndpoint || '').trim(),
      model: String(values.grammarModel || '').trim(),
      // An untouched default is stored as empty, so a later improvement to NEO's
      // prompt reaches this writer instead of being pinned by the save.
      prompt: compareForm(prompt) === compareForm(values.__defaultPrompt) ? '' : prompt,
      keyCleared: !!values.__keyTouched && !String(values.grammarKey || '').trim()
    };
  }

  function register() {
    if (!window.NeoSettings || typeof window.NeoSettings.registerGroup !== 'function') return;
    window.NeoSettings.registerGroup({
      id: 'grammar',
      tab: 'AI Grammar',
      title: 'Grammar checking',
      show: () => {
        try { return !!(window.NeoExtApi && window.NeoExtApi.moreFeatures()); } catch { return false; }
      },
      load: async () => {
        const api = bridge();
        if (!api || typeof api.getGrammarSettings !== 'function') return {};
        let res = null;
        try { res = await api.getGrammarSettings(); } catch { res = null; }
        const config = window.NeoGrammarConfig;
        const stored = (res && res.stored) || {};
        const resolved = (res && res.settings) || (config ? config.defaultSettings() : { endpoint: '', model: '', prompt: '' });
        return {
          // The fields show what the file holds; the inherited value is the
          // placeholder, so an empty field keeps following the Rewrite setting.
          grammarEndpoint: stored.endpoint || '',
          grammarModel: stored.model || '',
          __inheritedEndpoint: resolved.endpoint || '',
          __inheritedModel: resolved.model || '',
          // The field shows the prompt in force, so the writer can edit it; the
          // default text is kept apart so an untouched field still follows NEO.
          grammarPrompt: stored.prompt || (res && res.defaultPrompt) || '',
          __defaultPrompt: (res && res.defaultPrompt) || '',
          grammarKey: '',
          __hasKey: !!(res && res.hasKey),
          __secure: res ? res.secureStorage !== false : true,
          __secretName: (res && res.secret) || (config ? config.SECRET : 'grammar-key'),
          __loadNote: res ? '' : x('These settings could not be loaded; showing the defaults.'),
          __keyCleared: !!stored.keyCleared,
          __keyTouched: false
        };
      },
      controls: (info, values) => [
        ...(values.__loadNote ? [{ type: 'note', text: values.__loadNote }] : []),
        { type: 'note', text: x('Grammar asks this model for one pass over the selected passage. An empty endpoint or model follows the Rewrite setting.') },
        { key: 'grammarEndpoint', type: 'text', label: 'Endpoint', placeholder: values.__inheritedEndpoint || '' },
        { key: 'grammarModel', type: 'text', label: 'Model', placeholder: values.__inheritedModel || '' },
        { key: 'grammarKey', type: 'secret', label: 'API key' },
        { type: 'note', text: x('Leave the prompt empty to use the grammar prompt that ships with NEO. A key typed here is used only by Grammar.') },
        { key: 'grammarPrompt', type: 'textarea', label: 'Prompt', rows: 10,
          reset: 'Restore default prompt',
          resetValue: (values) => values.__defaultPrompt || '' },
        { type: 'button', label: 'Test connection', run: async (values) => {
          let res = null;
          try { res = await bridge().testGrammar({ endpoint: values.grammarEndpoint, key: values.grammarKey }); } catch { res = null; }
          return res && res.ok ? { ok: true } : { ok: false, reason: reasonText(res && res.reason) };
        } }
      ],
      validate: async (values) => {
        const api = bridge();
        if (!api || typeof api.validateGrammarSettings !== 'function') return { ok: false, reason: x('Settings are not available in this build') };
        let res = null;
        try { res = await api.validateGrammarSettings(payload(values)); } catch { res = null; }
        return res && res.ok ? { ok: true } : { ok: false, reason: reasonText(res && res.reason) };
      },
      save: async (values) => {
        // A failed load leaves every field blank; saving then would erase what the
        // file still holds, so it refuses instead.
        if (values.__loadNote) return { ok: false, reason: x('These settings could not be loaded, so nothing was saved.') };
        const api = bridge();
        let res = null;
        try { res = await api.saveGrammarSettings(payload(values)); } catch { res = null; }
        if (!res || !res.ok) return { ok: false, reason: reasonText(res && res.reason) };
        const key = String(values.grammarKey || '').trim();
        if (key || values.__keyTouched) {
          try {
            const stored = await window.neo.setSecret(values.__secretName || 'grammar-key', key);
            if (!stored) return { ok: false, reason: x('The settings were saved, but the key could not be stored.') };
          } catch {
            return { ok: false, reason: x('The settings were saved, but the key could not be stored.') };
          }
        }
        return { ok: true };
      }
    });
  }

  register();
  window.NeoGrammarSettings = { register };
})();
