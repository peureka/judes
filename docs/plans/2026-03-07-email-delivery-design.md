# Email Delivery Design — 2026-03-07

Replaces WhatsApp (Meta Cloud API) with email via Resend. Responses happen on the web timeline at judes.ai. Click tracking on all email links.

---

## Why

Meta Cloud API requires Facebook account + verified business. Ad account locked, can't create new business. Email has no platform gatekeeping, allows styled HTML (the Judes aesthetic), and click tracking provides engagement signals even without explicit responses.

---

## 1. Email Delivery

`email.js` replaces `whatsapp.js`. Uses Resend SDK.

**Two functions:**
- `sendFind(email, find)` — Styled HTML email: dark background, monospace font, reasoning sentence, tracked Spotify link, "say something" link to web timeline
- `sendMagicLink(email, token)` — Login link email

**Find email structure:**
```
From: judes <finds@judes.ai>
Subject: (artist/title name or no subject)

[dark background, monospace]
[reasoning sentence]
[spotify link — tracked through /api/click]
["say something" link → judes.ai/timeline?find=abc123]
```

**Database:** `users.whatsapp_id` → `users.email`. Query in `initiate.js` changes from `WHERE u.whatsapp_id IS NOT NULL` to `WHERE u.email IS NOT NULL`.

---

## 2. Click Tracking

`/api/click` route on the Next.js app.

```
GET /api/click?f=abc123&t=spotify
→ INSERT into find_clicks (find_record_id, click_type, clicked_at)
→ 302 redirect to actual URL
```

**Click types:** `spotify` (opened the music), `respond` (clicked through to timeline).

**New table: `find_clicks`**
- `id` (serial)
- `find_record_id` (FK → find_records)
- `click_type` (text)
- `clicked_at` (timestamptz)

Spotify click without response = soft confirmation (not ignore). Feeds into reaction classifier.

---

## 3. Magic Link Auth

**Flow:**
1. User enters email on judes.ai
2. `POST /api/auth/send` → generate token, store in `auth_tokens`, send magic link via Resend
3. User clicks `judes.ai/api/auth/verify?token=xyz`
4. Verify checks token, marks used, sets HTTP-only cookie, redirects to `/timeline`

**New table: `auth_tokens`**
- `id` (serial)
- `email` (text)
- `token` (uuid)
- `expires_at` (timestamptz, 15 min)
- `used` (boolean, default false)
- `created_at` (timestamptz)

Find email "say something" link triggers auth flow if user isn't authenticated — prompted for email, magic link, then redirected back to the find with input open.

---

## 4. Web Timeline Response

`judes.ai/timeline` (already scaffolded in `web/app/timeline/`).

- Arriving via `?find=abc123` scrolls to that find, response input focused
- `POST /api/respond` → classifies reaction (existing `reaction.js`), extracts taste edges, updates taste vector
- Judes can reply once (one-reply discipline), displayed inline
- No free conversation. Input only appears on unanswered finds.

---

## 5. Onboarding

- Onboarding on judes.ai: three things + email address
- After decode, relationship begins via email
- First find arrives at next cron run (every 4h)
- No change to decode engine, taste graph extraction, or intelligence layer

---

## File Changes

**New files:**
- `email.js` — Resend SDK, sendFind, sendMagicLink
- `web/app/api/click/route.js` — click tracking redirect
- `web/app/api/auth/send/route.js` — magic link send
- `web/app/api/auth/verify/route.js` — magic link verify
- `web/app/api/respond/route.js` — find response endpoint
- `db/migrate-email.sql` — find_clicks + auth_tokens tables, users.email column

**Modified files:**
- `initiate.js` — email replaces whatsapp_id
- `index.js` — import email.js instead of whatsapp.js

**Deleted:**
- `whatsapp.js`

**Unchanged:** decode.js, taste-filter.js, reaction.js, scoring.js, taste-graph.js, sources/spotify.js, conversation.js, brief.js, chapters.js, all intelligence layers
