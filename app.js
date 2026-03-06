// app.js - IPTV Hub Frontend
// Mobile-first: loads JSON data, renders channel cards, handles filtering and HLS playback

const DATA_BASE = './data/';

const CATEGORY_COLORS = [
  '#e50914','#ff6b35','#f7c59f','#4ecdc4','#45b7d1',
  '#96ceb4','#ffeaa7','#dda0dd','#98d8c8','#ff9ff3',
  '#54a0ff','#5f27cd','#01abc4','#ff9f43','#ee5a24',
  '#009432','#0652dd','#833471','#12cbc4','#c0392b',
];

// ─── State ──────────────────────────────────────────
let allChannels  = [];
let allCategories = [];
let allCountries  = [];
let allLanguages  = [];
let activeFilter  = { type: 'all', value: '' };
let searchQuery   = '';
let hls           = null;

// ─── DOM refs ───────────────────────────────────────
const $  = id => document.getElementById(id);
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

    const total = channels.length.toLocaleString();
    countAll.textContent      = total;
    statShowing.textContent   = total;
    mStatShowing.textContent  = total;
    statCountries.textContent  = countries.length;
    mStatCountries.textContent = countries.length;

    buildSidebar();
    renderChannels();
    setupEvents();
  } catch (err) {
    console.error('Failed to load data:', err);
    channelsGrid.innerHTML = `
      <div id="empty" role="alert">
        <div class="empty-icon">⚠️</div>
        <p>Failed to load channel data.<br>Run <code>node build.js</code> to generate data files.</p>
      </div>`;
  }
}

async function fetchJSON(file) {
  const res = await fetch(DATA_BASE + file);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
  return res.json();
}

// ─── Sidebar ─────────────────────────────────────────
function buildSidebar() {
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

  // Re-apply active state if needed
  syncActiveButtons();
}

// ─── Filter & Render ──────────────────────────────────
function getFiltered() {
  let ch = allChannels;

  if (activeFilter.type === 'category') {
    ch = ch.filter(c => c.category === activeFilter.value);
  } else if (activeFilter.type === 'country') {
    ch = ch.filter(c => c.country === activeFilter.value);
  } else if (activeFilter.type === 'language') {
    ch = ch.filter(c => c.language === activeFilter.value);
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
  const countStr = channels.length.toLocaleString();

  statShowing.textContent  = countStr;
  mStatShowing.textContent = countStr;

  if (channels.length === 0) {
    channelsGrid.innerHTML = `
      <div id="empty">
        <div class="empty-icon">📭</div>
        <p>No channels found.<br>Try a different filter or search term.</p>
      </div>`;
    updateTitle(0);
    return;
  }

  // Group by category for "All Channels" view; flat list for filtered views
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
}

function channelCard(ch) {
  const logo = ch.logo
    ? `<img src="${esc(ch.logo)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'no-logo\\' aria-hidden=\\'true\\'>📺</span>'" />`
    : `<span class="no-logo" aria-hidden="true">📺</span>`;

  return `
    <article
      class="channel-card"
      data-id="${ch.id}"
      role="listitem button"
      tabindex="0"
      aria-label="Play ${esc(ch.name)}"
    >
      <div class="card-logo">
        ${logo}
        <div class="play-overlay" aria-hidden="true">▶</div>
      </div>
      <div class="card-info">
        <div class="card-name" title="${esc(ch.name)}">${esc(ch.name)}</div>
        <div class="card-meta">
          <span class="card-tag country" aria-label="${esc(ch.countryName || ch.country)}">${ch.flag} ${esc(ch.country)}</span>
          ${ch.category && ch.category !== 'Uncategorized'
            ? `<span class="card-tag">${esc(ch.category)}</span>`
            : ''}
        </div>
      </div>
    </article>`;
}

function updateTitle(count) {
  const label = getViewLabel();
  // Replace first text node only (keep the #view-subtitle span)
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
    const k = item[key] || 'Uncategorized';
    (map[k] = map[k] || []).push(item);
  }
  return map;
}

// Exposed for show-more buttons rendered in innerHTML
window._showCategory = function(name) { setFilter('category', name); };

function setFilter(type, value) {
  activeFilter = { type, value };
  syncActiveButtons();
  closeSidebar();
  renderChannels();
}

function syncActiveButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const active = btn.dataset.type === activeFilter.type && btn.dataset.value === activeFilter.value;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

// ─── Player ───────────────────────────────────────────
function openPlayer(channel) {
  playerName.textContent = channel.name;
  playerMeta.textContent = `${channel.flag} ${channel.countryName || channel.country} • ${channel.language} • ${channel.category}`;

  if (channel.logo) {
    playerLogo.src = channel.logo;
    playerLogo.style.display = '';
  } else {
    playerLogo.style.display = 'none';
  }

  streamUrlEl.value = channel.url;
  playerStatus.style.display = 'flex';
  playerModal.classList.add('open');
  playerModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Mark playing card
  document.querySelectorAll('.channel-card').forEach(card => {
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
        playerStatus.innerHTML = '<div class="empty-icon">⚠️</div><p>Stream unavailable or geo-blocked</p>';
        playerStatus.style.display = 'flex';
      }
    });
  } else if (playerVideo.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    playerVideo.src = url;
    playerVideo.play().catch(() => {});
    playerVideo.addEventListener('loadedmetadata', () => {
      playerStatus.style.display = 'none';
    }, { once: true });
  } else {
    playerStatus.innerHTML = '<div class="empty-icon">⚠️</div><p>HLS not supported in this browser</p>';
  }
}

function closePlayer() {
  if (hls) { hls.destroy(); hls = null; }
  playerVideo.pause();
  playerVideo.src = '';
  playerModal.classList.remove('open');
  playerModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  document.querySelectorAll('.channel-card.playing').forEach(c => c.classList.remove('playing'));
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

// ─── Events ───────────────────────────────────────────
function setupEvents() {
  // Main search
  searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value.trim();
    renderChannels();
  });

  // Sidebar country filter input
  sidebarSearchEl.addEventListener('input', () => {
    renderCountriesList(sidebarSearchEl.value.trim());
  });

  // Sidebar filter button clicks (delegated)
  $('sidebar').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    setFilter(btn.dataset.type, btn.dataset.value);
  });

  // Channel card clicks (delegated on grid)
  channelsGrid.addEventListener('click', e => {
    const card = e.target.closest('.channel-card');
    if (!card) return;
    const ch = allChannels.find(c => c.id === +card.dataset.id);
    if (ch) openPlayer(ch);
  });

  // Keyboard: Enter/Space activates card
  channelsGrid.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const card = e.target.closest('.channel-card');
      if (card) card.click();
    }
  });

  // Player controls
  $('player-close').addEventListener('click', closePlayer);
  playerModal.addEventListener('click', e => { if (e.target === playerModal) closePlayer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayer(); });

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

  // Mobile menu toggle
  $('menu-toggle').addEventListener('click', openSidebar);
  $('sidebar-close').addEventListener('click', closeSidebar);
  $('sidebar-overlay').addEventListener('click', closeSidebar);

  // Swipe-left to close sidebar on mobile
  let touchStartX = 0;
  $('sidebar').addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });
  $('sidebar').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx < -60) closeSidebar(); // swipe left
  }, { passive: true });
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

// ─── Boot ─────────────────────────────────────────────
init();
