# cel's headspace — STYLE.md

The single source of truth for how this hub looks, feels, and behaves.
Every edit must be checked against this file. When something feels wrong, the answer is here.

---

## 0. THE ONE RULE

This is **not a website**. It is a **personal living archive** — a cross between a well-used notebook, a magazine spread, a Pinterest board, and Apple Notes.

Information does not live in stacked page-sections. It lives in a **masonry of cards**, where each piece of data takes the visual shape that lets it be understood in 2–3 seconds. **Text is the last choice, not the first.**

If an edit makes the hub feel more like a corporate dashboard, a landing page, or a settings screen — it is wrong, no matter how "clean" it looks.

---

## 1. FONTS

Three families. The handwritten fonts are the **voice** (things you glance at). DM Sans is the **substance** (things you read).

### Files
Place these in a `/fonts/` folder next to the HTML:
- `fonts/FuLuLingGanHeChaTi-2.ttf` → family name **`fululing`** (English + Chinese, handwritten)
- `fonts/NanumMuGungHwa.ttf` → family name **`Nanum MuGungHwa`** (Korean, handwritten). *(ASCII filename — the original Korean-named file broke during zip extraction; keep it ASCII.)*
- DM Sans → loaded from Google Fonts (or `fonts/DMSans.ttf`)

### @font-face
```css
@font-face{
  font-family:'fululing';
  src:url('fonts/FuLuLingGanHeChaTi-2.ttf') format('truetype');
  font-weight:normal; font-style:normal; font-display:swap;
}
@font-face{
  font-family:'Nanum MuGungHwa';
  src:url('fonts/나눔손글씨_무궁화.ttf') format('truetype');
  font-weight:normal; font-style:normal; font-display:swap;
}
/* DM Sans via Google Fonts in <head>:
   <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"> */
```

### The two font variables
```css
:root{
  /* the handwritten VOICE — fululing handles EN+CN, Nanum handles KR, both fall to DM Sans */
  --font-hand:'fululing','Nanum MuGungHwa','DM Sans',-apple-system,sans-serif;
  /* the readable SUBSTANCE */
  --font:'DM Sans','fululing','Nanum MuGungHwa',-apple-system,sans-serif;
}
```

### THE RULE — when each is used

