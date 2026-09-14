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

  // --- Compact record tables ------------------------------------------------
  // Leadership, Ministries, Locations, Service Schedules, Lifegroups, Sermons
  // and Requests render in the same table component: a server-side search bar
  // above a compact table, six rows per page, and a "Load more" button in the
  // footer. Each section declares its query and column cells only — the shell
  // markup, debounced search, pagination and empty states are shared. Events,
  // Monthly theme and Live status keep focused card lists (tiny datasets) but
  // share the icon-style action buttons and the edit-populated toast.

  const RECORD_PAGE_SIZE = 6;

  // Location names for the schedules table. Fetched once and cached.
  let locationNameById = {};
  let locationNamesLoaded = false;

  async function ensureLocationNames() {
    if (locationNamesLoaded) return;
    const { data } = await supabase.from('locations').select('id, name');
    locationNameById = {};
    (data || []).forEach(function (l) { locationNameById[l.id] = l.name; });
    locationNamesLoaded = true;
  }

  function locationNameOf(id) {
    return locationNameById[id] || 'Unknown location';
  }

  // --- Cell render helpers ---------------------------------------------------

  // Escape LIKE wildcards so a user's "%" or "_" — a valid search string —
  // searches for the literal character instead of matching every record.
  // Commas/parens/quotes are PostgREST .or() grammar and would break the
  // generated filter, so they are neutralised to spaces in the pattern.
  function dbEscapePattern(value) {
    return String(value || '')
      .replace(/[\\%*_]/g, function (m) { return '\\' + m; })
      .replace(/[,'"()]/g, ' ');
  }

  // Avatar (people) or square thumbnail (services) + a primary text label.
  function identityCell(imageUrl, name, icon, square) {
    const shape = square ? ' data-table__avatar--square' : '';
    const media = imageUrl
      ? '<img class="data-table__avatar' + shape + '" src="' + escAttr(imageUrl) + '" alt="" loading="lazy" />'
      : '<span class="data-table__avatar' + shape + ' data-table__avatar--icon">' +
        '<i data-lucide="' + escAttr(icon || 'user') + '" aria-hidden="true"></i></span>';
    return '<div class="data-table__identity">' + media + '<span>' + esc(name || '') + '</span></div>';
  }

  function badgeCell(value, tone) {
    const toneClass = tone === 'on' ? ' data-table__badge--on' : (tone === 'off' ? ' data-table__badge--off' : '');
    return '<span class="data-table__badge' + toneClass + '">' + esc(value || '') + '</span>';
  }

  function primaryCell(value) {
    return '<span class="data-table__primary">' + esc(value || '') + '</span>';
  }

  function summaryCell(value) {
    return '<span class="data-table__summary">' + esc(value || '') + '</span>';
  }

  function linkCell(url) {
    if (!url) return '';
    return '<a class="data-table__link" href="' + escAttr(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>';
  }

  function formatIsoDate(value) {
    if (!value) return '';
    const parts = String(value).split('T')[0].split('-');
    if (parts.length !== 3) return esc(String(value));
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatTableDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  // Edit/Delete button pair used on every record row.
  function actionButtons(action, id, label) {
    return '<div class="data-table__actions">' +
      '<button type="button" class="btn btn--sm data-table__btn data-table__btn--edit" ' +
        'data-action="edit-' + action + '" data-id="' + escAttr(id) + '" aria-label="Edit ' + escAttr(label) + '">' +
        '<i data-lucide="pencil" aria-hidden="true"></i> Edit</button>' +
      '<button type="button" class="btn btn--sm data-table__btn data-table__btn--delete" ' +
        'data-action="delete-' + action + '" data-id="' + escAttr(id) + '" aria-label="Delete ' + escAttr(label) + '">' +
        '<i data-lucide="trash-2" aria-hidden="true"></i> Delete</button>' +
      '</div>';
  }

  // --- Table section configuration ------------------------------------------

  const DATA_TABLES = {
    leadership: {
      containerId: 'leadershipList',
      searchId: 'leadershipSearch',
      tbodyId: 'leadershipTableBody',
      countId: 'leadershipTableCount',
      moreId: 'leadershipLoadMore',
      searchPlaceholder: 'Search leaders…',
      searchLabel: 'Search leaders',
      table: 'leadership_team',
      orderColumn: 'sort_order',
      ascending: true,
      searchColumns: ['name', 'role', 'bio'],
      emptyText: 'No leaders yet. Add a leader below.',
      countLabel: 'leaders',
      columns: [
        { label: 'Leader', thClass: 'data-table__th--name', tdClass: 'data-table__td--name',
          render: function (l) { return identityCell(l.image_url, l.name, 'user'); } },
        { label: 'Role', render: function (l) { return summaryCell(l.role); } },
        { label: 'Bio', tdClass: 'data-table__td--grow', render: function (l) { return summaryCell(l.bio); } },
        { label: 'Actions', thClass: 'data-table__th--actions', tdClass: 'data-table__td--actions',
          render: function (l) { return actionButtons('leader', l.id, l.name); } }
      ]
    },
    ministries: {
      containerId: 'ministriesList',
      searchId: 'ministriesSearch',
      tbodyId: 'ministriesTableBody',
      countId: 'ministriesTableCount',
      moreId: 'ministriesLoadMore',
      searchPlaceholder: 'Search ministries…',
      searchLabel: 'Search ministries',
      table: 'ministries',
      orderColumn: 'name',
      ascending: true,
      searchColumns: ['name', 'category', 'description', 'contact_person'],
      emptyText: 'No ministries yet. Add a ministry below.',
      countLabel: 'ministries',
      columns: [
        { label: 'Ministry', thClass: 'data-table__th--name', tdClass: 'data-table__td--name',
          render: function (m) { return identityCell(m.image_url, m.name, 'heart-handshake', true); } },
        { label: 'Category', render: function (m) { return badgeCell(m.category); } },
        { label: 'Description', tdClass: 'data-table__td--grow', render: function (m) { return summaryCell(m.description); } },
        { label: 'Contact Person', render: function (m) { return summaryCell(m.contact_person); } },
        { label: 'Target School', render: function (m) { return summaryCell(m.target_school); } },
        { label: 'Actions', thClass: 'data-table__th--actions', tdClass: 'data-table__td--actions',
          render: function (m) { return actionButtons('ministry', m.id, m.name); } }
      ]
    },
    locations: {
      containerId: 'locationsList',
      searchId: 'locationsSearch',
      tbodyId: 'locationsTableBody',
      countId: 'locationsTableCount',
      moreId: 'locationsLoadMore',
      searchPlaceholder: 'Search locations…',
      searchLabel: 'Search locations',
      table: 'locations',
      orderColumn: 'sort_order',
      ascending: true,
      searchColumns: ['name', 'address', 'location_type'],
      emptyText: 'No locations yet. Add a location below.',
      countLabel: 'locations',
      columns: [
        { label: 'Campus', thClass: 'data-table__th--name', tdClass: 'data-table__td--name',
          render: function (l) { return identityCell(l.image_url, l.name, 'map-pin', true); } },
        { label: 'Type', render: function (l) { return badgeCell(l.location_type); } },
        { label: 'Address', tdClass: 'data-table__td--grow', render: function (l) { return summaryCell(l.address); } },
        { label: 'Google Maps', tdClass: 'data-table__td--link', render: function (l) { return linkCell(l.google_maps_embed_link); } },
        { label: 'Status', render: function (l) { return badgeCell(l.status || 'Inactive', String(l.status) === 'Active' ? 'on' : 'off'); } },
        { label: 'Actions', thClass: 'data-table__th--actions', tdClass: 'data-table__td--actions',
          render: function (l) { return actionButtons('location', l.id, l.name); } }
      ]
    },
    schedules: {
      containerId: 'schedulesList',
      searchId: 'schedulesSearch',
      tbodyId: 'schedulesTableBody',
      countId: 'schedulesTableCount',
      moreId: 'schedulesLoadMore',
      searchPlaceholder: 'Search schedules…',
      searchLabel: 'Search service schedules',
      table: 'service_schedules',
      orderColumn: 'sort_order',
      ascending: true,
      searchColumns: ['service_name', 'day', 'time'],
      emptyText: 'No service schedules yet. Add one below.',
      countLabel: 'schedules',
      columns: [
        { label: 'Service', thClass: 'data-table__th--name', tdClass: 'data-table__td--name',
          render: function (s) { return identityCell(s.image_url, s.service_name, 'clock', true); } },
        { label: 'Day', render: function (s) { return badgeCell(s.day); } },
        { label: 'Time', render: function (s) { return summaryCell(s.time); } },
        { label: 'Location', render: function (s) { return summaryCell(locationNameOf(s.location_id)); } },
        { label: 'Actions', thClass: 'data-table__th--actions', tdClass: 'data-table__td--actions',
          render: function (s) { return actionButtons('schedule', s.id, s.service_name); } }
      ]
    },
    lifegroups: {
      containerId: 'lifegroupsList',
      searchId: 'lifegroupsSearch',
      tbodyId: 'lifegroupsTableBody',
      countId: 'lifegroupsTableCount',
      moreId: 'lifegroupsLoadMore',
      searchPlaceholder: 'Search lifegroups…',
      searchLabel: 'Search lifegroups',
      table: 'lifegroups',
      orderColumn: 'group_name',
      ascending: true,
      searchColumns: ['group_name', 'leader_name', 'location', 'meeting_time'],
      emptyText: 'No lifegroups yet. Add a lifegroup below.',
      countLabel: 'lifegroups',
      columns: [
        { label: 'Group', thClass: 'data-table__th--name', tdClass: 'data-table__td--name',
          render: function (lg) { return primaryCell(lg.group_name); } },
        { label: 'Type', render: function (lg) { return badgeCell(lg.group_type); } },
        { label: 'Leader', render: function (lg) { return summaryCell(lg.leader_name); } },
        { label: 'Location', tdClass: 'data-table__td--grow', render: function (lg) { return summaryCell(lg.location); } },
        { label: 'Meeting Time', render: function (lg) { return summaryCell(lg.meeting_time); } },
        { label: 'Actions', thClass: 'data-table__th--actions', tdClass: 'data-table__td--actions',
          render: function (lg) { return actionButtons('lifegroup', lg.id, lg.group_name); } }
      ]
    },
    sermons: {
      containerId: 'sermonsList',
      searchId: 'sermonsSearch',
      tbodyId: 'sermonsTableBody',
      countId: 'sermonsTableCount',
      moreId: 'sermonsLoadMore',
      searchPlaceholder: 'Search sermons…',
      searchLabel: 'Search sermons',
      table: 'sermons',
      orderColumn: 'date',
      ascending: false,
      searchColumns: ['title', 'speaker'],
      emptyText: 'No sermons yet. Add a sermon below.',
      countLabel: 'sermons',
      columns: [
        { label: 'Title', thClass: 'data-table__th--name', tdClass: 'data-table__td--name',
          render: function (s) { return primaryCell(s.title); } },
        { label: 'Speaker', render: function (s) { return summaryCell(s.speaker); } },
        { label: 'Date', tdClass: 'data-table__td--date', render: function (s) { return formatIsoDate(s.date); } },
        { label: 'YouTube', tdClass: 'data-table__td--link', render: function (s) { return linkCell(s.youtube_url); } },
        { label: 'Actions', thClass: 'data-table__th--actions', tdClass: 'data-table__td--actions',
          render: function (s) { return actionButtons('sermon', s.id, s.title); } }
      ]
    }
  };

  // --- Shared table engine ---------------------------------------------------

  const tableShellsBuilt = {};

  function buildTableShell(cfg) {
    const container = document.getElementById(cfg.containerId);
    if (!container) return false;
    const key = cfg.containerId + (cfg.shellKey ? '::' + cfg.shellKey : '');
    if (!cfg.alwaysRebuild && tableShellsBuilt[key]) return false;
    tableShellsBuilt[key] = true;

    const headings = cfg.columns.map(function (col) {
      return '<th' + (col.thClass ? ' class="' + col.thClass + '"' : '') + ' scope="col">' + esc(col.label) + '</th>';
    }).join('');

    container.innerHTML =
      '<div class="data-table">' +
        '<div class="data-table__toolbar">' +
          '<div class="data-table__toolbar-group">' +
            (cfg.dateFromId && cfg.dateToId
              ? '<div class="data-table__datefilter">' +
                  '<label class="data-table__datefilter-label" for="' + escAttr(cfg.dateFromId) + '">From</label>' +
                  '<input type="date" id="' + escAttr(cfg.dateFromId) + '" class="data-table__datefilter-input" aria-label="Filter from date" />' +
                  '<label class="data-table__datefilter-label" for="' + escAttr(cfg.dateToId) + '">To</label>' +
                  '<input type="date" id="' + escAttr(cfg.dateToId) + '" class="data-table__datefilter-input" aria-label="Filter to date" />' +
                '</div>'
              : '') +
            '<div class="data-table__search">' +
              '<i data-lucide="search" class="data-table__search-icon" aria-hidden="true"></i>' +
              '<input type="search" id="' + escAttr(cfg.searchId) + '" class="data-table__search-input" ' +
                'placeholder="' + escAttr(cfg.searchPlaceholder) + '" aria-label="' + escAttr(cfg.searchLabel) + '" autocomplete="off" />' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="data-table__scroll">' +
          '<table class="data-table__table">' +
            '<thead><tr>' + headings + '</tr></thead>' +
            '<tbody id="' + escAttr(cfg.tbodyId) + '"></tbody>' +
          '</table>' +
        '</div>' +
        '<div class="data-table__footer">' +
          '<span class="data-table__count" id="' + escAttr(cfg.countId) + '"></span>' +
          '<button type="button" class="btn btn--sm btn--outline data-table__more" id="' + escAttr(cfg.moreId) + '" hidden>' +
            '<i data-lucide="chevron-down" aria-hidden="true"></i> Load more</button>' +
        '</div>' +
      '</div>';
    return true;
  }

  function bindTableControls(cfg) {
    const search = document.getElementById(cfg.searchId);
    const more = document.getElementById(cfg.moreId);

    if (search && !search._bound) {
      search._bound = true;
      let timer = null;
      search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          // Debounced server-side query: fires once the admin finishes typing.
          loadTablePage(cfg, { reset: true, term: search.value.trim() });
        }, 350);
      });
    }

    if (more && !more._bound) {
      more._bound = true;
      more.addEventListener('click', function () {
        if (isButtonBusy(more)) return;
        loadMoreRecords(cfg, more);
      });
    }

    // Optional date-range filters (Requests). Changing either bound re-queries
    // from page 0, combining with any active text search term.
    if (cfg.dateFromId && cfg.dateToId) {
      const fromEl = document.getElementById(cfg.dateFromId);
      const toEl = document.getElementById(cfg.dateToId);

      if (fromEl && !fromEl._bound) {
        fromEl._bound = true;
        fromEl.addEventListener('change', function () {
          cfg.dateFrom = fromEl.value || '';
          loadTablePage(cfg, { reset: true, term: search ? search.value.trim() : '' });
        });
      }
      if (toEl && !toEl._bound) {
        toEl._bound = true;
        toEl.addEventListener('change', function () {
          cfg.dateTo = toEl.value || '';
          loadTablePage(cfg, { reset: true, term: search ? search.value.trim() : '' });
        });
      }
    }
  }

  async function fetchTablePage(cfg, term, offset) {
    const searchCols = typeof cfg.searchColumns === 'function' ? cfg.searchColumns() : cfg.searchColumns;
    let query = supabase.from(cfg.table).select('*', { count: 'exact' });
    if (term) {
      const pattern = '%' + dbEscapePattern(term) + '%';
      query = query.or(searchCols.map(function (col) {
        return col + '.ilike.' + pattern;
      }).join(','));
    }
    if (cfg.dateColumn) {
      if (cfg.dateFrom) query = query.gte(cfg.dateColumn, cfg.dateFrom + 'T00:00:00');
      if (cfg.dateTo) query = query.lte(cfg.dateColumn, cfg.dateTo + 'T23:59:59.999');
    }
    if (cfg.orderColumn) {
      query = query.order(cfg.orderColumn, { ascending: cfg.ascending });
    }
    return await query.range(offset, offset + RECORD_PAGE_SIZE - 1);
  }

  function renderTableRows(cfg, records) {
    return records.map(function (record) {
      const cells = cfg.columns.map(function (col) {
        return '<td' + (col.tdClass ? ' class="' + col.tdClass + '"' : '') + '>' + col.render(record) + '</td>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
  }

  function renderEmptyRow(cfg) {
    const hasFilters = !!(cfg.term || cfg.dateFrom || cfg.dateTo);
    const icon = hasFilters ? 'search-x' : 'inbox';
    const message = hasFilters ? 'No records match your filters.' : cfg.emptyText;
    return '<tr class="data-table__empty"><td colspan="' + cfg.columns.length + '">' +
      '<i data-lucide="' + icon + '" aria-hidden="true"></i> ' + esc(message) + '</td></tr>';
  }

  async function loadTablePage(cfg, opts) {
    opts = opts || {};
    const tbody = document.getElementById(cfg.tbodyId);
    if (!tbody) return;
    if (opts.reset) cfg.offset = 0;
    const term = typeof opts.term === 'string' ? opts.term : (cfg.term || '');
    cfg.term = term;

    const result = await fetchTablePage(cfg, term, cfg.offset);
    if (result.error) {
      console.error(result.error);
      const failedCfg = Object.assign({}, cfg, { term: '', emptyText: 'Could not load records.' });
      tbody.innerHTML = renderEmptyRow(failedCfg);
      updateTableFooter(cfg, 0, 0);
      return;
    }

    const records = result.data || [];
    const total = typeof result.count === 'number' ? result.count : 0;

    if (opts.reset) {
      tbody.innerHTML = records.length ? renderTableRows(cfg, records) : renderEmptyRow(cfg);
    } else {
      tbody.insertAdjacentHTML('beforeend', renderTableRows(cfg, records));
    }
    updateTableFooter(cfg, total, records.length);
    if (window.initIcons) window.initIcons();
  }

  async function loadMoreRecords(cfg, btn) {
    const startedAt = Date.now();
    setButtonLoading(btn, true);
    cfg.offset += RECORD_PAGE_SIZE;
    await loadTablePage(cfg, { reset: false });
    finishButtonLoading(btn, startedAt);
  }

  function updateTableFooter(cfg, total, pageCount) {
    const counter = document.getElementById(cfg.countId);
    if (counter) {
      const to = Math.min(cfg.offset + pageCount, total);
      counter.textContent = total > 0
        ? 'Showing ' + (cfg.offset + 1) + '–' + to + ' of ' + total + ' ' + cfg.countLabel
        : '';
    }
    const moreBtn = document.getElementById(cfg.moreId);
    if (moreBtn) moreBtn.hidden = (cfg.offset + pageCount) >= total;
  }

  // --- Section loaders (entry points for initCMSData + post-write reloads) --

  function loadLeadership() {
    const cfg = DATA_TABLES.leadership;
    if (buildTableShell(cfg)) bindTableControls(cfg);
    loadTablePage(cfg, { reset: true });
  }

  function loadMinistries() {
    const cfg = DATA_TABLES.ministries;
    if (buildTableShell(cfg)) bindTableControls(cfg);
    loadTablePage(cfg, { reset: true });
  }

  function loadLocations() {
    const cfg = DATA_TABLES.locations;
    if (buildTableShell(cfg)) bindTableControls(cfg);
    loadTablePage(cfg, { reset: true });
  }

  function loadLifegroups() {
    const cfg = DATA_TABLES.lifegroups;
    if (buildTableShell(cfg)) bindTableControls(cfg);
    loadTablePage(cfg, { reset: true });
  }

  function loadSermons() {
    const cfg = DATA_TABLES.sermons;
    if (buildTableShell(cfg)) bindTableControls(cfg);
    loadTablePage(cfg, { reset: true });
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
      return '<div class="card admin-record">' +
        (ev.image_url
          ? '<img class="admin-record__media" src="' + escAttr(ev.image_url) + '" alt="' + escAttr(ev.title || '') + '" />'
          : '') +
        '<div class="admin-record__body">' +
        '<h3 class="card__title admin-record__title">' + esc(ev.title || '') + '</h3>' +
        '<p class="card__text admin-record__text">' + esc(dateLabel) + '</p>' +
        '</div>' +
        '<div class="admin-record__actions">' +
        '<button type="button" class="btn btn--sm data-table__btn data-table__btn--edit" data-action="edit-special-event" data-id="' + escAttr(ev.id) + '" aria-label="Edit event ' + escAttr(ev.title || '') + '"><i data-lucide="pencil" aria-hidden="true"></i> Edit</button>' +
        '<button type="button" class="btn btn--sm data-table__btn data-table__btn--delete" data-action="delete-special-event" data-id="' + escAttr(ev.id) + '" aria-label="Delete event ' + escAttr(ev.title || '') + '"><i data-lucide="trash-2" aria-hidden="true"></i> Delete</button>' +
        '</div>' +
        '</div>';
    }).join('');
    if (window.initIcons) window.initIcons();
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
    list.innerHTML = '<div class="card admin-record">' +
      (data.image_url
        ? '<img class="admin-record__media" src="' + escAttr(data.image_url) + '" alt="' + escAttr(data.title || 'Monthly Theme') + '" />'
        : '') +
      '<div class="admin-record__body">' +
      '<h3 class="card__title admin-record__title">' + esc(data.title || 'Monthly Theme') + '</h3>' +
      '<p class="card__text admin-record__text">' + esc(data.month_label || 'No month label') + ' — ' +
        (data.is_active ? badgeCell('Active', 'on') : badgeCell('Inactive', 'off')) + '</p>' +
      '</div>' +
      '<div class="admin-record__actions">' +
      '<button type="button" class="btn btn--sm data-table__btn data-table__btn--edit" data-action="edit-monthly-theme" aria-label="Edit monthly theme"><i data-lucide="pencil" aria-hidden="true"></i> Edit</button>' +
      '<button type="button" class="btn btn--sm data-table__btn data-table__btn--delete" data-action="delete-monthly-theme" aria-label="Delete monthly theme"><i data-lucide="trash-2" aria-hidden="true"></i> Delete</button>' +
      '</div>' +
      '</div>';
    if (window.initIcons) window.initIcons();
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
    list.innerHTML = '<div class="card admin-record">' +
      '<div class="admin-record__body">' +
      '<h3 class="card__title admin-record__title">' + esc(data.live_title || 'Live Stream') + '</h3>' +
      '<p class="card__text admin-record__text">' +
        (data.is_live ? '<span class="data-table__badge data-table__badge--live">Live Now</span>'
                      : badgeCell('Not live', 'off')) +
        (data.youtube_url ? ' — ' + esc(data.youtube_url) : '') +
      '</p>' +
      '</div>' +
      '<div class="admin-record__actions">' +
      '<button type="button" class="btn btn--sm data-table__btn data-table__btn--edit" data-action="edit-live-status" aria-label="Edit live status"><i data-lucide="pencil" aria-hidden="true"></i> Edit</button>' +
      '<button type="button" class="btn btn--sm data-table__btn data-table__btn--delete" data-action="delete-live-status" aria-label="Delete live status"><i data-lucide="trash-2" aria-hidden="true"></i> Delete</button>' +
      '</div>' +
      '</div>';
    if (window.initIcons) window.initIcons();
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
    await ensureLocationNames();
    const cfg = DATA_TABLES.schedules;
    if (buildTableShell(cfg)) bindTableControls(cfg);
    loadTablePage(cfg, { reset: true });
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

  function requestTableConfig() {
    const tab = REQUEST_TABS[activeRequestTab] || REQUEST_TABS.prayer;
    const isPrayer = tab.table === 'prayer_requests';
    const kind = isPrayer ? 'prayer request' : 'ministry join request';
    return {
      containerId: 'requestsList',
      shellKey: activeRequestTab,
      // The shell mirrors the active tab (column labels, delete target table),
      // so always rebuild it on every load when the tab changes.
      alwaysRebuild: true,
      searchId: 'requestsSearch',
      tbodyId: 'requestsTableBody',
      countId: 'requestsTableCount',
      moreId: 'requestsLoadMore',
      searchPlaceholder: 'Search ' + tab.title.toLowerCase() + '…',
      searchLabel: 'Search ' + tab.title.toLowerCase(),
      table: tab.table,
      orderColumn: 'date_submitted',
      ascending: false,
      searchColumns: isPrayer
        ? ['visitor_name', 'request_text']
        : ['visitor_name', 'ministry_of_interest', 'contact_info'],
      dateColumn: 'date_submitted',
      dateFromId: 'requestsDateFrom',
      dateToId: 'requestsDateTo',
      emptyText: 'No ' + tab.title.toLowerCase() + ' yet.',
      countLabel: 'requests',
      columns: [
        { label: 'Name', thClass: 'data-table__th--name', tdClass: 'data-table__td--name',
          render: function (r) { return primaryCell(r.visitor_name || 'Anonymous'); } },
        { label: 'Message', tdClass: 'data-table__td--grow',
          render: function (r) {
            return summaryCell(isPrayer
              ? r.request_text
              : [r.ministry_of_interest, r.contact_info].filter(Boolean).join(' — '));
          } },
        { label: 'Submitted', tdClass: 'data-table__td--date',
          render: function (r) { return formatTableDateTime(r.date_submitted); } },
        { label: 'Status', tdClass: 'data-table__td--status',
          render: function (r) {
            return r.notified_at
              ? '<span class="data-table__badge data-table__badge--on"><i data-lucide="mail-check" aria-hidden="true"></i> Emailed</span>'
              : badgeCell('New');
          } },
        { label: 'Actions', thClass: 'data-table__th--actions', tdClass: 'data-table__td--actions',
          render: function (r) {
            return '<div class="data-table__actions">' +
              '<button type="button" class="btn btn--sm data-table__btn data-table__btn--delete" ' +
                'data-action="delete-request" data-id="' + escAttr(r.id) + '" data-table="' + escAttr(tab.table) + '" ' +
                'aria-label="Delete ' + kind + ' from ' + escAttr(r.visitor_name || 'Anonymous') + '">' +
                '<i data-lucide="trash-2" aria-hidden="true"></i> Delete</button>' +
              '</div>';
          } }
      ]
    };
  }

  async function loadRequests() {
    const cfg = requestTableConfig();
    const container = document.getElementById(cfg.containerId);
    if (!container) return;
    // The table shell is keyed by the active tab, so switching tabs rebuilds
    // the search bar + table for the other request type (and re-binds controls).
    buildTableShell(cfg);
    bindTableControls(cfg);
    const input = document.getElementById(cfg.searchId);
    if (input) {
      input.placeholder = cfg.searchPlaceholder;
      input.setAttribute('aria-label', cfg.searchLabel);
      input.value = '';
    }
    await loadTablePage(cfg, { reset: true, term: '' });
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
    const iconName = type === 'error' ? 'circle-alert' : 'circle-check';
    toast.innerHTML = '<i data-lucide="' + iconName + '" class="toast__icon" aria-hidden="true"></i><span></span>';
    toast.querySelector('span').textContent = message;
    container.appendChild(toast);
    if (window.initIcons) window.initIcons();
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
  // Accept only well-known raster image types; SVG is excluded because an SVG
  // can carry executable scripts when opened directly. Filenames are stripped
  // of path separators and reserved characters so a crafted name cannot create
  // nested "folders" inside the bucket.
  const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  async function uploadImage(file) {
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      throw new Error('File too large. Max size is 2MB (' + formatFileSize(file.size) + ').');
    }
    if (ALLOWED_IMAGE_MIME.indexOf(file.type) === -1) {
      throw new Error('Unsupported file type "' + (file.type || 'unknown') + '". Use JPG, PNG, WebP, GIF or AVIF.');
    }
    const safeName = String(file.name || 'image').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100);
    const fileName = Date.now() + '-' + safeName;
    const { data, error } = await supabase.storage
      .from('website-images')
      .upload(fileName, file, { upsert: false, contentType: file.type });
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

       // Validate form inputs (excluding file inputs)
       const mainAddress = valueOf('setAddress').trim();
       const contactPhone = valueOf('setPhone').trim();
       const contactEmail = valueOf('setEmail').trim();
       const bankDetails = valueOf('setBank').trim();
       const facebookUrl = valueOf('setFacebook').trim();
       const instagramUrl = valueOf('setInstagram').trim();
       const youtubeUrl = valueOf('setYouTube').trim();
       const xUrl = valueOf('setX').trim();
       const heroVideoUrl = valueOf('setHeroVideo').trim();

// Required-by-default validation. Every settings field carries
        // `required` in the markup; format rules below only run on filled
        // values (a field can never be empty at this point). These are
        // link fields, so they must stay plain URLs restricted to allowed
        // hosts — unlike the sermon/live fields, no <iframe> is accepted here.
        const settingsCheck = validateRequiredFieldsInline(settingsForm, {
          setEmail: function (v) { return isValidEmail(v) || 'Please enter a valid email address.'; },
          setFacebook: function (v) { return isValidUrl(v) || 'Please enter a valid Facebook URL.'; },
          setInstagram: function (v) { return isValidUrl(v) || 'Please enter a valid Instagram URL.'; },
          setYouTube: function (v) { return isValidYouTubeUrl(v) || 'Please enter a valid YouTube URL.'; },
          setX: function (v) { return isValidUrl(v) || 'Please enter a valid X / Twitter URL.'; }
        });

        if (!settingsCheck.valid) {
          showToast(settingsCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (settingsCheck.first) settingsCheck.first.focus();
          return;
        }

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
           main_address: mainAddress,
           contact_phone: contactPhone,
           contact_email: contactEmail,
           bank_details: bankDetails,
           facebook_url: facebookUrl,
           instagram_url: instagramUrl,
           youtube_url: youtubeUrl,
           x_url: xUrl,
           hero_video_url: heroVideoUrl,
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

   // --- Validation Helpers ---
   function isValidEmail(email) {
     return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
   }

   function isValidUrl(url) {
     try {
       const parsed = new URL(String(url).trim());
       return parsed.protocol === 'http:' || parsed.protocol === 'https:';
     } catch {
       return false;
     }
   }

   // User-facing link fields (socials, hero video, YouTube) are interpolated
   // into href/src attributes on the public pages. Restrict video/YouTube
   // fields to YouTube hosts so a wrong or malicious link cannot be embedded.
   function isValidYouTubeUrl(url) {
     if (!isValidUrl(url)) return false;
     const host = new URL(String(url).trim()).hostname.replace(/^www\./, '');
     return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
   }

   // Admins may paste a YouTube embed <iframe> instead of a plain link.
   // Extract the real src before URL validation — previously the URL check ran
   // first and rejected the markup, so paste-and-extract never worked.
   function extractYouTubeUrl(value) {
     const raw = String(value || '').trim();
     if (!raw || raw.indexOf('<iframe') === -1) return raw;
     const doc = new DOMParser().parseFromString(raw, 'text/html');
     const iframe = doc.querySelector('iframe[src]');
     return iframe ? (iframe.getAttribute('src') || '').trim() : raw;
   }

   // --- Generic required-field validation ------------------------------------
   // A control is "required by default" when it carries the `required`
   // attribute; the CMS forms use novalidate, so this helper is the sole
   // enforcement point. File inputs and hidden fields are never validated
   // here, and optional fields simply omit the attribute (e.g. the ministry
   // target_school field). Per-field format rules (email/URL) can be supplied
   // as { fieldId: (value) => true | 'error message' }.

   function labelForField(el) {
     if (el.labels && el.labels.length) {
       return (el.labels[0].textContent || '').replace(/\*/g, '').trim() || 'This field';
     }
     return 'This field';
   }

   function errorElementFor(el) {
     const describedBy = el.getAttribute('aria-describedby');
     if (describedBy) {
       const firstId = describedBy.split(/\s+/)[0];
       if (firstId) {
         const existing = document.getElementById(firstId);
         if (existing) return existing;
       }
     }
     const group = el.closest('.form__group');
     if (group) {
       const existing = group.querySelector('.error-message');
       if (existing) return existing;
       const created = document.createElement('div');
       created.className = 'error-message';
       created.setAttribute('aria-live', 'polite');
       const newId = el.id ? 'error-' + el.id : 'error-' + Math.random().toString(36).slice(2, 8);
       created.id = newId;
       group.appendChild(created);
       el.setAttribute('aria-describedby', newId);
       return created;
     }
     return null;
   }

   function validateRequiredFieldsInline(form, extraRules) {
     const controls = form.querySelectorAll('input, select, textarea');
     const requiredFields = [];
     controls.forEach(function (el) {
       const type = (el.getAttribute('type') || '').toLowerCase();
       if (type === 'file' || type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') return;
       if (el.disabled) return;
       if (el.required) requiredFields.push(el);
     });

     requiredFields.forEach(function (el) {
       el.classList.remove('form__input--error');
       el.setAttribute('aria-invalid', 'false');
       const err = errorElementFor(el);
       if (err) err.textContent = '';
     });

     let firstInvalid = null;
     const missingLabels = [];
     const ruleMessages = [];

     requiredFields.forEach(function (el) {
       const label = labelForField(el);
       let message = '';
       const value = el.value.trim();

       if (!value) {
         message = label + ' is required.';
       } else if (extraRules && extraRules[el.id]) {
         const rule = extraRules[el.id](value);
         if (typeof rule === 'string') message = rule;
       }

       if (!message) return;

       el.classList.add('form__input--error');
       el.setAttribute('aria-invalid', 'true');
       const err = errorElementFor(el);
       if (err) err.textContent = message;

       if (/is required\.?$/.test(message)) missingLabels.push(label);
       else ruleMessages.push(message);

       if (!firstInvalid) firstInvalid = el;
     });

     const summary = [];
     if (missingLabels.length) {
       summary.push(missingLabels.join(' and ') + (missingLabels.length > 1 ? ' are required.' : ' is required.'));
     }
     if (ruleMessages.length) summary.push(ruleMessages.join(' '));

     return { valid: !firstInvalid, first: firstInvalid, summary: summary.join(' ') };
   }

   // --- Leadership CRUD ---
   const leadershipForm = document.getElementById('leadershipForm');
   if (leadershipForm) {
     // Edit state: when null the form adds a new leader; otherwise it holds the
     // id of the row being updated. One form serves both modes.
     let leadershipEditingId = null;
     const leadershipSubmit = leadershipForm.querySelector('button[type="submit"]');
     const leadershipCancelEdit = document.getElementById('leadershipCancelEdit');

     function resetLeadershipForm() {
       leadershipEditingId = null;
       leadershipForm.reset();
       if (leadershipCancelEdit) leadershipCancelEdit.hidden = true;
       if (leadershipSubmit) {
         leadershipSubmit.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i> Add Leader';
         if (window.initIcons) window.initIcons();
       }
     }

     leadershipForm.addEventListener('submit', async function (e) {
       e.preventDefault();
       const submitBtn = leadershipForm.querySelector('[type="submit"]');
       if (isButtonBusy(submitBtn)) return;

        // Validate form inputs (excluding file inputs)
const name = document.getElementById('leaderName').value.trim();
        const role = document.getElementById('leaderRole').value.trim();
        const bio = document.getElementById('leaderBio').value.trim();

        // Required-by-default validation driven by the `required` attribute.
        const leaderCheck = validateRequiredFieldsInline(leadershipForm);

        if (!leaderCheck.valid) {
          showToast(leaderCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (leaderCheck.first) leaderCheck.first.focus();
          return;
        }

        const imageInput = document.getElementById('leaderImage');
        const imageFile = imageInput ? imageInput.files[0] : null;

        setButtonLoading(submitBtn, true);
       const startedAt = Date.now();
       try {
         let imageUrl = '';
         if (imageFile) imageUrl = await uploadImage(imageFile);
          let error;
          if (leadershipEditingId) {
            ({ error } = await supabase.from('leadership_team').update({ name, role, bio: bio, image_url: imageUrl }).eq('id', leadershipEditingId));
           } else {
            ({ error } = await supabase.from('leadership_team').insert([{ name, role, bio: bio, image_url: imageUrl }]));
          }

         if (error) {
           showToast('Error saving leader.', 'error');
           console.error(error);
         } else {
           showToast(leadershipEditingId ? 'Leader updated!' : 'Leader added!', 'success');
           resetLeadershipForm();
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

      // Edit handler for leaders
      document.addEventListener('click', async function (e) {
        const btn = e.target.closest('[data-action="edit-leader"]');
        if (!btn) return;
        if (isButtonBusy(btn)) return;
        setButtonLoading(btn, true);
        const startedAt = Date.now();
        try {
          const id = btn.dataset.id;
          const { data, error } = await supabase.from('leadership_team').select('*').eq('id', id).single();
          if (error || !data) {
            showToast('Could not load that leader.', 'error');
            console.error(error);
            return;
          }
          leadershipEditingId = id;
          document.getElementById('leaderName').value = data.name || '';
          document.getElementById('leaderRole').value = data.role || '';
          document.getElementById('leaderBio').value = data.bio || '';
          if (leadershipCancelEdit) leadershipCancelEdit.hidden = false;
          if (leadershipSubmit) {
            leadershipSubmit.innerHTML = '<i data-lucide="pencil" aria-hidden="true"></i> Update Leader';
            if (window.initIcons) window.initIcons();
          }
          document.getElementById('leaderName').focus();

          // Ensure the Leadership section remains visible
          const sidebarLinks = document.querySelectorAll('.sidebar__link');
          sidebarLinks.forEach(function (link) {
            link.classList.remove('sidebar__link--active');
          });
          document.querySelector('.sidebar__link[data-section="leadership"]').classList.add('sidebar__link--active');

          const sections = document.querySelectorAll('.admin-section');
          sections.forEach(function (sec) {
            sec.hidden = sec.id !== 'section-leadership';
          });

          showToast('Leader loaded into the form.', 'success');
        } catch (err) {
          showToast('Could not load that leader.', 'error');
          console.error(err);
        } finally {
          finishButtonLoading(btn, startedAt);
        }
      });

     if (leadershipCancelEdit) {
       leadershipCancelEdit.addEventListener('click', resetLeadershipForm);
     }
   }

// --- Ministries CRUD ---
   const ministriesForm = document.getElementById('ministriesForm');
   if (ministriesForm) {
     // Edit state: when null the form adds a new ministry; otherwise it holds the
     // id of the row being updated. One form serves both modes.
     let ministriesEditingId = null;
     const ministriesSubmit = ministriesForm.querySelector('button[type="submit"]');
     const ministriesCancelEdit = document.getElementById('ministriesCancelEdit');

     function resetMinistriesForm() {
       ministriesEditingId = null;
       ministriesForm.reset();
       if (ministriesCancelEdit) ministriesCancelEdit.hidden = true;
       if (ministriesSubmit) {
         ministriesSubmit.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i> Add Ministry';
         if (window.initIcons) window.initIcons();
       }
     }

     ministriesForm.addEventListener('submit', async function (e) {
       e.preventDefault();
       const submitBtn = ministriesForm.querySelector('[type="submit"]');
       if (isButtonBusy(submitBtn)) return;

       // Validate form inputs (excluding file inputs)
       const name = document.getElementById('minName').value.trim();
       const category = document.getElementById('minCategory').value;
       const desc = document.getElementById('minDesc').value.trim();
       const contact = document.getElementById('minContact').value.trim();
       const school = document.getElementById('minSchool').value.trim();

        // Validate required fields (target_school is deliberately optional — it
        // only carries `required` for Campus ministries intent, and its
        // absence of the attribute makes the generic validator skip it).
        const ministryCheck = validateRequiredFieldsInline(ministriesForm);

        if (!ministryCheck.valid) {
          showToast(ministryCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (ministryCheck.first) ministryCheck.first.focus();
          return;
        }

       const imageInput = document.getElementById('minImage');
       const imageFile = imageInput ? imageInput.files[0] : null;

       setButtonLoading(submitBtn, true);
       const startedAt = Date.now();
       try {
         let imageUrl = '';
         if (imageFile) imageUrl = await uploadImage(imageFile);
         let error;
         if (ministriesEditingId) {
           ({ error } = await supabase.from('ministries').update({ name, category, description: desc, contact_person: contact, target_school: school, image_url: imageUrl }).eq('id', ministriesEditingId));
          } else {
            ({ error } = await supabase.from('ministries').insert([{ name, category, description: desc, contact_person: contact, target_school: school, image_url: imageUrl }]));
          }

         if (error) {
           showToast('Error saving ministry.', 'error');
           console.error(error);
         } else {
           showToast(ministriesEditingId ? 'Ministry updated!' : 'Ministry added!', 'success');
           resetMinistriesForm();
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

// Edit handler for ministries
      document.addEventListener('click', async function (e) {
        const btn = e.target.closest('[data-action="edit-ministry"]');
        if (!btn) return;
        if (isButtonBusy(btn)) return;
        setButtonLoading(btn, true);
        const startedAt = Date.now();
        try {
          const id = btn.dataset.id;
          const { data, error } = await supabase.from('ministries').select('*').eq('id', id).single();
          if (error || !data) {
            showToast('Could not load that ministry.', 'error');
            console.error(error);
            return;
          }
          ministriesEditingId = id;
          document.getElementById('minName').value = data.name || '';
          document.getElementById('minCategory').value = data.category || 'General';
          document.getElementById('minDesc').value = data.description || '';
          document.getElementById('minContact').value = data.contact_person || '';
          document.getElementById('minSchool').value = data.target_school || '';
          if (ministriesCancelEdit) ministriesCancelEdit.hidden = false;
          if (ministriesSubmit) {
            ministriesSubmit.innerHTML = '<i data-lucide="pencil" aria-hidden="true"></i> Update Ministry';
            if (window.initIcons) window.initIcons();
          }
          document.getElementById('minName').focus();
          showToast('Ministry loaded into the form.', 'success');
        } catch (err) {
          showToast('Could not load that ministry.', 'error');
          console.error(err);
        } finally {
          finishButtonLoading(btn, startedAt);
        }
      });

     if (ministriesCancelEdit) {
       ministriesCancelEdit.addEventListener('click', resetMinistriesForm);
     }
   }

// --- Locations CRUD ---
   const locationsForm = document.getElementById('locationsForm');
   if (locationsForm) {
     // Edit state: null = adding; otherwise the row id being updated.
     let locationsEditingId = null;
     let locationsEditingImage = '';
     const locationsSubmit = locationsForm.querySelector('button[type="submit"]');
     const locationsCancelEdit = document.getElementById('locationsCancelEdit');

     function resetLocationsForm() {
       locationsEditingId = null;
       locationsEditingImage = '';
       locationsForm.reset();
       if (locationsCancelEdit) locationsCancelEdit.hidden = true;
       if (locationsSubmit) {
         locationsSubmit.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i> Add Location';
         if (window.initIcons) window.initIcons();
       }
     }

locationsForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const submitBtn = locationsForm.querySelector('[type="submit"]');
        if (isButtonBusy(submitBtn)) return;

        // Validate form inputs (excluding file inputs)
        const name = document.getElementById('locName').value.trim();
        const type = document.getElementById('locType').value;
        const address = document.getElementById('locAddress').value.trim();
        const maps = document.getElementById('locMaps').value.trim();
        const status = document.getElementById('locStatus').value;

        // Validate required fields plus the Google Maps embed URL format.
        const locationCheck = validateRequiredFieldsInline(locationsForm, {
          locMaps: function (v) { return isValidUrl(v) || 'Please enter a valid Google Maps URL.'; }
        });

        if (!locationCheck.valid) {
          showToast(locationCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (locationCheck.first) locationCheck.first.focus();
          return;
        }

        setButtonLoading(submitBtn, true);
        const startedAt = Date.now();
        try {
          let image_url = locationsEditingImage;
          const imageInput = document.getElementById('locImage');
          const imageFile = imageInput ? imageInput.files[0] : null;
          if (imageFile) image_url = await uploadImage(imageFile);

          let error;
          if (locationsEditingId) {
            ({ error } = await supabase.from('locations').update({ name, location_type: type, address, google_maps_embed_link: maps, status, image_url }).eq('id', locationsEditingId));
          } else {
            ({ error } = await supabase.from('locations').insert([{ name, location_type: type, address, google_maps_embed_link: maps, status, image_url }]));
          }

          if (error) {
            showToast('Error saving location.', 'error');
            console.error(error);
          } else {
            showToast(locationsEditingId ? 'Location updated!' : 'Location added!', 'success');
            resetLocationsForm();
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

// Edit handler for locations
      document.addEventListener('click', async function (e) {
        const btn = e.target.closest('[data-action="edit-location"]');
        if (!btn) return;
        if (isButtonBusy(btn)) return;
        setButtonLoading(btn, true);
        const startedAt = Date.now();
        try {
          const id = btn.dataset.id;
          const { data, error } = await supabase.from('locations').select('*').eq('id', id).single();
          if (error || !data) {
            showToast('Could not load that location.', 'error');
            console.error(error);
            return;
          }
          locationsEditingId = id;
          locationsEditingImage = data.image_url || '';
          document.getElementById('locName').value = data.name || '';
          document.getElementById('locType').value = data.location_type || 'Main';
          document.getElementById('locAddress').value = data.address || '';
          document.getElementById('locMaps').value = data.google_maps_embed_link || '';
          document.getElementById('locStatus').value = data.status || 'Active';
          if (locationsCancelEdit) locationsCancelEdit.hidden = false;
          if (locationsSubmit) {
            locationsSubmit.innerHTML = '<i data-lucide="pencil" aria-hidden="true"></i> Update Location';
            if (window.initIcons) window.initIcons();
          }
          document.getElementById('locName').focus();
          showToast('Location loaded into the form.', 'success');
        } catch (err) {
          showToast('Could not load that location.', 'error');
          console.error(err);
        } finally {
          finishButtonLoading(btn, startedAt);
        }
      });

     if (locationsCancelEdit) {
       locationsCancelEdit.addEventListener('click', resetLocationsForm);
     }
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

       // Validate form inputs (excluding file inputs)
       const name = document.getElementById('lgName').value.trim();
       const type = document.getElementById('lgType').value;
       const leader = document.getElementById('lgLeader').value.trim();
       const location = document.getElementById('lgLocation').value.trim();
       const time = document.getElementById('lgTime').value.trim();
       const contact = document.getElementById('lgContact').value.trim();

// Required-by-default validation driven by the `required` attribute.
        const lifegroupCheck = validateRequiredFieldsInline(lifegroupsForm);

        if (!lifegroupCheck.valid) {
          showToast(lifegroupCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (lifegroupCheck.first) lifegroupCheck.first.focus();
          return;
        }

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
      const editBtn = e.target.closest('[data-action="edit-lifegroup"]');
      if (editBtn) {
        if (isButtonBusy(editBtn)) return;
        setButtonLoading(editBtn, true);
        const startedAt = Date.now();
        try {
          const id = editBtn.dataset.id;
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
          showToast('Lifegroup loaded into the form.', 'success');
        } catch (err) {
          showToast('Could not load that lifegroup.', 'error');
          console.error(err);
        } finally {
          finishButtonLoading(editBtn, startedAt);
        }
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

       // Validate form inputs (excluding file inputs)
       const title = document.getElementById('sermonTitle').value.trim();
       const speaker = document.getElementById('sermonSpeaker').value.trim();
       const date = document.getElementById('sermonDate').value;
       const youtube = extractYouTubeUrl(document.getElementById('sermonYoutube').value.trim());
       const desc = document.getElementById('sermonDesc').value.trim();

// Required-by-default validation. The YouTube field accepts a plain link
        // or a pasted <iframe> embed, so the format rule extracts first.
        const sermonCheck = validateRequiredFieldsInline(sermonsForm, {
          sermonYoutube: function (v) { return isValidYouTubeUrl(extractYouTubeUrl(v)) || 'Please enter a valid YouTube link or embed URL.'; }
        });

        if (!sermonCheck.valid) {
          showToast(sermonCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (sermonCheck.first) sermonCheck.first.focus();
          return;
        }

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
      const editBtn = e.target.closest('[data-action="edit-sermon"]');
      if (editBtn) {
        if (isButtonBusy(editBtn)) return;
        setButtonLoading(editBtn, true);
        const startedAt = Date.now();
        try {
          const id = editBtn.dataset.id;
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
          showToast('Sermon loaded into the form.', 'success');
        } catch (err) {
          showToast('Could not load that sermon.', 'error');
          console.error(err);
        } finally {
          finishButtonLoading(editBtn, startedAt);
        }
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

       // Validate form inputs (excluding file inputs)
       const title = document.getElementById('evTitle').value.trim();
       const date = document.getElementById('evDate').value;
       const time = document.getElementById('evTime').value.trim();
       const desc = document.getElementById('evDesc').value.trim();

        // Required-by-default validation driven by the `required` attribute.
        const eventCheck = validateRequiredFieldsInline(specialEventsForm);

        if (!eventCheck.valid) {
          showToast(eventCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (eventCheck.first) eventCheck.first.focus();
          return;
        }

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
      const editBtn = e.target.closest('[data-action="edit-special-event"]');
      if (editBtn) {
        if (isButtonBusy(editBtn)) return;
        setButtonLoading(editBtn, true);
        const startedAt = Date.now();
        try {
          const id = editBtn.dataset.id;
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
          showToast('Event loaded into the form.', 'success');
        } catch (err) {
          showToast('Could not load that event.', 'error');
          console.error(err);
        } finally {
          finishButtonLoading(editBtn, startedAt);
        }
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

       // Validate form inputs (excluding file inputs)
       const service_name = document.getElementById('scName').value.trim();
       const day = document.getElementById('scDay').value.trim();
       const time = document.getElementById('scTime').value.trim();
       const location_id = document.getElementById('scLocation').value;
       const imageInput = document.getElementById('scImage');
       const imageFile = imageInput ? imageInput.files[0] : null;

        // Required-by-default validation driven by the `required` attribute.
        const scheduleCheck = validateRequiredFieldsInline(schedulesForm);

        if (!scheduleCheck.valid) {
          showToast(scheduleCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (scheduleCheck.first) scheduleCheck.first.focus();
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
      const editBtn = e.target.closest('[data-action="edit-schedule"]');
      if (editBtn) {
        if (isButtonBusy(editBtn)) return;
        setButtonLoading(editBtn, true);
        const startedAt = Date.now();
        try {
          const id = editBtn.dataset.id;
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
          showToast('Schedule loaded into the form.', 'success');
        } catch (err) {
          showToast('Could not load that schedule.', 'error');
          console.error(err);
        } finally {
          finishButtonLoading(editBtn, startedAt);
        }
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

       // Validate form inputs (excluding file inputs)
       const month_label = document.getElementById('mtMonth').value.trim();
       const title = document.getElementById('mtTitle').value.trim();
       const description = document.getElementById('mtText').value.trim();
       const scripture = document.getElementById('mtScripture').value.trim();
       const is_active = document.getElementById('mtActive').value === 'true';
       const imageInput = document.getElementById('mtImage');
       const imageFile = imageInput ? imageInput.files[0] : null;

        // Required-by-default validation driven by the `required` attribute.
        const themeCheck = validateRequiredFieldsInline(monthlyThemeForm);

        if (!themeCheck.valid) {
          showToast(themeCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (themeCheck.first) themeCheck.first.focus();
          return;
        }

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
      const editBtn = e.target.closest('[data-action="edit-monthly-theme"]');
      if (editBtn) {
        if (isButtonBusy(editBtn)) return;
        setButtonLoading(editBtn, true);
        const startedAt = Date.now();
        try {
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
          showToast('Monthly theme loaded into the form.', 'success');
        } catch (err) {
          showToast('Could not load the current theme.', 'error');
          console.error(err);
        } finally {
          finishButtonLoading(editBtn, startedAt);
        }
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

// Required-by-default validation. The YouTube field accepts a plain link
        // or a pasted <iframe> embed, so the format rule extracts first.
        const liveCheck = validateRequiredFieldsInline(liveStatusForm, {
          lsYoutube: function (v) { return isValidYouTubeUrl(extractYouTubeUrl(v)) || 'Please enter a valid YouTube link or embed URL.'; }
        });

        if (!liveCheck.valid) {
          showToast(liveCheck.summary || 'Please fix the highlighted fields.', 'error');
          if (liveCheck.first) liveCheck.first.focus();
          return;
        }

       // Normalize a pasted <iframe> to its src before saving.
       youtube_url = extractYouTubeUrl(youtube_url);

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
      const editBtn = e.target.closest('[data-action="edit-live-status"]');
      if (editBtn) {
        if (isButtonBusy(editBtn)) return;
        setButtonLoading(editBtn, true);
        const startedAt = Date.now();
        try {
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
          showToast('Live status loaded into the form.', 'success');
        } catch (err) {
          showToast('Could not load the live status.', 'error');
          console.error(err);
        } finally {
          finishButtonLoading(editBtn, startedAt);
        }
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

  // --- Live inline validation feedback ---
  // The moment the admin touches a field that failed validation, the error
  // state and message clear. Feedback is immediate instead of waiting for the
  // next submit. Handles text inputs, selects, textareas and file inputs.
  document.addEventListener('input', clearFieldError);
  document.addEventListener('change', clearFieldError);

  function clearFieldError(e) {
    const target = e.target;
    if (!target || typeof target.matches !== 'function') return;
    if (!target.matches('input.form__input, select.form__input, textarea.form__input')) return;
    target.classList.remove('form__input--error');
    target.setAttribute('aria-invalid', 'false');
    const describedBy = target.getAttribute('aria-describedby');
    if (describedBy) {
      describedBy.split(' ').forEach(function (id) {
        const el = document.getElementById(id);
        if (el && el.classList.contains('error-message')) el.textContent = '';
      });
    }
  }
})();
