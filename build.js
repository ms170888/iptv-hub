#!/usr/bin/env node
// build.js — IPTV Hub Builder v3 — HD+ Quality Filtering
// No npm deps — Node 18+ built-in fetch

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, 'data');
const BUILD_START = Date.now();

// ─── Config ──────────────────────────────────────────
const PROBE_TIMEOUT_MS = 8000;
const PROBE_BATCH_SIZE = 50;
const PROBE_ENABLED    = process.env.SKIP_PROBE !== '1';

// Build stats
const buildStats = {
  sourcesScraped:   0,
  totalFound:       0,
  healthPassed:     0,
  hdFilterPassed:   0,
  finalChannels:    0,
  finalMovies:      0,
  finalAdult:       0,
  premiumTagged:    0,
  res4K:      0,
  res1080:    0,
  res720:     0,
  resUnknown: 0,
  probeAlive:        0,
  probeDead:         0,
  probeTimeout:      0,
  probeGeoBlocked:   0,
  probeInvalidFormat: 0,
};

// ─── Base M3U Sources ─────────────────────────────────
const BASE_SOURCES = [
  { url: 'https://iptv-org.github.io/iptv/index.m3u',                             type: 'main',  isAdult: false },
  { url: 'https://iptv-org.github.io/iptv/categories/xxx.m3u',                    type: 'adult', isAdult: true  },
  { url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',   type: 'main',  isAdult: false },
  { url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us.m3u', type: 'main',  isAdult: false },
  { url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/ca.m3u', type: 'main',  isAdult: false },
  { url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/gb.m3u', type: 'main',  isAdult: false },
  { url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/in.m3u', type: 'main',  isAdult: false },
];

const GITHUB_M3U_PATHS = [
  'playlist.m3u8', 'index.m3u', 'iptv.m3u', 'channels.m3u8',
  'channels.m3u', 'list.m3u', 'tv.m3u', 'streams.m3u',
];

const GITHUB_PREMIUM_QUERIES = [
  'iptv 4k m3u',
  'iptv hd premium m3u',
  'iptv sports hd',
  'iptv 1080p m3u8',
  'free iptv hd channels',
];

const GITHUB_ADULT_QUERIES = [
  'iptv adult m3u',
  'iptv xxx m3u',
];

const GITHUB_GENERAL_QUERIES = [
  'iptv m3u playlist',
  'iptv m3u8 sport',
  'free iptv premium',
  'm3u movies vod playlist',
];

// ─── Quality Constants ────────────────────────────────
const PREMIUM_NETWORKS = [
  'hbo', 'espn', 'sky sports', 'sky cinema', 'bt sport', 'dazn', 'fox sports',
  'showtime', 'starz', 'bein', 'tnt', 'usa network', 'premier league',
  'champions league', 'f1 tv', 'canal+', 'cinemax', 'nfl', 'nba', 'mlb', 'nhl',
  'discovery+', 'paramount+', 'peacock', 'disney+', 'hulu', 'fox news', 'msnbc',
  'sportsnet', 'tsn', 'super sport', 'laliga', 'serie a', 'bundesliga',
  'beIN', 'eurosport', 'motogp', 'formula 1', 'formula1',
];

const INTL_BROADCASTERS = [
  'al jazeera', 'france24', 'france 24', 'nhk', 'euronews',
  'bbc ', ' bbc', 'bbc world', 'bbc news', 'cnn', 'cnn international',
  'abc news', 'nbc news', 'cbs news', 'sky news', 'bloomberg',
  'cgtn', 'ard', 'zdf', 'rai news', 'tvp', 'trt world', 'trt ',
  'france tv', 'abc australia', 'cbc', 'itv', 'channel 4', 'channel4',
  'tv5monde', 'arte', 'rfi', 'rts', 'orf ', ' orf', 'srf', 'rtl',
  ' dw', 'dw ', 'dw news',
];

const HD_NAME_KEYWORDS = [
  '4k', 'uhd', 'fhd', ' hd', 'hd ', '-hd', '.hd', '_hd', '(hd)', '[hd]',
  '|hd', 'hd|', '1080', '720', 'high definition', 'ultra hd', '4k ultra', '2160',
];

const SD_EXCLUDE_KEYWORDS = [
  ' sd', '.sd', '-sd', '_sd', '(sd)', '[sd]', '|sd', 'sd|',
  ' lq', '.lq', '-lq', '_lq', '(lq)', '[lq]',
  'low quality', ' low ', 'lowres',
];

// ─── Category normalization ───────────────────────────
const CATEGORY_MAP = {
  sport: 'Sports', sports: 'Sports', football: 'Sports', soccer: 'Sports',
  basketball: 'Sports', cricket: 'Sports', tennis: 'Sports', golf: 'Sports',
  baseball: 'Sports', hockey: 'Sports', rugby: 'Sports', racing: 'Sports',
  fighting: 'Sports', boxing: 'Sports', mma: 'Sports', esports: 'Sports',
  'sport ': 'Sports', athletics: 'Sports', olympic: 'Sports',

  news: 'News', information: 'News', noticias: 'News', 'breaking news': 'News',
  actualite: 'News', nachrichten: 'News', 'notícias': 'News',

  entertainment: 'Entertainment', variety: 'Entertainment', lifestyle: 'Entertainment',
  comedy: 'Entertainment', drama: 'Entertainment', thriller: 'Entertainment',

  movies: 'Movies', movie: 'Movies', cinema: 'Movies', film: 'Movies', films: 'Movies',
  vod: 'Movies', series: 'Movies', 'tv shows': 'Movies', tvshows: 'Movies',
  tv_shows: 'Movies', peliculas: 'Movies', filmes: 'Movies',

  music: 'Music', musica: 'Music', 'música': 'Music', muzika: 'Music', musik: 'Music',

  kids: 'Kids', children: 'Kids', cartoon: 'Kids', animation: 'Kids', family: 'Kids',
  enfants: 'Kids', bambini: 'Kids', 'niños': 'Kids',

  documentary: 'Documentary', docu: 'Documentary', nature: 'Documentary',
  history: 'Documentary', science: 'Documentary', discovery: 'Documentary',

  religious: 'Religious', religion: 'Religious', church: 'Religious',
  islamic: 'Religious', christian: 'Religious', spiritual: 'Religious',
  faith: 'Religious', gospel: 'Religious',

  adult: 'Adult', xxx: 'Adult', erotic: 'Adult', '18+': 'Adult', nsfw: 'Adult',
  xvideos: 'Adult', porn: 'Adult',

  general: 'General', other: 'General', undefined: 'General', uncategorized: 'General',
  misc: 'General', mixed: 'General',
};

// ─── Country data ─────────────────────────────────────
const COUNTRY_NAMES = {
  AF:'Afghanistan',AL:'Albania',DZ:'Algeria',AD:'Andorra',AO:'Angola',
  AR:'Argentina',AM:'Armenia',AU:'Australia',AT:'Austria',AZ:'Azerbaijan',
  BH:'Bahrain',BD:'Bangladesh',BY:'Belarus',BE:'Belgium',BJ:'Benin',
  BO:'Bolivia',BA:'Bosnia',BW:'Botswana',BR:'Brazil',BN:'Brunei',
  BG:'Bulgaria',BF:'Burkina Faso',BI:'Burundi',KH:'Cambodia',CM:'Cameroon',
  CA:'Canada',CF:'Central African Republic',TD:'Chad',CL:'Chile',CN:'China',
  CO:'Colombia',CD:'DR Congo',CG:'Congo',CR:'Costa Rica',CI:"Côte d'Ivoire",
  HR:'Croatia',CU:'Cuba',CY:'Cyprus',CZ:'Czech Republic',DK:'Denmark',
  DO:'Dominican Republic',EC:'Ecuador',EG:'Egypt',SV:'El Salvador',
  EE:'Estonia',ET:'Ethiopia',FI:'Finland',FR:'France',GA:'Gabon',GE:'Georgia',
  DE:'Germany',GH:'Ghana',GR:'Greece',GT:'Guatemala',GN:'Guinea',
  HN:'Honduras',HK:'Hong Kong',HU:'Hungary',IN:'India',ID:'Indonesia',
  IR:'Iran',IQ:'Iraq',IE:'Ireland',IL:'Israel',IT:'Italy',JM:'Jamaica',
  JP:'Japan',JO:'Jordan',KZ:'Kazakhstan',KE:'Kenya',KW:'Kuwait',KG:'Kyrgyzstan',
  LA:'Laos',LV:'Latvia',LB:'Lebanon',LY:'Libya',LT:'Lithuania',LU:'Luxembourg',
  MK:'North Macedonia',MG:'Madagascar',MY:'Malaysia',MV:'Maldives',ML:'Mali',
  MT:'Malta',MR:'Mauritania',MX:'Mexico',MD:'Moldova',MN:'Mongolia',
  ME:'Montenegro',MA:'Morocco',MZ:'Mozambique',MM:'Myanmar',NA:'Namibia',
  NP:'Nepal',NL:'Netherlands',NZ:'New Zealand',NI:'Nicaragua',NE:'Niger',
  NG:'Nigeria',NO:'Norway',OM:'Oman',PK:'Pakistan',PS:'Palestine',PA:'Panama',
  PY:'Paraguay',PE:'Peru',PH:'Philippines',PL:'Poland',PT:'Portugal',
  PR:'Puerto Rico',QA:'Qatar',RO:'Romania',RU:'Russia',RW:'Rwanda',
  SA:'Saudi Arabia',SN:'Senegal',RS:'Serbia',SL:'Sierra Leone',SG:'Singapore',
  SK:'Slovakia',SI:'Slovenia',SO:'Somalia',ZA:'South Africa',KR:'South Korea',
  SS:'South Sudan',ES:'Spain',LK:'Sri Lanka',SD:'Sudan',SE:'Sweden',
  CH:'Switzerland',SY:'Syria',TW:'Taiwan',TJ:'Tajikistan',TZ:'Tanzania',
  TH:'Thailand',TN:'Tunisia',TR:'Turkey',TM:'Turkmenistan',UA:'Ukraine',
  AE:'UAE',GB:'United Kingdom',US:'United States',UY:'Uruguay',UZ:'Uzbekistan',
  VE:'Venezuela',VN:'Vietnam',YE:'Yemen',ZM:'Zambia',ZW:'Zimbabwe',
  XX:'International',INT:'International',
};

// ─── Helpers ──────────────────────────────────────────
function countryFromTvgId(tvgId) {
  if (!tvgId) return '';
  const m = tvgId.match(/\.([a-z]{2})@/i);
  return m ? m[1].toUpperCase() : '';
}

function codeToFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0)));
}

function normalizeCategory(raw) {
  if (!raw) return 'General';
  const trimmed = raw.trim();
  const key = trimmed.toLowerCase();
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  for (const [k, v] of Object.entries(CATEGORY_MAP)) {
    if (key.includes(k)) return v;
  }
  return trimmed.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

function isPremium(name) {
  const lower = (name || '').toLowerCase();
  return PREMIUM_NETWORKS.some(kw => lower.includes(kw.toLowerCase()))
      || INTL_BROADCASTERS.some(kw => lower.includes(kw.toLowerCase()));
}

function isMovieEntry(ch) {
  const cat = (ch.category || '').toLowerCase();
  const url = (ch.url || '').toLowerCase();
  if (['movies', 'movie', 'vod', 'cinema', 'film', 'films', 'series'].some(k => cat.includes(k))) return true;
  if (/\.(mp4|mkv|avi|mov|m4v)(\?|$)/i.test(url)) return true;
  return false;
}

// ─── Quality logic ────────────────────────────────────
function resolveResolutionLabel(parsedHeight, bandwidth, name) {
  if (parsedHeight >= 2160) return '4K';
  if (parsedHeight >= 1080) return '1080p';
  if (parsedHeight >= 720)  return '720p';
  if (parsedHeight > 0)     return `${parsedHeight}p`; // confirmed SD

  // Infer from name
  const n = (name || '').toLowerCase();
  if (n.includes('4k') || n.includes('uhd') || n.includes('ultra hd') || n.includes('2160')) return '4K';
  if (n.includes('fhd') || n.includes('1080')) return '1080p';
  if (HD_NAME_KEYWORDS.some(k => n.includes(k))) return '720p';

  return 'Unknown';
}

function shouldKeepHD(channel) {
  const name        = (channel.name || '').toLowerCase();
  const parsedHeight = channel._parsedHeight || 0;
  const bandwidth   = channel._bandwidth    || 0;

  // EXCLUDE: confirmed SD by resolution
  if (parsedHeight > 0 && parsedHeight < 720) return false;

  // EXCLUDE: very low bitrate confirmed SD
  if (bandwidth > 0 && bandwidth < 1500000 && parsedHeight > 0 && parsedHeight < 720) return false;

  // EXCLUDE: SD/LQ name label when we have no resolution to counter it
  if (parsedHeight === 0) {
    const hasSdLabel = SD_EXCLUDE_KEYWORDS.some(k => name.includes(k));
    if (hasSdLabel) return false;
  }

  // KEEP: confirmed HD resolution
  if (parsedHeight >= 720) return true;

  // KEEP: HD keyword in name
  if (HD_NAME_KEYWORDS.some(k => name.includes(k))) return true;

  // KEEP: premium network
  if (PREMIUM_NETWORKS.some(kw => name.includes(kw.toLowerCase()))) return true;

  // KEEP: known international broadcaster
  if (INTL_BROADCASTERS.some(kw => name.includes(kw.toLowerCase()))) return true;

  // KEEP: unknown resolution — benefit of the doubt
  if (parsedHeight === 0) return true;

  return false;
}

// ─── M3U Parsing ─────────────────────────────────────
function parseExtInf(line) {
  const res = { name:'', tvgId:'', tvgName:'', tvgCountry:'', tvgLanguage:'', tvgLogo:'', groupTitle:'' };
  const attrRe = /([\w-]+)="([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(line)) !== null) {
    const k = m[1].toLowerCase().replace(/-/g, '');
    const v = m[2].trim();
    if      (k === 'tvgid')       res.tvgId       = v;
    else if (k === 'tvgname')     res.tvgName     = v;
    else if (k === 'tvgcountry')  res.tvgCountry  = v.toUpperCase();
    else if (k === 'tvglanguage') res.tvgLanguage = v;
    else if (k === 'tvglogo')     res.tvgLogo     = v;
    else if (k === 'grouptitle')  res.groupTitle  = v;
  }
  const ci = line.lastIndexOf(',');
  if (ci !== -1) res.name = line.slice(ci + 1).trim();
  if (!res.name && res.tvgName) res.name = res.tvgName;
  return res;
}

function parseM3U(content, sourceType, isAdult = false) {
  const channels = [];
  const lines = content.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#EXTVLCOPT') && !l.startsWith('#KODIPROP'));

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF:')) continue;
    const inf = parseExtInf(lines[i]);
    if (!inf.name) continue;

    let streamUrl = '';
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].startsWith('#')) { streamUrl = lines[j].trim(); break; }
    }
    if (!streamUrl || !streamUrl.startsWith('http')) continue;

    let country  = inf.tvgCountry || countryFromTvgId(inf.tvgId) || 'XX';
    let language = inf.tvgLanguage || '';
    let category = 'General';
    let entryIsAdult = isAdult;

    if (sourceType === 'adult') {
      category = 'Adult';
      entryIsAdult = true;
    } else if (sourceType === 'country') {
      if (country === 'XX' && inf.groupTitle) {
        const found = Object.entries(COUNTRY_NAMES).find(
          ([, v]) => v.toLowerCase() === inf.groupTitle.trim().toLowerCase()
        );
        if (found) country = found[0];
      }
      category = normalizeCategory(inf.groupTitle || '');
    } else if (sourceType === 'language') {
      language = inf.groupTitle || language;
      category = 'General';
    } else if (sourceType === 'category') {
      category = normalizeCategory(inf.groupTitle || '');
      language = language || '';
    } else {
      category = normalizeCategory(inf.groupTitle || '');
      if (category === 'Adult') entryIsAdult = true;
    }

    channels.push({
      name:     inf.name,
      tvgId:    inf.tvgId,
      tvgLogo:  inf.tvgLogo,
      country,
      language,
      category,
      url:      streamUrl,
      isAdult:  entryIsAdult,
      premium:  isPremium(inf.name),
    });
  }
  return channels;
}