**`--font-hand` (handwritten) is for the VOICE:**
- Page / subsection titles (`.dash-head-t`, `.focal-title`, `.sec-title` when it's a real title)
- Section headers and eyebrows that act as headers
- Navigation / sidebar labels
- Big focal numbers and stat headlines (net worth figure, streak count, countdown)
- Quote cards, affirmations, "a note to self" headers, journal-prompt titles, scribble note titles
- Anything decorative, personal, or glance-only

**`--font` (DM Sans) is for the SUBSTANCE — everything you actually READ:**
- All body text, descriptions, note content
- Article card titles + meta (they're scannable content, not headers)
- All data: finance figures in tables, portfolio values, monthly line items, dates in tight columns
- Form inputs, buttons, dropdowns
- Any list of items, any table, any dense block
- Small labels under 11px (handwritten gets messy at small sizes)

**Quick test:** *Do I glance at it or read it?* Glance → `--font-hand`. Read → `--font`.

### Hard font rules
- **Never** `font-style: italic` anywhere. For lightness use `font-weight: 300`.
- **Never** set handwritten font below 13px (it turns to mush).
- DM Sans weights: 300 (light), 400 (regular), 500 (medium). Never 600/700.
- Default `body` is `--font` (DM Sans). Handwritten is opt-in per element via `--font-hand`.

---

## 2. COLOR

### Palette
```css
:root{
  --bg:#F4F0EB;          /* warm cream — page background */
  --card:rgba(255,255,255,0.55);  /* soft linen card surface */
  --t1:#1C1A17;          /* near-black — primary text / headlines */
  --t2:#3B3835;          /* dark — strong body */
  --t3:#6B6760;          /* mid — body */
  --t4:#9E9A92;          /* muted — meta, captions */
  --t5:#C5C0B8;          /* faint — hints, placeholders */
  --sage:#7EA88E;   --sage-bg:rgba(126,168,142,0.10);
  --blush:#C9949C;  --blush-bg:rgba(201,148,156,0.10);
  --honey:#BDA36A;  --honey-bg:rgba(189,163,106,0.10);
  --lavender:#B0A0C8; --lavender-bg:rgba(176,160,200,0.08);
}
```

### Accent identity per subsection
Each subsection has ONE dominant accent. Used on focal washes, accent borders, category spines — never flooding the whole screen.
```
Finance      → honey      Monthly     → blush
Portfolio    → sage       Property    → stone/neutral
Rituals      → lavender   Movement    → sage
Pilates      → blush      Maintenance → honey
Books        → lavender   Articles    → lavender
Korean       → blush      Japanese    → sage
Bucket list  → lavender   Trips       → honey
Scribbles    → lavender
```

### Tint rules
- Focal / hero wash: accent at **0.08–0.12** opacity (must be visible — not 0.03).
- Card background: `--card` (translucent white), never flat gray.
- Accent borders (income/expense rows, spines): accent at **0.5** opacity, 2–4px, on ONE side only.
- **Single-sided borders get `border-radius: 0`.** Rounded corners only with full borders.
- Text on a colored chip uses the **darkest shade of that same color**, never black/gray.

---

## 3. THE FEEL (design constitution)

It should feel like:
- opening a well-used notebook
- flipping through a travel journal
- reading a magazine spread
- sorting through polaroids
- walking through a small museum exhibition
- looking at a bedroom inspiration wall

### NEVER do (the drift-killers)
- ❌ equal-height card grids / uniform tiles
- ❌ KPI dashboard widgets in neat rows
- ❌ giant header image banners at the top of every section
- ❌ italic fonts
- ❌ a section that is just `header → list → header → list`
- ❌ summary cards placed BELOW detail cards
- ❌ wall-of-text cards (>5–6 lines of text = wrong format chosen)
- ❌ hairline dividers (`nb-rule`) between every section — use whitespace
- ❌ short card stretched tall to match a taller neighbor (dead space)
- ❌ decorative images that carry no information

---

## 4. LAYOUT — masonry first

### The engine
```css
.masonry{column-count:4;column-gap:14px;}
@media(max-width:1100px){.masonry{column-count:3;}}
@media(max-width:760px){.masonry{column-count:2;}}
@media(max-width:460px){.masonry{column-count:1;}}
.masonry > *{break-inside:avoid;margin-bottom:14px;display:inline-block;width:100%;}
.masonry.cols3{column-count:3;}  /* denser content */
```
Cards pack vertically by natural height. No row alignment. No stretching. No dead gaps.

### Section header (replaces all banners)
```css
.dash-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin:4px 0 18px;}
.dash-head-t{font-family:var(--font-hand);font-size:24px;color:var(--t1);}   /* VOICE */
.dash-head-stat{font-size:12px;font-weight:300;color:var(--t4);}             /* DM Sans */
.dash-head-actions{margin-left:auto;display:flex;gap:6px;align-items:center;}
```
A slim one-line header. NO giant image. Images live INSIDE cards, in any row or column.

### Density patterns (use instead of one-list-per-section)
- `.grouped-block` — 2–4 small related sections combined into one card with internal `.gb-section` dividers.
- `.side-pair` — two related blocks side by side (`grid-template-columns:1fr 1fr`, collapses to 1 col under 640px). Only pair blocks of similar height; otherwise use masonry.
- `.stat-strip` — single-line computed values in a horizontal row, not separate sections.
- collapsible — dense archive content (transactions, finished books, logs) hidden behind a `▸` toggle.

---

## 5. CARD ARCHETYPES — data picks its shape

Before rendering anything, ask: *what is the fastest visual form of this?* Then build that card, not a paragraph.

| Data | Card type | Primary visual element |
|------|-----------|------------------------|
| A number (net worth, balance) | KPI card | large number first |
| A trend over time | chart card | line/bar mini-chart |
| Allocation / breakdown | stacked bar / ring | proportion bars |
| An article | article card | title-forward, color spine, cover if exists |
| A note | note card | title + snippet, Apple-Notes style |
| Progress to a goal | progress card | ring or bar |
| A schedule | calendar card | calendar grid |
| Places / studios | gallery card | photo + location chip |
| A book / show | cover card / polaroid | cover image |
| Status | badge | colored pill |

Every card must answer **"why am I looking at this?"** within 2 seconds via its primary visual. Text supports the visual; the visual does not support the text.

### Card base
```css
.card{background:var(--card);border:1px solid rgba(60,52,44,0.05);
  border-radius:14px;overflow:hidden;transition:transform 0.18s,box-shadow 0.18s;}
.card:hover{transform:translateY(-3px);box-shadow:0 8px 22px rgba(60,52,44,0.09);}
```
Card titles use `--font-hand`. Card body/meta/data use `--font` (DM Sans).

### Size variants for hierarchy
- default = supporting content
- `.lg` / `.span-2` = important content (bigger title, wider)
- promote ~1 in 7 cards to `.lg` for visual rhythm
- Most important info is largest and first. Never bury the summary.

---

## 6. TOKENS

```
radius:   cards 14px · pills 99px · chips 6–8px · inputs 8px
borders:  1px rgba(60,52,44,0.05) default · 0.5px for fine dividers
spacing:  card gap 14px · section margin 18–28px · card padding 16–20px
chips:    .dash-chip — 10.5px, pill, transparent; .on = ink bg + cream text
shadow:   none at rest · soft lift on hover only (0 8px 22px rgba(60,52,44,0.09))
min font: 11px (DM Sans) · 13px (handwritten)
```

---

## 7. INTELLIGENCE — make it feel alive

- Numbers auto-compute across the hub (pots → net worth → balance sheet → ring). Nothing manually duplicated.
- Cards reflect current state (subscriptions show next charge, streaks count real days, countdowns tick).
- One source of truth per fact — never two cards showing the same number differently.
- Editable in place: click a value to edit, don't open a modal form (esp. Monthly, Scribbles).

---

## 8. SELF-CHECK (run before saving any edit)

1. ☐ Did I use a masonry of cards, not stacked header→list sections?
2. ☐ Is there NO giant header image banner? (slim `.dash-head` only)
3. ☐ Does each card lead with a visual, not a paragraph?
4. ☐ Are titles/headers/nav in `--font-hand`, and body/data/tables in DM Sans?
5. ☐ Zero italic anywhere?
6. ☐ Summary cards ABOVE detail cards?
7. ☐ No card with >5–6 lines of plain text?
8. ☐ Accent color visible (0.08–0.12), not invisible?
9. ☐ No short-card-stretched-tall dead space? (masonry, not rigid grid)
10. ☐ Would this still feel like a notebook/magazine, not a corporate dashboard?

If any answer is no, the edit isn't done.

---

## 9. NOTE ON SINGLE-FILE PORTABILITY (optional)

The hub is currently one self-contained HTML file. The two handwritten TTFs are ~4.4MB each. To keep one portable file, base64-embed them inside the `@font-face` `src` (`url('data:font/ttf;base64,...')`) — adds ~12MB, slower to open. Otherwise keep them in `/fonts/` beside the HTML (recommended: faster, cleaner). DM Sans always loads from Google Fonts CDN.
