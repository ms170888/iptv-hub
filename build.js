#!/usr/bin/env node
// build.js — IPTV Hub Builder v2
// No npm deps — Node 18+ built-in fetch

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

// ─── Config ──────────────────────────────────────────
const PROBE_TIMEOUT_MS = 5000;
const PROBE_BATCH_SIZE = 100;
const PROBE_ENABLED = process.env.SKIP_PROBE !== '1';

// ─── Base M3U Sources ─────────────────────────────────
const BASE_SOURCES = [
  { url: 'https://iptv-org.github.io/iptv/index.m3u',                             type: 'main',  isAdult: false },
  { url: 'https://iptv-org.github.io/iptv/index.nsfw.m3u',                        type: 'adult', isAdult: true  },
  { url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',   type: 'main',  isAdult: false },
  { url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us.m3u', type: 'main',  isAdult: false },
  { url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/ca.m3u', type: 'main',  isAdult: false },
  { url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/gb.m3u', type: 'main',  isAdult: false },
  { url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/in.m3u', type: 'main',  isAdult: false },
];

// Common M3U file paths to try in discovered GitHub repos
const GITHUB_M3U_PATHS = [
  'playlist.m3u8', 'index.m3u', 'iptv.m3u', 'channels.m3u8',
  'channels.m3u', 'list.m3u', 'tv.m3u', 'streams.m3u',
];

// GitHub search queries to find more sources
const GITHUB_QUERIES = [
  'iptv m3u playlist',
  'iptv m3u8 sport',
  'free iptv premium',
  'm3u movies vod playlist',
];

// ─── Category normalization ───────────────────────────
const CATEGORY_MAP = {
  sport: 'Sports', sports: 'Sports', football: 'Sports', soccer: 'Sports',
  basketball: 'Sports', cricket: 'Sports', tennis: 'Sports', golf: 'Sports',
  baseball: 'Sports', hockey: 'Sports', rugby: 'Sports', racing: 'Sports',
  fighting: 'Sports', boxing: 'Sports', mma: 'Sports', esports: 'Sports',
  'sport ': 'Sports', athletics: 'Sports', olympic: 'Sports',

  news: 'News', information: 'News', noticias: 'News', 'breaking news': 'News',
  actualite: 'News', nachrichten: 'News', notícias: 'News',

  entertainment: 'Entertainment', variety: 'Entertainment', lifestyle: 'Entertainment',
  comedy: 'Entertainment', drama: 'Entertainment', thriller: 'Entertainment',

  movies: 'Movies', movie: 'Movies', cinema: 'Movies', film: 'Movies', films: 'Movies',
  vod: 'Movies', series: 'Movies', 'tv shows': 'Movies', tvshows: 'Movies',
  tv_shows: 'Movies', peliculas: 'Movies', filmes: 'Movies',

  music: 'Music', musica: 'Music', música: 'Music', muzika: 'Music', musik: 'Music',

  kids: 'Kids', children: 'Kids', cartoon: 'Kids', animation: 'Kids', family: 'Kids',
  enfants: 'Kids', bambini: 'Kids', niños: 'Kids',

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

// Premium channel name keywords (case-insensitive)
const PREMIUM_KEYWORDS = [
  'hbo', 'espn', 'fox sports', 'sky sports', 'bt sport', 'dazn',
  'showtime', 'starz', 'bein', 'tnt', 'usa network',
  'premier league', 'champions league', 'f1 tv',
  'canal+', 'sky cinema', 'cinemax', 'nfl', 'nba', 'mlb', 'nhl',
  'beIN', 'discovery+', 'paramount+', 'peacock',
];

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
  // Return original capitalized
  return trimmed.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

function isPremium(name) {
  const lower = (name || '').toLowerCase();
  return PREMIUM_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function isMovieEntry(ch) {
  const cat = (ch.category || '').toLowerCase();
  const url  = (ch.url || '').toLowerCase();
  if (['movies', 'movie', 'vod', 'cinema', 'film', 'films', 'series'].some(k => cat.includes(k))) return true;
  if (/\.(mp4|mkv|avi|mov|m4v)(\?|$)/i.test(url)) return true;
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
      // main
      category = normalizeCategory(inf.groupTitle || '');
      if (category === 'Adult') entryIsAdult = true;
    }

    channels.push({
      name:     inf.name,
      tvgId:    inf.tvgId,
      tvgLogo:  inf.tvgLogo,
      country:  country,
      language: language,
      category: category,
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
        headers: { 'User-Agent': 'IPTVHub/2.0' },
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

// Search GitHub for repos matching a query
async function searchGitHubRepos(query) {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'IPTVHub/2.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(r => ({
      owner: r.owner.login,
      repo:  r.name,
      stars: r.stargazers_count,
      defaultBranch: r.default_branch || 'master',
    }));
  } catch (e) {
    console.warn(`  GitHub search failed: ${e.message}`);
    return [];
  }
}

// Discover additional M3U sources from GitHub
async function discoverGitHubSources() {
  console.log('\n🔍 Searching GitHub for additional M3U sources...');
  const discovered = [];
  const seenRepos = new Set();

  for (const query of GITHUB_QUERIES) {
    console.log(`  Query: "${query}"`);
    const repos = await searchGitHubRepos(query);

    // Rate limit: 2s between search calls
    await new Promise(r => setTimeout(r, 2000));

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
            headers: { 'User-Agent': 'IPTVHub/2.0' },
          });
          clearTimeout(t);
          if (res.ok) {
            const text = await res.text();
            if (text.includes('#EXTINF') && text.length > 500) {
              // Detect if likely adult/VOD based on query
              const isAdultQuery = query.includes('adult') || query.includes('xxx');
              const isVodQuery   = query.includes('movie') || query.includes('vod');
              const srcType = isAdultQuery ? 'adult' : (isVodQuery ? 'main' : 'main');
              const srcAdult = isAdultQuery;
              console.log(`  ✅ Found M3U: ${rawUrl} (${text.split('#EXTINF').length - 1} entries)`);
              discovered.push({ url: rawUrl, type: srcType, isAdult: srcAdult });
              break; // one file per repo
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  console.log(`  Found ${discovered.length} additional GitHub sources\n`);
  return discovered;
}

// ─── Stream Probing ───────────────────────────────────
// Returns: 'alive' | 'dead' | 'geoblock'
async function probeStream(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    let status;
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'IPTVHub/2.0', 'Range': 'bytes=0-1023' },
      });
      status = res.status;
    } catch {
      // HEAD not supported — try GET
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), PROBE_TIMEOUT_MS);
      const res2 = await fetch(url, {
        method: 'GET',
        signal: ctrl2.signal,
        headers: { 'User-Agent': 'IPTVHub/2.0', 'Range': 'bytes=0-1023' },
      });
      clearTimeout(t2);
      status = res2.status;
    }
    clearTimeout(t);

    if (status === 403 || status === 451) return 'geoblock';
    if (status >= 200 && status < 400) return 'alive';
    return 'dead';
  } catch {
    return 'dead';
  }
}

