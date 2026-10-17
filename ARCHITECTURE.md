# Infinity Circuit Website: Architecture

How infinitycircuitmcp.com is built, how data flows, and the settings that must not be "fixed."

All earlier **(verify)** items were checked against the repo and the deployed web app on Oct 17, 2026. If you add an unconfirmed item, mark it **(verify)**.

No credentials belong in this file. The TO access code, webhook URLs, and OAuth secrets live in the Sheet's Config tab, Apps Script Script Properties, GitHub Secrets, Cloudflare environment variables, and a password manager.

---

## 1. Stack at a glance

| Layer | Tool | Notes |
|---|---|---|
| Static site generator | Eleventy (11ty) | Templates are Nunjucks (`.njk`) |
| Hosting | Cloudflare Pages (free tier) | Auto-deploys on every push to `main` |
| Repo | `github.com/reckonerX/infinity-circuit` | Local clone at `G:\infinity-circuit` |
| Serverless | Cloudflare Pages Functions | GitHub OAuth for Decap CMS |
| CMS | Decap CMS | News posts; commits straight to the repo |
| Data | Google Sheets | Read live by the browser on page load |
| Write API | Google Apps Script web app | TO submissions, standings recalculation, notifications |
| Email | MailerLite | Signup strip and delayed popup on the site |
| Notifications | Discord webhooks | #circuit-news (GitHub Action), #standings (Apps Script) |
| Domain | Namecheap registrar, Cloudflare DNS | `infinitycircuitmcp.com`; Pages URL `infinity-circuit.pages.dev` |

---

## 2. Local development

```bash
cd G:\infinity-circuit
npm start            # runs: eleventy --serve
# open http://localhost:8080
```

`package.json` scripts: `"start": "eleventy --serve"`, `"build": "eleventy"`.

**Always pull before pushing.** Decap CMS commits to `main` on its own, so a push will be rejected whenever someone has published a post since your last pull:

```bash
git pull
git add .
git commit -m "message"
git push
```

Cloudflare deploys in about a minute after a push. If the live site looks stale, check the deployment log in Cloudflare before assuming the code is wrong.

---

## 3. Repo layout (key files)

```
.github/workflows/discord-notify.yml   GitHub Action: posts new news posts to #circuit-news
functions/api/auth/index.js            Pages Function: starts GitHub OAuth for Decap
functions/api/auth/callback.js         Pages Function: OAuth callback
src/_includes/layouts/base.njk         Site layout, nav, OG meta tags
src/_includes/layouts/post.njk         News post layout
src/index.njk                          Home: live events + standings previews, Champion section
src/standings/index.njk                Standings (live from Sheet)
src/events/index.njk                   Events calendar (live from Sheet; upcoming/past split)
src/news/index.njk                     News list
src/gallery/index.njk                  Gallery
src/rules/index.njk                    Rules page: BOTH documents on one page (see below)
src/about/index.njk                    About
src/apply/index.njk                    Apply to Host form (posts to Apps Script)
src/submit/index.njk                   TO results submission form (posts to Apps Script)
src/assets/docs/rules-and-structure.pdf      Circuit Rules & Structure PDF download
src/assets/docs/event-operations-guide.pdf   Event Operations Guide PDF download
src/assets/css/style.css               Site styles
src/admin/config.yml                   Decap CMS config
src/admin/index.html                   Decap CMS admin page
src/posts/                             News posts (Markdown, written by Decap)
```

### Rules page

`src/rules/index.njk` holds both documents: Circuit Rules & Structure (anchor `#circuit-rules`) and the Event Operations Guide (anchor `#operations-guide`). There is no separate Event Operations page.

- The page is a **summary**, not a full copy of either document. The PDFs are authoritative, and the page says so.
- Each section shows its version in the eyebrow at the top and a "Version X.Y | Last updated [date]" line at the bottom (Brand Guide 9.3). Update both when a document changes.
- The PDF filenames use hyphens: `rules-and-structure.pdf`, `event-operations-guide.pdf`. Replace the file in place; the download links don't change.
- Current as of Oct 17, 2026: Circuit Rules v1.4, Event Operations Guide v1.5. Ops section headings use the v1.5 section numbers (2, 3, 5, 6, 8, 15); sections the page doesn't summarize are skipped.

---

## 4. Data flow

