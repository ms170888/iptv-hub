// app.js — IPTV Hub Frontend v2
// Mobile-first: loads JSON data, renders channel cards, handles filtering and HLS playback

const DATA_BASE = './data/';

const CATEGORY_COLORS = [
  '#e50914','#ff6b35','#f7c59f','#4ecdc4','#45b7d1',
  '#96ceb4','#ffeaa7','#dda0dd','#98d8c8','#ff9ff3',
  '#54a0ff','#5f27cd','#01abc4','#ff9f43','#ee5a24',
  '#009432','#0652dd','#833471','#12cbc4','#c0392b',
];

// ─── State ───────────────────────────────────────────
let allChannels   = [];
let allCategories = [];
let allCountries  = [];
let allLanguages  = [];
let allQualities  = [];
let allMovies     = [];
let allAdult      = [];

let activeSection       = 'live';   // 'live' | 'sports' | 'movies' | 'adult'
let activeFilter        = { type: 'all', value: '' };
let activeQualityFilter = '';       // '' | '4K' | '1080p' | '720p' | 'Unknown'
let searchQuery         = '';
let hls                 = null;
let adultVerified       = false;

// Cast state
let castAvailable = false;
let castSession   = null;

// ─── DOM refs ────────────────────────────────────────
const $ = id => document.getElementById(id);

const searchEl        = $('search');
const sidebarSearchEl = $('sidebar-search');
const channelsGrid    = $('channels-grid');
const playerModal     = $('player-modal');
const playerVideo     = $('video');
const playerName      = $('player-name');
const playerMeta      = $('player-meta');
const playerLogo      = $('player-logo');
const playerStatus    = $('player-status');
const streamUrlEl     = $('stream-url');
const viewTitle       = $('view-title');
const viewSubtitle    = $('view-subtitle');
const statShowing     = $('stat-showing');
const statCountries   = $('stat-countries');
const mStatShowing    = $('m-stat-showing');
const mStatCountries  = $('m-stat-countries');
const countAll        = $('count-all');

// ─── Init ────────────────────────────────────────────
async function init() {
  try {
    showGridLoading();

    const [channels, categories, countries, languages] = await Promise.all([
      fetchJSON('channels.json'),
      fetchJSON('categories.json'),
      fetchJSON('countries.json'),
      fetchJSON('languages.json'),
    ]);

    allChannels   = channels;
    allCategories = categories;
    allCountries  = countries;
    allLanguages  = languages;

    // Try movies.json and qualities.json (may not exist yet)
    try { allMovies    = await fetchJSON('movies.json');    } catch { allMovies = []; }
    try { allQualities = await fetchJSON('qualities.json'); } catch { allQualities = []; }

    // Update stat counters
    updateStats();

    buildSidebar();
    renderSection();
    setupEvents();
    initPipButton();

  } catch (err) {
    console.error('Failed to load data:', err);
    channelsGrid.innerHTML = `
      <div class="empty-state" role="alert">
        <span class="empty-icon">⚠️</span>
        <p>Failed to load channel data.<br>Run <code>node build.js</code> to generate data files.</p>
      </div>`;
  }
}

async function fetchJSON(file) {
  const res = await fetch(DATA_BASE + file);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
  return res.json();
}

function showGridLoading() {
  channelsGrid.innerHTML = `
    <div class="section-loading" role="status">
      <div class="loader" aria-hidden="true"></div>
      <p>Loading channels...</p>
    </div>`;
}

function updateStats() {
  const total = allChannels.length.toLocaleString();
  countAll.textContent       = total;
  statShowing.textContent    = total;
  mStatShowing.textContent   = total;
  statCountries.textContent  = allCountries.length;
  mStatCountries.textContent = allCountries.length;
}

function updateChannelCountHeader(showing, total) {
  const showingEl = $('stat-showing');
  const mShowingEl = $('m-stat-showing');
  if (showing === total) {
    if (showingEl) showingEl.textContent = total.toLocaleString();
    if (mShowingEl) mShowingEl.textContent = total.toLocaleString();
  } else {
    if (showingEl) showingEl.textContent = `${showing.toLocaleString()} of ${total.toLocaleString()}`;
    if (mShowingEl) mShowingEl.textContent = `${showing.toLocaleString()} of ${total.toLocaleString()}`;
  }
}

