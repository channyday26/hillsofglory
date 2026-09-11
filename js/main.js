// ============================================
// Hills of Glory — Public Site Scripts
// ============================================

(function () {
  'use strict';

  const html = document.documentElement;

  // ============================================
  // Lucide Icons
  // The markup uses <i data-lucide="..."> placeholders that are converted to
  // inline SVGs by lucide.createIcons(). This must run after any static or
  // dynamically-injected icon markup is in the DOM. It's called unconditionally
  // on load (independent of the theme toggle) and again after async content
  // renderers insert rows containing icons.
  // ============================================
  function initIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  // ============================================
  // Theme Toggle Switch (respects system + localStorage)
  // ============================================
  const themeToggle = document.getElementById('themeToggle');

  function getPreferredTheme() {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return 'light';
  }

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (themeToggle) {
      themeToggle.checked = theme === 'dark';
      const label = themeToggle.closest('.theme-switch');
      if (label) label.setAttribute('data-theme-active', theme);
    }
    // Re-render icons so the sun/moon icons reflect the new theme.
    initIcons();
  }

  applyTheme(getPreferredTheme());
  // Guarantee static icons (hero, nav, footer, badges) render even though
  // applyTheme only swaps the theme toggle's own icon.
  initIcons();

  if (themeToggle) {
    themeToggle.addEventListener('change', function () {
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
  // Mobile Menu — floating FAB + compact floating modal
  // ============================================
  const floatingMenuBtn = document.getElementById('floatingMenuBtn');
  const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  const navbar = document.querySelector('.navbar');

  let savedScrollY = 0;

  function openOverlay() {
    if (mobileMenuOverlay) mobileMenuOverlay.classList.add('is-open');
    if (floatingMenuBtn) {
      floatingMenuBtn.setAttribute('aria-expanded', 'true');
      floatingMenuBtn.setAttribute('aria-label', 'Close navigation menu');
    }
    // Lock the viewport WITHOUT repositioning the body. Fixing the body
    // (`position: fixed` + negative top, or `body { overflow: hidden }`) turns
    // it into a non-scrolling box, which breaks `position: sticky` on the
    // navbar: the header stops sticking and slides up out of view — the visible
    // "scroll jump" on open. Overflow set on the root element propagates to the
    // viewport and leaves sticky intact. Touch scrolling is already impossible
    // while the modal is open because the overlay covers the viewport with
    // `touch-action: none`.
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    window.scrollTo({ top: savedScrollY, left: 0, behavior: 'instant' });
    // Move focus to the first link after the entrance animation starts so the
    // grow choreography plays without an abrupt focus jump.
    var firstLink = mobileMenuOverlay && mobileMenuOverlay.querySelector('.mobile-menu-overlay__link');
    window.setTimeout(function () { if (firstLink) firstLink.focus(); }, 90);
  }

  function closeOverlay() {
    if (mobileMenuOverlay) mobileMenuOverlay.classList.remove('is-open');
    if (floatingMenuBtn) {
      floatingMenuBtn.setAttribute('aria-expanded', 'false');
      floatingMenuBtn.setAttribute('aria-label', 'Open navigation menu');
    }
    document.documentElement.style.overflow = '';
    document.documentElement.style.overscrollBehavior = '';
    // The body was never moved, so the offset is untouched; re-pin it instantly
    // (`html` has `scroll-behavior: smooth`, so a plain scrollTo would animate).
    window.scrollTo({ top: savedScrollY, left: 0, behavior: 'instant' });
    if (floatingMenuBtn) floatingMenuBtn.focus();
  }

  if (floatingMenuBtn && mobileMenuOverlay) {
    floatingMenuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (mobileMenuOverlay.classList.contains('is-open')) {
        closeOverlay();
      } else {
        openOverlay();
      }
    });
  }

  // Clicking the dimmed backdrop (or anywhere outside the card/FAB) closes it.
  document.addEventListener('click', function (e) {
    if (!mobileMenuOverlay || !mobileMenuOverlay.classList.contains('is-open')) return;
    var panel = mobileMenuOverlay.querySelector('.mobile-menu-overlay__panel');
    var clickedInsidePanel = panel && panel.contains(e.target);
    var clickedOnFab = floatingMenuBtn && floatingMenuBtn.contains(e.target);
    if (!clickedInsidePanel && !clickedOnFab) {
      closeOverlay();
    }
  });

  // Close when tapping a navigation link, pressing Escape, or tabbing past the
  // dialog (simple focus trap that wraps between the navigation links).
  if (mobileMenuOverlay) {
    mobileMenuOverlay.querySelectorAll('.mobile-menu-overlay__link').forEach(function (link) {
      link.addEventListener('click', closeOverlay);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (!mobileMenuOverlay || !mobileMenuOverlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') {
      closeOverlay();
      return;
    }
    if (e.key === 'Tab') {
      var focusables = mobileMenuOverlay.querySelectorAll('.mobile-menu-overlay__link');
      if (!focusables.length || !mobileMenuOverlay.contains(document.activeElement)) {
        e.preventDefault();
        if (focusables[0]) focusables[0].focus();
        return;
      }
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // ============================================
  // Navbar scroll state
  // The bar is fully transparent at the top of the page; once the user scrolls
  // past a small threshold it transitions into the compact glassmorphic state
  // (`.is-scrolled`), handled by CSS with spring easings.
  // ============================================
  if (navbar) {
    let ticking = false;

    function syncNavbarState() {
      navbar.classList.toggle('is-scrolled', window.scrollY > 48);
    }

    // Mobile only: lock the navbar container's height to the header's actual
    // rendered height as the bar compacts on scroll. The inline px height is
    // animated by the container's `height` transition; on desktop we clear it
    // and let the CSS `height: 100%` fill rule take over.
    const navbarContainer = document.querySelector('.navbar__container');
    const mobileNavbarQuery = window.matchMedia('(max-width: 960px)');

    function syncContainerHeight() {
      if (!navbarContainer) return;
      if (mobileNavbarQuery.matches) {
        navbarContainer.style.height =
          Math.round(navbar.getBoundingClientRect().height) + 'px';
      } else {
        navbarContainer.style.height = '';
      }
    }

    // Sync immediately so a reload at mid-scroll doesn't leave the bar stuck in
    // its transparent top-of-page state, and so the container matches the
    // header's height on first paint.
    syncNavbarState();
    syncContainerHeight();

    mobileNavbarQuery.addEventListener('change', syncContainerHeight);
    window.addEventListener('resize', syncContainerHeight);

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          syncNavbarState();
          syncContainerHeight();
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
         const iconClass = type === 'error' ? 'circle-alert' : 'circle-check';
    toast.innerHTML = '<i data-lucide="' + iconClass + '" class="toast__icon"></i><span>' + esc(message) + '</span>';
    container.appendChild(toast);
    initIcons();
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
         { url: s.facebook_url, label: 'Facebook', icon: 'facebook' },
        { url: s.instagram_url, label: 'Instagram', icon: 'instagram' },
        { url: s.youtube_url, label: 'YouTube', icon: 'youtube' },
        { url: s.x_url, label: 'X', icon: 'twitter' },
      ].filter(function (item) { return item.url; });

      if (socials.length) {
        footerSocial.innerHTML = socials.map(function (item) {
          return '<a href="' + escAttr(item.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escAttr(item.label) + '">' +
            '<i data-lucide="' + item.icon + '"></i></a>';
        }).join('');
      }

      // The social pills were re-injected as <i data-lucide> placeholders;
      // convert them to inline SVGs or they render as empty, invisible boxes.
      initIcons();
    }
  }

  // ============================================
  // Home — Service Schedules (main church only)
  // ============================================
  async function loadHomeSchedules() {
    const grid = document.getElementById('homeScheduleGrid');
    if (!grid) return;

    // The homepage schedule features the main church only: resolve the Main
    // location id first and scope the query with it. Falling back to "show all"
    // keeps the section populated while a Main location row is still missing.
    const mainLocations = await fetchTable('locations', function (q) {
      return q.eq('location_type', 'Main').eq('status', 'Active').limit(1);
    });
    const mainId = (mainLocations[0] || {}).id;

    const schedules = await fetchTable('service_schedules', function (q) {
      let query = mainId ? q.eq('location_id', mainId) : q;
      return query.order('sort_order', { ascending: true });
    });
    if (!schedules.length) return; // keep static fallback markup

    // Stream rows with their CMS-uploaded thumbnail beside the day label.
    grid.innerHTML = schedules.map(function (s) {
      const thumb = s.image_url
        ? '<img class="schedule-row__thumb" src="' + escAttr(s.image_url) + '" alt="" loading="lazy" />'
        : '';
      return '<li class="schedule-row">' +
        '<span class="schedule-row__day">' + thumb +
        '<span class="schedule-row__day-text">' + esc(s.day || '') + '</span></span>' +
        '<span class="schedule-row__service">' + esc(s.service_name || 'Service') + '</span>' +
        '<time class="schedule-row__time" datetime="' + escAttr(s.time || '') + '">' + esc(s.time || '') + '</time>' +
        '<a href="locations.html" class="schedule-row__link" aria-label="View service details">' +
        '<i data-lucide="arrow-up-right"></i></a>' +
        '</li>';
    }).join('');

    // Spotlight headline follows the first service when data is present.
    const dayEl = document.getElementById('homeScheduleDay');
    const timeEl = document.getElementById('homeScheduleTime');
    const first = schedules[0];
    if (dayEl && first.day) dayEl.textContent = first.day;
    if (timeEl && first.time) {
      timeEl.textContent = first.time;
      timeEl.setAttribute('datetime', first.time);
    }

    // CMS-managed backdrop for the spotlight card (settings -> home_spotlight_image).
    const settings = await fetchTable('church_settings');
    const spotlight = document.getElementById('homeSpotlightImage');
    if (spotlight && settings.length && settings[0].home_spotlight_image) {
      spotlight.src = settings[0].home_spotlight_image;
    }

    initIcons();
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
        ? '<button type="button" class="btn btn--primary btn--sm sermon-play" data-youtube="' + escAttr(videoId) + '"><i data-lucide="play"></i> Watch</button>'
        : (s.youtube_url ? '<a href="' + escAttr(s.youtube_url) + '" target="_blank" rel="noopener" class="btn btn--primary btn--sm"><i data-lucide="play"></i> Watch</a>' : '')) +
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
  // Home — Latest Sermons (limit 3; single sermon spans the grid)
  // ============================================
  function renderFeaturedSermon(s) {
    const videoId = extractYouTubeId(s.youtube_url);
    const thumb = videoId
      ? 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg'
      : 'images/preach.png';
    const watchBtn = videoId
      ? '<button type="button" class="btn btn--primary sermon-play" data-youtube="' + escAttr(videoId) + '"><i data-lucide="play"></i> Watch Now</button>'
      : (s.youtube_url
          ? '<a href="' + escAttr(s.youtube_url) + '" target="_blank" rel="noopener" class="btn btn--primary"><i data-lucide="play"></i> Watch Now</a>'
          : '');
    return '<div class="card card--featured hover-lift animate-fade-up" data-youtube="' + escAttr(videoId || '') + '">' +
      '<div class="card__media">' +
      '<img src="' + escAttr(thumb) + '" alt="' + escAttr(s.title || 'Sermon') + '" loading="lazy" />' +
      '</div>' +
      '<div class="card__body">' +
      '<span class="card__tag">' + esc(formatDate(s.date) || 'Latest Message') + '</span>' +
      '<h3 class="card__title">' + esc(s.title || '') + '</h3>' +
      '<p class="card__text">' + esc(s.speaker || 'Guest Speaker') + (s.description ? ' &bull; ' + esc(s.description) : '') + '</p>' +
      '<div class="card__footer">' +
      watchBtn +
      '<a href="sermons.html" class="btn btn--outline"><i data-lucide="library"></i> Browse All Sermons</a>' +
      '</div>' +
      '</div></div>';
  }

  async function loadHomeSermons() {
    const grid = document.getElementById('homeSermonsGrid');
    if (!grid) return;

    const sermons = await fetchTable('sermons', function (q) {
      return q.order('date', { ascending: false, nullsFirst: false }).limit(3);
    });
    if (!sermons.length) return; // keep static fallback

    grid.classList.toggle('grid-single', sermons.length === 1);
    if (sermons.length === 1) {
      grid.innerHTML = renderFeaturedSermon(sermons[0]);
    } else {
      grid.innerHTML = sermons.map(renderSermonCard).join('');
    }
    wireSermonPlayButtons();
    initIcons();
  }

  // ============================================
  // Pagination helpers
  // ============================================
  // Pages are fetched with .range(), asking for one row more than we intend to
  // show. If that extra row comes back there is another page, so we never need
  // a separate count query.
  const PAGE_SIZE = 9;

  // Page size is per-pager so distinct sections (sermons at 9, lifegroups at 3)
  // can page at their own rhythm without a shared constant.
  function newPager(pageSize) {
    return { offset: 0, exhausted: false, loading: false, pageSize: pageSize || PAGE_SIZE };
  }

  function pageRange(pager) {
    return [pager.offset, pager.offset + (pager.pageSize || PAGE_SIZE)];
  }

  // Splits a fetched batch into the rows to render, and records whether more
  // remain. Returns the rows to render.
  function takePage(pager, rows) {
    const size = pager.pageSize || PAGE_SIZE;
    pager.exhausted = rows.length <= size;
    const page = rows.slice(0, size);
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
      label.textContent = state === 'loading' ? 'Loading\u2026' : btn.dataset.label || 'See More Sermons';
    }
  }

  // ============================================
  // Sermons Page — search, filters, and paginated list
  // ============================================
  const SERMONS_PAGE_SIZE = 3;
  const sermonsPager = newPager(SERMONS_PAGE_SIZE);
  let sermonsSearchQuery = '';
  let sermonsDateFilter = 'all';
  let sermonsSpeakerFilter = 'all';
  let sermonsAllData = [];
  let sermonsAvailableSpeakers = [];
  let sermonsSearchTimer = 0;
  let sermonsRequestId = 0;

  const SERMON_DATE_RANGES = {
    'this-week': { start: -7, end: 0 },
    'this-month': { start: -30, end: 0 },
    'last-3-months': { start: -90, end: 0 },
    'this-year': { start: -365, end: 0 }
  };

  function filterSermonsByDate(data, filter) {
    if (filter === 'all') return data;
    const range = SERMON_DATE_RANGES[filter];
    if (!range) return data;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() + range.start);
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + range.end);
    return data.filter(function (s) {
      if (!s.date) return false;
      const d = new Date(s.date);
      return d >= startDate && d <= endDate;
    });
  }

  function filterSermonsBySpeaker(data, speaker) {
    if (speaker === 'all') return data;
    return data.filter(function (s) {
      return s.speaker && s.speaker.toLowerCase() === speaker.toLowerCase();
    });
  }

  function searchSermons(data, query) {
    if (!query.trim()) return data;
    const term = query.toLowerCase().trim();
    return data.filter(function (s) {
      return (s.title && s.title.toLowerCase().includes(term)) ||
             (s.speaker && s.speaker.toLowerCase().includes(term)) ||
             (s.description && s.description.toLowerCase().includes(term));
    });
  }

  async function loadSermonsAll() {
    return await fetchTable('sermons', function (q) {
      return q.order('date', { ascending: false, nullsFirst: false });
    });
  }

  function renderSermonsSpeakers(speakers) {
    const selectDesktop = document.getElementById('sermonSpeakerFilter');
    const selectMobile = document.getElementById('sermonSpeakerFilterMobile');
    const current = selectDesktop ? selectDesktop.value : 'all';
    const speakerOptions = speakers.map(function (s) {
      return '<option value="' + escAttr(s) + '">' + esc(s) + '</option>';
    }).join('');

    if (selectDesktop) {
      selectDesktop.innerHTML = '<option value="all">All Speakers</option>' + speakerOptions;
      if (speakers.includes(current)) selectDesktop.value = current;
    }

    if (selectMobile) {
      selectMobile.innerHTML = '<option value="all">All Speakers</option>' + speakerOptions;
      if (speakers.includes(current)) selectMobile.value = current;
    }
  }

  function extractSpeakers(data) {
    const speakers = new Set();
    data.forEach(function (s) {
      if (s.speaker && s.speaker.trim()) {
        speakers.add(s.speaker.trim());
      }
    });
    return Array.from(speakers).sort();
  }

  function updateSermonsResultsInfo(count, total) {
    const container = document.getElementById('sermonsResultsInfo');
    const countEl = document.getElementById('sermonsResultsCount');
    if (!container || !countEl) return;
    if (sermonsSearchQuery || sermonsDateFilter !== 'all' || sermonsSpeakerFilter !== 'all') {
      container.hidden = false;
      countEl.textContent = count + (count === total ? '' : ' of ' + total) + ' sermon' + (count === 1 ? '' : 's');
    } else {
      container.hidden = true;
    }
  }

  function showSermonsEmpty(show) {
    const empty = document.getElementById('sermonsEmptyState');
    const grid = document.getElementById('sermonsListGrid');
    const loadMore = document.getElementById('sermonsLoadMore');
    if (empty) empty.hidden = !show;
    if (grid) grid.hidden = show;
    if (loadMore) loadMore.hidden = true;
  }

  async function loadSermonsList(append) {
    const grid = document.getElementById('sermonsListGrid');
    if (!grid) return;
    if (append && (sermonsPager.loading || sermonsPager.exhausted)) return;

    const btn = document.getElementById('sermonsLoadMore');
    const requestId = ++sermonsRequestId;

    sermonsPager.loading = true;
    setLoadMoreState(btn, 'loading');

    if (!sermonsAllData.length) {
      sermonsAllData = await loadSermonsAll();
      if (!sermonsAllData.length) {
        grid.innerHTML = '<p class="card__text">No sermons posted yet. Check back soon.</p>';
        sermonsPager.loading = false;
        setLoadMoreState(btn, 'exhausted');
        return;
      }
      sermonsAvailableSpeakers = extractSpeakers(sermonsAllData);
      renderSermonsSpeakers(sermonsAvailableSpeakers);
    }

    let filtered = filterSermonsByDate(sermonsAllData, sermonsDateFilter);
    filtered = filterSermonsBySpeaker(filtered, sermonsSpeakerFilter);
    filtered = searchSermons(filtered, sermonsSearchQuery);

    if (requestId !== sermonsRequestId) return;

    updateSermonsResultsInfo(filtered.length, sermonsAllData.length);

    if (!filtered.length) {
      grid.innerHTML = '';
      showSermonsEmpty(true);
      sermonsPager.loading = false;
      setLoadMoreState(btn, 'exhausted');
      return;
    }

    showSermonsEmpty(false);

    let pageData = filtered.slice(sermonsPager.offset, sermonsPager.offset + sermonsPager.pageSize);
    sermonsPager.exhausted = sermonsPager.offset + pageData.length >= filtered.length;
    sermonsPager.offset += pageData.length;

    if (!append) grid.innerHTML = '';

    if (pageData.length) {
      grid.insertAdjacentHTML('beforeend', pageData.map(renderSermonCard).join(''));
      wireSermonPlayButtons();
    }

    initIcons();
    sermonsPager.loading = false;
    setLoadMoreState(btn, sermonsPager.exhausted ? 'exhausted' : 'ready');
  }

  function wireSermonsControls() {
    const search = document.getElementById('sermonSearch');
    const clear = document.getElementById('sermonSearchClear');
    const dateFilter = document.getElementById('sermonDateFilter');
    const speakerFilter = document.getElementById('sermonSpeakerFilter');
    const dateFilterMobile = document.getElementById('sermonDateFilterMobile');
    const speakerFilterMobile = document.getElementById('sermonSpeakerFilterMobile');
    const resetBtn = document.getElementById('sermonFiltersReset');
    const resetBtnMobile = document.getElementById('sermonFilterResetMobile');
    const emptyReset = document.getElementById('sermonsEmptyReset');
    const filterToggle = document.getElementById('sermonFilterToggle');
    const filterDrawer = document.getElementById('sermonFiltersDrawer');
    const filterClose = document.getElementById('sermonFilterClose');
    const filterApply = document.getElementById('sermonFilterApply');
    const drawerOverlay = document.querySelector('.sermons-drawer__overlay');

    function openFilterDrawer() {
      if (!filterDrawer) return;
      filterDrawer.hidden = false;
      document.body.style.overflow = 'hidden';
      if (filterToggle) filterToggle.setAttribute('aria-expanded', 'true');
    }

    function closeFilterDrawer() {
      if (!filterDrawer) return;
      filterDrawer.hidden = true;
      document.body.style.overflow = '';
      if (filterToggle) filterToggle.setAttribute('aria-expanded', 'false');
    }

    function syncMobileFilters() {
      if (dateFilterMobile) dateFilterMobile.value = sermonsDateFilter;
      if (speakerFilterMobile) speakerFilterMobile.value = sermonsSpeakerFilter;
    }

    function syncDesktopFilters() {
      if (dateFilter) dateFilter.value = sermonsDateFilter;
      if (speakerFilter) speakerFilter.value = sermonsSpeakerFilter;
    }

    function resetFilters() {
      sermonsSearchQuery = '';
      sermonsDateFilter = 'all';
      sermonsSpeakerFilter = 'all';
      sermonsPager.offset = 0;
      sermonsPager.exhausted = false;
      if (search) search.value = '';
      if (clear) clear.hidden = true;
      syncDesktopFilters();
      syncMobileFilters();
      closeFilterDrawer();
      loadSermonsList(false);
    }

    if (filterToggle) {
      filterToggle.addEventListener('click', openFilterDrawer);
    }

    if (filterClose) {
      filterClose.addEventListener('click', closeFilterDrawer);
    }

    if (drawerOverlay) {
      drawerOverlay.addEventListener('click', closeFilterDrawer);
    }

    if (filterApply) {
      filterApply.addEventListener('click', function () {
        if (dateFilterMobile) sermonsDateFilter = dateFilterMobile.value;
        if (speakerFilterMobile) sermonsSpeakerFilter = speakerFilterMobile.value;
        sermonsPager.offset = 0;
        sermonsPager.exhausted = false;
        syncDesktopFilters();
        closeFilterDrawer();
        loadSermonsList(false);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && filterDrawer && !filterDrawer.hidden) {
        closeFilterDrawer();
      }
    });

    if (search) {
      search.addEventListener('input', function () {
        clearTimeout(sermonsSearchTimer);
        sermonsSearchTimer = setTimeout(function () {
          const term = search.value.trim();
          if (term !== sermonsSearchQuery) {
            sermonsSearchQuery = term;
            sermonsPager.offset = 0;
            sermonsPager.exhausted = false;
            if (clear) clear.hidden = !term;
            loadSermonsList(false);
          }
        }, 200);
      });
    }

    if (clear) {
      clear.addEventListener('click', function () {
        if (search) {
          search.value = '';
          search.focus();
        }
        sermonsSearchQuery = '';
        sermonsPager.offset = 0;
        sermonsPager.exhausted = false;
        clear.hidden = true;
        loadSermonsList(false);
      });
    }

    if (dateFilter) {
      dateFilter.addEventListener('change', function () {
        if (this.value !== sermonsDateFilter) {
          sermonsDateFilter = this.value;
          if (dateFilterMobile) dateFilterMobile.value = this.value;
          sermonsPager.offset = 0;
          sermonsPager.exhausted = false;
          loadSermonsList(false);
        }
      });
    }

    if (speakerFilter) {
      speakerFilter.addEventListener('change', function () {
        if (this.value !== sermonsSpeakerFilter) {
          sermonsSpeakerFilter = this.value;
          if (speakerFilterMobile) speakerFilterMobile.value = this.value;
          sermonsPager.offset = 0;
          sermonsPager.exhausted = false;
          loadSermonsList(false);
        }
      });
    }

    if (dateFilterMobile) {
      dateFilterMobile.addEventListener('change', function () {
        if (this.value !== sermonsDateFilter) {
          sermonsDateFilter = this.value;
          if (dateFilter) dateFilter.value = this.value;
        }
      });
    }

    if (speakerFilterMobile) {
      speakerFilterMobile.addEventListener('change', function () {
        if (this.value !== sermonsSpeakerFilter) {
          sermonsSpeakerFilter = this.value;
          if (speakerFilter) speakerFilter.value = this.value;
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', resetFilters);
    }

    if (resetBtnMobile) {
      resetBtnMobile.addEventListener('click', function () {
        sermonsSearchQuery = '';
        sermonsDateFilter = 'all';
        sermonsSpeakerFilter = 'all';
        sermonsPager.offset = 0;
        sermonsPager.exhausted = false;
        if (search) search.value = '';
        if (clear) clear.hidden = true;
        syncDesktopFilters();
        syncMobileFilters();
        loadSermonsList(false);
      });
    }

    if (emptyReset) {
      emptyReset.addEventListener('click', resetFilters);
    }

    const btn = document.getElementById('sermonsLoadMore');
    if (btn) {
      btn.addEventListener('click', function () {
        loadSermonsList(true);
      });
    }
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
        '<button type="button" class="video-modal__close" aria-label="Close video"><i data-lucide="x"></i></button>' +
        '<div class="video-modal__player"></div>' +
        '</div>';
      document.body.appendChild(modal);
      initIcons();

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
        grid.innerHTML = '<p class="ministry-card__text">No ministries in this category yet.</p>';
        return;
      }
      grid.innerHTML = items.map(function (m) {
        return '<article class="ministry-card animate-fade-up">' +
          (m.image_url
            ? '<div class="ministry-card__media"><img src="' + escAttr(m.image_url) + '" alt="' + escAttr(m.name || '') + '" loading="lazy" /></div>'
            : '') +
          '<h3 class="ministry-card__title">' + esc(m.name || '') + '</h3>' +
          '<p class="ministry-card__text">' + esc(m.description || '') + '</p>' +
          (m.target_school ? '<span class="ministry-card__school"><i data-lucide="graduation-cap"></i> ' + esc(m.target_school) + '</span>' : '') +
          (m.contact_person ? '<span class="ministry-card__meta"><i data-lucide="user"></i> ' + esc(m.contact_person) + '</span>' : '') +
          '</article>';
      }).join('');
    });

    if (joinSelect && all.length) {
      joinSelect.innerHTML = '<option value="">Select a ministry</option>' +
        all.map(function (m) {
          return '<option value="' + escAttr(m.name || '') + '">' + esc(m.name || '') + '</option>';
        }).join('');
    }

    initIcons();
  }

  // ============================================
  // Locations — Main church showcase + outreach cards
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

    function mainCard(loc) {
      return '<div class="main-church__showcase animate-fade-up stagger-1">' +
        '<div class="main-church__media-wrap">' +
        '<span class="main-church__ghost" aria-hidden="true"></span>' +
        '<figure class="main-church__arch">' +
        '<img src="images/hills_building.png" alt="' + escAttr(loc.name || 'Hills of Glory Main Church') + '" loading="lazy" />' +
        '<span class="main-church__sticker"><i data-lucide="map-pin"></i> Main Church</span>' +
        '</figure>' +
        '</div>' +
        '<div class="main-church__panel">' +
        '<span class="main-church__eyebrow"><i data-lucide="landmark"></i> Our Central Home</span>' +
        '<h3 class="main-church__name">' + esc(loc.name || 'Hills of Glory Main Church') + '</h3>' +
        '<p class="main-church__address"><i data-lucide="map-pin"></i> ' + esc(loc.address || 'Location details coming soon.') + '</p>' +
        '<span class="main-church__rule" aria-hidden="true"></span>' +
        '<div class="main-church__map">' +
        (loc.google_maps_embed_link
          ? '<iframe class="main-church__iframe" src="' + escAttr(loc.google_maps_embed_link) + '" title="Map to ' + escAttr(loc.name || 'Hills of Glory Main Church') + '" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>'
          : '<div class="main-church__map-fallback"><i data-lucide="map"></i><span>Interactive map coming soon.</span></div>') +
        '</div>' +
        '<span class="main-church__map-caption"><i data-lucide="navigation"></i> Tap the map for directions to our campus.</span>' +
        '</div>' +
        '</div>';
    }

    function outreachCard(loc, i) {
      const locSchedules = schedulesByLocation[loc.id] || [];
      const scheduleBody = locSchedules.length
        ? locSchedules.map(function (s) {
            return '<div class="outreach-column__row"><span>' + esc(s.day) + '</span><strong>' + esc(s.service_name || 'Service') + '</strong><time>' + esc(s.time || '') + '</time></div>';
          }).join('')
        : '<p class="card__text">Service times coming soon.</p>';

      const rank = i + 1;
      const idx = rank < 10 ? '0' + rank : String(rank);

      return '<article class="outreach-column animate-fade-up">' +
        '<div class="outreach-column__head">' +
        '<span class="outreach-column__index" aria-hidden="true">' + idx + '</span>' +
        '<h3 class="outreach-column__name">' + esc(loc.name || '') + '</h3>' +
        '</div>' +
        '<span class="outreach-column__chip"><i data-lucide="tent"></i> Outreach</span>' +
        '<p class="outreach-column__address"><i data-lucide="map-pin"></i> ' + esc(loc.address || '') + '</p>' +
        '<div class="location-accordion">' +
        '<button type="button" class="location-accordion__trigger" aria-expanded="false">' +
        '<span><i data-lucide="clock"></i> Service Schedule</span><i data-lucide="chevron-down"></i></button>' +
        '<div class="location-accordion__body" hidden>' + scheduleBody + '</div>' +
        '</div>' +
        (loc.google_maps_embed_link
          ? '<div class="outreach-column__footer"><a href="' + escAttr(loc.google_maps_embed_link) + '" target="_blank" rel="noopener" class="btn btn--outline btn--sm"><i data-lucide="map"></i> View Map</a></div>'
          : '') +
        '</article>';
    }

    if (mainCampusCard) {
      const main = locations.find(function (l) { return l.location_type === 'Main'; });
      if (main) {
        mainCampusCard.innerHTML = mainCard(main);
      } else {
        mainCampusCard.innerHTML = '<p class="card__text">Main church details coming soon.</p>';
      }
    }

    if (outreachGrid) {
      const outreaches = locations.filter(function (l) { return l.location_type !== 'Main'; });
      if (!outreaches.length) {
        outreachGrid.innerHTML = '<p class="card__text">No outreach locations listed yet.</p>';
      } else {
        outreachGrid.innerHTML = outreaches.map(function (loc, i) {
          return outreachCard(loc, i);
        }).join('');
      }
    }

    wireAccordions();
    initIcons();
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
  // Lifegroups — paginated, with type filters + search
  // ============================================
  // The filter and the search term are both applied in the query rather than by
  // hiding rendered cards. With pagination the two have to agree: hiding cards
  // client-side would show "3 of 9" results on a page that claims there are more.
  // The directory opens with the first three groups and pages by three; a live
  // search switches to a single unfiltered-by-pagination view of every match.
  const lifegroupsPager = newPager(3);
  let lifegroupsFilter = 'all';
  let lifegroupsQuery = '';
  // Debounced so a fast typist does not fire one query per keystroke.
  let lifegroupsSearchTimer = 0;
  // Every load takes a ticket. A reply whose ticket is no longer the latest is
  // stale — a filter/search change or a newer page has superseded it — and is
  // dropped rather than rendered over the top of fresher results.
  let lifegroupsRequestId = 0;
  // Search mode returns every match in a single pass (no pagination). A firm
  // cap keeps the directory response bounded even for a very large church.
  const LIFEGROUPS_SEARCH_LIMIT = 50;

  // Public-facing label/icon per group_type. Anything unseen (legacy values,
  // hand-edited rows) falls back to a humanised label with a neutral icon.
  const LIFEGROUP_TYPES = {
    men:      { label: "Men's Group",    icon: 'person-standing' },
    women:    { label: "Women's Group",  icon: 'person-standing' },
    couple:   { label: 'Couples Group',  icon: 'heart' },
    youth:    { label: 'Youth Group',    icon: 'smile' },
    children: { label: 'Children Group', icon: 'baby' }
  };

  function lifegroupMeta(type) {
    if (LIFEGROUP_TYPES[type]) return LIFEGROUP_TYPES[type];
    return {
      label: type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Lifegroup',
      icon: 'users'
    };
  }

  // Escape LIKE wildcards so a search for "100%" matches it literally rather
  // than every group whose name starts "100". Backslash is Postgres's default
  // LIKE escape, so it must be escaped first. Commas and parentheses are also
  // stripped: they are structural in PostgREST's `or(...)` filter string and a
  // stray `)` in user input would corrupt the combined filter.
  function escapeLike(term) {
    const sanitised = term.replace(/[,()"]/g, '');
    return sanitised.replace(/[\\%_]/g, '\\$&');
  }

  function renderLifegroupCard(g) {
    const meta = lifegroupMeta(g.group_type);
    return '<article class="card hover-lift animate-fade-up lifegroup-card">' +
      '<span class="lifegroup-card__type"><i data-lucide="' + meta.icon + '" aria-hidden="true"></i> ' + esc(meta.label) + '</span>' +
      '<h3 class="lifegroup-card__title">' + esc(g.group_name || 'Lifegroup') + '</h3>' +
      (g.leader_name ? '<p class="lifegroup-card__meta"><i data-lucide="user" aria-hidden="true"></i>' + esc(g.leader_name) + '</p>' : '') +
      '<p class="lifegroup-card__meta"><i data-lucide="map-pin" aria-hidden="true"></i>' + esc(g.location || 'Location to be announced') + '</p>' +
      '<p class="lifegroup-card__meta"><i data-lucide="clock" aria-hidden="true"></i>' + esc(g.meeting_time || 'Time to be announced') + '</p>' +
      (g.contact_info ? '<div class="lifegroup-card__footer"><span class="lifegroup-card__meta"><i data-lucide="phone" aria-hidden="true"></i>' + esc(g.contact_info) + '</span></div>' : '') +
      '</article>';
  }

  async function loadLifegroups(append) {
    const grid = document.getElementById('lifegroupsGrid');
    if (!grid) return;
    // Only "Load more" is rate-limited. A filter/search change must never be
    // swallowed because an earlier request happens to still be open.
    if (append && (lifegroupsPager.loading || lifegroupsPager.exhausted)) return;

    const btn = document.getElementById('lifegroupsLoadMore');
    const requestId = ++lifegroupsRequestId;
    const activeFilter = lifegroupsFilter;
    const term = lifegroupsQuery;
    lifegroupsPager.loading = true;
    setLoadMoreState(btn, 'loading');

    const range = pageRange(lifegroupsPager);
    // Search mode ignores the pager: every match is returned in one pass so the
    // typed query immediately shows the full matching set without "Load more".
    const batch = await fetchTable('lifegroups', function (q) {
      let query = q.eq('is_active', true);
      if (activeFilter !== 'all') query = query.eq('group_type', activeFilter);
      if (term) {
        const like = escapeLike(term);
        query = query.or('group_name.ilike.%' + like + '%,leader_name.ilike.%' + like + '%,location.ilike.%' + like + '%');
        return query.order('sort_order', { ascending: true }).limit(LIFEGROUPS_SEARCH_LIMIT);
      }
      return query.order('sort_order', { ascending: true }).range(range[0], range[1]);
    });

    // Superseded — the newer request owns the grid and will clear `loading`.
    if (requestId !== lifegroupsRequestId) return;

    lifegroupsPager.loading = false;
    const groups = term
      ? batch.slice(0, LIFEGROUPS_SEARCH_LIMIT)
      : takePage(lifegroupsPager, batch);
    if (term) {
      // A search is a single, complete view of the matches — never paginated.
      lifegroupsPager.exhausted = true;
      lifegroupsPager.offset = 0;
    }

    if (!append) grid.innerHTML = '';

    if (!groups.length && !append) {
      grid.innerHTML = term
        ? '<p class="card__text">No groups match your search. Try a different keyword or clear the filters.</p>'
        : (activeFilter === 'all'
            ? '<p class="card__text">No Lifegroups listed yet. Check back soon.</p>'
            : '<p class="card__text">No ' + esc(lifegroupMeta(activeFilter).label) + ' scheduled yet. Check back soon or contact the church office.</p>');
    } else if (groups.length) {
      grid.insertAdjacentHTML('beforeend', groups.map(renderLifegroupCard).join(''));
    }

    initIcons();
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

    // Live search: debounced keystrokes reset the pager and re-query, keeping
    // the search term in sync with what the paginated query actually fetches.
    const search = document.getElementById('lifegroupSearch');
    const clear = document.getElementById('lifegroupSearchClear');
    if (search) {
      search.addEventListener('input', function () {
        const term = search.value.trim();
        clearTimeout(lifegroupsSearchTimer);
        lifegroupsSearchTimer = setTimeout(function () {
          if (term === lifegroupsQuery) return;
          lifegroupsQuery = term;
          lifegroupsPager.offset = 0;
          lifegroupsPager.exhausted = false;
          if (clear) clear.hidden = !term;
          loadLifegroups(false);
        }, 150);
      });
    }

    if (clear) {
      clear.addEventListener('click', function () {
        if (!search) return;
        search.value = '';
        clear.hidden = true;
        lifegroupsQuery = '';
        lifegroupsPager.offset = 0;
        lifegroupsPager.exhausted = false;
        loadLifegroups(false);
        search.focus();
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
  // Special Events — up to two upcoming one-off events
  // ============================================
  // Rendered from special_events. A single result switches the grid to the
  // full-width variant; zero results keeps the static "coming soon" fallback.

  const EVENT_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

  // Format a DATE (yyyy-mm-dd) as "March 20, 2026" without Date object parsing,
  // which would shift the day off-by-one in negative-offset timezones.
  function formatEventDate(dateStr) {
    const parts = String(dateStr || '').split('T')[0].split('-');
    if (parts.length !== 3) return String(dateStr || '');
    const month = parseInt(parts[1], 10) - 1;
    if (!EVENT_MONTHS[month]) return String(dateStr);
    return EVENT_MONTHS[month] + ' ' + parseInt(parts[2], 10) + ', ' + parseInt(parts[0], 10);
  }

  function renderSpecialEvent(ev) {
    return '<article class="special-event hover-lift animate-fade-up">' +
      (ev.image_url
        ? '<div class="special-event__media"><img src="' + escAttr(ev.image_url) +
          '" alt="' + escAttr(ev.title || 'Special event') + '" loading="lazy" /></div>'
        : '') +
      '<div class="special-event__body">' +
        '<div class="special-event__meta">' +
          '<span class="special-event__meta-item"><i data-lucide="calendar" aria-hidden="true"></i>' +
            esc(formatEventDate(ev.event_date)) + '</span>' +
          (ev.event_time
            ? '<span class="special-event__meta-item"><i data-lucide="clock" aria-hidden="true"></i>' +
              esc(ev.event_time) + '</span>'
            : '') +
        '</div>' +
        '<h3 class="special-event__title">' + esc(ev.title || '') + '</h3>' +
        (ev.description ? '<p class="special-event__text">' + esc(ev.description) + '</p>' : '') +
      '</div>' +
    '</article>';
  }

  async function loadSpecialEvents() {
    const grid = document.getElementById('specialEventsGrid');
    if (!grid) return;
    const events = await fetchTable('special_events', function (q) {
      return q.eq('is_active', true).order('event_date', { ascending: true }).limit(2);
    });
    if (!events.length) return; // keep the static "coming soon" fallback

    // A pair splits the row in two; one event (or the empty-state fallback)
    // keeps the full-width single-column layout.
    grid.classList.toggle('special-events__grid--single', events.length !== 2);
    grid.innerHTML = events.map(renderSpecialEvent).join('');
    initIcons();
  }

  // ============================================
  // Home — Monthly Theme (dynamic showcase, hidden unless published)
  // ============================================
  // The section carries the `hidden` attribute in markup. A published row
  // (monthly_theme.is_active = true) fills the stage and reveals it; with no
  // row the attribute is left alone and the section never takes up space.
  function renderMonthlyTheme(t) {
    return '<div class="monthly-theme__media">' +
      (t.image_url
        ? '<img src="' + escAttr(t.image_url) + '" alt="' + escAttr(t.title || 'Monthly Theme') + '" loading="lazy" />'
        : '') +
      '<div class="monthly-theme__wash" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="monthly-theme__panel">' +
      '<span class="monthly-theme__eyebrow"><i data-lucide="sparkles" aria-hidden="true"></i>This Month&#39;s Theme</span>' +
      (t.month_label
        ? '<span class="monthly-theme__month"><i data-lucide="calendar" aria-hidden="true"></i>' + esc(t.month_label) + '</span>'
        : '') +
      (t.title ? '<h2 class="monthly-theme__title">' + esc(t.title) + '</h2>' : '') +
      (t.description ? '<p class="monthly-theme__text">' + esc(t.description) + '</p>' : '') +
      (t.scripture
        ? '<span class="monthly-theme__scripture"><i data-lucide="book-open" aria-hidden="true"></i><span>' + esc(t.scripture) + '</span></span>'
        : '') +
      '</div>';
  }

  async function loadMonthlyTheme() {
    const section = document.getElementById('monthlyThemeSection');
    const slot = document.getElementById('monthlyThemeContent');
    if (!section || !slot) return;

    const themes = await fetchTable('monthly_theme', function (q) {
      return q.eq('is_active', true).limit(1);
    });
    if (!themes.length) return; // no published theme — section stays hidden

    slot.innerHTML = renderMonthlyTheme(themes[0]);
    section.hidden = false;
    initIcons();
  }

  // ============================================
  // Home — "Happening Right Now" live stream
  // ============================================
  // Reveals the live section and the desktop navbar "Live" button only while
  // live_status.is_live is true AND a YouTube URL exists. Setting the stream
  // to ended/inactive in the CMS hides both automatically.
  function renderLiveShowcase(s) {
    const videoId = extractYouTubeId(s.youtube_url);
    const media = videoId
      ? '<div class="live-showcase__video">' +
        '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(videoId) +
        '?autoplay=1&amp;rel=0" title="' + escAttr(s.live_title || 'Live stream') +
        '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>' +
        '</div>'
      : '<div class="live-showcase__cover"><i data-lucide="youtube" aria-hidden="true"></i><span>Watch on YouTube</span></div>';

    return '<div class="live-showcase__media">' + media + '</div>' +
      '<div class="live-showcase__panel">' +
      '<span class="live-showcase__badge"><span class="live-dot" aria-hidden="true"></span> Live Now</span>' +
      (s.live_title ? '<h3 class="live-showcase__title">' + esc(s.live_title) + '</h3>' : '') +
      (s.live_description ? '<p class="live-showcase__text">' + esc(s.live_description) + '</p>' : '') +
      '<div class="live-showcase__actions">' +
      '<a href="' + escAttr(s.youtube_url) + '" target="_blank" rel="noopener nofollow" class="btn btn--secondary">' +
      '<i data-lucide="youtube" aria-hidden="true"></i> Watch on YouTube</a>' +
      '</div>' +
      '</div>';
  }

  async function loadLiveStatus() {
    const section = document.getElementById('liveSection');
    const slot = document.getElementById('liveShowcase');
    const navBtn = document.getElementById('navLiveButton');
    if (!section || !slot) return;

    const rows = await fetchTable('live_status', function (q) {
      return q.limit(1);
    });
    const live = rows[0];
    const isLive = Boolean(live && live.is_live && live.youtube_url);

    // Toggling `hidden` on the section hides it and everything inside it
    // (the [hidden] { display:none } base rule beats all component displays).
    section.hidden = !isLive;
    if (navBtn) navBtn.hidden = !isLive;
    if (!isLive) return;

    slot.innerHTML = renderLiveShowcase(live);
    initIcons();
  }

  // The navbar "Live" entry smooth-scrolls to the visible live section while
  // a stream is up; reduced-motion users get an instant jump instead.
  function wireNavLive() {
    const btn = document.getElementById('navLiveButton');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const section = document.getElementById('liveSection');
      if (!section) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        section.scrollIntoView();
      } else {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
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
    wireNavLive();

    // Pagination and filter controls are wired once, up front, so a re-query
    // never stacks duplicate listeners.
    wireSermonsControls();
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
      loadSpecialEvents();
      loadMonthlyTheme();
      loadLiveStatus();
      loadGive();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