### 4.1 Reading (site to Sheet)

Pages fetch the Sheet directly in the browser using the gviz JSON endpoint. No API key is needed because the Sheet is published.

```js
var URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
          '/gviz/tq?tqx=out:json&headers=1&gid=' + GID;
```

The response is wrapped in a JS callback. Strip the wrapper before calling `JSON.parse`:

```js
var json = text.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, '');
```

Gviz returns dates as `Date(y,m,d)` strings, with the month 0-indexed. The `isPast()` helper in the events page parses that format.

Standings are near real-time: the next page load reflects whatever the Sheet holds.

### 4.2 Sheet

**Sheet ID:** `1eFyIt13Av9MmEx0pi0Kca9gxCJJdEs4lnV9slVSJQFE`

| Tab | GID | Purpose |
|---|---|---|
| Raw Results | | One row per player result; `Status` = PENDING / APPROVED / REJECTED |
| Players | | One row per player, keyed by Longshanks username. Columns: username, display name, email, Discord, Stone held |
| Standings | 2103732828 | Computed by Apps Script; read by the site |
| Events | 980771470 | Event calendar |
| Gallery | 866280774 | Photos |
| Champions | 359881057 | Champion / Hall of Heroes |
| Applications | | Apply to Host submissions |
| Config | | Settings: TO access code, admin email, `Max Results Counted` (best-N results; default 4), multipliers, base points |

**Rules for editing the Sheet:**
- Never leave placeholder text rows under a header. The site renders them as real events or players.
- Longshanks username is the canonical player ID. Don't key on display names.
- The script looks up each Config value by the exact text in column A. Don't rename a Config label unless the script accepts the new name. The 15+ multiplier is the one exception: the script accepts either `Multiplier 15+` or `Multiplier 15-24`.
- **Never re-run `setupInfinityCircuitSheet()`.** It clears Raw Results, Players, Standings, and Config, which would wipe the season.

### 4.3 Writing (site to Apps Script)

**Endpoint:**
`https://script.google.com/macros/s/AKfycby5wQ2PIHH9IeKp5mgiPpcH8TO9JyhXXeaABTUDZOov4zxZ_r3tdeIgVLbZn40rBAznNg/exec`

**What the web app does:**
- Accepts TO submissions and Apply to Host applications via POST, and checks the TO access code against Config.
- Writes rows to Raw Results as PENDING (admin submissions go straight to APPROVED).
- Scores each row at submission time: base points × attendance multiplier. Events below the minimum (Shards Event under 5 players, Qualifier under 8) are recorded at 0 Shard Points with a note; the Qualifier winner still gets the Stone (Rules v1.4).
- Creates player records on approval, for TO and admin submissions alike.
- Applies the Stone Cascade Rule.
- Recalculates standings.
- Emails the admin.

The submit and apply forms post directly to the Apps Script endpoint. There is no Pages Function proxy. The submit form unlocks with the TO access code; the code is checked client-side, and the page itself is publicly reachable.

**Deploying script changes:** the web app runs a pinned deployment version. After editing the script, use Deploy, then Manage deployments, then edit, then New version. The endpoint URL doesn't change. The onEdit trigger and editor-run functions use the latest saved code without a redeploy.

**Submit form fields:**
- Players can be dragged to reorder placements.
- A Stone dropdown appears for Qualifiers.
- LSID is the numeric Longshanks event ID.

### 4.4 Results workflow

1. The TO submits the form, and rows land in Raw Results as PENDING.
2. The admin reviews and sets each row to APPROVED or REJECTED, one row at a time or several at once (fill-down or paste both work). An onEdit trigger creates missing player records, applies the Stone cascade, and recalculates standings quietly, with no Discord post.
3. Run **`auditStones()`** for a Qualifier to confirm who received the Stone.
4. After all rows for the event are approved, run **`manualRecalculate()`** from the Apps Script editor. This is the only thing that posts to #standings.

`recalculateStandings(notifyDiscord)` takes the flag. Only `manualRecalculate()` passes it as true.

The admin can also enter rows directly, which skips the approval step.

**Stone cascade behavior:**
- It waits until the 1st-place row is approved, then awards the Stone to the highest finisher who holds no Stone.
- If anyone already holds that Stone, it does nothing. Re-approving rows never moves a Stone. To reassign one on purpose, edit Stone Held on the Players tab by hand.

