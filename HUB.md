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
- **Quotes archive:** quote records support `text`, `author`, `source`, `music`, `audio`, `audioDuration`, `type`, `link`, `img`/`images`, `imageSize`, and optional `mediaNote`/`platform`. The verified Douyin batch is generated into `assets/douyin/quotes.js`; covers and playable MP3/M4A tracks live under `assets/douyin/`. Every archive write runs `syncDouyinCacheKey()`, which derives the page URL and service-worker cache name from the file's SHA-256 so deployed browsers cannot reuse stale metadata. From the ACC root, Lux may place up to 50 canonical links in the ignored `.local-api/douyin-intake-queue.json` and run the exact bounded intake command. The local-Chrome helper retries throttling, validates host/path, captures caption/creator/cover/music/audio, and records the intake here. Its separate explicit-approval publisher verifies the full archive and persistent Safari/PWA player before committing the archive, matching page/worker cache keys, and HUB note. `getQuotes()` merges new seed fields into existing localStorage records without overwriting user edits and deduplicates by source link or normalized text. Deleted generated records are preserved in the `quotes-deleted-v1` tombstone list so a reload cannot seed them again; `quote-samples-removed-v1` removes the six retired demonstration quotes from existing devices.
- **Quotes presentation:** the Quotes wall is a compact mixed-width masonry archive: roughly five varied columns on desktop and two tap-to-read columns on normal phones, falling back to one only below 341px. Images retain their natural proportions. `openQuoteModal()` first hydrates legacy records from the verified archive, mounts the visible player, then starts one globally tracked playback session. The modal provides play/pause, seek, playback status and automatic stop on close. Only records with a verified `audio` path render player controls; music-credit-only records render a compact label instead of a disabled player.
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
- **No hosted Claude/OpenRouter route.** Online AI analysis is intentionally disabled; do not add an API key or recreate a paid AI proxy without Celine's explicit decision.
- **`financials.js`** — Yahoo Finance quoteSummary proxy for structured stock-analysis inputs.
- **`rss/[[path]].js`** — Yahoo Finance RSS proxy.
- **`search.js`** — Yahoo Finance symbol search proxy (powers stock autocomplete in Investments → AI analysis).
- **`telegram.js`** — Telegram webhook parser that sends a tap-to-import inbox link back to Cel; it stores messages as local notes and does not call an LLM.
- **`widget.js`** — snapshot store for the iOS home-screen widget (`widget:<token>`). GET/PUT JSON.
- **`yahoo/[[path]].js`** — Yahoo Finance chart/price proxy.
- **KV binding:** `cards.js` and `widget.js` use the namespace bound as **`FLASHCARDS`** (set in the Cloudflare dashboard). If one of those APIs returns 501 "KV not bound", that's why.

## 4. PWA / offline
- `manifest.json` (display standalone, icons), `sw.js` (content-derived quote cache, currently **`cel-headspace-q-d272d9b386df`**, network-first for navigation, cache-first for stable media), `icons/` (now the pink-flower app icon). The mutable quote archive URL includes the same content hash and `_headers` requests browser revalidation; never restore a blanket immutable `/assets/*` rule because it makes new article metadata stale on Cloudflare.
- `index.html` registers `sw.js`, requests an update on load, performs at most one guarded refresh when the worker announces a new cache version, and shows a one-time "Add to Home Screen" hint on mobile browsers.
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

`FINANCE_PLAN.md` is Finn's private living plan. It is deliberately listed in
this nested repository's `.gitignore`, must never be published with Headspace,
and is backed up separately by ACC. Finn reads it alongside the dated
`finance_data.md` snapshot and updates it in place only when Celine confirms a
material fact, decision, goal, or completed action.

Finance values are private state, never deployable source data. Connected
devices sync the allow-listed `cel-headspace-finance` stores through the
authenticated `/api/finance` Pages Function and the existing private
`FLASHCARDS` KV binding. The secret is a Cloudflare Pages secret and a macOS
Keychain item; it must never enter HTML, Git, logs, memory, or chat. Finn writes
and validates the ignored local pending snapshot, then uses the bounded
`acc-finance-sync-finn` command. UI, schema, and feature changes still use the
reviewed Headspace publication workflow. The working contract is
`../skills/finn_finance_handoff.md`.

