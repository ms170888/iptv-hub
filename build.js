#!/usr/bin/env node
// build.js - IPTV aggregator builder
// No npm dependencies — uses built-in fetch (Node 18+)

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

// Sources and their type (affects how group-title is interpreted)
const SOURCES = [
  { url: 'https://iptv-org.github.io/iptv/index.m3u',          type: 'main' },
  { url: 'https://iptv-org.github.io/iptv/index.country.m3u',  type: 'country' },
  { url: 'https://iptv-org.github.io/iptv/index.language.m3u', type: 'language' },
  { url: 'https://iptv-org.github.io/iptv/index.category.m3u', type: 'category' },
];

// ISO 3166-1 alpha-2 → country name (partial, for display)
const COUNTRY_NAMES = {
  AF:'Afghanistan',AL:'Albania',DZ:'Algeria',AD:'Andorra',AO:'Angola',
  AR:'Argentina',AM:'Armenia',AU:'Australia',AT:'Austria',AZ:'Azerbaijan',
  BH:'Bahrain',BD:'Bangladesh',BY:'Belarus',BE:'Belgium',BJ:'Benin',
  BO:'Bolivia',BA:'Bosnia',BW:'Botswana',BR:'Brazil',BN:'Brunei',
  BG:'Bulgaria',BF:'Burkina Faso',BI:'Burundi',KH:'Cambodia',CM:'Cameroon',
  CA:'Canada',CF:'Central African Republic',TD:'Chad',CL:'Chile',CN:'China',
  CO:'Colombia',CD:'DR Congo',CG:'Congo',CR:'Costa Rica',CI:'Côte d\'Ivoire',
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

// Extract 2-letter country code from tvg-id like "channel.us@SD" → "US"
function countryFromTvgId(tvgId) {
  if (!tvgId) return '';
  const m = tvgId.match(/\.([a-z]{2})@/i);
  return m ? m[1].toUpperCase() : '';
}

// ISO 3166-1 alpha-2 to flag emoji
function codeToFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0)));
}

// Parse #EXTINF attributes
function parseExtInf(line) {
  const res = { name: '', tvgId: '', tvgName: '', tvgCountry: '', tvgLanguage: '', tvgLogo: '', groupTitle: '' };
  const attrRe = /([\w-]+)="([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(line)) !== null) {
    const k = m[1].toLowerCase().replace(/-/g, '');
    const v = m[2].trim();
    if (k === 'tvgid') res.tvgId = v;
    else if (k === 'tvgname') res.tvgName = v;
    else if (k === 'tvgcountry') res.tvgCountry = v.toUpperCase();
    else if (k === 'tvglanguage') res.tvgLanguage = v;
    else if (k === 'tvglogo') res.tvgLogo = v;
    else if (k === 'grouptitle') res.groupTitle = v;
  }
  const ci = line.lastIndexOf(',');
  if (ci !== -1) res.name = line.slice(ci + 1).trim();
  if (!res.name && res.tvgName) res.name = res.tvgName;
  return res;
}

// Parse M3U content — type controls how group-title is used
function parseM3U(content, sourceType) {
  const channels = [];
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#EXTVLCOPT') && !l.startsWith('#KODIPROP'));

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF:')) continue;
    const inf = parseExtInf(lines[i]);
    if (!inf.name) continue;

    let streamUrl = '';
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].startsWith('#')) { streamUrl = lines[j].trim(); break; }
    }
    if (!streamUrl) continue;

    // Derive country: prefer explicit tvg-country, then tvg-id extraction
    let country = inf.tvgCountry || countryFromTvgId(inf.tvgId);

    // Override based on source type
    let category = '';
    let language = '';

    if (sourceType === 'country') {
      // group-title IS the country name — we already have country from tvg-id
      if (!country && inf.groupTitle) {
        // Try to map country name to code
        const name = inf.groupTitle.trim();
        const found = Object.entries(COUNTRY_NAMES).find(([, v]) => v.toLowerCase() === name.toLowerCase());
        if (found) country = found[0];
      }
      category = ''; // will be merged from main or category source
    } else if (sourceType === 'language') {
      language = inf.groupTitle || inf.tvgLanguage || '';
    } else if (sourceType === 'category') {
      category = inf.groupTitle || '';
    } else {
      // main: group-title is category
      category = inf.groupTitle || '';
      language = inf.tvgLanguage || '';
    }

    channels.push({ name: inf.name, tvgId: inf.tvgId, tvgLogo: inf.tvgLogo, country, language, category, url: streamUrl });
  }
  return channels;
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch(url, { signal: ctrl.signal });
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

