# Infinity Circuit Website: Architecture

How infinitycircuitmcp.com is built, how data flows, and the settings that must not be "fixed."

Items marked **(verify)** come from the build chats but weren't confirmed in the final code. Check them against the repo and correct this file.

No credentials belong in this file. The TO access code, webhook URLs, and OAuth secrets live in the Sheet's Config tab, GitHub Secrets, Cloudflare environment variables, and a password manager.

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
functions/api/auth/callback(.js)       Pages Function: OAuth callback (verify exact path)
src/_includes/layouts/base.njk         Site layout, nav, OG meta tags
src/index.njk                          Home: live events + standings previews, Champion section
src/standings/index.njk                Standings (live from Sheet)
src/events/index.njk                   Events calendar (live from Sheet; upcoming/past split)
src/submit/index.njk                   TO results submission form
src/admin/config.yml                   Decap CMS config
src/posts/                             News posts (Markdown, written by Decap)
```

Other pages: News, Gallery, Rules (with PDF downloads), About, Apply to Host.

**(verify)** Paths for the Gallery, Rules, About, and Apply pages, and for the rules PDFs (the Circuit Rules download is `rules_and_structure.pdf`).

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
| Standings | (verify) | Computed by Apps Script; read by the site |
| Events | 980771470 | Event calendar |
| Gallery | 866280774 | Photos |
| Champions | 359881057 | Champion / Hall of Heroes |
| Applications | | Apply to Host submissions |
| Config | | Settings, including the TO access code and `MAX_RESULTS` (best-N results counted; default 4) |

**Rules for editing the Sheet:**
- Never leave placeholder text rows under a header. The site renders them as real events or players.
- Longshanks username is the canonical player ID. Don't key on display names.

### 4.3 Writing (site to Apps Script)

**Endpoint:**
`https://script.google.com/macros/s/AKfycby5wQ2PIHH9IeKp5mgiPpcH8TO9JyhXXeaABTUDZOov4zxZ_r3tdeIgVLbZn40rBAznNg/exec`

**What the web app does:**
- Accepts TO submissions via POST and checks the access code against Config.
- Writes rows to Raw Results as PENDING.
- Creates player records on first approved result.
- Applies the Stone Cascade Rule.
- Recalculates standings.
- Emails the admin.

The submit form unlocks with the TO access code. The code is checked client-side, and the page itself is publicly reachable.

**(verify)** Whether the planned Pages Function proxy for this endpoint was ever built. The current setup suggests the form posts directly to Apps Script.

**Submit form fields:**
- Players can be dragged to reorder placements.
- A Stone dropdown appears for Qualifiers.
- LSID is the numeric Longshanks event ID.

### 4.4 Results workflow

1. The TO submits the form, and rows land in Raw Results as PENDING.
2. The admin reviews and sets each row to APPROVED or REJECTED. An onEdit trigger recalculates standings quietly, with no Discord post.
3. After all rows for the event are approved, run **`manualRecalculate()`** from the Apps Script editor. This is the only thing that posts to #standings.

`recalculateStandings(notifyDiscord)` takes the flag. Only `manualRecalculate()` passes it as true.

The admin can also enter rows directly, which skips the approval step.

---

## 5. Decap CMS

**Admin URL:** `https://infinity-circuit.pages.dev/admin/`. Log in there, not on the custom domain.

### DO NOT CHANGE

- **`base_url` in `src/admin/config.yml` must stay `https://infinity-circuit.pages.dev`.** On the custom domain, the OAuth popup's postMessage fails cross-origin and login hangs.
- **The GitHub OAuth App callback URL must stay `https://infinity-circuit.pages.dev/api/auth/callback`,** for the same reason.

### Auth

`functions/api/auth/index.js` redirects to GitHub with `client_id` from the Cloudflare env var `GITHUB_CLIENT_ID`, scope `repo`, and passes Decap's `state` parameter through. The client secret is a Cloudflare env var. **(verify)** the exact variable name.

Publishing a post commits Markdown to `src/posts/`, Cloudflare rebuilds, and the post goes live about a minute later.

---

## 6. Discord webhooks

| Channel | Trigger | Where configured |
|---|---|---|
| #circuit-news | GitHub Action on push to `main`, only when a file in `src/posts/` is **added** | `.github/workflows/discord-notify.yml`; secret `DISCORD_CIRCUIT_NEWS_WEBHOOK` |
| #standings | Apps Script, only from `manualRecalculate()` | Webhook URL stored in Apps Script. Repo secret `DISCORD_STANDINGS_WEBHOOK` also exists. **(verify)** whether it's used. |
| #tournament-results | None. TOs post manually by design. | |
| #event-calendar, #announcements | None. Manual by design. | |

The Action compares changes with `git diff --name-only --diff-filter=A HEAD~1 HEAD`. Without `--diff-filter=A`, merge commits and edits re-announce old posts.

The #standings webhook was recreated after the channel was accidentally deleted. If it ever stops posting, check the URL first.

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
- **Event Operations page out of date** (as of Oct 17, 2026): the page text says v1.4, but the PDF download is v1.5. Still to update: the version label, the Section 3.1 event naming table, and a duplicate bullet in Section 6.
- **Old graphics break the Stone Bar spec** (Brand Guide 3.5): the launch post's hero image, and possibly `og-preview.png`, have gapped, fully rounded segments.

---

## 9. Brand tokens used in CSS

- **Brand colors:** Void Violet `#9370c8`, Deep Void `#6040a0`, Cosmic Dark `#12101e`, Deep Violet `#3c2070`, Circuit Tint `#f4f2ff`.
- **Stone colors:** Reality `#c41e3a`, Mind `#e8b800`, Soul `#e87200`, Space `#1a5fe0`, Time `#0da85e`, Power `#c0357a`.
- **Typeface:** Space Grotesk 400/500/600 from Google Fonts. Dark-first design.

---

*Last updated: Oct 17, 2026*
