// NEO fork — one wording for every rephrase failure (adr-012)
//
// Pure: the window and the settings tab map the same reason codes to the same
// sentences, so a 401 does not read as two different problems.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoRephraseReasons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TEXT = {
    endpoint: 'Only the local machine can be used. Check Settings → AI.',
    host: 'Only the local machine can be used. Check Settings → AI.',
    scheme: 'Only the local machine can be used. Check Settings → AI.',
    userinfo: 'Only the local machine can be used. Check Settings → AI.',
    url: 'That endpoint is not a valid address.',
    session: 'That rewrite window expired. Try again.',
    busy: 'The local model is still writing. Try again in a moment.',
    profile: 'That profile is no longer in the list.',
    auth: 'The API key was refused. Check Settings → AI.',
    model: 'That model was not found. Check Settings → AI.',
    modelId: 'The model id cannot be empty.',
    timeout: 'The local model did not answer in time.',
    network: 'The local model is not reachable.',
    http: 'The local model refused the request.',
    notFound: 'The endpoint or model was not found. Check Settings → AI.',
    empty: 'The local model returned nothing.',
    large: 'The local model returned too much text.',
    cancelled: 'That request was cancelled.',
    context: 'The reply repeated the surrounding text.',
    continuation: 'The reply continued the story instead of rewriting it.',
    short: 'The reply was not the right size.',
    long: 'The reply was not the right size.',
    limits: 'That value is too long for its field.',
    profiles: 'Use 2 to 8 profiles, each with its own label.',
    prompt: 'The base instruction cannot be empty.',
    many: 'That is too many profiles.',
    save: 'Those settings could not be saved.',
    slow: 'The local model is slow. Try again.'
  };
  function reasonText(reason, x) {
    const say = typeof x === 'function' ? x : (s) => s;
    const text = TEXT[reason];
    return text ? say(text) : say('That could not be completed.');
  }
  return { TEXT, reasonText };
});