// ─── Fetch helpers ────────────────────────────────────
async function fetchWithRetry(url, retries = 3, timeoutMs = 45000) {
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'IPTVHub/3.0' },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.warn(`  Attempt ${i + 1} failed: ${e.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return null;
}

async function searchGitHubRepos(query, perPage = 10) {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'IPTVHub/3.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(r => ({
      owner:         r.owner.login,
      repo:          r.name,
      stars:         r.stargazers_count,
      defaultBranch: r.default_branch || 'master',
    }));
  } catch (e) {
    console.warn(`  GitHub search failed: ${e.message}`);
    return [];
  }
}

async function discoverGitHubSources(queries, isAdultSource = false, label = '') {
  console.log(`\n🔍 Searching GitHub for ${label} M3U sources...`);
  const discovered = [];
  const seenRepos  = new Set();

  for (const query of queries) {
    console.log(`  Query: "${query}"`);
    const repos = await searchGitHubRepos(query, 10);
    await new Promise(r => setTimeout(r, 2000)); // rate-limit

    for (const { owner, repo, defaultBranch } of repos.slice(0, 5)) {
      const key = `${owner}/${repo}`;
      if (seenRepos.has(key)) continue;
      seenRepos.add(key);

      for (const path of GITHUB_M3U_PATHS) {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${path}`;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          const res = await fetch(rawUrl, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'IPTVHub/3.0' },
          });
          clearTimeout(t);
          if (res.ok) {
            const text = await res.text();
            if (text.includes('#EXTINF') && text.length > 500) {
              console.log(`  ✅ Found M3U: ${rawUrl} (${text.split('#EXTINF').length - 1} entries)`);
              discovered.push({ url: rawUrl, type: isAdultSource ? 'adult' : 'main', isAdult: isAdultSource });
              break;
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  console.log(`  Found ${discovered.length} additional sources\n`);
  return discovered;
}

// ─── Deep Stream Probing ──────────────────────────────
// Returns: { status: 'alive'|'dead'|'geoblock'|'timeout'|'invalid', parsedHeight, bandwidth }
async function deepProbeStream(url) {
  const isHLS = /\.m3u8(\?|#|$)/i.test(url);
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':     '*/*',
      },
    });

    if (res.status === 403 || res.status === 451 || res.status === 429) {
      try { res.body?.cancel(); } catch {}
      return { status: 'geoblock' };
    }
    if (!res.ok) {
      try { res.body?.cancel(); } catch {}
      return { status: 'dead' };
    }

    if (isHLS) {
      // Read M3U8 playlist content
      let content;
      try {
        content = await res.text();
      } catch {
        return { status: 'dead' };
      }

      // Validate M3U8 format
      if (!content.includes('#EXTM3U') && !content.includes('#EXTINF') && !content.includes('#EXT-X-')) {
        return { status: 'invalid' };
      }

      // Parse resolution and bandwidth from master playlist
      let maxHeight    = 0;
      let maxBandwidth = 0;
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#EXT-X-STREAM-INF:')) {
          const resMatch = trimmed.match(/RESOLUTION=(\d+)x(\d+)/i);
          const bwMatch  = trimmed.match(/BANDWIDTH=(\d+)/i);
          if (resMatch) {
            const h = parseInt(resMatch[2], 10);
            if (h > maxHeight) maxHeight = h;
          }
          if (bwMatch) {
            const bw = parseInt(bwMatch[1], 10);
            if (bw > maxBandwidth) maxBandwidth = bw;
          }
        }
      }

      // If this is a master playlist, verify first variant loads
      if (content.includes('#EXT-X-STREAM-INF:')) {
        const variantUrls = lines.map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        if (variantUrls.length > 0) {
          const firstVariant = variantUrls[0];
          let variantUrl = null;
          try {
            variantUrl = firstVariant.startsWith('http')
              ? firstVariant
              : new URL(firstVariant, url).href;
          } catch { /* bad relative URL */ }

          if (variantUrl) {
            try {
              const ctrl2 = new AbortController();
              const t2    = setTimeout(() => ctrl2.abort(), PROBE_TIMEOUT_MS);
              const vRes  = await fetch(variantUrl, {
                method: 'GET',
                signal: ctrl2.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
              });
              clearTimeout(t2);
              try { vRes.body?.cancel(); } catch {}
              if (!vRes.ok) return { status: 'dead' };
            } catch (e) {
              if (e.name === 'AbortError') return { status: 'timeout' };
              return { status: 'dead' };
            }
          }
        }
      }

      return { status: 'alive', parsedHeight: maxHeight, bandwidth: maxBandwidth };

    } else {
      // Direct stream: check Content-Type header
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      try { res.body?.cancel(); } catch {}

      // Reject obvious non-media content types
      if (ct && (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/xml'))) {
        return { status: 'invalid' };
      }

      return { status: 'alive', parsedHeight: 0, bandwidth: 0 };
    }

  } catch (e) {
    if (e.name === 'AbortError') return { status: 'timeout' };
    return { status: 'dead' };
  } finally {
    clearTimeout(timer);
  }
}

