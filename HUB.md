# HUB.md — cel's headspace (AI context)

> A single-file personal-life dashboard ("cel's headspace") for **Cel**. This file is the catch-up doc for any AI picking up the project. **Keep it updated every session.** Pair it with `STYLE.md` (look/feel rules) and `finance_data.md` (source finance figures).

---

## 1. What it is / where it lives
- **One file:** everything is in **`index.html`** (HTML + CSS + vanilla JS, no build step, no framework). Edit it directly.
- **Live:** https://vivisheadspace.pages.dev (Cloudflare Pages, serves `index.html` at root).
- **Repo:** `github.com/yaqueline2/equity-terminal` (currently **public** — owner is iterating; do NOT make private without asking, she wants other AIs to access it).
- **Deploy flow:** commit to `main` → push → Cloudflare auto-builds (~1–2 min). That's the whole pipeline. End commit messages with the Co-Authored-By trailer.
- It's a **PWA** — installable to iPhone/Android home screen ("Add to Home Screen"). Auto-updates on open (network-first).

## 2. Tech / architecture
- **Persistence:** `localStorage`, via `store(key,val)` / `load(key,def)`. All keys are prefixed **`cel-`** internally. Data is **per-device** (the phone install and desktop do NOT share data unless flashcard sync is on).
- **HTML escaping:** always use `esc()` for user/dynamic strings.
- **Structure:** 4 top views — **Home / Practice / Wealth / Mind** (`.view[data-view]`), each with subviews (`.subview[data-sub]`):
  - Home: flow, quarters, scribbles, trips
  - Practice: rituals, movement, pilates, maintenance, home
  - Wealth: finance, monthly, investments, property
  - Mind: quotes, articles, korean, japanese
- **Nav:** `.topnav` (`.nv[data-view]` buttons) + `.sb` sidebar (`.sb-i[data-sub]`, rendered per view by `renderSidebar`). `switchView(view)` / `switchSub(view,sub)`.
- **Renders:** each section has a `renderX()` fn that fills its container's `innerHTML` then binds handlers. A guarded init array near the end calls them all (one failing renderer must not blank the app).
- **CRUD conventions:**
  - **Add:** `.add-row[data-add="KIND"]` with `.add-in[data-field]` inputs; central handler is `wireAdd()` (Enter key → reads fields → pushes → store → render). Every `data-add` kind must have a branch there.
  - **Delete:** buttons carry `data-Xdel`; bound in the section's render.
  - **Edit:** inline via `makeEditable(el,current,onSave,opts)` (used widely in finance/monthly/holdings/pots/debts/etc.).
- **Migrations:** when changing seed/default data that existing users already have in localStorage, gate a one-time copy behind a flag (e.g. `if(!load('some-flag',0)){ ...patch...; store('some-flag',1); }`). Examples used: `treat-plan-v2`, `treatlog-rename-v1`, `guides-rn-v5`, `monthly-fix-janmay-1`, `habits-set-v2`.

## 3. Backend (Cloudflare Pages Functions) — `functions/api/`
- **`cards.js`** — flashcard SRS cross-device sync. KV-backed, keyed by a user passphrase (`srs:<token>`). Opt-in via "set up sync".
- **`search.js`** — Yahoo Finance symbol search proxy (powers stock autocomplete in Investments → AI analysis).
- **`widget.js`** — snapshot store for the iOS home-screen widget (`widget:<token>`). GET/PUT JSON.
- **KV binding:** all three use the namespace bound as **`FLASHCARDS`** (set in the Cloudflare dashboard). If an API returns 501 "KV not bound", that's why.

## 4. PWA / offline
- `manifest.json` (display standalone, icons), `sw.js` (cache **`cel-headspace-v2`**, network-first for navigation so edits show, cache-first for assets incl. `webp`), `icons/` (now the pink-flower app icon).
- `index.html` registers `sw.js` and shows a one-time "Add to Home Screen" hint on mobile browsers.
- **Entry/gate** ("threshold"): `#threshold` overlay with mood + "just let me in" (`#th-skip` → `enter()` adds `.gone`). Background `#th-bg` = `assets/wallpaper.png` on desktop, **`assets/mobile-wallpaper.png`** on mobile (chosen by viewport at load). The gate is cosmetic, NOT security.