// ─── Sidebar ─────────────────────────────────────────
function buildSidebar() {
  // Quality filter
  const qualList = $('qualities-list');
  if (qualList && allQualities.length > 0) {
    const QUAL_ICONS = { '4K': '🟣', '1080p': '🔵', '720p': '🟢', 'Unknown': '⚪' };
    qualList.innerHTML = allQualities.map(q => `
      <button class="filter-btn" data-type="quality" data-value="${esc(q.value)}" role="listitem" aria-pressed="false">
        <span class="flag" aria-hidden="true">${QUAL_ICONS[q.value] || '⚪'}</span>
        <span class="label">${esc(q.label)}</span>
        <span class="count">${q.count.toLocaleString()}</span>
      </button>
    `).join('');
  }

  // Categories
  const catList = $('categories-list');
  catList.innerHTML = allCategories.slice(0, 35).map((cat, i) => `
    <button class="filter-btn" data-type="category" data-value="${esc(cat.name)}" role="listitem" aria-pressed="false">
      <span class="cat-badge" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}" aria-hidden="true"></span>
      <span class="label">${esc(cat.name)}</span>
      <span class="count">${cat.count.toLocaleString()}</span>
    </button>
  `).join('');

  renderCountriesList('');

  // Languages
  const langList = $('languages-list');
  langList.innerHTML = allLanguages.slice(0, 40).map(lang => `
    <button class="filter-btn" data-type="language" data-value="${esc(lang.name)}" role="listitem" aria-pressed="false">
      <span class="flag" aria-hidden="true">🗣️</span>
      <span class="label">${esc(lang.name)}</span>
      <span class="count">${lang.count.toLocaleString()}</span>
    </button>
  `).join('');
}

function renderCountriesList(filter) {
  const el = $('countries-list');
  const q  = filter.toLowerCase();
  const filtered = q
    ? allCountries.filter(c =>
        c.code.toLowerCase().includes(q) ||
        (c.name && c.name.toLowerCase().includes(q))
      )
    : allCountries;

  el.innerHTML = filtered.slice(0, 60).map(c => `
    <button class="filter-btn" data-type="country" data-value="${esc(c.code)}" role="listitem" aria-pressed="false">
      <span class="flag" aria-hidden="true">${c.flag}</span>
      <span class="label">${esc(c.name || c.code)}</span>
      <span class="count">${c.count.toLocaleString()}</span>
    </button>
  `).join('');

  syncActiveButtons();
}