**Standings order:** Stone holders sort first, then everyone else by Shard total. This is intended, and the Discord top-5 uses the same order.

**Editor-only helpers** (neither posts to Discord):
- `checkSetup()`: confirms the webhook property is set and the 15+ multiplier reads correctly.
- `auditStones()`: lists each approved Qualifier's 1st-place finisher next to the current holder of that Stone.

---

## 5. Decap CMS

**Admin URL:** `https://infinity-circuit.pages.dev/admin/`. Log in there, not on the custom domain.

### DO NOT CHANGE

- **`base_url` in `src/admin/config.yml` must stay `https://infinity-circuit.pages.dev`.** On the custom domain, the OAuth popup's postMessage fails cross-origin and login hangs.
- **The GitHub OAuth App callback URL must stay `https://infinity-circuit.pages.dev/api/auth/callback`,** for the same reason.

### Auth

`functions/api/auth/index.js` redirects to GitHub with `client_id` from the Cloudflare env var `GITHUB_CLIENT_ID`, scope `repo`, and passes Decap's `state` parameter through. `functions/api/auth/callback.js` exchanges the code using `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, both Cloudflare env vars.

Publishing a post commits Markdown to `src/posts/`, Cloudflare rebuilds, and the post goes live about a minute later.

---

## 6. Discord webhooks

| Channel | Trigger | Where configured |
|---|---|---|
| #circuit-news | GitHub Action on push to `main`, only when a file in `src/posts/` is **added** | `.github/workflows/discord-notify.yml`; secret `DISCORD_CIRCUIT_NEWS_WEBHOOK` |
| #standings | Apps Script, only from `manualRecalculate()` | Webhook URL in Apps Script **Script Properties** as `STANDINGS_WEBHOOK_URL`, never in the code. The repo secret `DISCORD_STANDINGS_WEBHOOK` is not used by any workflow. |
| #tournament-results | None. TOs post manually by design. | |
| #event-calendar, #announcements | None. Manual by design. | |

The Action compares changes with `git diff --name-only --diff-filter=A HEAD~1 HEAD`. Without `--diff-filter=A`, merge commits and edits re-announce old posts.

The #standings webhook was rotated on Oct 17, 2026 after its URL had been stored in the script. If it ever stops posting, check the `STANDINGS_WEBHOOK_URL` property first, then the execution log's "Discord response:" line. If the property is missing, the post is skipped and logged.

---

## 7. Domain and email

- **Domain:** registered at Namecheap; nameservers point to Cloudflare. The custom domain is attached under Workers & Pages, then infinity-circuit, then Custom domains.
- **OG and Twitter meta tags** in `base.njk` use `https://infinitycircuitmcp.com` and `/assets/images/og-preview.png`.
- **Email:** `hello@infinitycircuitmcp.com` is forwarded by Cloudflare Email Routing; there's no mail hosting. The default Namecheap MX and SPF records had to be removed for Email Routing to work.
- **MailerLite signup:** a homepage strip, plus a popup after 8 seconds with a 7-day localStorage snooze.

---

## 8. Known issues and gotchas

- **Header rows rendering as data:** check for literal placeholder rows in the Sheet first. `&headers=1` alone didn't fix it during the build.
- **Submit form layout:** it broke on a ThinkPad at narrow widths. The grid now uses `minmax()` columns on `.player-row` and `.player-list-header`.
- **Old graphics break the Stone Bar spec** (Brand Guide 3.5): the launch post's hero image, and possibly `og-preview.png`, have gapped, fully rounded segments. Accepted as is; these won't be fixed. Don't flag them again.

---

## 9. Brand tokens used in CSS

- **Brand colors:** Void Violet `#9370c8`, Deep Void `#6040a0`, Cosmic Dark `#12101e`, Deep Violet `#3c2070`, Circuit Tint `#f4f2ff`.
- **Stone colors:** Reality `#c41e3a`, Mind `#e8b800`, Soul `#e87200`, Space `#1a5fe0`, Time `#0da85e`, Power `#c0357a`.
- **Typeface:** Space Grotesk 400/500/600 from Google Fonts. Dark-first design.

---

*Last updated: Oct 17, 2026 (verified against the repo and the deployed web app)*
