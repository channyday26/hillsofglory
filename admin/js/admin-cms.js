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

  // --- Sidebar Navigation ---
  const sidebarLinks = document.querySelectorAll('.sidebar__link');
  const sections = document.querySelectorAll('.admin-section');
  const sidebarLogout = document.getElementById('sidebarLogout');

  sidebarLinks.forEach(function (link) {
    if (!link.dataset.section) return; // FIX: Ignores links without a data-section (like "View Website")
    
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
      await supabase.auth.signOut();
      window.location.href = 'index.html';
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
        '<h3 class="card__title" style="margin:0;">' + (lg.group_name || '') + '</h3>' +
        '<p class="card__text" style="margin:0;">Leader: ' + (lg.leader_name || '') + ' — ' + (lg.location || '') + '</p>' +
        '</div>' +
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
        '<button class="btn btn--secondary" data-action="delete-sermon" data-id="' + (s.id || '') + '">Delete</button>' +
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
          ? '<span class="request-row__badge"><i class="ti ti-mail-check"></i> Emailed</span>'
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
            '<i class="ti ti-trash"></i> Delete</button>' +
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

      btn.disabled = true;
      // .select('id') is what makes this honest: when RLS blocks a DELETE,
      // PostgREST returns 200 with an empty array rather than an error, so
      // without it a forbidden delete looks like a successful one.
      const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
      btn.disabled = false;

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
    });
  }

  function initCMSData() {
    loadSettings();
    loadNotificationSettings();
    loadLeadership();
    loadMinistries();
    loadLocations();
    loadLifegroups();
    loadSermons();
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
    const iconClass = type === 'error' ? 'ti-alert-circle' : 'ti-circle-check';
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
      if (submitBtn) submitBtn.disabled = true;

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
      };

      const result = await saveChurchSettings(payload);

      if (submitBtn) submitBtn.disabled = false;

      if (result.error) {
        showToast(settingsErrorMessage(result.error), 'error');
        console.error(result.error);
      } else {
        showToast('Settings saved!', 'success');
        loadSettings();
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
      const name = document.getElementById('leaderName').value.trim();
      const role = document.getElementById('leaderRole').value.trim();
      const bio = document.getElementById('leaderBio').value.trim();
      const imageInput = document.getElementById('leaderImage');
      const imageFile = imageInput ? imageInput.files[0] : null;
      let imageUrl = '';
      try {
        if (imageFile) imageUrl = await uploadImage(imageFile);
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }
      const { data, error } = await supabase.from('leadership_team').insert([{ name, role, bio, image_url: imageUrl }]);
      if (error) {
        showToast('Error adding leader.', 'error');
        console.error(error);
      } else {
        showToast('Leader added!', 'success');
        leadershipForm.reset();
        loadLeadership();
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'delete-leader') {
        const id = e.target.dataset.id;
        const { error } = await supabase.from('leadership_team').delete().eq('id', id);
        if (error) {
          showToast('Error deleting.', 'error');
        } else {
          showToast('Leader removed.', 'success');
          loadLeadership();
        }
      }
    });
  }

  // --- Ministries CRUD ---
  const ministriesForm = document.getElementById('ministriesForm');
  if (ministriesForm) {
    // Data loading deferred to initCMSData() after auth.

    ministriesForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const name = document.getElementById('minName').value.trim();
      const category = document.getElementById('minCategory').value;
      const desc = document.getElementById('minDesc').value.trim();
      const contact = document.getElementById('minContact').value.trim();
      const school = document.getElementById('minSchool').value.trim();
      const imageInput = document.getElementById('minImage');
      const imageFile = imageInput ? imageInput.files[0] : null;
      let imageUrl = '';
      try {
        if (imageFile) imageUrl = await uploadImage(imageFile);
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }
      const { data, error } = await supabase.from('ministries').insert([{ name, category, description: desc, contact_person: contact, target_school: school, image_url: imageUrl }]);
      if (error) {
        showToast('Error adding ministry.', 'error');
        console.error(error);
      } else {
        showToast('Ministry added!', 'success');
        ministriesForm.reset();
        loadMinistries();
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'delete-ministry') {
        const id = e.target.dataset.id;
        const { error } = await supabase.from('ministries').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); }
        else { showToast('Ministry removed.', 'success'); loadMinistries(); }
      }
    });
  }

  // --- Locations CRUD ---
  const locationsForm = document.getElementById('locationsForm');
  if (locationsForm) {
    // Data loading deferred to initCMSData() after auth.

    locationsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const name = document.getElementById('locName').value.trim();
      const type = document.getElementById('locType').value;
      const address = document.getElementById('locAddress').value.trim();
      const maps = document.getElementById('locMaps').value.trim();
      const status = document.getElementById('locStatus').value;
      const { data, error } = await supabase.from('locations').insert([{ name, location_type: type, address, google_maps_embed_link: maps, status }]);
      if (error) {
        showToast('Error adding location.', 'error');
        console.error(error);
      } else {
        showToast('Location added!', 'success');
        locationsForm.reset();
        loadLocations();
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'delete-location') {
        const id = e.target.dataset.id;
        const { error } = await supabase.from('locations').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); }
        else { showToast('Location removed.', 'success'); loadLocations(); }
      }
    });
  }

  // --- Lifegroups CRUD ---
  const lifegroupsForm = document.getElementById('lifegroupsForm');
  if (lifegroupsForm) {
    // Data loading deferred to initCMSData() after auth.

    lifegroupsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const name = document.getElementById('lgName').value.trim();
      const leader = document.getElementById('lgLeader').value.trim();
      const location = document.getElementById('lgLocation').value.trim();
      const time = document.getElementById('lgTime').value.trim();
      const contact = document.getElementById('lgContact').value.trim();
      const { data, error } = await supabase.from('lifegroups').insert([{ group_name: name, leader_name: leader, location, meeting_time: time, contact_info: contact }]);
      if (error) {
        showToast('Error adding lifegroup.', 'error');
        console.error(error);
      } else {
        showToast('Lifegroup added!', 'success');
        lifegroupsForm.reset();
        loadLifegroups();
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'delete-lifegroup') {
        const id = e.target.dataset.id;
        const { error } = await supabase.from('lifegroups').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); }
        else { showToast('Lifegroup removed.', 'success'); loadLifegroups(); }
      }
    });
  }

  // --- Sermons CRUD ---
  const sermonsForm = document.getElementById('sermonsForm');
  if (sermonsForm) {
    // Data loading deferred to initCMSData() after auth.

    sermonsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const title = document.getElementById('sermonTitle').value.trim();
      const speaker = document.getElementById('sermonSpeaker').value.trim();
      const date = document.getElementById('sermonDate').value;
      const youtube = document.getElementById('sermonYoutube').value.trim();
      const desc = document.getElementById('sermonDesc').value.trim();
      const { data, error } = await supabase.from('sermons').insert([{ title, speaker, date, youtube_url: youtube, description: desc }]);
      if (error) {
        showToast('Error adding sermon.', 'error');
        console.error(error);
      } else {
        showToast('Sermon added!', 'success');
        sermonsForm.reset();
        loadSermons();
      }
    });

    document.addEventListener('click', async function (e) {
      if (e.target.dataset.action === 'delete-sermon') {
        const id = e.target.dataset.id;
        const { error } = await supabase.from('sermons').delete().eq('id', id);
        if (error) { showToast('Error deleting.', 'error'); }
        else { showToast('Sermon removed.', 'success'); loadSermons(); }
      }
    });
  }

  // --- Requests ---
  // Loader, renderer, tabs and delete all live in the consolidated block near
  // the top of this file. Nothing to wire here.
})();