async function probeAll(channels, label = '') {
  if (channels.length === 0) return [];
  console.log(`\n🔍 Probing ${channels.length} ${label}streams (batch: ${PROBE_BATCH_SIZE}, timeout: ${PROBE_TIMEOUT_MS}ms)...`);

  const alive = [], dead = [], geoBlocked = [];
  let done = 0;

  for (let i = 0; i < channels.length; i += PROBE_BATCH_SIZE) {
    const batch = channels.slice(i, i + PROBE_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(ch => probeStream(ch.url)));

    for (let j = 0; j < batch.length; j++) {
      const result = results[j].status === 'fulfilled' ? results[j].value : 'dead';
      if      (result === 'alive')    alive.push(batch[j]);
      else if (result === 'geoblock') geoBlocked.push(batch[j]);
      else                            dead.push(batch[j]);
    }

    done += batch.length;
    const pct = ((done / channels.length) * 100).toFixed(1);
    process.stdout.write(`\r  Progress: ${done}/${channels.length} (${pct}%) — alive: ${alive.length}, dead: ${dead.length}, geo-blocked: ${geoBlocked.length}  `);
  }

  console.log(`\n\n  ✅ Alive:         ${alive.length}`);
  console.log(`  🌍 Geo-blocked:   ${geoBlocked.length} (excluded)`);
  console.log(`  ❌ Dead/timeout:  ${dead.length} (excluded)`);
  console.log(`  📊 Survival rate: ${((alive.length / channels.length) * 100).toFixed(1)}%\n`);

  return alive;
}