async function probeAll(channels, label = '', applyHDFilter = false) {
  if (channels.length === 0) return [];

  console.log(`\n🔍 Deep-probing ${channels.length} ${label}streams (batch: ${PROBE_BATCH_SIZE}, timeout: ${PROBE_TIMEOUT_MS}ms)...`);
  if (applyHDFilter) console.log('   HD+ quality filter will be applied after health check');

  const alive = [], geoBlocked = [];
  let deadCount = 0, timeoutCount = 0, invalidCount = 0;
  let done = 0;

  for (let i = 0; i < channels.length; i += PROBE_BATCH_SIZE) {
    const batch   = channels.slice(i, i + PROBE_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(ch => deepProbeStream(ch.url)));

    for (let j = 0; j < batch.length; j++) {
      const r = results[j].status === 'fulfilled' ? results[j].value : { status: 'dead' };

      switch (r.status) {
        case 'alive':
          alive.push({ ...batch[j], _parsedHeight: r.parsedHeight || 0, _bandwidth: r.bandwidth || 0 });
          buildStats.probeAlive++;
          break;
        case 'geoblock':
          geoBlocked.push(batch[j]);
          buildStats.probeGeoBlocked++;
          break;
        case 'timeout':
          timeoutCount++;
          buildStats.probeTimeout++;
          break;
        case 'invalid':
          invalidCount++;
          buildStats.probeInvalidFormat++;
          break;
        default:
          deadCount++;
          buildStats.probeDead++;
      }
    }

    done += batch.length;
    const pct = ((done / channels.length) * 100).toFixed(1);
    process.stdout.write(
      `\r  Progress: ${done}/${channels.length} (${pct}%) | alive: ${alive.length}, dead: ${deadCount}, timeout: ${timeoutCount}, geo: ${geoBlocked.length}, invalid: ${invalidCount}  `
    );
  }

  console.log(`\n\n  ✅ Alive:         ${alive.length}`);
  console.log(`  🌍 Geo-blocked:   ${geoBlocked.length} (excluded)`);
  console.log(`  ⏱  Timeout:       ${timeoutCount} (excluded)`);
  console.log(`  🚫 Invalid fmt:   ${invalidCount} (excluded)`);
  console.log(`  ❌ Dead:          ${deadCount} (excluded)`);
  console.log(`  📊 Survival rate: ${((alive.length / channels.length) * 100).toFixed(1)}%\n`);

  buildStats.healthPassed += alive.length;

  if (!applyHDFilter) return alive;

  // Apply HD+ quality filter to main channels
  console.log(`🎯 Applying HD+ quality filter...`);
  const hdChannels = alive.filter(ch => shouldKeepHD(ch));
  const sdDropped  = alive.length - hdChannels.length;
  console.log(`  ✅ HD+ kept:    ${hdChannels.length}`);
  console.log(`  ❌ SD dropped:  ${sdDropped}\n`);

  buildStats.hdFilterPassed += hdChannels.length;
  return hdChannels;
}

