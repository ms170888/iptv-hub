# 📺 IPTV Hub

**Free live TV channels from around the world, streamed directly in your browser.**

🔗 **Live Site:** https://ms170888.github.io/iptv-hub/

---

## Features

Browse thousands of free IPTV channels with a Netflix-style dark UI:

- **Search** channels instantly by name, country, or category
- **Filter** by country (with flag emojis), language, or category
- **HLS.js playback** directly in the browser (no plugins needed)
- **Copy stream URL** or open in VLC with one click
- **Auto-updated daily** via GitHub Actions
- **Responsive** — works on desktop and mobile

## Channel Sources

All channels are sourced from the amazing [iptv-org](https://github.com/iptv-org/iptv) project:

- `index.m3u` — main channel list
- `index.country.m3u` — channels by country
- `index.language.m3u` — channels by language
- `index.category.m3u` — channels by category

## Stats

| Metric | Count |
|--------|-------|
| Total Channels | 8,000+ |
| Countries | 200+ |
| Languages | 100+ |
| Categories | 50+ |

## Tech Stack

- Pure HTML/CSS/JS — no build step needed
- [HLS.js](https://github.com/video-dev/hls.js/) for stream playback
- Node.js 18+ for the build script (native `fetch`, no npm deps)
- GitHub Actions for daily data refresh
- GitHub Pages for hosting

## Local Development

```bash
# Clone the repo
git clone https://github.com/ms170888/iptv-hub.git
cd iptv-hub

# Fetch fresh channel data
node build.js

# Serve locally (any static server)
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080`

## Project Structure

```
iptv-hub/
├── build.js              # Node scraper — fetches & parses M3U playlists
├── index.html            # Main HTML shell
├── style.css             # Dark theme styles
├── app.js                # Frontend JS (filtering, cards, HLS player)
├── data/                 # Auto-generated JSON files
│   ├── channels.json     # All channel metadata
│   ├── categories.json   # Category list with counts
│   ├── countries.json    # Country list with flags & counts
│   └── languages.json    # Language list with counts
├── .github/workflows/
│   └── update.yml        # Daily cron: rebuild data + deploy
└── README.md
```

## Disclaimer

All streams are publicly available from [iptv-org](https://github.com/iptv-org/iptv).
This project does not host any streams. Stream availability depends on the channel providers.
Some channels may be geo-restricted.

---

Built with ❤️ | Data from [iptv-org/iptv](https://github.com/iptv-org/iptv)