// ─── Section Routing ─────────────────────────────────
function switchSection(section) {
  if (section === 'adult') {
    // Check session-based age verification
    if (!adultVerified && !sessionStorage.getItem('iptv_adult_ok')) {
      showAgeGate();
      return;
    }
    adultVerified = true;
  }

  activeSection       = section;
  searchQuery         = '';
  searchEl.value      = '';
  activeFilter        = { type: 'all', value: '' };
  activeQualityFilter = '';

  // Update nav tab active state
  document.querySelectorAll('.nav-tab').forEach(t => {
    const active = t.dataset.section === section;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  // Sidebar only relevant for Live TV + Sports
  const sidebar = $('sidebar');
  const hasSidebar = section === 'live' || section === 'sports';
  sidebar.classList.toggle('sidebar-hidden-section', !hasSidebar);

  // Load adult data if needed and not loaded yet
  if (section === 'adult' && allAdult.length === 0) {
    fetchJSON('adult.json')
      .then(data => { allAdult = data; renderSection(); })
      .catch(() => { allAdult = []; renderSection(); });
    channelsGrid.innerHTML = `
      <div class="section-loading" role="status">
        <div class="loader" aria-hidden="true"></div>
        <p>Loading adult content...</p>
      </div>`;
    return;
  }

  renderSection();
}

function renderSection() {
  syncActiveButtons();

  if (activeSection === 'live')    { renderChannels(); return; }
  if (activeSection === 'sports')  { renderSports();   return; }
  if (activeSection === 'movies')  { renderMovies();   return; }
  if (activeSection === 'adult')   { renderAdult();    return; }
}

// ─── LIVE TV ─────────────────────────────────────────
function getFiltered() {
  let ch = allChannels;

  if (activeFilter.type === 'category') {
    ch = ch.filter(c => c.category === activeFilter.value);
  } else if (activeFilter.type === 'country') {
    ch = ch.filter(c => c.country === activeFilter.value);
  } else if (activeFilter.type === 'language') {
    ch = ch.filter(c => c.language === activeFilter.value);
  }

  if (activeQualityFilter) {
    ch = ch.filter(c => c.resolution === activeQualityFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    ch = ch.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q) ||
      (c.countryName && c.countryName.toLowerCase().includes(q))
    );
  }

  return ch;
}

function renderChannels() {
  const channels = getFiltered();
  updateCountDisplay(channels.length);
  updateChannelCountHeader(channels.length, allChannels.length);

  if (channels.length === 0) {
    channelsGrid.innerHTML = emptyState('No channels found matching your search.');
    updateTitle(0);
    return;
  }

  const grouped = (activeFilter.type === 'all' && !searchQuery)
    ? groupBy(channels, 'category')
    : { [getViewLabel()]: channels };

  let html = '';
  for (const [group, items] of Object.entries(grouped)) {
    const preview = (activeFilter.type === 'all' && !searchQuery) ? 16 : items.length;
    const hasMore = items.length > preview;

    html += `
      <div class="section-group">
        <div class="section-header">
          <h2>${esc(group)}</h2>
          <span class="section-count">${items.length.toLocaleString()}</span>
        </div>
        <div class="channel-section-grid">
          ${items.slice(0, preview).map(ch => channelCard(ch)).join('')}
          ${hasMore ? `
            <div class="show-more-row" style="grid-column:1/-1;text-align:center;padding:8px 0;">
              <button class="show-more-btn" onclick="window._showCategory('${esc(group)}')">
                Show all ${items.length.toLocaleString()} channels →
              </button>
            </div>` : ''}
        </div>
      </div>`;
  }

  channelsGrid.innerHTML = html;
  updateTitle(channels.length);
  syncActiveButtons();
}

function resolutionBadge(ch) {
  if (!ch.resolution) return '';
  const map = {
    '4K':     { cls: 'badge-res-4k',  label: '4K'  },
    '1080p':  { cls: 'badge-res-fhd', label: 'FHD' },
    '720p':   { cls: 'badge-res-hd',  label: 'HD'  },
    'Unknown':{ cls: 'badge-res-unk', label: '?'   },
  };
  const b = map[ch.resolution];
  if (!b) return '';
  return `<span class="badge-res ${b.cls}" title="${esc(ch.resolution)}">${b.label}</span>`;
}

function channelCard(ch) {
  const logo = ch.logo
    ? `<img src="${esc(ch.logo)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'no-logo\\' aria-hidden=\\'true\\'>📺</span>'" />`
    : `<span class="no-logo" aria-hidden="true">📺</span>`;

  const premiumBadge = ch.premium ? `<span class="badge-premium">⭐ Premium</span>` : '';
  const resBadge     = resolutionBadge(ch);

  return `
    <article
      class="channel-card${ch.premium ? ' premium' : ''}"
      data-id="${ch.id}"
      data-source="live"
      role="listitem button"
      tabindex="0"
      aria-label="Play ${esc(ch.name)}"
    >
      <div class="card-logo">
        ${logo}
        <div class="play-overlay" aria-hidden="true">▶</div>
        ${resBadge ? `<div class="card-res-badge">${resBadge}</div>` : ''}
      </div>
      <div class="card-info">
        <div class="card-name" title="${esc(ch.name)}">${esc(ch.name)}</div>
        <div class="card-meta">
          ${premiumBadge}
          <span class="card-tag country" aria-label="${esc(ch.countryName || ch.country)}">${ch.flag} ${esc(ch.country)}</span>
          ${ch.category && ch.category !== 'General'
            ? `<span class="card-tag">${esc(ch.category)}</span>`
            : ''}
        </div>
      </div>
    </article>`;
}

// ─── SPORTS ──────────────────────────────────────────
function renderSports() {
  const q = searchQuery.toLowerCase();

  let sports = allChannels.filter(ch => {
    const cat = (ch.category || '').toLowerCase();
    return cat === 'sports' || cat.includes('sport');
  });

  if (q) {
    sports = sports.filter(ch =>
      ch.name.toLowerCase().includes(q) ||
      (ch.countryName && ch.countryName.toLowerCase().includes(q))
    );
  }

  updateCountDisplay(sports.length);
  updateTitleDirect('🏆 Sports', sports.length);

  if (sports.length === 0) {
    channelsGrid.innerHTML = emptyState('No sports channels found.');
    return;
  }

  // Premium first, then sort alphabetically
  const premium = sports.filter(ch => ch.premium).sort((a, b) => a.name.localeCompare(b.name));
  const regular = sports.filter(ch => !ch.premium).sort((a, b) => a.name.localeCompare(b.name));

  let html = '<div class="channel-section-grid" style="grid-column:1/-1">';

  if (premium.length > 0) {
    html += `<div class="sport-group-header">⭐ Premium Sports (${premium.length})</div>`;
    html += premium.map(ch => channelCard(ch)).join('');
  }

  if (regular.length > 0) {
    html += `<div class="sport-group-header">All Sports (${regular.length})</div>`;
    html += regular.map(ch => channelCard(ch)).join('');
  }

  html += '</div>';
  channelsGrid.innerHTML = html;
}

// ─── MOVIES & VOD ────────────────────────────────────
function renderMovies() {
  const q = searchQuery.toLowerCase();

  let movies = allMovies.length > 0
    ? allMovies
    : allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        return ['movies', 'movie', 'vod', 'cinema', 'film', 'films', 'series'].some(k => cat.includes(k));
      });

  if (q) {
    movies = movies.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.countryName && m.countryName.toLowerCase().includes(q))
    );
  }

  updateCountDisplay(movies.length);
  updateTitleDirect('🎬 Movies & VOD', movies.length);

  if (movies.length === 0) {
    channelsGrid.innerHTML = emptyState('No movies or VOD content found.');
    return;
  }

  channelsGrid.innerHTML = `
    <div id="movies-grid" style="grid-column:1/-1">
      ${movies.slice(0, 200).map(m => movieCard(m)).join('')}
    </div>`;
}