## 5. Mobile design system (≤700px)  ← big focus area
Desktop is untouched; all mobile rules are gated to `@media(max-width:700px)`.
- **Bottom tab bar:** the `.topnav-nav` pill is `position:fixed` to the bottom (app-style). NOTE: the topnav's `backdrop-filter` is disabled on mobile so the fixed child escapes to the viewport (a filter ancestor traps `position:fixed`).
- **Subview strip:** `.sb` becomes a light frosted horizontal chip row; active chip is a solid dark pill. Scrollbar hidden.
- **"Details behind a tap" (`m-fold`):** add class `m-fold` + `data-fold="label"` to any heavy block. JS `applyMobileFolds()` injects a "view details" toggle before each on mobile; CSS hides the block until `.m-open`. Desktop shows everything (button `display:none`). Applied across Wealth/Practice/Mind to keep "headline + record up top, heavy detail one tap away".
- **Mobile-specific charts:** 2026-glance timeline → vertical list; monthly "at a glance" → 2×2 tiles; rings shrink. (More charts still desktop-shaped when expanded — candidates for mobile versions.)
- **Type:** `html{-webkit-text-size-adjust:100%}` (critical — iOS was auto-inflating text). Big handwritten headers scaled down on mobile.
- **Layout gotchas fixed:** grid blowouts need `min-width:0` (e.g. `.mt-skin-col`); flex pill rows should `overflow-x:auto` not wrap to a cut-off stack (movement `.prog-filters`).
- **Philosophy (owner's words):** mobile is for **record + glancing at important things** — keep it minimal, not the full desktop content.

## 6. Flashcards / SRS / deep links
- Decks: `FC_DECKS = {ko:[ko-grammar, ko-cheat, ko-vocab], jp:[jp-core, jp-egg]}`; deck JSON in `decks/`.
- SRS state per deck: `load('srs-'+deckId,{})`, entries `{d: dueDay,...}`. `fcCounts(deck)` → `{due,newCards,seen}` (due = entries with `d<=today`; new = up to 20/day of unseen). `fcStart(lang,deckId)` opens the study overlay (`#fc-ov`).
- **Deep link:** `?go=<deckId>` (e.g. `?go=ko-vocab`) skips the gate, switches to the language, and starts that deck. Used by widgets/shortcuts to jump straight into study.

## 7. iOS home-screen widget (Scriptable)
- The app computes a small snapshot (`buildWidgetSnapshot()`: today's to-dos + vocab due/new, with per-language `snap.ko`/`snap.jp` and per-deck `snap.decks`) and PUTs it to `/api/widget?token=<widgetToken()>` on load + when backgrounded.
- "📲 widget" link in the flashcards footer reveals the personal widget URL.
- User pastes a **Scriptable** script that GETs that URL and renders a widget.
- **iOS limitation (important):** a widget tapping an `https://` link always opens **Safari**, not the installed PWA — there is no way to open a specific home-screen web app at a route. Options: (a) widget → `?go=ko-vocab` opens Safari straight into study (recommend flashcard **sync** so progress matches the installed app, since Safari and the PWA have separate localStorage); (b) a Shortcut "Open App: headspace" opens the installed app but only to its start page (can't deep-link).

## 8. Scribbles (personal wiki)
- Notebooks (`scribbles` store): Notes, Guides, then place-folders (Cafes/Restaurants/Studios/Beauty). `PLACE_META` marks place folders.
- **Cafes/Restaurants** auto-mirror from `REDNOTE_PLACES` (classified, real names) via `mirrorPlaces()`. Card link: Google Maps on desktop, **XHS post (`rn` field) on mobile** (opens her rednote app). Studios city filter = `CHINA_CITIES` (fixed list).
- **Guides** (cats / apartment) seeded from `GUIDE_SEED`; each gallery card is a tap-to-expand `<details>` with the full rednote post text inline (desktop) — mobile hides the gallery and shows a pressable board-link button. Board links must be `contenteditable="false"` to be tappable (guides render inside the contenteditable note editor).
- **Rednote (XHS) scraping** (how cafe names + guide content were obtained): posts are QR-walled; harvest each post's `xsec_token` from the board page's reactive store (real wheel-scroll to load all), then same-origin `fetch(/explore/<id>?xsec_token=..&xsec_source=pc_feed)` and parse `noteDetailMap`. Rate-limited after ~36 rapid fetches (captcha) — go slow. See memory `rednote-scraping`.

## 9. Finance gotcha (easy to re-break)
The **earliest tracked month's `savings` = opening pot balances**, NOT monthly transfers — exclude from flow math. `computeMaybank`, `getNWHistory` (the "2026 in a glance" cumulative-savings trajectory) depend on this. Keys: monthly `monthly-v9`, subs `subs-v3` (both had read/write key mismatches that were fixed). Never hardcode the current month — use `curMonthStr()`.

## 10. Working / verifying (for the next AI)
- Preview tools (`mcp__Claude_Preview__*`): `preview_start` (launch.json name `headspace`, port 7725), load **`http://localhost:7725/index.html`** (root "/" is empty). Skip the gate in evals via `document.getElementById('th-skip').click()` or `?go=...`.
- Mobile testing: `preview_resize` to **390×844**; check `document.documentElement.scrollWidth>392` for overflow; always re-check desktop (1440) isn't broken.
- After JS edits, syntax-check by extracting `<script>` blocks and `node --check`.
- The local preview is a static server — **`/api/*` functions do NOT run locally**; test them with `curl` against the deployed site.

## 11. Status / changelog (newest first)
- iOS widget pipeline (`/api/widget` + snapshot + Scriptable) + `?go=` deep link to jump straight into a deck. Per-language/per-deck snapshot breakdown.
- Flower app icon + portrait mobile entry wallpaper (`assets/mobile-wallpaper.png`).
- Mobile redesign: bottom tab bar, light chip strip, `m-fold` "view details" across Wealth/Practice/Mind, mobile-specific charts, iOS text-size fix, header scaling; fixes for movement program pills, maintenance table blowout, monthly-PDF in-app overlay (was a trapping popup), scribbles XHS links on mobile.
- CRUD audit: every add/edit/delete works; fixed pilates session delete + articles add/delete; removed dead code (renderGoals/noteCardHTML).
- Maintenance: skin treatments section (log + plan tables), 针清+黑金超光子 log.
- Scribbles: real cafe names from rednote content; guides inline content; quotes screenshot capture.
- Earlier: flashcards + SRS + sync + PWA; finance correctness; dusty-blue (no green); stock AI analysis + autocomplete.

## 12. Known open items / ideas
- More mobile-native charts when folds are expanded (allocation, dividend, sector → simplified mobile versions).
- 写真馆 Studios: owner will provide studio names / photos / WeChat IDs to build out.
- "refresh my rednote boards" re-pull when she saves new posts.
- Optional: full cross-device data sync (currently only flashcards sync); splash screen / page transitions.

---
*Maintained for AI handoff. When you finish a session, append what changed to §11 and adjust the relevant sections.*
