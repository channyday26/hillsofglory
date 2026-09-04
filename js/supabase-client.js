// ============================================
// Hills of Glory — Supabase Client Bootstrap
// ============================================
// The Supabase UMD SDK is loaded via a <script> tag in each page's <head>,
// which sets window.supabase to the SDK namespace (with .createClient).
// This file replaces window.supabase with the created CLIENT instance, so
// every other script can use `supabase.from(...)`, `supabase.auth`, etc.
//
// We also expose a bare `supabase` global (no `window.` prefix) for legacy
// scripts (admin-cms.js, admin-auth.js) that were written before we
// standardised on `window.supabase`.
//
// NOTE: The public anon/publishable key below is safe to expose in the
// browser. Never place the service_role key in frontend code.

(function () {
  'use strict';

  var SUPABASE_URL = 'https://zlsjponobcgsvbamhaeg.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_JOcPxFz8bOnxG46nnD_P5g_haLj3hGy';

  function initClient() {
    // window.supabase is the SDK namespace until we overwrite it with the client.
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      expose(client);
      return true;
    }
    // Already a client (has .from) — nothing to do.
    if (window.supabase && typeof window.supabase.from === 'function') {
      expose(window.supabase);
      return true;
    }
    return false;
  }

  function expose(client) {
    // window.supabase is the canonical place. Bare `supabase` is for legacy.
    window.supabase = client;
    // eslint-disable-next-line no-undef
    supabase = client;
  }

  // Fast path: SDK already present (loaded synchronously in <head>).
  if (!initClient()) {
    // Fallback: inject the SDK and create the client once it loads.
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = initClient;
    script.onerror = function () {
      console.error('Failed to load the Supabase SDK from the CDN.');
    };
    document.head.appendChild(script);
  }
})();