function movieCard(m) {
  const poster = m.logo
    ? `<img src="${esc(m.logo)}" alt="${esc(m.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'no-poster\\'><span>🎬</span><span>No Image</span></div>'" />`
    : `<div class="no-poster"><span>🎬</span><span>${esc(m.category || 'VOD')}</span></div>`;

  const premiumBadge = m.premium ? `<span class="badge-premium">⭐ Premium</span>` : '';

  return `
    <article
      class="movie-card${m.premium ? ' premium' : ''}"
      data-id="${m.id}"
      data-source="movies"
      role="listitem button"
      tabindex="0"
      aria-label="Play ${esc(m.name)}"
    >
      <div class="movie-poster">
        ${poster}
        <div class="play-overlay" aria-hidden="true">▶</div>
      </div>
      <div class="movie-info">
        <div class="movie-title" title="${esc(m.name)}">${esc(m.name)}</div>
        <div class="movie-meta">
          ${premiumBadge}
          <span class="card-tag country">${m.flag} ${esc(m.country)}</span>
        </div>
      </div>
    </article>`;
}

// ─── ADULT ───────────────────────────────────────────
function renderAdult() {
  const q = searchQuery.toLowerCase();

  let adult = allAdult;
  if (q) {
    adult = adult.filter(ch =>
      ch.name.toLowerCase().includes(q) ||
      (ch.countryName && ch.countryName.toLowerCase().includes(q))
    );
  }

  updateCountDisplay(adult.length);
  updateTitleDirect('🔞 Adult', adult.length);

  if (adult.length === 0) {
    channelsGrid.innerHTML = emptyState('No adult channels available right now. Check back after the next build.');
    return;
  }

  channelsGrid.innerHTML = `
    <div class="channel-section-grid" style="grid-column:1/-1">
      ${adult.slice(0, 300).map(ch => channelCard(ch)).join('')}
    </div>`;
}