// ─── Main ─────────────────────────────────────────────
async function main() {
  console.log('🚀 IPTV Hub Builder v2 Starting...\n');
  mkdirSync(DATA_DIR, { recursive: true });

  // Discover additional sources from GitHub
  let githubSources = [];
  try {
    githubSources = await discoverGitHubSources();
  } catch (e) {
    console.warn('GitHub discovery failed, continuing without extra sources:', e.message);
  }

  const SOURCES = [...BASE_SOURCES, ...githubSources];

  const channelMap = new Map(); // url → channel
  const adultMap   = new Map(); // url → adult channel

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
        const e = targetMap.get(ch.url);
        if (!e.country  || e.country === 'XX')          e.country  = ch.country  || e.country;
        if (!e.language && ch.language)                  e.language = ch.language;
        if (!e.category || e.category === 'General')     e.category = ch.category || e.category;
        if (!e.logo     && ch.tvgLogo)                   e.logo     = ch.tvgLogo;
        if (!e.premium  && ch.premium)                   e.premium  = true;
        updated++;
      }
    }

    console.log(`  ✅ ${parsed.length} parsed → +${addedMain} main, +${addedAdult} adult, ~${updated} merged (total: ${channelMap.size} main, ${adultMap.size} adult)\n`);
  }

  let channels      = [...channelMap.values()];
  let adultChannels = [...adultMap.values()];

  console.log(`\n📦 Before probing: ${channels.length} main + ${adultChannels.length} adult channels`);

  // Probe streams
  if (PROBE_ENABLED) {
    channels      = await probeAll(channels, '');
    adultChannels = await probeAll(adultChannels, 'adult ');
  } else {
    console.log('\n⚡ Stream probing skipped (SKIP_PROBE=1)\n');
  }

  // Separate VOD/movies from live channels
  const movieChannels = channels.filter(ch => isMovieEntry(ch));
  const liveChannels  = channels.filter(ch => !isMovieEntry(ch));

  // Finalize with IDs and flag emoji
  function finalizeChannels(arr, idOffset = 0) {
    return arr.map((ch, i) => {
      const country = ch.country || 'XX';
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
        premium:     ch.premium || false,
      };
    });
  }

  const finalChannels = finalizeChannels(liveChannels);
  const finalMovies   = finalizeChannels(movieChannels,  finalChannels.length);
  const finalAdult    = finalizeChannels(adultChannels,  finalChannels.length + finalMovies.length);

  // Build filter metadata for main channels
  const catMap     = new Map();
  const countryMap = new Map();
  const langMap    = new Map();

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
  }

  const categories = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1]) // sort by count desc
    .map(([name, count]) => ({ name, count }));

  const countries = [...countryMap.values()]
    .sort((a, b) => b.count - a.count); // most channels first

  const languages = [...langMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // Write data files
  writeFileSync(join(DATA_DIR, 'channels.json'),   JSON.stringify(finalChannels, null, 2));
  writeFileSync(join(DATA_DIR, 'movies.json'),     JSON.stringify(finalMovies,   null, 2));
  writeFileSync(join(DATA_DIR, 'adult.json'),      JSON.stringify(finalAdult,    null, 2));
  writeFileSync(join(DATA_DIR, 'categories.json'), JSON.stringify(categories,    null, 2));
  writeFileSync(join(DATA_DIR, 'countries.json'),  JSON.stringify(countries,     null, 2));
  writeFileSync(join(DATA_DIR, 'languages.json'),  JSON.stringify(languages,     null, 2));

  const mb = (Buffer.byteLength(JSON.stringify(finalChannels)) / 1024 / 1024).toFixed(2);

  console.log('\n📊 Final Summary:');
  console.log(`  Live channels:   ${finalChannels.length}`);
  console.log(`  Movies / VOD:    ${finalMovies.length}`);
  console.log(`  Adult:           ${finalAdult.length}`);
  console.log(`  Categories:      ${categories.length}`);
  console.log(`  Countries:       ${countries.length}`);
  console.log(`  Languages:       ${languages.length}`);
  console.log(`  channels.json:   ${mb} MB`);
  console.log('\n✅ Done! Data written to ./data/');
}

main().catch(e => { console.error('❌ Build failed:', e); process.exit(1); });
