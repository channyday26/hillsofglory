// ============================================
// Hills of Glory — Public Site Scripts
// ============================================

(function () {
  'use strict';

  const html = document.documentElement;

  // ============================================
  // Theme Toggle (respects system + localStorage)
  // ============================================
  const themeToggle = document.getElementById('themeToggle');

  function getPreferredTheme() {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (themeToggle) {
      themeToggle.setAttribute('data-theme-active', theme);
      const icon = themeToggle.querySelector('.ti');
      if (icon) {
        icon.classList.toggle('ti-sun', theme === 'light');
        icon.classList.toggle('ti-moon', theme === 'dark');
      }
    }
  }

  applyTheme(getPreferredTheme());

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const current = html.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  // React to OS theme changes only when user hasn't chosen explicitly
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!localStorage.getItem('theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });

  // ============================================
  // Mobile Menu Drawer + Backdrop
  // ============================================
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const navbarNav = document.getElementById('navbarNav');
  const navbarBackdrop = document.getElementById('navbarBackdrop');

  function openMenu() {
    if (navbarNav) navbarNav.classList.add('is-open');
    if (navbarBackdrop) navbarBackdrop.classList.add('is-open');
    if (mobileMenuToggle) mobileMenuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    if (navbarNav) navbarNav.classList.remove('is-open');
    if (navbarBackdrop) navbarBackdrop.classList.remove('is-open');
    if (mobileMenuToggle) mobileMenuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (mobileMenuToggle && navbarNav) {
    mobileMenuToggle.addEventListener('click', function () {
      if (navbarNav.classList.contains('is-open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });
  }

  if (navbarBackdrop) {
    navbarBackdrop.addEventListener('click', closeMenu);
  }

  if (navbarNav) {
    navbarNav.querySelectorAll('.navbar__link').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  // ============================================
  // Sticky navbar scroll shadow
  // ============================================
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    let ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          navbar.classList.toggle('is-scrolled', window.scrollY > 8);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ============================================
  // HTML escaping helper (guard against injection)
  // ============================================
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(value) {
    return esc(value);
  }

  // ============================================
  // Supabase Helpers
  // ============================================
  function client() {
    return window.supabase;
  }

  async function fetchTable(tableName, buildQuery) {
    const sb = client();
    if (!sb || typeof sb.from !== 'function') {
      console.error('Supabase client not ready for ' + tableName);
      return [];
    }
    let query = sb.from(tableName).select('*');
    if (typeof buildQuery === 'function') {
      query = buildQuery(query);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching ' + tableName + ':', error.message || error);
      return [];
    }
    return data || [];
  }

  // ============================================
  // Toast Notifications
  // ============================================
  function ensureToastContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast toast--' + (type === 'error' ? 'error' : 'success');
    const iconClass = type === 'error' ? 'ti-alert-circle' : 'ti-circle-check';
    toast.innerHTML = '<i class="ti ' + iconClass + ' toast__icon"></i><span>' + esc(message) + '</span>';
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(function () { toast.remove(); }, 320);
    }, 4000);
  }

  // ============================================
  // Footer + Contact page — church settings
  // ============================================
  async function loadFooter() {
    const settings = await fetchTable('church_settings');
    if (!settings.length) return;
    const s = settings[0];

    // Footer contact block
    const footerAddress = document.getElementById('footerAddress');
    if (footerAddress && s.main_address) footerAddress.textContent = s.main_address;

    const footerPhone = document.getElementById('footerPhone');
    if (footerPhone && s.contact_phone) footerPhone.textContent = s.contact_phone;

    const footerEmail = document.getElementById('footerEmail');
    if (footerEmail && s.contact_email) footerEmail.textContent = s.contact_email;

    // Contact page detail cards (if present)
    const contactAddress = document.getElementById('contactAddress');
    if (contactAddress && s.main_address) contactAddress.textContent = s.main_address;

    const contactPhone = document.getElementById('contactPhone');
    if (contactPhone && s.contact_phone) contactPhone.textContent = s.contact_phone;

    const contactEmail = document.getElementById('contactEmail');
    if (contactEmail && s.contact_email) contactEmail.textContent = s.contact_email;

    const footerSocial = document.getElementById('footerSocial');
    if (footerSocial) {
      const socials = [
        { url: s.facebook_url, label: 'Facebook', icon: 'ti-brand-facebook' },
        { url: s.instagram_url, label: 'Instagram', icon: 'ti-brand-instagram' },
        { url: s.youtube_url, label: 'YouTube', icon: 'ti-brand-youtube' },
        { url: s.x_url, label: 'X', icon: 'ti-brand-x' },
      ].filter(function (item) { return item.url; });

      if (socials.length) {
        footerSocial.innerHTML = socials.map(function (item) {
          return '<a href="' + escAttr(item.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escAttr(item.label) + '">' +
            '<i class="ti ' + item.icon + '"></i></a>';
        }).join('');
      }
    }
  }

  // ============================================
  // Home — Service Schedules (all schedules with location)
  // ============================================
  async function loadHomeSchedules() {
    const grid = document.getElementById('homeScheduleGrid');
    if (!grid) return;

    const schedules = await fetchTable('service_schedules', function (q) {
      return q.order('sort_order', { ascending: true });
    });
    if (!schedules.length) return; // keep static fallback markup

    grid.innerHTML = schedules.map(function (s) {
      return '<div class="card glass-card hover-lift animate-fade-up">' +
        '<div class="schedule-badge"><i class="ti ti-calendar-event"></i> ' + esc(s.service_name || 'Service') + '</div>' +
        '<h3 class="card__title">' + esc(s.service_name || 'Service') + '</h3>' +
        '<p class="card__text"><strong>' + esc(s.day || '') + '</strong> &mdash; ' + esc(s.time || '') + '</p>' +
        '<div class="card__footer">' +
        '<span class="card__tag">Worship &amp; Word</span>' +
        '<a href="locations.html" class="btn btn--outline btn--sm">Locations &rarr;</a>' +
        '</div></div>';
    }).join('');
  }

  // ============================================
  // Sermon card renderer (shared)
  // ============================================
  function renderSermonCard(s) {
    const videoId = extractYouTubeId(s.youtube_url);
    const thumb = videoId
      ? 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg'
      : 'images/preach.png';
    return '<div class="card hover-lift animate-fade-up" data-youtube="' + escAttr(videoId || '') + '">' +
      '<div class="card__media">' +
      '<img src="' + escAttr(thumb) + '" alt="' + escAttr(s.title || 'Sermon') + '" loading="lazy" />' +
      '</div>' +
      '<span class="card__tag">' + esc(formatDate(s.date) || 'Message') + '</span>' +
      '<h3 class="card__title">' + esc(s.title || '') + '</h3>' +
      '<p class="card__text">' + esc(s.speaker || 'Guest Speaker') + (s.description ? ' &bull; ' + esc(s.description) : '') + '</p>' +
      '<div class="card__footer">' +
      (videoId
        ? '<button type="button" class="btn btn--primary btn--sm sermon-play" data-youtube="' + escAttr(videoId) + '"><i class="ti ti-player-play"></i> Watch</button>'
        : (s.youtube_url ? '<a href="' + escAttr(s.youtube_url) + '" target="_blank" rel="noopener" class="btn btn--primary btn--sm"><i class="ti ti-player-play"></i> Watch</a>' : '')) +
      '</div></div>';
  }

  function extractYouTubeId(url) {
    if (!url) return null;
    const match = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ============================================
  // Home — Latest Sermons (limit 3)
  // ============================================
  async function loadHomeSermons() {
    const grid = document.getElementById('homeSermonsGrid');
    if (!grid) return;

    const sermons = await fetchTable('sermons', function (q) {
      return q.order('date', { ascending: false, nullsFirst: false }).limit(3);
    });
    if (!sermons.length) return; // keep static fallback

    grid.innerHTML = sermons.map(renderSermonCard).join('');
    wireSermonPlayButtons();
  }

  // ============================================
  // Pagination helpers
  // ============================================
  // Pages are fetched with .range(), asking for one row more than we intend to
  // show. If that extra row comes back there is another page, so we never need
  // a separate count query.
  const PAGE_SIZE = 9;

  function newPager() {
    return { offset: 0, exhausted: false, loading: false };
  }

  function pageRange(pager) {
    return [pager.offset, pager.offset + PAGE_SIZE];
  }

  // Splits a fetched batch into the rows to render, and records whether more
  // remain. Returns the rows to render.
  function takePage(pager, rows) {
    pager.exhausted = rows.length <= PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    pager.offset += page.length;
    return page;
  }

  function setLoadMoreState(btn, state) {
    if (!btn) return;
    const label = btn.querySelector('.load-more__label');
    btn.classList.toggle('is-loading', state === 'loading');
    btn.disabled = state === 'loading';
    // Visibility is only decided once a load settles, so the button stays
    // hidden through the very first fetch instead of flashing "Loading…".
    if (state !== 'loading') btn.hidden = state === 'exhausted';
    if (label) {
      label.textContent = state === 'loading' ? 'Loading…' : btn.dataset.label || 'Load more';
    }
  }

  // ============================================
  // Sermons Page — paginated list
  // ============================================
  const sermonsPager = newPager();

  async function loadSermonsList(append) {
    const grid = document.getElementById('sermonsListGrid');
    if (!grid) return;
    if (sermonsPager.loading) return;
    if (append && sermonsPager.exhausted) return;

    const btn = document.getElementById('sermonsLoadMore');
    sermonsPager.loading = true;
    setLoadMoreState(btn, 'loading');

    const range = pageRange(sermonsPager);
    const batch = await fetchTable('sermons', function (q) {
      return q.order('date', { ascending: false, nullsFirst: false }).range(range[0], range[1]);
    });
    const sermons = takePage(sermonsPager, batch);

    if (!append) grid.innerHTML = '';

    if (!sermons.length && !append) {
      grid.innerHTML = '<p class="card__text">No sermons posted yet. Check back soon.</p>';
    } else if (sermons.length) {
      grid.insertAdjacentHTML('beforeend', sermons.map(renderSermonCard).join(''));
      wireSermonPlayButtons();
    }

    sermonsPager.loading = false;
    setLoadMoreState(btn, sermonsPager.exhausted ? 'exhausted' : 'ready');
  }

  function wireSermonsLoadMore() {
    const btn = document.getElementById('sermonsLoadMore');
    if (!btn) return;
    btn.addEventListener('click', function () {
      loadSermonsList(true);
    });
  }

  // ============================================
  // Sermon video modal
  // ============================================
  function wireSermonPlayButtons() {
    document.querySelectorAll('.sermon-play').forEach(function (btn) {
      if (btn.dataset.wired) return;
      btn.dataset.wired = 'true';
      btn.addEventListener('click', function () {
        openVideoModal(btn.dataset.youtube);
      });
    });
  }

  function openVideoModal(youtubeId) {
    if (!youtubeId) return;
    let modal = document.querySelector('.video-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'video-modal';
      modal.innerHTML =
        '<div class="video-modal__dialog">' +
        '<button type="button" class="video-modal__close" aria-label="Close video"><i class="ti ti-x"></i></button>' +
        '<div class="video-modal__player"></div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.addEventListener('click', function (e) {
        if (e.target === modal || e.target.closest('.video-modal__close')) {
          closeVideoModal();
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeVideoModal();
      });
    }

    const player = modal.querySelector('.video-modal__player');
    player.innerHTML = '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(youtubeId) +
      '?autoplay=1&rel=0" title="Sermon video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    requestAnimationFrame(function () { modal.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
  }

  function closeVideoModal() {
    const modal = document.querySelector('.video-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () {
      const player = modal.querySelector('.video-modal__player');
      if (player) player.innerHTML = '';
    }, 300);
  }

  // ============================================
  // About — Leadership team
  // ============================================
  async function loadLeadership() {
    const grid = document.getElementById('leadershipGrid');
    if (!grid) return;

    const leaders = await fetchTable('leadership_team', function (q) {
      return q.order('sort_order', { ascending: true });
    });
    if (!leaders.length) return; // keep static fallback

    grid.innerHTML = leaders.map(function (l) {
      return '<div class="card hover-lift animate-fade-up">' +
        (l.image_url
          ? '<div class="card__media"><img src="' + escAttr(l.image_url) + '" alt="' + escAttr(l.name || '') + '" loading="lazy" /></div>'
          : '') +
        '<span class="card__tag">' + esc(l.role || 'Leadership') + '</span>' +
        '<h3 class="card__title">' + esc(l.name || '') + '</h3>' +
        (l.role ? '<p class="card__subtitle">' + esc(l.role) + '</p>' : '') +
        '<p class="card__text">' + esc(l.bio || '') + '</p>' +
        '</div>';
    }).join('');
  }

  // ============================================
  // Ministries — grouped by category
  // ============================================
  async function loadMinistries() {
    const grids = {
      Worship: document.getElementById('worshipGrid'),
      General: document.getElementById('ministriesGrid'),
      Campus: document.getElementById('campusGrid'),
    };
    const joinSelect = document.getElementById('joinMinistry');

    // Nothing on this page needs ministries
    if (!grids.Worship && !grids.General && !grids.Campus && !joinSelect) return;

    const all = await fetchTable('ministries', function (q) {
      return q.eq('is_active', true).order('sort_order', { ascending: true });
    });

    Object.keys(grids).forEach(function (category) {
      const grid = grids[category];
      if (!grid) return;
      const items = all.filter(function (m) { return m.category === category; });
      if (!items.length) {
        grid.innerHTML = '<p class="card__text">No ministries in this category yet.</p>';
        return;
      }
      grid.innerHTML = items.map(function (m) {
        return '<div class="glass-card hover-lift animate-fade-up">' +
          (m.image_url
            ? '<div class="card__media"><img src="' + escAttr(m.image_url) + '" alt="' + escAttr(m.name || '') + '" loading="lazy" /></div>'
            : '') +
          '<h3 class="card__title">' + esc(m.name || '') + '</h3>' +
          '<p class="card__text">' + esc(m.description || '') + '</p>' +
          (m.target_school ? '<p class="card__subtitle"><i class="ti ti-school"></i> ' + esc(m.target_school) + '</p>' : '') +
          (m.contact_person ? '<div class="card__footer"><span class="card__text"><i class="ti ti-user"></i> ' + esc(m.contact_person) + '</span></div>' : '') +
          '</div>';
      }).join('');
    });

    if (joinSelect && all.length) {
      joinSelect.innerHTML = '<option value="">Select a ministry</option>' +
        all.map(function (m) {
          return '<option value="' + escAttr(m.name || '') + '">' + esc(m.name || '') + '</option>';
        }).join('');
    }
  }

  // ============================================
  // Locations — Main campus + outreaches with schedule accordion
  // ============================================
  async function loadLocations() {
    const mainCampusCard = document.getElementById('mainCampusCard');
    const outreachGrid = document.getElementById('outreachGrid');
    if (!mainCampusCard && !outreachGrid) return;

    const locations = await fetchTable('locations', function (q) {
      return q.eq('status', 'Active').order('sort_order', { ascending: true });
    });
    const schedules = await fetchTable('service_schedules', function (q) {
      return q.order('sort_order', { ascending: true });
    });

    const schedulesByLocation = {};
    schedules.forEach(function (s) {
      if (!schedulesByLocation[s.location_id]) schedulesByLocation[s.location_id] = [];
      schedulesByLocation[s.location_id].push(s);
    });

    function locationCard(loc) {
      const locSchedules = schedulesByLocation[loc.id] || [];
      const scheduleBody = locSchedules.length
        ? locSchedules.map(function (s) {
            return '<p class="card__text"><strong>' + esc(s.service_name) + '</strong>: ' + esc(s.day) + ' &mdash; ' + esc(s.time) + '</p>';
          }).join('')
        : '<p class="card__text">Service times coming soon.</p>';

      return '<div class="glass-card hover-lift animate-fade-up">' +
        '<span class="card__tag">' + esc(loc.location_type === 'Main' ? 'Main Campus' : 'Outreach') + '</span>' +
        '<h3 class="card__title">' + esc(loc.name || '') + '</h3>' +
        '<p class="card__text"><i class="ti ti-map-pin"></i> ' + esc(loc.address || '') + '</p>' +
        '<div class="location-accordion">' +
        '<button type="button" class="location-accordion__trigger" aria-expanded="false">' +
        '<span><i class="ti ti-clock"></i> Service Schedule</span><i class="ti ti-chevron-down"></i></button>' +
        '<div class="location-accordion__body" hidden>' + scheduleBody +
        (loc.google_maps_embed_link ? '<a href="' + escAttr(loc.google_maps_embed_link) + '" target="_blank" rel="noopener" class="btn btn--outline btn--sm"><i class="ti ti-map"></i> View Map</a>' : '') +
        '</div></div></div>';
    }

    if (mainCampusCard) {
      const main = locations.find(function (l) { return l.location_type === 'Main'; });
      if (main) {
        mainCampusCard.innerHTML = locationCard(main);
      } else {
        mainCampusCard.innerHTML = '<p class="card__text">Main campus details coming soon.</p>';
      }
    }

    if (outreachGrid) {
      const outreaches = locations.filter(function (l) { return l.location_type !== 'Main'; });
      if (!outreaches.length) {
        outreachGrid.innerHTML = '<p class="card__text">No outreach locations listed yet.</p>';
      } else {
        outreachGrid.innerHTML = outreaches.map(locationCard).join('');
      }
    }

    wireAccordions();
  }

  function wireAccordions() {
    document.querySelectorAll('.location-accordion__trigger').forEach(function (trigger) {
      if (trigger.dataset.wired) return;
      trigger.dataset.wired = 'true';
      trigger.addEventListener('click', function () {
        const expanded = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', String(!expanded));
        const body = trigger.nextElementSibling;
        if (body) {
          if (expanded) {
            body.hidden = true;
          } else {
            body.hidden = false;
            body.classList.add('animate-fade-up');
          }
        }
      });
    });
  }

  // ============================================
  // Lifegroups — paginated, with type filters
  // ============================================
  // The filter is applied in the query rather than by hiding rendered cards.
  // With pagination the two have to agree: hiding cards client-side would show
  // "3 of 9" results on a page that claims there are more.
  const lifegroupsPager = newPager();
  let lifegroupsFilter = 'all';
  // Every load takes a ticket. A reply whose ticket is no longer the latest is
  // stale — a filter change or a newer page has superseded it — and is dropped
  // rather than rendered over the top of fresher results.
  let lifegroupsRequestId = 0;

  function renderLifegroupCard(g) {
    return '<div class="card hover-lift animate-fade-up">' +
      (g.group_type ? '<span class="card__tag">' + esc(g.group_type) + '</span>' : '') +
      '<h3 class="card__title">' + esc(g.group_name || '') + '</h3>' +
      (g.leader_name ? '<p class="card__subtitle"><i class="ti ti-user"></i> ' + esc(g.leader_name) + '</p>' : '') +
      '<p class="card__text"><i class="ti ti-map-pin"></i> ' + esc(g.location || 'TBA') + '</p>' +
      '<p class="card__text"><i class="ti ti-clock"></i> ' + esc(g.meeting_time || 'TBA') + '</p>' +
      (g.contact_info ? '<div class="card__footer"><span class="card__text"><i class="ti ti-phone"></i> ' + esc(g.contact_info) + '</span></div>' : '') +
      '</div>';
  }

  async function loadLifegroups(append) {
    const grid = document.getElementById('lifegroupsGrid');
    if (!grid) return;
    // Only "Load more" is rate-limited. A filter change must never be swallowed
    // because an earlier request happens to still be open.
    if (append && (lifegroupsPager.loading || lifegroupsPager.exhausted)) return;

    const btn = document.getElementById('lifegroupsLoadMore');
    const requestId = ++lifegroupsRequestId;
    const activeFilter = lifegroupsFilter;
    lifegroupsPager.loading = true;
    setLoadMoreState(btn, 'loading');

    const range = pageRange(lifegroupsPager);
    const batch = await fetchTable('lifegroups', function (q) {
      let query = q.eq('is_active', true);
      if (activeFilter !== 'all') query = query.eq('group_type', activeFilter);
      return query.order('sort_order', { ascending: true }).range(range[0], range[1]);
    });

    // Superseded — the newer request owns the grid and will clear `loading`.
    if (requestId !== lifegroupsRequestId) return;

    lifegroupsPager.loading = false;
    const groups = takePage(lifegroupsPager, batch);

    if (!append) grid.innerHTML = '';

    if (!groups.length && !append) {
      grid.innerHTML = activeFilter === 'all'
        ? '<p class="card__text">No Lifegroups listed yet. Check back soon.</p>'
        : '<p class="card__text">No ' + esc(activeFilter) + ' groups yet. Try another filter.</p>';
    } else if (groups.length) {
      grid.insertAdjacentHTML('beforeend', groups.map(renderLifegroupCard).join(''));
    }

    setLoadMoreState(btn, lifegroupsPager.exhausted ? 'exhausted' : 'ready');
  }

  function wireLifegroupControls() {
    const filters = document.getElementById('lifegroupFilters');
    if (filters) {
      filters.addEventListener('click', function (e) {
        const btn = e.target.closest('.filter-pill');
        if (!btn || btn.dataset.filter === lifegroupsFilter) return;

        filters.querySelectorAll('.filter-pill').forEach(function (b) {
          b.classList.remove('filter-pill--active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('filter-pill--active');
        btn.setAttribute('aria-pressed', 'true');

        // Back to page one for the new filter.
        lifegroupsFilter = btn.dataset.filter;
        lifegroupsPager.offset = 0;
        lifegroupsPager.exhausted = false;
        loadLifegroups(false);
      });
    }

    const more = document.getElementById('lifegroupsLoadMore');
    if (more) {
      more.addEventListener('click', function () {
        loadLifegroups(true);
      });
    }
  }

  // ============================================
  // Give — bank details
  // ============================================
  async function loadGive() {
    const target = document.getElementById('giveDetails');
    if (!target) return;

    const settings = await fetchTable('church_settings');
    if (!settings.length || !settings[0].bank_details) return; // keep static fallback

    target.textContent = settings[0].bank_details;
  }

  // ============================================
  // Prayer Request Form
  // ============================================
  function initPrayerForm() {
    const form = document.getElementById('prayerRequestForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const honeypot = document.getElementById('prayerWebsite');
      if (honeypot && honeypot.value) return; // bot trap

      const nameEl = document.getElementById('prayerName');
      const requestEl = document.getElementById('prayerRequest');
      const name = nameEl ? nameEl.value.trim() : '';
      const requestText = requestEl ? requestEl.value.trim() : '';

      if (!name || !requestText) {
        showToast('Please fill in your name and prayer request.', 'error');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const { error } = await client().from('prayer_requests').insert([
        { visitor_name: name, request_text: requestText }
      ]);

      if (submitBtn) submitBtn.disabled = false;

      if (error) {
        showToast('Something went wrong. Please try again.', 'error');
        console.error(error);
      } else {
        showToast('Prayer request submitted. We are praying with you.', 'success');
        form.reset();
      }
    });
  }

  // ============================================
  // Join Ministry Form
  // ============================================
  function initJoinForm() {
    const form = document.getElementById('joinMinistryForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const honeypot = document.getElementById('websiteUrl');
      if (honeypot && honeypot.value) return; // bot trap

      const nameEl = document.getElementById('joinName');
      const contactEl = document.getElementById('joinEmail');
      const ministryEl = document.getElementById('joinMinistry');
      const name = nameEl ? nameEl.value.trim() : '';
      const contact = contactEl ? contactEl.value.trim() : '';
      const ministry = ministryEl ? ministryEl.value : '';

      if (!name || !contact || !ministry) {
        showToast('Please complete all fields.', 'error');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const { error } = await client().from('ministry_join_requests').insert([
        { visitor_name: name, contact_info: contact, ministry_of_interest: ministry }
      ]);

      if (submitBtn) submitBtn.disabled = false;

      if (error) {
        showToast('Something went wrong. Please try again.', 'error');
        console.error(error);
      } else {
        showToast('Thank you for your interest! We will be in touch.', 'success');
        form.reset();
      }
    });
  }

  // ============================================
  // Wait for Supabase SDK, then initialize
  // ============================================
  function waitForSupabase(callback, attempts) {
    attempts = attempts || 0;
    const sb = window.supabase;
    // The CDN SDK exposes createClient; supabase-client.js reassigns window.supabase
    // to the created client (which has .from). Guard for both states.
    if (sb && typeof sb.from === 'function') {
      callback();
    } else if (attempts < 100) {
      setTimeout(function () { waitForSupabase(callback, attempts + 1); }, 50);
    } else {
      console.error('Supabase client failed to initialize.');
      callback(); // run UI-only features regardless
    }
  }

  async function init() {
    // UI-only features run immediately (no Supabase needed)
    initPrayerForm();
    initJoinForm();

    // Pagination and filter controls are wired once, up front, so a re-query
    // never stacks duplicate listeners.
    wireSermonsLoadMore();
    wireLifegroupControls();

    // Data features wait for the client
    waitForSupabase(function () {
      loadFooter();
      loadHomeSchedules();
      loadHomeSermons();
      loadSermonsList(false);
      loadLeadership();
      loadMinistries();
      loadLocations();
      loadLifegroups(false);
      loadGive();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