// ─── Age Gate ─────────────────────────────────────────
function showAgeGate() {
  const modal = $('age-gate-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeAgeGate() {
  const modal = $('age-gate-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ─── Player ───────────────────────────────────────────
function openPlayer(channel) {
  playerName.textContent = channel.name;
  playerMeta.textContent = `${channel.flag || '🌐'} ${channel.countryName || channel.country || ''} • ${channel.language || ''} • ${channel.category || ''}`;

  if (channel.logo) {
    playerLogo.src = channel.logo;
    playerLogo.style.display = '';
  } else {
    playerLogo.style.display = 'none';
  }

  streamUrlEl.value = channel.url;
  playerStatus.style.display = 'flex';
  playerStatus.innerHTML = '<div class="loader" aria-hidden="true"></div><p>Loading stream...</p>';
  playerModal.classList.add('open');
  playerModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Mark playing card
  document.querySelectorAll('.channel-card, .movie-card').forEach(card => {
    card.classList.toggle('playing', +card.dataset.id === channel.id);
  });

  loadStream(channel.url);
}

function loadStream(url) {
  if (hls) { hls.destroy(); hls = null; }
  playerVideo.src = '';

  if (typeof Hls !== 'undefined' && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(url);
    hls.attachMedia(playerVideo);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      playerStatus.style.display = 'none';
      playerVideo.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        playerStatus.innerHTML = '<div class="empty-icon" style="font-size:32px">⚠️</div><p>Stream unavailable or geo-blocked</p>';
        playerStatus.style.display = 'flex';
      }
    });
  } else if (playerVideo.canPlayType('application/vnd.apple.mpegurl')) {
    playerVideo.src = url;
    playerVideo.play().catch(() => {});
    playerVideo.addEventListener('loadedmetadata', () => {
      playerStatus.style.display = 'none';
    }, { once: true });
  } else {
    playerStatus.innerHTML = '<div class="empty-icon" style="font-size:32px">⚠️</div><p>HLS not supported in this browser</p>';
  }
}

function closePlayer() {
  if (hls) { hls.destroy(); hls = null; }
  playerVideo.pause();
  playerVideo.src = '';
  playerModal.classList.remove('open');
  playerModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  document.querySelectorAll('.channel-card.playing, .movie-card.playing').forEach(c => c.classList.remove('playing'));
}

// ─── Sidebar open/close ──────────────────────────────
function openSidebar() {
  const sidebar  = $('sidebar');
  const overlay  = $('sidebar-overlay');
  const menuBtn  = $('menu-toggle');
  sidebar.classList.add('open');
  sidebar.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  menuBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  const sidebar  = $('sidebar');
  const overlay  = $('sidebar-overlay');
  const menuBtn  = $('menu-toggle');
  sidebar.classList.remove('open');
  sidebar.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'false');
  menuBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

// ─── Toast ────────────────────────────────────────────
function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── UI helpers ──────────────────────────────────────
function emptyState(msg) {
  return `
    <div class="empty-state" role="status" style="grid-column:1/-1">
      <span class="empty-icon">📭</span>
      <p>${msg}</p>
    </div>`;
}

function updateCountDisplay(count) {
  const str = count.toLocaleString();
  statShowing.textContent  = str;
  mStatShowing.textContent = str;
}

function updateTitle(count) {
  const label = getViewLabel();
  viewTitle.firstChild.textContent = label + ' ';
  viewSubtitle.textContent = count === 0 ? '' : `${count.toLocaleString()} channels`;
}

function updateTitleDirect(label, count) {
  viewTitle.firstChild.textContent = label + ' ';
  viewSubtitle.textContent = count === 0 ? '' : `${count.toLocaleString()} channels`;
}

function getViewLabel() {
  if (activeFilter.type === 'all')      return 'All Channels';
  if (activeFilter.type === 'category') return activeFilter.value;
  if (activeFilter.type === 'language') return `🗣️ ${activeFilter.value}`;
  if (activeFilter.type === 'country') {
    const c = allCountries.find(x => x.code === activeFilter.value);
    return c ? `${c.flag} ${c.name || c.code}` : activeFilter.value;
  }
  return 'Channels';
}

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key] || 'General';
    (map[k] = map[k] || []).push(item);
  }
  return map;
}

