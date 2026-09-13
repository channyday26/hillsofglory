// ============================================
// Hills of Glory - Supabase Client Bootstrap
// ============================================

(() => {
  'use strict';

  const SUPABASE_URL = 'https://zlsjponobcgsvbamhaeg.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_JOcPxFz8bOnxG46nnD_P5g_haLj3hGy';

  function initClient() {
    // Check if window.supabase is the SDK library (has .createClient)
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return true;
    }

    // Check if window.supabase is already an active client instance (has .from)
    if (window.supabase && typeof window.supabase.from === 'function') {
      return true;
    }

    return false;
  }

  // Fast path: SDK already present from head tag
  if (!initClient()) {
    // Fallback: Dynamically load SDK if missing
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = initClient;
    script.onerror = () => {
      console.error('Failed to load Supabase SDK from CDN.');
    };
    document.head.appendChild(script);
  }
})();