# Judes Web App + WhatsApp Pivot — Design

## Goal

Replace Telegram with two surfaces: a Next.js web app at judes.ai (onboarding, taste profile, find timeline) and WhatsApp via Meta Cloud API (find delivery). The taste engine stays unchanged — we're swapping the transport layer and adding a visual surface.

## Architecture

```
User --> judes.ai (Next.js on Vercel)
           |-- Onboarding: type three things, see decode, connect WhatsApp
           |-- Timeline: finds + responses (respond only, no free chat)
           |-- Side panel: taste profile, world items, decode

Finds --> Meta Cloud API (WhatsApp) --> user's phone
User replies on WhatsApp --> Meta webhook --> reaction engine
User replies on web --> API route --> reaction engine

Auth: phone number + OTP sent via WhatsApp
```

## What changes

- **Grammy/Telegram removed** — replaced by Meta Cloud API WhatsApp integration
- **bot.js rewritten** — becomes a webhook handler for Meta WhatsApp incoming messages
- **New Next.js app** — the web frontend at judes.ai, deployed to Vercel
- **Auth layer added** — phone OTP sent via WhatsApp (user-initiated conversation = free)
- **API routes** — Next.js API routes talk to the same Neon Postgres database
- **Onboarding moves to web** — decode happens via API route, not in chat

## What stays the same

- Neon Postgres + pgvector (all existing tables)
- decode.js, taste-filter.js, reaction.js, conversation.js, scoring.js
- Spotify integration (sources/spotify.js)
- All cron jobs (find pipeline, silence sweep, briefs, chapters)
- Claude API prompts
- memory/embeddings.js

## Web App Pages

### 1. Landing / Onboarding (`/`)

- Dark background. Monospace. A few lines in Judes' voice.
- Input field: "three things."
- After typing: loading state, then decode appears.
- Below decode: "your world" (the 8 items, clickable Google search links).
- Below world: connect WhatsApp (enter phone number, receive OTP via WhatsApp, verify).
- This is the screenshot moment. Designed for screenshotting.

### 2. Timeline (main view after auth)

- Chat-like thread. Dark. Messages from Judes (finds with reasoning sentences) and user responses.
- Input field appears only when there's an unanswered find.
- Each find shows: the thing (with link), the reasoning sentence, timestamp.
- Sparse. Unhurried. Weeks of gaps between finds is normal and looks intentional.

### 3. Taste Profile (side panel)

- The decode text
- The three things
- The world items (clickable)
- Taste brief
- Past finds with reactions
- No settings. No preferences. No toggles. You can't configure Judes.

## WhatsApp Integration (Meta Cloud API)

- **Free tier:** 1,000 service conversations/month. Sufficient for early stage.
- **Outbound finds:** Business-initiated messages require pre-approved templates. Template format: link + reasoning sentence.
- **Inbound responses:** Meta webhook receives user replies. Same classifyReaction + respondToReaction pipeline. Judes replies once, then quiet.
- **OTP auth:** Send verification code via WhatsApp (user-initiated conversation = free). No SMS cost.
- **Setup required:** Meta Business account, WhatsApp Business phone number, webhook configuration, message template approval.
- **Test mode:** Meta provides a test phone number for development.

## Auth Flow

1. User enters phone number on judes.ai
2. Judes sends OTP via WhatsApp to that number
3. User enters code on web
4. Session created (JWT cookie)
5. Same phone number used for WhatsApp find delivery

## Data Model Changes

- `users` table: add `phone_number` column (used for auth + WhatsApp delivery)
- `users` table: add `whatsapp_id` column (WhatsApp user ID from Meta API)
- `users` table: make `telegram_id` nullable (migration path, eventually remove)
- No new tables needed

## Design Principles

- The web app is NOT a chatbot. Judes initiates. User responds to finds only.
- The input field is hidden when there's nothing to respond to.
- The aesthetic is "like ChatGPT but Judes" — dark, clean, message thread — but the interaction model is asymmetric.
- No settings, no preferences, no profile editing. The taste profile is read-only. Judes learns from your responses, not your configuration.
- The landing page IS the onboarding. No separate signup flow.
- WhatsApp is delivery. The web app is the home.

## Tech Stack

- **Frontend:** Next.js 14+ (App Router), deployed to Vercel
- **Styling:** Tailwind CSS, dark theme only
- **Auth:** Custom phone OTP via Meta WhatsApp API, JWT sessions
- **Database:** Same Neon Postgres + pgvector
- **WhatsApp:** Meta Cloud API (direct, no Twilio)
- **Existing engine:** All JS files in project root stay, imported by API routes