// ─── Main ─────────────────────────────────────────────
async function main() {
  console.log('🚀 IPTV Hub Builder v3 — HD+ Quality Mode\n');
  mkdirSync(DATA_DIR, { recursive: true });

  // Discover additional sources from GitHub
  let premiumSources = [], adultSources = [], generalSources = [];

  try { premiumSources = await discoverGitHubSources(GITHUB_PREMIUM_QUERIES, false, 'premium/HD'); }
  catch (e) { console.warn('Premium GitHub discovery failed:', e.message); }

  try { adultSources = await discoverGitHubSources(GITHUB_ADULT_QUERIES, true, 'adult'); }
  catch (e) { console.warn('Adult GitHub discovery failed:', e.message); }

  try { generalSources = await discoverGitHubSources(GITHUB_GENERAL_QUERIES, false, 'general'); }
  catch (e) { console.warn('General GitHub discovery failed:', e.message); }

  const SOURCES = [...BASE_SOURCES, ...premiumSources, ...adultSources, ...generalSources];
  buildStats.sourcesScraped = SOURCES.length;

  const channelMap = new Map();
  const adultMap   = new Map();

  for (const src of SOURCES) {
    console.log(`⬇️  Fetching [${src.type}${src.isAdult ? '/adult' : ''}]: ${src.url}`);
    let content;
    try {
      content = await fetchWithRetry(src.url);
    } catch (e) {
      console.warn(`  ⚠️  Error fetching: ${e.message}\n`);
      continue;
    }
    if (!content) { console.warn('  ⚠️  Skipped (no content)\n'); continue; }

    let parsed;
    try {
      parsed = parseM3U(content, src.type, src.isAdult);
    } catch (e) {
      console.warn(`  ⚠️  Parse error: ${e.message}\n`);
      continue;
    }

    let addedMain = 0, addedAdult = 0, updated = 0;

    for (const ch of parsed) {
      const targetMap = ch.isAdult ? adultMap : channelMap;
      if (!targetMap.has(ch.url)) {
        targetMap.set(ch.url, {
          name:     ch.name,
          tvgId:    ch.tvgId,
          logo:     ch.tvgLogo,
          country:  ch.country  || 'XX',
          language: ch.language || '',
          category: ch.category || 'General',
          url:      ch.url,
          premium:  ch.premium  || false,
          isAdult:  ch.isAdult  || false,
        });
        ch.isAdult ? addedAdult++ : addedMain++;
      } else {
        const existing = targetMap.get(ch.url);
        if (!existing.country  || existing.country === 'XX')       existing.country  = ch.country  || existing.country;
        if (!existing.language && ch.language)                      existing.language = ch.language;
        if (!existing.category || existing.category === 'General')  existing.category = ch.category || existing.category;
        if (!existing.logo     && ch.tvgLogo)                       existing.logo     = ch.tvgLogo;
        if (!existing.premium  && ch.premium)                       existing.premium  = true;
        updated++;
      }
    }

    console.log(`  ✅ ${parsed.length} parsed → +${addedMain} main, +${addedAdult} adult, ~${updated} merged (total: ${channelMap.size} main, ${adultMap.size} adult)\n`);
  }

  let channels      = [...channelMap.values()];
  let adultChannels = [...adultMap.values()];

  buildStats.totalFound = channels.length + adultChannels.length;

  console.log(`\n📦 Before probing: ${channels.length} main + ${adultChannels.length} adult channels`);

  if (PROBE_ENABLED) {
    channels      = await probeAll(channels,      '',       true  /* HD filter */);
    adultChannels = await probeAll(adultChannels, 'adult ', false /* no HD filter */);
  } else {
    console.log('\n⚡ Stream probing skipped (SKIP_PROBE=1)\n');
    buildStats.healthPassed   = channels.length + adultChannels.length;
    buildStats.hdFilterPassed = channels.length;
    // Tag channels with empty probe data
    channels      = channels.map(ch => ({ ...ch, _parsedHeight: 0, _bandwidth: 0 }));
    adultChannels = adultChannels.map(ch => ({ ...ch, _parsedHeight: 0, _bandwidth: 0 }));
  }

  // Separate VOD/movies from live channels
  const movieChannels = channels.filter(ch =>  isMovieEntry(ch));
  const liveChannels  = channels.filter(ch => !isMovieEntry(ch));

  function finalizeChannels(arr, idOffset = 0) {
    return arr.map((ch, i) => {
      const country    = ch.country || 'XX';
      const parsedH    = ch._parsedHeight || 0;
      const bw         = ch._bandwidth    || 0;
      const resolution = resolveResolutionLabel(parsedH, bw, ch.name);
      const premium    = ch.premium || isPremium(ch.name) || false;

      return {
        id:          idOffset + i,
        name:        ch.name,
        logo:        ch.logo || '',
        country,
        countryName: COUNTRY_NAMES[country] || country,
        flag:        codeToFlag(country),
        language:    ch.language || 'Unknown',
        category:    ch.category || 'General',
        url:         ch.url,
        premium,
        resolution,
        bandwidth:   bw || null,
      };
    });
  }

  const finalChannels = finalizeChannels(liveChannels);
  const finalMovies   = finalizeChannels(movieChannels, finalChannels.length);
  const finalAdult    = finalizeChannels(adultChannels, finalChannels.length + finalMovies.length);

  // Compute build stats
  buildStats.finalChannels = finalChannels.length;
  buildStats.finalMovies   = finalMovies.length;
  buildStats.finalAdult    = finalAdult.length;

  for (const ch of [...finalChannels, ...finalMovies]) {
    if      (ch.resolution === '4K')     buildStats.res4K++;
    else if (ch.resolution === '1080p')  buildStats.res1080++;
    else if (ch.resolution === '720p')   buildStats.res720++;
    else                                  buildStats.resUnknown++;
    if (ch.premium) buildStats.premiumTagged++;
  }

  // Build filter metadata
  const catMap     = new Map();
  const countryMap = new Map();
  const langMap    = new Map();
  const qualMap    = new Map();

  for (const ch of finalChannels) {
    catMap.set(ch.category, (catMap.get(ch.category) || 0) + 1);

    if (ch.country !== 'XX') {
      if (!countryMap.has(ch.country)) {
        countryMap.set(ch.country, { code: ch.country, name: ch.countryName, flag: ch.flag, count: 0 });
      }
      countryMap.get(ch.country).count++;
    }

    if (ch.language && ch.language !== 'Unknown') {
      langMap.set(ch.language, (langMap.get(ch.language) || 0) + 1);
    }

    qualMap.set(ch.resolution, (qualMap.get(ch.resolution) || 0) + 1);
  }

  const categories = [...catMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  const countries  = [...countryMap.values()].sort((a, b) => b.count - a.count);
  const languages  = [...langMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  const qualities = [
    { label: '4K / Ultra HD',   value: '4K',      count: qualMap.get('4K')      || 0 },
    { label: '1080p / Full HD', value: '1080p',   count: qualMap.get('1080p')   || 0 },
    { label: '720p / HD',       value: '720p',    count: qualMap.get('720p')    || 0 },
    { label: 'Unknown Quality', value: 'Unknown', count: qualMap.get('Unknown') || 0 },
  ].filter(q => q.count > 0);

  // Write data files
  writeFileSync(join(DATA_DIR, 'channels.json'),   JSON.stringify(finalChannels, null, 2));
  writeFileSync(join(DATA_DIR, 'movies.json'),     JSON.stringify(finalMovies,   null, 2));
  writeFileSync(join(DATA_DIR, 'adult.json'),      JSON.stringify(finalAdult,    null, 2));
  writeFileSync(join(DATA_DIR, 'categories.json'), JSON.stringify(categories,    null, 2));
  writeFileSync(join(DATA_DIR, 'countries.json'),  JSON.stringify(countries,     null, 2));
  writeFileSync(join(DATA_DIR, 'languages.json'),  JSON.stringify(languages,     null, 2));
  writeFileSync(join(DATA_DIR, 'qualities.json'),  JSON.stringify(qualities,     null, 2));

  const buildSecs = ((Date.now() - BUILD_START) / 1000).toFixed(1);
  const mb = (Buffer.byteLength(JSON.stringify(finalChannels)) / 1024 / 1024).toFixed(2);

  console.log('\n=== IPTV Hub Build Summary ===');
  console.log(`Sources scraped:        ${buildStats.sourcesScraped}`);
  console.log(`Total channels found:   ${buildStats.totalFound}`);
  console.log(`Health check passed:    ${buildStats.healthPassed} (alive: ${buildStats.probeAlive}, geo-blocked: ${buildStats.probeGeoBlocked}, timeout: ${buildStats.probeTimeout}, invalid: ${buildStats.probeInvalidFormat})`);
  console.log(`HD+ quality filter:     ${buildStats.hdFilterPassed}`);
  console.log(`Final channels:         ${buildStats.finalChannels} (4K: ${buildStats.res4K}, 1080p: ${buildStats.res1080}, 720p: ${buildStats.res720}, Unknown: ${buildStats.resUnknown})`);
  console.log(`Movies/VOD:             ${buildStats.finalMovies}`);
  console.log(`Adult:                  ${buildStats.finalAdult}`);
  console.log(`Premium tagged:         ${buildStats.premiumTagged}`);
  console.log(`Build time:             ${buildSecs}s`);
  console.log(`channels.json:          ${mb} MB`);
  console.log('\n✅ Done! Data written to ./data/');
}

main().catch(e => { console.error('❌ Build failed:', e); process.exit(1); });