## 10. Working / verifying (for the next AI)
- Preview tools (`mcp__Claude_Preview__*`): `preview_start` (launch.json name `headspace`, port 7725), load **`http://localhost:7725/`** or **`http://localhost:7725/index.html`**. Skip the gate in evals via `document.getElementById('th-skip').click()` or `?go=...`.
- Simple Python preview: `python3 serve.py`, then open **`http://127.0.0.1:7724/`**.
- `serve.py` now includes lightweight local JSON stubs for **`/api/widget`** and **`/api/cards`**, stored in ignored `.local-api/`, so widget/flashcard sync calls do not throw 501 during local browser tests.
- Mobile testing: `preview_resize` to **390×844**; check `document.documentElement.scrollWidth>392` for overflow; always re-check desktop (1440) isn't broken.
- After JS edits, syntax-check by extracting `<script>` blocks and `node --check`.
- Other Cloudflare Pages functions still run only in production/Cloudflare tooling; test `claude`, `financials`, `search`, `rss`, `telegram`, and Yahoo proxies against the deployed site or a real Pages dev environment.

## 11. Status / changelog (newest first)
- Direct Finn finance sync (23 Jul 2026): retired the recurring export/import loop. Wealth now pulls and saves private finance stores through an authenticated, no-cache Cloudflare KV endpoint after a one-time device connection. Finn validates locally and syncs through a bounded Keychain-backed command; private values remain absent from public HTML and Git. New finance fields, stores, and UI are still implemented as versioned Headspace code changes.
- Reading desk + back issues (21 Jul 2026): added 7 real Substack reads Cel has actually read this month into Mind → Articles (gated one-time merge behind `articles-w2w3-add-v1` so existing installs pick them up without duplicating on repeat loads) — titles/authors/links verified via live search/fetch, not guessed. Added a `FRONTPAGE_ARCHIVE` array holding Issue No.1's full original content (recovered from commit `fe58380` since Issue No.2 overwrote the single `FRONTPAGE` slot) and reworked `openFrontpage()`/`fpAllIssues()` so the newspaper overlay now shows an "issue no." switcher strip — Cel can browse back issues without losing older ones each time a new issue prints. Future issues: keep appending fully-formed issue objects to `FRONTPAGE_ARCHIVE` before overwriting `FRONTPAGE` with the new one, so nothing gets lost.
- Private Finn handoff and source-data repair (19 Jul 2026): Wealth/Monthly now exports a private allow-listed finance snapshot for Finn and imports his validated return file with a preview and confirmation. Removed private finance exports and live balances, holdings, cash flow, insurance, debt and goal records from deployable defaults; existing localStorage data remains intact. Finance renderers now read current stores instead of stale legacy constants.
- Lux clipping intake 2026-07-19: captured four verified Douyin clippings with local media. Added video-detail cover extraction, corrected JPEG/MP3 signature detection, and strengthened archive verification to reject media whose bytes do not match its role. The three video cards currently contain their Douyin caption/title and cover, not an invented transcription of the list shown inside the video.
- Headspace Times Issue No.2 (19 Jul 2026): filled `FRONTPAGE` with the week of 13–19 July — hero `assets/week02-hero.png` (pink meditation illustration), inset `assets/week02-inset.png` (credited to artist "seur", used in the piano article). Lead ties together the week's throughline: job dissatisfaction reframed as a need for a protected personal routine, not the job itself, evidenced by Day 7 of the 14-day movement challenge, journaling, and a first piano session in 2+ years. Articles: piano, movement, and the 创业 (business) recurring thought. Cel gave explicit "print it" go-ahead and delegated the hero photo choice to Sol.
- Private living finance plan: recovered Finn's full plan from the obsolete Plan-mode temporary file into Git-ignored `FINANCE_PLAN.md`; ACC now injects it into Finn's finance context and includes it explicitly in the private local backup without publishing it through Headspace.
- Cloudflare quote archive cache repair: production diagnosis showed the current HTML and MP3 were deployed while the browser retained an older `quotes.js` under the blanket seven-day immutable asset policy. The archive remains on Cloudflare's proven `quotes.js` asset path but now uses a SHA-256 query key mirrored in the service-worker cache; Lux's intake updates both automatically. Stable images/audio remain immutable while mutable metadata revalidates.
- Legacy quote media repair: added unambiguous fallback matching by canonical link, source, music credit, or author so older localStorage records recover their verified archive audio and images even when their ID or full text changed. The affected `被子外面很危险创作的原声` article now resolves to its 28.45-second local MP3. Credit-only entries no longer render a large disabled `audio unavailable` control. Service-worker cache v7 and the update listener now accept every numbered cache release.
- Quote player control correction: removed pre-modal `pointerdown` playback, which could leave an orphaned Web Audio session playing without controls. Each article now hydrates its generated audio metadata before opening, mounts an always-visible sticky player first, and only then starts one globally tracked session. The player shows a real `Ⅱ`/`▶` control and `playing`/`paused` status; pausing and closing were verified in the rendered UI, and closing removes the audio element. Service-worker cache v6 retires the leaked v5 player on reload.
- ACC agent workflows: Lux can repeat the complete article/image/music/audio intake with archive validation and a separate approved publisher. Every Personal agent can finish a Headspace change through the same manifest-bound attachment-import, verify and publish workflow. It accepts media only from Personal chat uploads, commits only declared release files, and rejects private paths, unrelated changes, overwrites, syntax errors, missing documentation and broken quote media.
- Quote music Safari/PWA correction: moved playback to one pre-mounted global audio engine and made `play()` the first operation in the clipping click handler, before modal construction. Added an explicit service-worker v4 update handshake with a session-scoped one-refresh guard so installed copies cannot remain on the broken player without creating refresh loops. Verified that the same engine remains unmuted at full volume and advances playback time in both Chromium and Safari-family WebKit; also verified the source AAC file contains a normal audible signal.
- Quote music autoplay hardening: replaced the detached pre-played `Audio` object with a native mounted `<audio autoplay playsinline>` element, then calls `play()` synchronously inside the article tap. The player is now above the article, explicitly unmutes at full volume, and shows `playing`, `paused`, or `tap to play` when a browser still requires a second gesture.
- Quotes density/deletion: reduced desktop cards to a five-across mixed-width archive, added a two-column phone wall, kept natural image ratios, removed six placeholder quotes, made delete controls visible, and added durable deletion tombstones. Music now creates and starts a fresh media element inside the article's direct pointer gesture. If Safari or an embedded WebView rejects that media request, the same gesture also unlocks a Web Audio context that decodes and starts the track; the visible music control remains the final fallback for a browser configured to block all automatic sound. Playback is disposed when the article closes.
- Quotes wall/audio: replaced the rigid alternating rows with responsive natural-ratio masonry; added click-to-play article music with a compact player; upgraded existing localStorage records with `audio`, duration and image-size seed fields. All 25 music-labelled Douyin entries now have byte-verified local MP3/M4A audio; the one spoken video remains music-free.
- Lux Douyin intake: added a bounded local-Chrome intake command with canonical URL validation, bounded retries, streamed-audio capture, real media-type detection, generated result/remaining-failure reports, and a separate explicit-approval publisher.
- Quotes/Douyin intake: added 26 browser-verified clippings with full 文案, creator, source link, stable local cover image, and 25 available music credits; the single long spoken video is labelled without an invented song. Added first-class music display/editing and migration-safe quote deduplication.
- Local-dev QA: removed `.DS_Store` deployment junk, added `serve.py` local `/api/widget` + `/api/cards` JSON stubs, and verified Chromium load with no console errors or failed requests.
- Hub QA pass: restarted localhost preview, verified all visible subviews for console errors, overflow, broken images, blank cards, missing add buttons, and drifting delete controls; fixed the dynamic quarter calendar add button and removed the unnecessary final Practice/Home image block.
- Finance wealth header: FIRE badge now shows progress percent and FIRE number, with invested and remaining amounts in the hover title.
- Flow order: moved the 2026 progress and July calendar into a full-width two-card row above today's page.
- Finance wealth header: removed the finance command banner and added a small FIRE label at the bottom of the top milestone ring.
- Hub delete controls: normalized shared `x` buttons so row/table deletes sit inline instead of inheriting drifting absolute positioning across sections.
- Home restock: moved the restock list to the very top as a full-width inventory table, added area filters, and expanded rows with qty, cadence, last bought, notes, and bought-today action.
- Flow right column: moved the July/month calendar beside the 2026 progress panel instead of keeping it as a full-width strip.
- Skin treatment log: fixed the delete `x` button inheriting absolute row positioning inside the table.
- Flow header: enlarged the profile photo beside the good-morning greeting on desktop and mobile.
- Flow right column: removed the reading/currently-with-me block, moved 2026 progress above the cat photo, and changed the cat image from cropped cover sizing to full-image contained sizing.
- Flow refinement: habits now read as soft stamped paper marks, the 7-day tracker uses small stamp-like pips, and added only decorative margin doodles around habits/reading/year progress.
- Home/Flow editorial redesign: entry gate now exits cleanly without mobile ghosting; first viewport keeps the original good-morning row with net worth, 2026 progress, Korean streak, and together-days stats beside it; lower Home became clipped daily pages with softer to-dos, habit stamp tracker, compact month map, and visible reading clippings.
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