// Exposed for show-more buttons rendered in innerHTML
window._showCategory = function(name) {
  setFilter('category', name);
};

function setFilter(type, value) {
  if (type === 'quality') {
    activeQualityFilter = value;
    // don't touch activeFilter
  } else {
    activeFilter = { type, value };
    if (type !== 'all') activeQualityFilter = '';
  }
  syncActiveButtons();
  closeSidebar();
  renderSection();
}

function syncActiveButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    let active;
    if (btn.dataset.type === 'quality') {
      active = btn.dataset.value === activeQualityFilter;
    } else {
      active = btn.dataset.type === activeFilter.type && btn.dataset.value === activeFilter.value;
    }
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

// ─── Events ───────────────────────────────────────────
function setupEvents() {
  // Nav tab clicks
  $('nav-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.nav-tab');
    if (!tab) return;
    switchSection(tab.dataset.section);
  });

  // Main search
  searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value.trim();
    renderSection();
  });

  // Sidebar country filter
  sidebarSearchEl.addEventListener('input', () => {
    renderCountriesList(sidebarSearchEl.value.trim());
  });

  // Sidebar filter button clicks (delegated)
  $('sidebar').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    setFilter(btn.dataset.type, btn.dataset.value);
  });

  // Channel card / movie card clicks (delegated)
  channelsGrid.addEventListener('click', e => {
    const card = e.target.closest('.channel-card, .movie-card');
    if (!card) return;
    handleCardClick(card);
  });

  // Keyboard: Enter/Space activates card
  channelsGrid.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const card = e.target.closest('.channel-card, .movie-card');
      if (card) handleCardClick(card);
    }
  });

  // Player controls
  $('player-close').addEventListener('click', closePlayer);
  playerModal.addEventListener('click', e => { if (e.target === playerModal) closePlayer(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closePlayer();
      closeAgeGate();
      closeSidebar();
    }
  });

  // Copy stream URL
  $('copy-url').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(streamUrlEl.value);
      showToast('✅ URL copied!');
    } catch {
      streamUrlEl.select();
      document.execCommand('copy');
      showToast('✅ URL copied!');
    }
  });

  // Open in VLC
  $('open-vlc').addEventListener('click', () => {
    window.open(`vlc://${streamUrlEl.value}`, '_blank');
  });

  // Cast button
  $('cast-btn').addEventListener('click', () => {
    const url = streamUrlEl.value;
    if (!url) return;
    startCasting(url);
  });

  // Stop casting
  $('stop-cast-btn').addEventListener('click', stopCasting);

  // Picture-in-Picture
  $('pip-btn').addEventListener('click', async () => {
    if (!document.pictureInPictureEnabled) {
      showToast('PiP not supported in this browser');
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        if (playerVideo.readyState === 0) {
          showToast('Start playback first to use PiP');
          return;
        }
        await playerVideo.requestPictureInPicture();
      }
    } catch (e) {
      showToast('PiP failed: ' + e.message);
    }
  });

  // External player (Android intent URL)
  $('ext-btn').addEventListener('click', () => {
    const url = streamUrlEl.value;
    if (!url) return;
    const encoded = encodeURIComponent(url);
    const intentUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=${url.startsWith('https') ? 'https' : 'http'};type=application/x-mpegURL;end`;
    window.open(intentUrl, '_blank');
    showToast('Opening in external player...');
  });

  // Mobile menu toggle
  $('menu-toggle').addEventListener('click', openSidebar);
  $('sidebar-close').addEventListener('click', closeSidebar);
  $('sidebar-overlay').addEventListener('click', closeSidebar);

  // Swipe-left to close sidebar
  let touchStartX = 0;
  $('sidebar').addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });
  $('sidebar').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx < -60) closeSidebar();
  }, { passive: true });

  // Age gate buttons
  $('age-gate-yes').addEventListener('click', () => {
    sessionStorage.setItem('iptv_adult_ok', '1');
    adultVerified = true;
    closeAgeGate();
    switchSection('adult');
  });

  $('age-gate-no').addEventListener('click', () => {
    closeAgeGate();
    // Switch back to live tab
    switchSection('live');
    document.querySelectorAll('.nav-tab').forEach(t => {
      const active = t.dataset.section === 'live';
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  });
}

function handleCardClick(card) {
  const id  = +card.dataset.id;
  const src = card.dataset.source;

  let channel = null;
  if (src === 'movies') {
    channel = allMovies.find(c => c.id === id);
  } else if (src === 'adult') {
    channel = allAdult.find(c => c.id === id);
  } else {
    // live and sports both use allChannels
    channel = allChannels.find(c => c.id === id);
    if (!channel) channel = allMovies.find(c => c.id === id);
    if (!channel) channel = allAdult.find(c => c.id === id);
  }

  if (channel) openPlayer(channel);
}

// ─── Utility ──────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Cast (Chromecast) ────────────────────────────────

// Cast SDK calls this when the Cast framework is ready
window['__onGCastApiAvailable'] = function(isAvailable) {
  if (isAvailable) initCast();
  else updateCastButtonUnavailable();
};

function initCast() {
  try {
    const castContext = cast.framework.CastContext.getInstance();
    castContext.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    castContext.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      onCastSessionStateChanged
    );
    castAvailable = true;
    updateCastButtonAvailable();
  } catch (e) {
    console.warn('Cast init failed:', e);
    updateCastButtonUnavailable();
  }
}

function onCastSessionStateChanged() {
  castSession = cast.framework.CastContext.getInstance().getCurrentSession();
  updateCastUI();
}

function updateCastButtonAvailable() {
  const btn = $('cast-btn');
  if (!btn) return;
  btn.classList.remove('cast-unavailable', 'cast-active');
  btn.classList.add('cast-available');
  btn.title = 'Cast to Chromecast';
}

function updateCastButtonUnavailable() {
  const btn = $('cast-btn');
  if (!btn) return;
  btn.classList.remove('cast-available', 'cast-active');
  btn.classList.add('cast-unavailable');
  btn.title = 'Chromecast not available — use Chrome browser';
}

function updateCastUI() {
  const castStatusEl  = $('cast-status');
  const castBtn       = $('cast-btn');
  const deviceNameEl  = $('cast-device-name');
  if (!castStatusEl || !castBtn) return;

  const session = cast.framework.CastContext.getInstance().getCurrentSession();
  if (session) {
    const name = session.getCastDevice().friendlyName || 'TV';
    deviceNameEl.textContent = `Casting to ${name}`;
    castStatusEl.classList.add('active');
    castBtn.classList.add('cast-active');
    castBtn.classList.remove('cast-available');
    // Pause local playback — Cast device handles it
    if (!playerVideo.paused) playerVideo.pause();
  } else {
    castStatusEl.classList.remove('active');
    castBtn.classList.remove('cast-active');
    castBtn.classList.add('cast-available');
    castSession = null;
  }
}

async function startCasting(url) {
  if (!castAvailable) {
    showToast('Chromecast requires Chrome browser with Cast support');
    return;
  }
  try {
    const castContext = cast.framework.CastContext.getInstance();
    if (!castContext.getCurrentSession()) {
      await castContext.requestSession();
    }
    const session = castContext.getCurrentSession();
    if (!session) return;

    const mediaInfo = new chrome.cast.media.MediaInfo(url, 'application/x-mpegURL');
    mediaInfo.streamType = chrome.cast.media.StreamType.LIVE;
    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    await session.loadMedia(request);
    showToast('📺 Casting started!');
  } catch (e) {
    if (e && e.code !== chrome.cast.ErrorCode.CANCEL) {
      console.error('Cast error:', e);
      showToast('Cast failed: ' + (e.description || e.code || 'Unknown'));
    }
  }
}

function stopCasting() {
  if (!castAvailable) return;
  try {
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    if (session) {
      session.endSession(true);
      showToast('Casting stopped');
    }
  } catch (e) {
    console.warn('Stop cast error:', e);
  }
}

// ─── PiP ─────────────────────────────────────────────
function initPipButton() {
  const btn = $('pip-btn');
  if (!btn) return;
  if (!document.pictureInPictureEnabled) {
    btn.classList.add('pip-unavailable');
    btn.title = 'Picture-in-Picture not supported in this browser';
  } else {
    btn.title = 'Picture-in-Picture';
  }
}

// ─── Boot ─────────────────────────────────────────────
init();
