// app.js - IPTV Hub Frontend
// Loads JSON data, renders channel cards, handles filtering and HLS playback

const DATA_BASE = './data/';
const CATEGORY_COLORS = [
  '#e50914','#ff6b35','#f7c59f','#efefd0','#4ecdc4',
  '#45b7d1','#96ceb4','#ffeaa7','#dda0dd','#98d8c8',
  '#ff9ff3','#54a0ff','#5f27cd','#01abc4','#ff9f43',
  '#ee5a24','#009432','#0652dd','#833471','#12cbc4',
];

// State
let allChannels = [];
let allCategories = [];
let allCountries = [];
let allLanguages = [];
let activeFilter = { type: 'all', value: '' };
let searchQuery = '';
let hls = null;
let currentChannel = null;

// DOM refs
const searchEl = document.getElementById('search');
const sidebarSearchEl = document.getElementById('sidebar-search');
const channelsGrid = document.getElementById('channels-grid');
const playerModal = document.getElementById('player-modal');
const playerVideo = document.getElementById('video');
const playerName = document.getElementById('player-name');
const playerMeta = document.getElementById('player-meta');
const playerLogo = document.getElementById('player-logo');
const playerStatus = document.getElementById('player-status');
const streamUrlEl = document.getElementById('stream-url');
const viewTitle = document.getElementById('view-title');
const viewSubtitle = document.getElementById('view-subtitle');
const statShowing = document.getElementById('stat-showing');
const statCountries = document.getElementById('stat-countries');
const countAll = document.getElementById('count-all');

// Init
async function init() {
  try {
    const [channels, categories, countries, languages] = await Promise.all([
      fetchJSON('channels.json'),
      fetchJSON('categories.json'),
      fetchJSON('countries.json'),
      fetchJSON('languages.json'),
    ]);

    allChannels = channels;
    allCategories = categories;
    allCountries = countries;
    allLanguages = languages;

    countAll.textContent = channels.length.toLocaleString();
    statCountries.textContent = countries.length;

    buildSidebar();
    renderChannels();
    setupEvents();
  } catch (err) {
    console.error('Failed to load data:', err);
    channelsGrid.innerHTML = `
      <div id="empty">
        <div class="empty-icon">⚠️</div>
        <p>Failed to load channel data. Run <code>node build.js</code> first.</p>
      </div>`;
  }
}

async function fetchJSON(file) {
  const res = await fetch(DATA_BASE + file);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
  return res.json();
}

// Sidebar
function buildSidebar() {
  // Categories
  const catList = document.getElementById('categories-list');
  catList.innerHTML = allCategories.slice(0, 30).map((cat, i) => `
    <button class="filter-btn" data-type="category" data-value="${escHtml(cat.name)}">
      <span class="cat-badge" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></span>
      ${escHtml(cat.name)}
      <span class="count">${cat.count.toLocaleString()}</span>
    </button>
  `).join('');

  // Countries
  renderCountriesList('');

  // Languages
  const langList = document.getElementById('languages-list');
  langList.innerHTML = allLanguages.slice(0, 40).map(lang => `
    <button class="filter-btn" data-type="language" data-value="${escHtml(lang.name)}">
      <span class="flag">🗣️</span>
      ${escHtml(lang.name)}
      <span class="count">${lang.count.toLocaleString()}</span>
    </button>
  `).join('');
}

function renderCountriesList(filter) {
  const countriesList = document.getElementById('countries-list');
  const filtered = filter
    ? allCountries.filter(c => c.code.toLowerCase().includes(filter.toLowerCase()))
    : allCountries;

  countriesList.innerHTML = filtered.slice(0, 50).map(c => `
    <button class="filter-btn" data-type="country" data-value="${escHtml(c.code)}">
      <span class="flag">${c.flag}</span>
      ${escHtml(c.code)}
      <span class="count">${c.count.toLocaleString()}</span>
    </button>
  `).join('');
}

// Filter & Render
function getFilteredChannels() {
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
      c.country.toLowerCase().includes(q)
    );
  }

  return ch;
}

function renderChannels() {
  const channels = getFilteredChannels();
  statShowing.textContent = channels.length.toLocaleString();

  if (channels.length === 0) {
    channelsGrid.innerHTML = `
      <div id="empty">
        <div class="empty-icon">📭</div>
        <p>No channels found. Try a different filter or search term.</p>
      </div>`;
    return;
  }

  // Group by category when showing all
  const grouped = activeFilter.type === 'all' && !searchQuery
    ? groupBy(channels, 'category')
    : { [getViewLabel()]: channels };

  let html = '';
  for (const [group, items] of Object.entries(grouped)) {
    html += `
      <div class="section-group">
        <div class="section-header">
          <h2>${escHtml(group)}</h2>
          <span class="section-count">${items.length} channels</span>
        </div>
        <div class="channel-section-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:24px;">
          ${items.slice(0, activeFilter.type === 'all' ? 20 : items.length).map(ch => channelCard(ch)).join('')}
          ${items.length > 20 && activeFilter.type === 'all'
            ? `<div style="grid-column:1/-1;text-align:center;padding:8px;"><button class="copy-btn" onclick="window._showCategory('${escHtml(group)}')">Show all ${items.length} channels →</button></div>`
            : ''}
        </div>
      </div>`;
  }

  channelsGrid.innerHTML = html;
  updateTitle(channels.length);
}