async function main() {
  console.log('🚀 IPTV Hub Builder Starting...\n');
  mkdirSync(DATA_DIR, { recursive: true });

  // channelMap: url → channel object (dedupe by URL, merge metadata)
  const channelMap = new Map();

  for (const src of SOURCES) {
    console.log(`⬇️  Fetching [${src.type}]: ${src.url}`);
    const content = await fetchWithRetry(src.url);
    if (!content) { console.warn('  ⚠️  Skipped\n'); continue; }

    const parsed = parseM3U(content, src.type);
    let added = 0, updated = 0;

    for (const ch of parsed) {
      if (!channelMap.has(ch.url)) {
        channelMap.set(ch.url, {
          name: ch.name,
          tvgId: ch.tvgId,
          logo: ch.tvgLogo,
          country: ch.country || 'XX',
          language: ch.language || '',
          category: ch.category || '',
          url: ch.url,
        });
        added++;
      } else {
        // Merge: fill in missing fields
        const existing = channelMap.get(ch.url);
        if (!existing.country || existing.country === 'XX') existing.country = ch.country || existing.country;
        if (!existing.language && ch.language) existing.language = ch.language;
        if (!existing.category && ch.category) existing.category = ch.category;
        if (!existing.logo && ch.tvgLogo) existing.logo = ch.tvgLogo;
        updated++;
      }
    }
    console.log(`  ✅ ${parsed.length} parsed → +${added} new, ~${updated} merged (total: ${channelMap.size})\n`);
  }

  // Finalize channels
  const channels = [...channelMap.values()].map((ch, id) => {
    const country = ch.country || 'XX';
    const flag = codeToFlag(country);
    return {
      id,
      name: ch.name,
      logo: ch.logo || '',
      country: country,
      countryName: COUNTRY_NAMES[country] || country,
      flag,
      language: ch.language || 'Unknown',
      category: ch.category || 'Uncategorized',
      url: ch.url,
    };
  });

  // Build filter data
  const catMap = new Map();
  const countryMap = new Map();
  const langMap = new Map();

  for (const ch of channels) {
    // Categories
    catMap.set(ch.category, (catMap.get(ch.category) || 0) + 1);

    // Countries (exclude XX)
    if (ch.country !== 'XX') {
      if (!countryMap.has(ch.country)) {
        countryMap.set(ch.country, { code: ch.country, name: ch.countryName, flag: ch.flag, count: 0 });
      }
      countryMap.get(ch.country).count++;
    }

    // Languages
    if (ch.language && ch.language !== 'Unknown') {
      langMap.set(ch.language, (langMap.get(ch.language) || 0) + 1);
    }
  }

  const categories = [...catMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  const countries = [...countryMap.values()]
    .sort((a, b) => a.code.localeCompare(b.code));

  const languages = [...langMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  // Write
  writeFileSync(join(DATA_DIR, 'channels.json'),   JSON.stringify(channels, null, 2));
  writeFileSync(join(DATA_DIR, 'categories.json'), JSON.stringify(categories, null, 2));
  writeFileSync(join(DATA_DIR, 'countries.json'),  JSON.stringify(countries, null, 2));
  writeFileSync(join(DATA_DIR, 'languages.json'),  JSON.stringify(languages, null, 2));

  const mb = (JSON.stringify(channels).length / 1024 / 1024).toFixed(2);
  console.log('📊 Summary:');
  console.log(`  Channels:   ${channels.length}`);
  console.log(`  Categories: ${categories.length}`);
  console.log(`  Countries:  ${countries.length}`);
  console.log(`  Languages:  ${languages.length}`);
  console.log(`  Data size:  ${mb} MB`);
  console.log('\n✅ Done! Data written to ./data/');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
