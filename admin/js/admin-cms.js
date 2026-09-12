// ============================================
// Hills of Glory — Admin CMS
// ============================================

(function () {
  'use strict';

  // Wait for the Supabase client to be initialised. The SDK is normally
  // loaded synchronously in <head> so the client exists by the time we run,
  // but a CDN failure could leave supabase-client.js's async fallback in
  // charge. Poll briefly so we never dereference an undefined client.
  function waitForSupabase(cb, attempts) {
    attempts = attempts || 0;
    if (typeof supabase !== 'undefined' && supabase && supabase.auth) {
      cb();
    } else if (attempts < 50) {
      setTimeout(function () { waitForSupabase(cb, attempts + 1); }, 60);
    } else {
      console.error('Supabase client not available — admin CMS cannot start.');
    }
  }

// --- Auth check & Safe Loading Queue ---
  let isAuthReady = false;
  let authCallbacks = [];

  function runWhenAuthenticated(cb) {
    if (isAuthReady) {
      cb();
    } else {
      authCallbacks.push(cb);
    }
  }

  waitForSupabase(function () {
    supabase.auth.getSession().then(function (session) {
      if (!session.data.session) {
        window.location.href = 'index.html';
      } else {
        // Session confirmed! Run all queued data fetches.
        isAuthReady = true;
        authCallbacks.forEach(function (cb) { cb(); });
      }
    });
  });

  // --- Button loading state --------------------------------------------------
  // Toggles animated .btn--loading spinner + disabled + aria-busy so a button
  // cannot fire twice. Always use with try/finally so every exit path
  // (validation, upload error, network error) restores the button.
  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle('btn--loading', isLoading);
    btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  // --- Button loading helpers -----------------------------------------------
  // Toggles animated .btn--loading spinner + disabled + aria-busy so a button
  // cannot fire twice. Always use with try/finally so every exit path
  // (validation, upload error, network error) restores the button.
  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle('btn--loading', isLoading);
    btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  function isButtonBusy(btn) {
    return !!(btn && btn.disabled);
  }

  // Keeps the spinner visible for at least MIN_BUSY_MS so a fast network does
  // not produce a sub-perceptual flash.
  const MIN_BUSY_MS = 400;
  function finishButtonLoading(btn, startedAt) {
    const wait = Math.max(0, MIN_BUSY_MS - (Date.now() - startedAt));
    setTimeout(function () { setButtonLoading(btn, false); }, wait);
  }

  // --- Sidebar Navigation ---
  const sidebarLinks = document.querySelectorAll('.sidebar__link');
  const sections = document.querySelectorAll('.admin-section');
  const sidebarLogout = document.getElementById('sidebarLogout');

  sidebarLinks.forEach(function (link) {
    if (!link.dataset.section) return;

    link.addEventListener('click', function (e) {
      e.preventDefault();
      const target = link.dataset.section;
      sidebarLinks.forEach(function (l) { l.classList.remove('sidebar__link--active'); });
      link.classList.add('sidebar__link--active');
      sections.forEach(function (sec) {
        sec.hidden = sec.id !== 'section-' + target;
      });
    });
  });

  if (sidebarLogout) {
    sidebarLogout.addEventListener('click', async function () {
      setButtonLoading(sidebarLogout, true);
      await supabase.auth.signOut();
      window.location.href = 'index.html';
      // spinner stays visible through the redirect
    });
  }

  // --- Main CMS init: all data-fetching runs after auth is confirmed ---
  // This prevents .from() calls from referencing an undefined client.
  waitForSupabase(function () {
    supabase.auth.getSession().then(function (session) {
      if (session.data.session) {
        // Authenticated — run all data loaders.
        initCMSData();
      } else {
        // Not logged in — redirect.
        window.location.href = 'index.html';
      }
    });
  });



  // --- Module-level data loaders (visible to initCMSData) ---
  async function loadSettings() {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    const { data, error } = await supabase.from('church_settings').select('*').limit(1).maybeSingle();
    if (error) { console.error(error); return; }
    if (!data) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('setAddress', data.main_address); set('setPhone', data.contact_phone); set('setEmail', data.contact_email);
    set('setBank', data.bank_details); set('setFacebook', data.facebook_url); set('setInstagram', data.instagram_url);
    set('setYouTube', data.youtube_url); set('setX', data.x_url); set('setHeroVideo', data.hero_video_url);

    // Spotlight image is an upload control: the current URL goes into a hidden
    // field (so saving without a new file keeps it), and the preview mirrors it.
    const spotFile = document.getElementById('setSpotlightImage');
    if (spotFile) spotFile.value = '';
    set('setSpotlightImageValue', data.home_spotlight_image);
    const spotPreview = document.getElementById('setSpotlightImagePreview');
    const spotWrap = document.getElementById('setSpotlightImagePreviewWrap');
    if (spotPreview && spotWrap) {
      const url = data.home_spotlight_image || '';
      if (url) {
        spotPreview.src = url;
        spotWrap.hidden = false;
      } else {
        spotPreview.removeAttribute('src');
        spotWrap.hidden = true;
      }
    }
  }

  // Populates the notification-settings form. Admin-only table (migration 006),
  // so this returns nothing until seed_admin.sql has run and the session is an
  // admin — the empty form is the correct fallback in that case.
  async function loadNotificationSettings() {
    const form = document.getElementById('notifyForm');
    if (!form) return;
    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .maybeSingle();
    if (error) { console.error(error); return; }
    if (!data) return;
    const emailEl = document.getElementById('notifyEmail');
    const enabledEl = document.getElementById('notifyEnabled');
    if (emailEl) emailEl.value = data.prayer_notify_email || '';
    if (enabledEl) enabledEl.checked = data.prayer_notify_enabled !== false;
  }

  async function loadLeadership() {
    const list = document.getElementById('leadershipList');
    if (!list) return;
    const { data, error } = await supabase.from('leadership_team').select('*').order('sort_order', { ascending: true });
    if (error) { console.error(error); return; }
    list.innerHTML = (data || []).map(function (l) {
      return '<div class="card" style="display:flex;align-items:center;gap:var(--space-md);">' +
        (l.image_url ? '<img src="' + l.image_url + '" alt="' + (l.name || '') + '" style="width:60px;height:60px;border-radius:var(--radius-full);object-fit:cover;" />' : '') +
        '<div style="flex:1;"><h3 class="card__title" style="margin:0;">' + (l.name || '') + '</h3><p class="card__text" style="margin:0;">' + (l.role || '') + '</p></div>' +
        '<button class="btn btn--secondary" data-action="delete-leader" data-id="' + (l.id || '') + '">Delete</button></div>';
    }).join('');
  }

  async function loadMinistries() {
    const list = document.getElementById('ministriesList');
    if (!list) return;
    const { data, error } = await supabase.from('ministries').select('*').order('name', { ascending: true });
    if (error) { console.error(error); return; }
    list.innerHTML = (data || []).map(function (m) {
      return '<div class="card" style="display:flex;align-items:center;gap:var(--space-md);">' +
        '<div style="flex:1;">' +
        '<h3 class="card__title" style="margin:0;">' + (m.name || '') + '</h3>' +
        '<p class="card__text" style="margin:0;">' + (m.category || '') + '</p>' +
        '</div>' +
        '<button class="btn btn--secondary" data-action="delete-ministry" data-id="' + (m.id || '') + '">Delete</button>' +
        '</div>';
    }).join('');
  }

  async function loadLocations() {
    const list = document.getElementById('locationsList');
    if (!list) return;
    const { data, error } = await supabase.from('locations').select('*');
    if (error) { console.error(error); return; }
    list.innerHTML = (data || []).map(function (l) {
      return '<div class="card" style="display:flex;align-items:center;gap:var(--space-md);">' +
        '<div style="flex:1;">' +
        '<h3 class="card__title" style="margin:0;">' + (l.name || '') + '</h3>' +
        '<p class="card__text" style="margin:0;">' + (l.location_type || '') + ' — ' + (l.address || '') + '</p>' +
        '</div>' +
        '<button class="btn btn--secondary" data-action="delete-location" data-id="' + (l.id || '') + '">Delete</button>' +
        '</div>';
    }).join('');
  }

  async function loadLifegroups() {
    const list = document.getElementById('lifegroupsList');
    if (!list) return;
    const { data, error } = await supabase.from('lifegroups').select('*');
    if (error) { console.error(error); return; }
    list.innerHTML = (data || []).map(function (lg) {
      return '<div class="card" style="display:flex;align-items:center;gap:var(--space-md);">' +
        '<div style="flex:1;">' +
        '<h3 class="card__title" style="margin:0;">' + esc(lg.group_name || '') + '</h3>' +
        '<p class="card__text" style="margin:0;">' + esc(lg.group_type || 'uncategorised') + ' — Leader: ' +
          esc(lg.leader_name || '') + ' — ' + esc(lg.location || '') + '</p>' +
        '</div>' +
        '<button class="btn btn--secondary" data-action="edit-lifegroup" data-id="' + (lg.id || '') + '">Edit</button>' +
        '<button class="btn btn--secondary" data-action="delete-lifegroup" data-id="' + (lg.id || '') + '">Delete</button>' +
        '</div>';
    }).join('');
  }

  async function loadSermons() {
    const list = document.getElementById('sermonsList');
    if (!list) return;
    const { data, error } = await supabase.from('sermons').select('*').order('date', { ascending: false });
    if (error) { console.error(error); return; }
    list.innerHTML = (data || []).map(function (s) {
      return '<div class="card" style="display:flex;align-items:center;gap:var(--space-md);">' +
        '<div style="flex:1;">' +
        '<h3 class="card__title" style="margin:0;">' + (s.title || '') + '</h3>' +
        '<p class="card__text" style="margin:0;">' + (s.speaker || '') + ' — ' + (s.date || '') + '</p>' +
        '</div>' +
        '<button class="btn btn--secondary" data-action="edit-sermon" data-id="' + (s.id || '') + '">Edit</button>' +
        '<button class="btn btn--secondary" data-action="delete-sermon" data-id="' + (s.id || '') + '">Delete</button>' +
        '</div>';
    }).join('');
  }

  // --- Special events (max two) ---
  function formatAdminDate(dateStr) {
    const parts = String(dateStr || '').split('T')[0].split('-');
    if (parts.length !== 3) return String(dateStr || '');
    return parts[1] + '/' + parts[2] + '/' + parts[0];
  }

  async function loadSpecialEvents() {
    const list = document.getElementById('specialEventsList');
    if (!list) return;
    const { data, error } = await supabase.from('special_events').select('*').order('event_date', { ascending: true });
    if (error) { console.error(error); return; }
    if (!data || !data.length) {
      list.innerHTML = '<p class="card__text">No special events yet. Add up to two to feature on the events page.</p>';
      return;
    }
    list.innerHTML = data.map(function (ev) {
      const dateLabel = formatAdminDate(ev.event_date) + (ev.event_time ? ' — ' + ev.event_time : '');
      return '<div class="card" style="display:flex;align-items:center;gap:var(--space-md);">' +
        (ev.image_url
          ? '<img src="' + escAttr(ev.image_url) + '" alt="' + escAttr(ev.title || '') +
            '" style="width:60px;height:60px;border-radius:var(--radius-md);object-fit:cover;" />'
          : '') +
        '<div style="flex:1;">' +
        '<h3 class="card__title" style="margin:0;">' + esc(ev.title || '') + '</h3>' +
        '<p class="card__text" style="margin:0;">' + esc(dateLabel) + '</p>' +
        '</div>' +
        '<button class="btn btn--secondary" data-action="edit-special-event" data-id="' + (ev.id || '') + '">Edit</button>' +
        '<button class="btn btn--secondary" data-action="delete-special-event" data-id="' + (ev.id || '') + '">Delete</button>' +
        '</div>';
    }).join('');
  }

  // --- Monthly theme (singleton) ------------------------------------------
  // Remember the live row's real id so "Delete" is honest even if a future
  // upsert wrote a non-constant id.
  let monthlyThemeRowId = null;

  async function loadMonthlyTheme() {
    const list = document.getElementById('monthlyThemeList');
    if (!list) return;
    const { data, error } = await supabase.from('monthly_theme').select('*').limit(1).maybeSingle();
    if (error) { console.error(error); return; }
    monthlyThemeRowId = data ? data.id : null;
    if (!data) {
      list.innerHTML = '<p class="card__text">No monthly theme yet. Add one (Active) to reveal the homepage theme section; delete it to hide the section.</p>';
      return;
    }
    list.innerHTML = '<div class="card" style="display:flex;align-items:center;gap:var(--space-md);">' +
      (data.image_url
        ? '<img src="' + escAttr(data.image_url) + '" alt="' + escAttr(data.title || 'Monthly Theme') +
          '" style="width:64px;height:64px;border-radius:var(--radius-md);object-fit:cover;" />'
        : '') +
      '<div style="flex:1;">' +
      '<h3 class="card__title" style="margin:0;">' + esc(data.title || 'Monthly Theme') + '</h3>' +
      '<p class="card__text" style="margin:0;">' + esc(data.month_label || 'No month label') + ' — ' +
        (data.is_active ? 'Active (visible)' : 'Inactive (hidden)') + '</p>' +
      '</div>' +
      '<button class="btn btn--secondary" data-action="edit-monthly-theme">Edit</button>' +
      '<button class="btn btn--secondary" data-action="delete-monthly-theme">Delete</button>' +
      '</div>';
  }

  // --- Live status (singleton) --------------------------------------------
  let liveStatusRowId = null;

  async function loadLiveStatus() {
    const list = document.getElementById('liveStatusList');
    if (!list) return;
    const { data, error } = await supabase.from('live_status').select('*').limit(1).maybeSingle();
    if (error) { console.error(error); return; }
    liveStatusRowId = data ? data.id : null;
    if (!data) {
      list.innerHTML = '<p class="card__text">No live status yet. Save one with status Live to reveal the homepage section and navbar Live button.</p>';
      return;
    }
    list.innerHTML = '<div class="card" style="display:flex;align-items:center;gap:var(--space-md);">' +
      '<div style="flex:1;">' +
      '<h3 class="card__title" style="margin:0;">' + esc(data.live_title || 'Live Stream') + '</h3>' +
      '<p class="card__text" style="margin:0;">' +
        (data.is_live ? '<span style="color:var(--color-live);font-weight:700;">Live Now</span>'
                      : 'Not live (hidden)') +
        (data.youtube_url ? ' — ' + esc(data.youtube_url) : '') +
      '</p>' +
      '</div>' +
      '<button class="btn btn--secondary" data-action="edit-live-status">Edit</button>' +
      '<button class="btn btn--secondary" data-action="delete-live-status">Delete</button>' +
      '</div>';
  }

  // --- Service schedules (full CRUD with location + optional image) -------
  async function populateLocationSelect(selectedId) {
    const select = document.getElementById('scLocation');
    if (!select) return null;
    const { data, error } = await supabase.from('locations').select('id, name').order('sort_order', { ascending: true });
    if (error || !data || !data.length) {
      select.innerHTML = '<option value="">No locations yet — add one in Locations first</option>';
      return null;
    }
    select.innerHTML = data.map(function (l) {
      return '<option value="' + escAttr(l.id) + '"' + (selectedId === l.id ? ' selected' : '') + '>' +
        esc(l.name) + '</option>';
    }).join('');
    return data;
  }

  async function loadServiceSchedules() {
    const list = document.getElementById('schedulesList');
    if (!list) return;

    const [schedulesRes, locationsRes] = await Promise.all([
      supabase.from('service_schedules').select('*').order('sort_order', { ascending: true }),
      supabase.from('locations').select('id, name').order('sort_order', { ascending: true })
    ]);
    if (schedulesRes.error) { console.error(schedulesRes.error); return; }

    const nameById = {};
    (locationsRes.data || []).forEach(function (l) { nameById[l.id] = l.name; });

    if (!schedulesRes.data || !schedulesRes.data.length) {
      list.innerHTML = '<p class="card__text">No service schedules yet. Add one below.</p>';
      return;
    }

    list.innerHTML = schedulesRes.data.map(function (s) {
      return '<div class="card" style="display:flex;align-items:center;gap:var(--space-md);">' +
        (s.image_url
          ? '<img src="' + escAttr(s.image_url) + '" alt="" style="width:60px;height:60px;border-radius:var(--radius-md);object-fit:cover;" />'
          : '') +
        '<div style="flex:1;">' +
        '<h3 class="card__title" style="margin:0;">' + esc(s.service_name || '') + '</h3>' +
        '<p class="card__text" style="margin:0;">' + esc(s.day || '') + ' — ' + esc(s.time || '') +
          ' — ' + esc(nameById[s.location_id] || 'Unknown location') + '</p>' +
        '</div>' +
        '<button class="btn btn--secondary" data-action="edit-schedule" data-id="' + escAttr(s.id || '') + '">Edit</button>' +
        '<button class="btn btn--secondary" data-action="delete-schedule" data-id="' + escAttr(s.id || '') + '">Delete</button>' +
        '</div>';
    }).join('');
  }

  // --- HTML escaping ---------------------------------------------------
  // Request tables hold text typed by anonymous visitors. Interpolating that
  // into innerHTML unescaped means a submitted <img onerror="..."> runs inside
  // the admin's authenticated session, with the Supabase token in reach. Every
  // value below goes through esc().
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const escAttr = esc;

  // --- Requests (prayer + ministry join) --------------------------------
  // One loader, one renderer, driven by which tab is active. There used to be
  // two functions named loadRequests — a module-level one called by
  // initCMSData() and a block-scoped one that ran immediately at parse time,
  // before auth, so its query came back empty under RLS.
  const REQUEST_TABS = {
    prayer: { table: 'prayer_requests', title: 'Prayer Requests' },
    ministry: { table: 'ministry_join_requests', title: 'Ministry Join Requests' },
  };
  let activeRequestTab = 'prayer';

  async function loadRequests() {
    const list = document.getElementById('requestsList');
    if (!list) return;

    const tab = REQUEST_TABS[activeRequestTab] || REQUEST_TABS.prayer;
    const { data, error } = await supabase
      .from(tab.table)
      .select('*')
      .order('date_submitted', { ascending: false });

    if (error) {
      console.error(error);
      list.innerHTML = '<p class="card__text">Could not load requests. ' +
        (error.code === '42501' ? 'Your account needs role = admin.' : 'See the console.') + '</p>';
      return;
    }

    renderRequestsList(list, tab, data || []);

    // Icons in the freshly-injected rows are <i data-lucide> placeholders;
    // convert them now that they are in the DOM.
    if (window.initIcons) window.initIcons();
  }

  function renderRequestsList(container, tab, items) {
    if (!items.length) {
      container.innerHTML = '<p class="card__text">No ' + esc(tab.title.toLowerCase()) + ' yet.</p>';
      return;
    }

    container.innerHTML = '<h3 class="admin-list__heading">' + esc(tab.title) + '</h3>' +
      items.map(function (r) {
        const name = r.visitor_name || 'Anonymous';
        // prayer_requests carries request_text; ministry_join_requests carries
        // the interest plus a contact detail.
        const body = r.request_text ||
          [r.ministry_of_interest, r.contact_info].filter(Boolean).join(' — ') || '';
        const date = r.date_submitted ? new Date(r.date_submitted).toLocaleString() : '';
        const notified = r.notified_at
          ? '<span class="request-row__badge"><i data-lucide="mail-check"></i> Emailed</span>'
          : '';

        return '<div class="card request-row">' +
          '<div class="request-row__body">' +
            '<p class="card__subtitle">' + esc(name) + '</p>' +
            '<p class="card__text request-row__text">' + esc(body) + '</p>' +
            '<p class="request-row__meta">' + esc(date) + notified + '</p>' +
          '</div>' +
          '<button type="button" class="btn btn--secondary btn--sm" ' +
            'data-action="delete-request" ' +
            'data-id="' + escAttr(r.id || '') + '" ' +
            'data-table="' + escAttr(tab.table) + '" ' +
            'aria-label="Delete request from ' + escAttr(name) + '">' +
            '<i data-lucide="trash-2"></i> Delete</button>' +
          '</div>';
      }).join('');
  }

  function wireRequestControls() {
    // Tabs
    document.addEventListener('click', function (e) {
      const tabBtn = e.target.closest('.admin-tab');
      if (!tabBtn || !tabBtn.dataset.tab) return;
      if (!REQUEST_TABS[tabBtn.dataset.tab]) return;

      document.querySelectorAll('.admin-tab').forEach(function (t) {
        t.classList.remove('admin-tab--active');
        t.setAttribute('aria-pressed', 'false');
      });
      tabBtn.classList.add('admin-tab--active');
      tabBtn.setAttribute('aria-pressed', 'true');

      activeRequestTab = tabBtn.dataset.tab;
      loadRequests();
    });

    // Delete
    document.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-action="delete-request"]');
      if (!btn) return;

      const id = btn.dataset.id;
      const table = btn.dataset.table;

      // Never hand an arbitrary string to .from() — only the two known tables.
      const allowed = Object.keys(REQUEST_TABS).some(function (k) {
        return REQUEST_TABS[k].table === table;
      });
      if (!id || !allowed) return;

      if (!window.confirm('Delete this request permanently? This cannot be undone.')) return;

      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        // .select('id') is what makes this honest: when RLS blocks a DELETE,
        // PostgREST returns 200 with an empty array rather than an error, so
        // without it a forbidden delete looks like a successful one.
        const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');

        if (error) {
          showToast(error.code === '42501'
            ? 'Permission denied — your account needs role = admin.'
            : 'Could not delete the request.', 'error');
          console.error(error);
          return;
        }

        if (!data || !data.length) {
          showToast('Nothing was deleted. Confirm migration 006 has run and you are an admin.', 'error');
          return;
        }

        showToast('Request deleted.', 'success');
        loadRequests();
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });
  }

  function initCMSData() {
    loadSettings();
    loadNotificationSettings();
    loadLeadership();
    loadMinistries();
    loadLocations();
    loadServiceSchedules();
    populateLocationSelect();
    loadLifegroups();
    loadSermons();
    loadSpecialEvents();
    loadMonthlyTheme();
    loadLiveStatus();
    loadRequests();
    wireRequestControls();
  }

  // --- Toast ---
  function showToast(message, type) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast toast--' + (type === 'error' ? 'error' : 'success');
    const iconClass = type === 'error' ? 'circle-alert' : 'circle-check';
    const span = document.createElement('span');
    span.textContent = message;
    toast.innerHTML = '<i class="ti ' + iconClass + ' toast__icon"></i>';
    toast.appendChild(span);
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(function () { toast.remove(); }, 320);
    }, 4000);
  }

  // --- Helper: format file size ---
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // --- Helper: upload image to Supabase Storage ---
  async function uploadImage(file) {
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      throw new Error('File too large. Max size is 2MB (' + formatFileSize(file.size) + ').');
    }
    const fileName = Date.now() + '-' + file.name.replace(/\s+/g, '_');
    const { data, error } = await supabase.storage
      .from('website-images')
      .upload(fileName, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('website-images').getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  // --- Settings Form ---
  // church_settings is a singleton: migration 005 pins it to the constant id
  // below with CHECK (id = <constant>), which together with the primary key
  // makes "at most one row" a database invariant. That is what lets this be a
  // single idempotent upsert — correct whether or not the row already exists,
  // with no client-side branching and no cached row id.
  //
  // REQUIRES supabase/005_settings_singleton.sql. Before that migration the
  // live row still carries a random UUID, so upserting this constant would
  // insert a second row and trip the old BEFORE INSERT trigger. The error
  // handler below detects exactly that and says so.
  const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

  async function saveChurchSettings(payload) {
    return await supabase
      .from('church_settings')
      .upsert(Object.assign({ id: SETTINGS_ID }, payload))
      .select('id')
      .single();
  }

  // Turns the three failure modes that actually happen into something the
  // person reading the toast can act on.
  function settingsErrorMessage(error) {
    if (!error) return 'Error saving settings.';

    // P0001 — the retired single-row trigger is still installed.
    if (error.code === 'P0001') {
      return 'Database not migrated: run supabase/005_settings_singleton.sql in the SQL Editor, then try again.';
    }
    // 23514 — CHECK violation, i.e. the constant id here disagrees with the one
    // the constraint expects.
    if (error.code === '23514') {
      return 'The settings row id does not match the singleton constraint. Check SETTINGS_ID against migration 005.';
    }
    // 42501 — RLS refused the write.
    if (error.code === '42501') {
      return 'Permission denied. Check that your account has a profiles row with role = admin.';
    }
    return error.message || 'Error saving settings.';
  }

  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const submitBtn = settingsForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        // Spotlight image is uploaded to Storage; the resulting public URL goes
        // into home_spotlight_image. No new file selected -> keep the value held
        // in the hidden field (i.e. the image that is currently live).
        let spotlightImage = valueOf('setSpotlightImageValue');
        const spotFileInput = document.getElementById('setSpotlightImage');
        if (spotFileInput && spotFileInput.files && spotFileInput.files[0]) {
          spotlightImage = await uploadImage(spotFileInput.files[0]);
        }

        const payload = {
          main_address: valueOf('setAddress'),
          contact_phone: valueOf('setPhone'),
          contact_email: valueOf('setEmail'),
          bank_details: valueOf('setBank'),
          facebook_url: valueOf('setFacebook'),
          instagram_url: valueOf('setInstagram'),
          youtube_url: valueOf('setYouTube'),
          x_url: valueOf('setX'),
          hero_video_url: valueOf('setHeroVideo'),
          home_spotlight_image: spotlightImage,
        };

        const result = await saveChurchSettings(payload);

        if (result.error) {
          showToast(settingsErrorMessage(result.error), 'error');
          console.error(result.error);
        } else {
          showToast('Settings saved!', 'success');
          loadSettings();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });
  }

  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // --- Leadership CRUD ---
  const leadershipForm = document.getElementById('leadershipForm');
  if (leadershipForm) {
    // Data loading deferred to initCMSData() after auth.
    leadershipForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = leadershipForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      const name = document.getElementById('leaderName').value.trim();
      const role = document.getElementById('leaderRole').value.trim();
      const bio = document.getElementById('leaderBio').value.trim();
      const imageInput = document.getElementById('leaderImage');
      const imageFile = imageInput ? imageInput.files[0] : null;

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        let imageUrl = '';
        if (imageFile) imageUrl = await uploadImage(imageFile);
        const { data, error } = await supabase.from('leadership_team').insert([{ name, role, bio, image_url: imageUrl }]);
        if (error) {
          showToast('Error adding leader.', 'error');
          console.error(error);
        } else {
          showToast('Leader added!', 'success');
          leadershipForm.reset();
          loadLeadership();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });

    document.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-action="delete-leader"]');
      if (!btn) return;
      const id = btn.dataset.id;
      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase.from('leadership_team').delete().eq('id', id);
        if (error) {
          showToast('Error deleting.', 'error');
          console.error(error);
        } else {
          showToast('Leader removed.', 'success');
          loadLeadership();
        }
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });
  }

  // --- Ministries CRUD ---
  const ministriesForm = document.getElementById('ministriesForm');
  if (ministriesForm) {
    // Data loading deferred to initCMSData() after auth.

    ministriesForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = ministriesForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      const name = document.getElementById('minName').value.trim();
      const category = document.getElementById('minCategory').value;
      const desc = document.getElementById('minDesc').value.trim();
      const contact = document.getElementById('minContact').value.trim();
      const school = document.getElementById('minSchool').value.trim();
      const imageInput = document.getElementById('minImage');
      const imageFile = imageInput ? imageInput.files[0] : null;

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        let imageUrl = '';
        if (imageFile) imageUrl = await uploadImage(imageFile);
        const { data, error } = await supabase.from('ministries').insert([{ name, category, description: desc, contact_person: contact, target_school: school, image_url: imageUrl }]);
        if (error) {
          showToast('Error adding ministry.', 'error');
          console.error(error);
        } else {
          showToast('Ministry added!', 'success');
          ministriesForm.reset();
          loadMinistries();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });

    document.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-action="delete-ministry"]');
      if (!btn) return;
      const id = btn.dataset.id;
      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase.from('ministries').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); console.error(error); }
        else { showToast('Ministry removed.', 'success'); loadMinistries(); }
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });
  }

  // --- Locations CRUD ---
  const locationsForm = document.getElementById('locationsForm');
  if (locationsForm) {
    // Data loading deferred to initCMSData() after auth.

    locationsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = locationsForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      const name = document.getElementById('locName').value.trim();
      const type = document.getElementById('locType').value;
      const address = document.getElementById('locAddress').value.trim();
      const maps = document.getElementById('locMaps').value.trim();
      const status = document.getElementById('locStatus').value;

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        const { data, error } = await supabase.from('locations').insert([{ name, location_type: type, address, google_maps_embed_link: maps, status }]);
        if (error) {
          showToast('Error adding location.', 'error');
          console.error(error);
        } else {
          showToast('Location added!', 'success');
          locationsForm.reset();
          loadLocations();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });

    document.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-action="delete-location"]');
      if (!btn) return;
      const id = btn.dataset.id;
      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase.from('locations').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); console.error(error); }
        else { showToast('Location removed.', 'success'); loadLocations(); }
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });
  }

  // --- Lifegroups CRUD ---
  const lifegroupsForm = document.getElementById('lifegroupsForm');
  if (lifegroupsForm) {
    // Data loading deferred to initCMSData() after auth.

    // Edit state: when null the form adds a new group; otherwise it holds the
    // id of the row being updated. One form serves both modes.
    let lifegroupsEditingId = null;
    const lifegroupsSubmit = lifegroupsForm.querySelector('button[type="submit"]');

    function resetLifegroupForm() {
      lifegroupsEditingId = null;
      lifegroupsForm.reset();
      const cancelEdit = document.getElementById('lifegroupCancelEdit');
      if (cancelEdit) cancelEdit.hidden = true;
      if (lifegroupsSubmit) {
        lifegroupsSubmit.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i> Add Lifegroup';
        if (window.initIcons) window.initIcons();
      }
    }

    lifegroupsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = lifegroupsForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      const name = document.getElementById('lgName').value.trim();
      const type = document.getElementById('lgType').value;
      const leader = document.getElementById('lgLeader').value.trim();
      const location = document.getElementById('lgLocation').value.trim();
      const time = document.getElementById('lgTime').value.trim();
      const contact = document.getElementById('lgContact').value.trim();
      const payload = {
        group_name: name,
        group_type: type,
        leader_name: leader,
        location,
        meeting_time: time,
        contact_info: contact
      };

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        let error;
        if (lifegroupsEditingId) {
          ({ error } = await supabase.from('lifegroups').update(payload).eq('id', lifegroupsEditingId));
        } else {
          ({ error } = await supabase.from('lifegroups').insert([payload]));
        }

        if (error) {
          showToast('Error saving lifegroup.', 'error');
          console.error(error);
        } else {
          showToast(lifegroupsEditingId ? 'Lifegroup updated!' : 'Lifegroup added!', 'success');
          resetLifegroupForm();
          loadLifegroups();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'edit-lifegroup') {
        const id = e.target.dataset.id;
        const { data, error } = await supabase.from('lifegroups').select('*').eq('id', id).single();
        if (error || !data) {
          showToast('Could not load that lifegroup.', 'error');
          console.error(error);
          return;
        }
        lifegroupsEditingId = id;
        document.getElementById('lgName').value = data.group_name || '';
        document.getElementById('lgType').value = data.group_type || 'men';
        document.getElementById('lgLeader').value = data.leader_name || '';
        document.getElementById('lgLocation').value = data.location || '';
        document.getElementById('lgTime').value = data.meeting_time || '';
        document.getElementById('lgContact').value = data.contact_info || '';
        const cancelEdit = document.getElementById('lifegroupCancelEdit');
        if (cancelEdit) cancelEdit.hidden = false;
        if (lifegroupsSubmit) {
          lifegroupsSubmit.innerHTML = '<i data-lucide="pencil" aria-hidden="true"></i> Update Lifegroup';
          if (window.initIcons) window.initIcons();
        }
        document.getElementById('lgName').focus();
      }

      const btn = e.target.closest('[data-action="delete-lifegroup"]');
      if (!btn) return;
      const id = btn.dataset.id;
      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase.from('lifegroups').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); console.error(error); }
        else { showToast('Lifegroup removed.', 'success'); loadLifegroups(); }
        if (lifegroupsEditingId === id) resetLifegroupForm();
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });

    const cancelEdit = document.getElementById('lifegroupCancelEdit');
    if (cancelEdit) {
      cancelEdit.addEventListener('click', resetLifegroupForm);
    }
  }

  // --- Sermons CRUD ---
  const sermonsForm = document.getElementById('sermonsForm');
  if (sermonsForm) {
    let sermonsEditingId = null;
    const sermonsSubmit = sermonsForm.querySelector('button[type="submit"]');

    function resetSermonForm() {
      sermonsEditingId = null;
      sermonsForm.reset();
      const cancelEdit = document.getElementById('sermonCancelEdit');
      if (cancelEdit) cancelEdit.hidden = true;
      if (sermonsSubmit) {
        sermonsSubmit.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i> Add Sermon';
        if (window.initIcons) window.initIcons();
      }
    }

    sermonsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = sermonsForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      const title = document.getElementById('sermonTitle').value.trim();
      const speaker = document.getElementById('sermonSpeaker').value.trim();
      const date = document.getElementById('sermonDate').value;
      const youtube = document.getElementById('sermonYoutube').value.trim();
      const desc = document.getElementById('sermonDesc').value.trim();
      const payload = { title, speaker, date, youtube_url: youtube, description: desc };

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        let error;
        if (sermonsEditingId) {
          ({ error } = await supabase.from('sermons').update(payload).eq('id', sermonsEditingId));
        } else {
          ({ error } = await supabase.from('sermons').insert([payload]));
        }

        if (error) {
          showToast('Error saving sermon.', 'error');
          console.error(error);
        } else {
          showToast(sermonsEditingId ? 'Sermon updated!' : 'Sermon added!', 'success');
          resetSermonForm();
          loadSermons();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'edit-sermon') {
        const id = e.target.dataset.id;
        const { data, error } = await supabase.from('sermons').select('*').eq('id', id).single();
        if (error || !data) {
          showToast('Could not load that sermon.', 'error');
          console.error(error);
          return;
        }
        sermonsEditingId = id;
        document.getElementById('sermonTitle').value = data.title || '';
        document.getElementById('sermonSpeaker').value = data.speaker || '';
        document.getElementById('sermonDate').value = data.date || '';
        document.getElementById('sermonYoutube').value = data.youtube_url || '';
        document.getElementById('sermonDesc').value = data.description || '';
        const cancelEdit = document.getElementById('sermonCancelEdit');
        if (cancelEdit) cancelEdit.hidden = false;
        if (sermonsSubmit) {
          sermonsSubmit.innerHTML = '<i data-lucide="pencil" aria-hidden="true"></i> Update Sermon';
          if (window.initIcons) window.initIcons();
        }
        document.getElementById('sermonTitle').focus();
      }

      const btn = e.target.closest('[data-action="delete-sermon"]');
      if (!btn) return;
      const id = btn.dataset.id;
      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase.from('sermons').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); console.error(error); }
        else { showToast('Sermon removed.', 'success'); loadSermons(); }
        if (sermonsEditingId === id) resetSermonForm();
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });

    const cancelEdit = document.getElementById('sermonCancelEdit');
    if (cancelEdit) {
      cancelEdit.addEventListener('click', resetSermonForm);
    }
  }

  // --- Special Events CRUD (max two) ---
  const specialEventsForm = document.getElementById('specialEventsForm');
  if (specialEventsForm) {
    // Data loading deferred to initCMSData() after auth.

    // Edit state: null = adding a new event; otherwise the row id being
    // updated. One form serves both modes, mirroring the lifegroups editor.
    let specialEventsEditingId = null;
    let specialEventsEditingImage = '';
    const specialEventsSubmit = specialEventsForm.querySelector('button[type="submit"]');

    function resetSpecialEventsForm() {
      specialEventsEditingId = null;
      specialEventsEditingImage = '';
      specialEventsForm.reset();
      const cancelEdit = document.getElementById('specialEventCancelEdit');
      if (cancelEdit) cancelEdit.hidden = true;
      if (specialEventsSubmit) {
        specialEventsSubmit.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i> Add Event';
        if (window.initIcons) window.initIcons();
      }
    }

    specialEventsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = specialEventsForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      const title = document.getElementById('evTitle').value.trim();
      const date = document.getElementById('evDate').value;
      const time = document.getElementById('evTime').value.trim();
      const desc = document.getElementById('evDesc').value.trim();
      const imageInput = document.getElementById('evImage');
      const imageFile = imageInput ? imageInput.files[0] : null;

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        let imageUrl = specialEventsEditingImage;
        if (imageFile) imageUrl = await uploadImage(imageFile);

        // Only additions must respect the two-event cap; editing never adds a row.
        if (!specialEventsEditingId) {
          const { count, error: countError } = await supabase
            .from('special_events')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true);
          if (countError) console.error(countError);
          if (!countError && count >= 2) {
            showToast('Only two events can be featured at a time. Delete one first.', 'error');
            return;
          }
        }

        const payload = { title, event_date: date, event_time: time, description: desc, image_url: imageUrl };

        let error;
        if (specialEventsEditingId) {
          ({ error } = await supabase.from('special_events').update(payload).eq('id', specialEventsEditingId));
        } else {
          ({ error } = await supabase.from('special_events').insert([payload]));
        }

        if (error) {
          // The database trigger re-bounds the same limit as defence in depth.
          const capped = /special events/i.test(error.message || '');
          showToast(capped
            ? 'Only two events can be featured at a time. Delete one first.'
            : 'Error saving event.', 'error');
          console.error(error);
        } else {
          showToast(specialEventsEditingId ? 'Event updated!' : 'Event added!', 'success');
          resetSpecialEventsForm();
          loadSpecialEvents();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'edit-special-event') {
        const id = e.target.dataset.id;
        const { data, error } = await supabase.from('special_events').select('*').eq('id', id).single();
        if (error || !data) {
          showToast('Could not load that event.', 'error');
          console.error(error);
          return;
        }
        specialEventsEditingId = id;
        specialEventsEditingImage = data.image_url || '';
        document.getElementById('evTitle').value = data.title || '';
        document.getElementById('evDate').value = data.event_date ? String(data.event_date).slice(0, 10) : '';
        document.getElementById('evTime').value = data.event_time || '';
        document.getElementById('evDesc').value = data.description || '';
        const cancelEdit = document.getElementById('specialEventCancelEdit');
        if (cancelEdit) cancelEdit.hidden = false;
        if (specialEventsSubmit) {
          specialEventsSubmit.innerHTML = '<i data-lucide="pencil" aria-hidden="true"></i> Update Event';
          if (window.initIcons) window.initIcons();
        }
        document.getElementById('evTitle').focus();
      }

      const btn = e.target.closest('[data-action="delete-special-event"]');
      if (!btn) return;
      const id = btn.dataset.id;
      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase.from('special_events').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); console.error(error); }
        else { showToast('Event removed.', 'success'); loadSpecialEvents(); }
        if (specialEventsEditingId === id) resetSpecialEventsForm();
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });

    const cancelEdit = document.getElementById('specialEventCancelEdit');
    if (cancelEdit) {
      cancelEdit.addEventListener('click', resetSpecialEventsForm);
    }
  }

  // --- Service Schedules CRUD ---
  const schedulesForm = document.getElementById('schedulesForm');
  if (schedulesForm) {
    // Data loading deferred to initCMSData() after auth.

    // Edit state: null = adding; otherwise the row id being updated.
    let schedulesEditingId = null;
    let schedulesEditingImage = '';
    const schedulesSubmit = schedulesForm.querySelector('button[type="submit"]');

    function resetScheduleForm() {
      schedulesEditingId = null;
      schedulesEditingImage = '';
      schedulesForm.reset();
      const cancelEdit = document.getElementById('scheduleCancelEdit');
      if (cancelEdit) cancelEdit.hidden = true;
      if (schedulesSubmit) {
        schedulesSubmit.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i> Add Schedule';
        if (window.initIcons) window.initIcons();
      }
    }

    schedulesForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = schedulesForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      const service_name = document.getElementById('scName').value.trim();
      const day = document.getElementById('scDay').value.trim();
      const time = document.getElementById('scTime').value.trim();
      const location_id = document.getElementById('scLocation').value;
      const imageInput = document.getElementById('scImage');
      const imageFile = imageInput ? imageInput.files[0] : null;

      if (!service_name || !day || !time || !location_id) {
        showToast('Service name, day, time, and location are required.', 'error');
        return;
      }

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        let image_url = schedulesEditingImage;
        if (imageFile) image_url = await uploadImage(imageFile);

        const payload = { service_name, day, time, location_id, image_url };

        let error;
        if (schedulesEditingId) {
          ({ error } = await supabase.from('service_schedules').update(payload).eq('id', schedulesEditingId));
        } else {
          ({ error } = await supabase.from('service_schedules').insert([payload]));
        }

        if (error) {
          showToast('Error saving schedule.', 'error');
          console.error(error);
        } else {
          showToast(schedulesEditingId ? 'Schedule updated!' : 'Schedule added!', 'success');
          resetScheduleForm();
          loadServiceSchedules();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'edit-schedule') {
        const id = e.target.dataset.id;
        const { data, error } = await supabase.from('service_schedules').select('*').eq('id', id).single();
        if (error || !data) {
          showToast('Could not load that schedule.', 'error');
          console.error(error);
          return;
        }
        schedulesEditingId = id;
        schedulesEditingImage = data.image_url || '';
        document.getElementById('scName').value = data.service_name || '';
        document.getElementById('scDay').value = data.day || '';
        document.getElementById('scTime').value = data.time || '';
        await populateLocationSelect(data.location_id);
        const cancelEdit = document.getElementById('scheduleCancelEdit');
        if (cancelEdit) cancelEdit.hidden = false;
        if (schedulesSubmit) {
          schedulesSubmit.innerHTML = '<i data-lucide="pencil" aria-hidden="true"></i> Update Schedule';
          if (window.initIcons) window.initIcons();
        }
        document.getElementById('scName').focus();
      }

      const btn = e.target.closest('[data-action="delete-schedule"]');
      if (!btn) return;
      const id = btn.dataset.id;
      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase.from('service_schedules').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); console.error(error); }
        else { showToast('Schedule removed.', 'success'); loadServiceSchedules(); }
        if (schedulesEditingId === id) resetScheduleForm();
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });

    const scheduleCancelEdit = document.getElementById('scheduleCancelEdit');
    if (scheduleCancelEdit) {
      scheduleCancelEdit.addEventListener('click', resetScheduleForm);
    }
  }

  // --- Monthly Theme CRUD (singleton upsert) ---
  // One row, constant id (migration 009): saving upserts idempotently, exactly
  // like church_settings. Delete removes the row so the homepage hides.
  const MONTHLY_THEME_ID = '00000000-0000-0000-0000-000000000002';
  const monthlyThemeForm = document.getElementById('monthlyThemeForm');
  if (monthlyThemeForm) {
    let monthlyThemeEditingImage = '';

    monthlyThemeForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = monthlyThemeForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      const month_label = document.getElementById('mtMonth').value.trim();
      const title = document.getElementById('mtTitle').value.trim();
      const description = document.getElementById('mtText').value.trim();
      const scripture = document.getElementById('mtScripture').value.trim();
      const is_active = document.getElementById('mtActive').value === 'true';
      const imageInput = document.getElementById('mtImage');
      const imageFile = imageInput ? imageInput.files[0] : null;

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        let image_url = monthlyThemeEditingImage;
        if (imageFile) image_url = await uploadImage(imageFile);

        const payload = { month_label, title, description, scripture, image_url, is_active };
        const { error } = await supabase
          .from('monthly_theme')
          .upsert(Object.assign({ id: MONTHLY_THEME_ID }, payload));

        if (error) {
          showToast('Error saving monthly theme.', 'error');
          console.error(error);
        } else {
          showToast('Monthly theme saved!', 'success');
          monthlyThemeEditingImage = '';
          monthlyThemeForm.reset();
          loadMonthlyTheme();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'edit-monthly-theme') {
        const { data, error } = await supabase.from('monthly_theme').select('*').limit(1).maybeSingle();
        if (error || !data) {
          showToast('Could not load the current theme.', 'error');
          console.error(error);
          return;
        }
        monthlyThemeEditingImage = data.image_url || '';
        document.getElementById('mtMonth').value = data.month_label || '';
        document.getElementById('mtTitle').value = data.title || '';
        document.getElementById('mtText').value = data.description || '';
        document.getElementById('mtScripture').value = data.scripture || '';
        document.getElementById('mtActive').value = data.is_active ? 'true' : 'false';
        document.getElementById('mtTitle').focus();
      }

      const btn = e.target.closest('[data-action="delete-monthly-theme"]');
      if (!btn) return;
      if (!monthlyThemeRowId) return;
      if (!window.confirm('Delete the monthly theme? The homepage theme section will be hidden.')) return;
      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase.from('monthly_theme').delete().eq('id', monthlyThemeRowId);
        if (error) {
          showToast('Error deleting.', 'error');
          console.error(error);
        } else {
          showToast('Monthly theme removed.', 'success');
          monthlyThemeRowId = null;
          monthlyThemeEditingImage = '';
          monthlyThemeForm.reset();
          loadMonthlyTheme();
        }
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });
  }

  // --- Live Status CRUD (singleton upsert) ---
  const LIVE_STATUS_ID = '00000000-0000-0000-0000-000000000003';
  const liveStatusForm = document.getElementById('liveStatusForm');
  if (liveStatusForm) {
liveStatusForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = liveStatusForm.querySelector('[type="submit"]');
      if (isButtonBusy(submitBtn)) return;

      const is_live = document.getElementById('lsLive').value === 'true';
      const live_title = document.getElementById('lsTitle').value.trim();
      const live_description = document.getElementById('lsDesc').value.trim();
      let youtube_url = document.getElementById('lsYoutube').value.trim();

      // If user pasted an iframe, extract the src URL
      if (youtube_url.includes('<iframe')) {
        const match = youtube_url.match(/src="([^"]+)"/);
        if (match && match[1]) {
          youtube_url = match[1];
        }
      }

      setButtonLoading(submitBtn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase
          .from('live_status')
          .upsert(Object.assign({ id: LIVE_STATUS_ID }, { is_live, live_title, live_description, youtube_url }));

        if (error) {
          showToast('Error saving live status.', 'error');
          console.error(error);
        } else {
          showToast('Live status saved!', 'success');
          loadLiveStatus();
        }
      } catch (err) {
        showToast(err.message, 'error');
        console.error(err);
      } finally {
        finishButtonLoading(submitBtn, startedAt);
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'edit-live-status') {
        const { data, error } = await supabase.from('live_status').select('*').limit(1).maybeSingle();
        if (error || !data) {
          showToast('Could not load the live status.', 'error');
          console.error(error);
          return;
        }
        document.getElementById('lsLive').value = data.is_live ? 'true' : 'false';
        document.getElementById('lsTitle').value = data.live_title || '';
        document.getElementById('lsDesc').value = data.live_description || '';
        document.getElementById('lsYoutube').value = data.youtube_url || '';
        document.getElementById('lsTitle').focus();
      }

      const btn = e.target.closest('[data-action="delete-live-status"]');
      if (!btn) return;
      if (!liveStatusRowId) return;
      if (!window.confirm('Clear the live status? The homepage section and navbar Live button will be hidden.')) return;
      setButtonLoading(btn, true);
      const startedAt = Date.now();
      try {
        const { error } = await supabase.from('live_status').delete().eq('id', liveStatusRowId);
        if (error) {
          showToast('Error deleting.', 'error');
          console.error(error);
        } else {
          showToast('Live status removed.', 'success');
          liveStatusRowId = null;
          loadLiveStatus();
        }
      } catch (err) {
        showToast('Something went wrong.', 'error');
        console.error(err);
      } finally {
        finishButtonLoading(btn, startedAt);
      }
    });
  }

  // --- Requests ---
  // Loader, renderer, tabs and delete all live in the consolidated block near
  // the top of this file. Nothing to wire here.
})();