function channelCard(ch) {
  const logo = ch.logo
    ? `<img src="${escHtml(ch.logo)}" alt="${escHtml(ch.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'no-logo\\'>📺</span>'" />`
    : `<span class="no-logo">📺</span>`;

  return `
    <div class="channel-card" data-id="${ch.id}" role="button" tabindex="0" aria-label="Play ${escHtml(ch.name)}">
      <div class="card-logo">
        ${logo}
        <div class="play-overlay">▶</div>
      </div>
      <div class="card-info">
        <div class="card-name" title="${escHtml(ch.name)}">${escHtml(ch.name)}</div>
        <div class="card-meta">
          <span class="card-tag country">${ch.flag} ${escHtml(ch.country)}</span>
          ${ch.category ? `<span class="card-tag">${escHtml(ch.category)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function updateTitle(count) {
  const label = getViewLabel();
  viewTitle.childNodes[0].textContent = label + ' ';
  viewSubtitle.textContent = `${count.toLocaleString()} channels`;
}

function getViewLabel() {
  if (activeFilter.type === 'all') return 'All Channels';
  if (activeFilter.type === 'category') return activeFilter.value;
  if (activeFilter.type === 'country') {
    const c = allCountries.find(x => x.code === activeFilter.value);
    return c ? `${c.flag} ${c.code}` : activeFilter.value;
  }
  if (activeFilter.type === 'language') return `🗣️ ${activeFilter.value}`;
  return 'Channels';
}

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key] || 'Uncategorized';
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}

// Show category shortcut
window._showCategory = function(name) {
  setFilter('category', name);
};

function setFilter(type, value) {
  activeFilter = { type, value };

  // Update sidebar active state
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active',
      btn.dataset.type === type && btn.dataset.value === value
    );
  });

  closeSidebar();
  renderChannels();
}

// Player
function openPlayer(channel) {
  currentChannel = channel;

  playerName.textContent = channel.name;
  playerMeta.textContent = `${channel.flag} ${channel.country} • ${channel.language} • ${channel.category}`;

  if (channel.logo) {
    playerLogo.src = channel.logo;
    playerLogo.style.display = '';
  } else {
    playerLogo.style.display = 'none';
  }

  streamUrlEl.value = channel.url;
  playerStatus.style.display = 'flex';
  playerModal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Mark card as playing
  document.querySelectorAll('.channel-card').forEach(card => {
    card.classList.toggle('playing', card.dataset.id == channel.id);
  });

  loadStream(channel.url);
}

function loadStream(url) {
  // Cleanup previous
  if (hls) {
    hls.destroy();
    hls = null;
  }
  playerVideo.src = '';

  if (Hls.isSupported()) {
    hls = new Hls({ enableWorker: true });
    hls.loadSource(url);
    hls.attachMedia(playerVideo);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      playerStatus.style.display = 'none';
      playerVideo.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        playerStatus.innerHTML = '<div class="empty-icon">⚠️</div><p>Stream unavailable or geo-blocked</p>';
        playerStatus.style.display = 'flex';
      }
    });
  } else if (playerVideo.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS (Safari/iOS)
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
  document.body.style.overflow = '';
  document.querySelectorAll('.channel-card.playing').forEach(c => c.classList.remove('playing'));
}

// Toast
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// Mobile sidebar
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// Events
function setupEvents() {
  // Search
  searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value.trim();
    renderChannels();
  });

  // Sidebar country filter
  sidebarSearchEl.addEventListener('input', () => {
    renderCountriesList(sidebarSearchEl.value.trim());
    bindSidebarBtns();
  });

  // Sidebar filter buttons (delegated)
  document.getElementById('sidebar').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (btn) setFilter(btn.dataset.type, btn.dataset.value);
  });

  // Channel cards (delegated)
  channelsGrid.addEventListener('click', e => {
    const card = e.target.closest('.channel-card');
    if (!card) return;
    const id = parseInt(card.dataset.id);
    const ch = allChannels.find(c => c.id === id);
    if (ch) openPlayer(ch);
  });

  channelsGrid.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.channel-card');
      if (card) card.click();
    }
  });

  // Player close
  document.getElementById('player-close').addEventListener('click', closePlayer);
  playerModal.addEventListener('click', e => {
    if (e.target === playerModal) closePlayer();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePlayer();
  });

  // Copy URL
  document.getElementById('copy-url').addEventListener('click', () => {
    navigator.clipboard.writeText(streamUrlEl.value).then(() => showToast('✅ URL copied!'));
  });

  // Open in VLC
  document.getElementById('open-vlc').addEventListener('click', () => {
    window.open(`vlc://${streamUrlEl.value}`, '_blank');
  });

  // Mobile menu
  document.getElementById('menu-toggle').addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
}

function bindSidebarBtns() {
  // Re-bind filter state after sidebar re-render
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active',
      btn.dataset.type === activeFilter.type && btn.dataset.value === activeFilter.value
    );
  });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Boot
init();
