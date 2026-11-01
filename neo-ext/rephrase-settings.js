// NEO fork — the AI tab in Settings (adr-012)
//
// Registers one group: endpoint, model, key, base instruction, profiles, and a
// connection test. The key is written last, after the settings are stored.

'use strict';

(function () {
  const bridge = () => window.NeoForkNative || null;
  const reasons = window.NeoRephraseReasons;
  const x = (s, vars) => (window.NeoExt && typeof window.NeoExt.x === 'function' ? window.NeoExt.x(s, vars) : s);
  function reasonText(reason) {
    return reasons && reasons.reasonText ? reasons.reasonText(reason, x) : x('That setting could not be saved.');
  }

  function payload(values) {
    const profiles = (Array.isArray(values.rephraseProfiles) ? values.rephraseProfiles : [])
      .map((p) => ({ label: String((p && p.label) || '').trim(), instruction: String((p && p.instruction) || '').trim() }));
    return {
      endpoint: String(values.rephraseEndpoint || '').trim(),
      model: String(values.rephraseModel || '').trim(),
      prompt: String(values.rephrasePrompt || '').trim(),
      profiles
    };
  }

  function register() {
    if (!window.NeoSettings || typeof window.NeoSettings.registerGroup !== 'function') return;
    window.NeoSettings.registerGroup({
      id: 'rephrase',
      tab: 'AI Rephrasing',
      title: 'Rewriting with a local model',
      show: () => {
        try { return !!(window.NeoExtApi && window.NeoExtApi.moreFeatures()); } catch { return false; }
      },
      load: async () => {
        const api = bridge();
        if (!api || typeof api.getRephraseSettings !== 'function') return {};
        let res = null;
        try { res = await api.getRephraseSettings(); } catch { res = null; }
        const defaults = (window.NeoRephrasePrompt && window.NeoRephrasePrompt.defaultSettings)
          ? window.NeoRephrasePrompt.defaultSettings() : { endpoint: '', model: '', prompt: '', profiles: [] };
        const settings = (res && res.settings) || defaults;
        return {
          rephraseEndpoint: settings.endpoint || '',
          rephraseModel: settings.model || '',
          rephrasePrompt: settings.prompt || '',
          rephraseProfiles: Array.isArray(settings.profiles) ? settings.profiles.map((p) => ({ label: p.label, instruction: p.instruction })) : [],
          rephraseKey: '',
          __hasKey: !!(res && res.hasKey),
          __secure: res ? res.secureStorage !== false : true,
          __secretName: (res && res.secret) || 'rephrase-key',
          __loadNote: res ? '' : x('These settings could not be loaded; showing the defaults.'),
          __keyTouched: false
        };
      },
      controls: (info, values) => [
        ...(values.__loadNote ? [{ type: 'note', text: values.__loadNote }] : []),
        { key: 'rephraseEndpoint', type: 'text', label: 'Endpoint' },
        { key: 'rephraseModel', type: 'text', label: 'Model' },
        { key: 'rephraseKey', type: 'secret', label: 'API key' },
        { key: 'rephrasePrompt', type: 'textarea', label: 'Base instruction', rows: 4,
          reset: 'Restore default prompt',
          resetValue: () => (window.NeoRephrasePrompt && window.NeoRephrasePrompt.defaultSettings
            ? window.NeoRephrasePrompt.defaultSettings().prompt : '') },
        { key: 'rephraseProfiles', type: 'profiles', label: 'Profiles', max: 8,
          reset: 'Restore default profiles',
          resetValue: () => (window.NeoRephrasePrompt && window.NeoRephrasePrompt.defaultSettings
            ? window.NeoRephrasePrompt.defaultSettings().profiles : []) },
        { type: 'button', label: 'Test connection', run: async (values) => {
          let res = null;
          try { res = await bridge().testRephrase({ endpoint: values.rephraseEndpoint, key: values.rephraseKey }); } catch { res = null; }
          return res && res.ok ? { ok: true } : { ok: false, reason: reasonText(res && res.reason) };
        } }
      ],
      validate: async (values) => {
        const api = bridge();
        if (!api || typeof api.validateRephraseSettings !== 'function') return { ok: false, reason: x('Settings are not available in this build') };
        let res = null;
        try { res = await api.validateRephraseSettings(payload(values)); } catch { res = null; }
        return res && res.ok ? { ok: true } : { ok: false, reason: reasonText(res && res.reason) };
      },
      save: async (values) => {
        const api = bridge();
        let res = null;
        try { res = await api.saveRephraseSettings(payload(values)); } catch { res = null; }
        if (!res || !res.ok) return { ok: false, reason: reasonText(res && res.reason) };
        const key = String(values.rephraseKey || '').trim();
        if (key || values.__keyTouched) {
          try {
            const stored = await window.neo.setSecret(values.__secretName || 'rephrase-key', key);
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
  window.NeoRephraseSettings = { register };
})();
