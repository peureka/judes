# Changelog

Session-by-session log of what was built, changed, and decided. This is the memory between sessions. Claude Code reads this at the start of every session to know where things stand.

---

## Session 0 — 2025-03-05

**What happened:** Repo initialised. No code yet. Foundation documents created.

**Files created:**
- `CLAUDE.md` — root instruction file for Claude Code. Defines load order, session log trigger, and operational rules.
- `docs/IDENTITY.md` — the governing document (v2, ~6,800 words). Covers: governing thesis, Naomi persona, product definition, find format, voice rules, lexicon (dead/alive words), integrity audit, refusal set, initiation logic, onboarding flow, taste model, learning via memnant, viral mechanics, taste graph strategy and data model (full schema), invisible stack, one-person company operational model (Showrunner split), and build spec with wiring order.
- `docs/NAOMI.md` — standalone test persona file. Includes full profile, exit conditions, the Naomi Test, and canonical three things (Tirzah, Peckham, concrete) for smoke testing the decode engine.
- `docs/STACK.md` — technical architecture reference. Data flows (onboarding, find, reaction), dependency table, memnant schema summary, Claude API prompt types, judes.ai spec, cost estimates, and open technical questions.
- `docs/DECISIONS.md` — decision log pre-populated with all decisions made during identity file development.
- `docs/CHANGELOG.md` — this file.

**Architecture decisions:**
- Memnant schema defined: TasteNode, TasteEdge, UserTasteProfile, FindRecord, ReactionSignal, DecodePattern.
- Wiring order established: Telegram bot → memnant schema → decode engine → source integrations → taste filter → initiation engine → reaction capture → judes.ai.

**What's next:** Build starts. All eight components in the wiring order. The decode engine wired to memnant is the first thing that produces visible output (Naomi's smoke test: Tirzah, Peckham, concrete).

---

## Session 1 — 2026-03-05

**What happened:** Full taste graph + find pipeline built end-to-end. Judes is live on Telegram as @heyjudesbot. First decode completed with Naomi's three things (Tirzah, Peckham, concrete).

**Architecture shift:** Storage moved from memnant SQLite to Neon Postgres + pgvector. Surface changed from conversational companion to find-based recommendation engine with one-reply discipline. Engine (fact extraction, temporal awareness, life chapters, memory recall, scoring) stays unchanged and runs silently.

**Infrastructure:**
- Neon project `judes` created in `aws-eu-west-2` (project: `hidden-morning-72867567`)
- All 4 SQL migrations run: `schema.sql` → `migrate-memory.sql` → `migrate-vision.sql` → `migrate-taste-graph.sql`
- 13 tables live: users, messages, user_context, brief_history, chapters, temporal_hints, taste_connections, taste_nodes, taste_edges, user_taste_profiles, decode_patterns, find_records, reaction_signals
- `.env` configured with Telegram, Anthropic, Spotify, and Neon credentials
- `db/run-migrations.js` — reusable migration runner with paren-aware SQL splitting

**Files created:**
- `taste-filter.js` — Claude Sonnet-powered find scoring. Takes candidate + taste profile, runs integrity audit (interruption, specificity, duplication, software, flatness tests), returns SEND with reasoning sentence or REJECT. Dead words enforced.
- `reaction.js` — Haiku-powered reaction classifier. Signal types: confirmation, deep_resonance, correction, discovery, social_share. Silence tracking: soft_ignore at 24h, hard_ignore at 72h (bumps staleness_score). Taste insights create new edges (source: user_articulation).
- `sources/spotify.js` — Full Spotify Web API integration. Client credentials flow with auto-refresh. Search (tracks/albums/artists), related artists, top tracks, audio features, new releases. `generateCandidates()` with 3 strategies: brief keywords, related artists (walks graph for obscure finds <50 popularity), edge reasoning text.
- `db/migrate-taste-graph.sql` — 6 taste graph tables with constraints, indexes, pgvector HNSW index
- `db/run-migrations.js` — Node-based migration runner for Neon serverless driver
- `docs/plans/2026-03-05-taste-graph-and-find-pipeline.md` — 10-task implementation plan

**Files modified:**
- `decode.js` — Added `extractTasteGraph()`: calls Haiku to extract structured taste data (nodes, edges, through-line), writes to taste_nodes/taste_edges/decode_patterns/user_taste_profiles with embedding
- `bot.js` — Imports changed: `respondToReaction` + `extractFacts` from conversation.js, `classifyReaction` from reaction.js. Post-onboarding: checks for recent unanswered find → classifies reaction → one reply → quiet. No find = save message + extract facts + silence. Photo/voice handlers simplified to no-op outside onboarding.
- `conversation.js` — `extractFacts` now exported. Added `respondToReaction()`: one-sentence reply to find reactions, returns null on silence/ignore. Fixed path from `judes-identity.md` to `docs/IDENTITY.md`.
- `initiate.js` — Rewritten from conversational initiation to find pipeline: `generateFinds()` replaces `generateInitiations()`. Scores eligible users → generates Spotify candidates → taste filter → send or silence. Records find_records with reasoning.
- `index.js` — Cron updated: find engine every 4h (9/13/17/21 UTC) instead of every 2h. Added silence signal sweep at 2am UTC. Added `checkSilenceSignals` import.
- `docs/IDENTITY.md` — Added refusal set item 9: respond-to-responses rule (one reply, in voice, then quiet)
- `docs/DECISIONS.md` — Added 2026-03-05 decisions (Postgres, taste graph tables, surface/engine split, respond-to-responses, conversation→reaction capture)
- `docs/STACK.md` — Updated from memnant SQLite to Neon Postgres throughout
- `db/migrate-memory.sql` — Made idempotent with IF NOT EXISTS
- `.env.example` — Added SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET

**Smoke test result:** Naomi's three things (Tirzah, Peckham, concrete) produced:
- Decode: "you keep choosing unfinished things. raw vocals that crack at the edges, a neighborhood that refuses to gentrify cleanly, buildings that show their bones..."
- World: claire rousay, Jeanne Dielman, Juliaan Lampens, Belleville, Lemaire, Bright London, Serge Lutens, Suisse Int'l
- Taste graph: 3 nodes (music/creator, place/moment, material/domain), 4 edges (sensory, structural, emotional, corrective)
- Through-line: "you are drawn to things that show their construction, their refusal to be finished or polished into forgetting."

**Known issue:** Decode brief (section 3) not appearing in Telegram reply — likely a `---` separator parsing issue in `decode.js`. The brief is stored in the users table separately so it doesn't affect find pipeline functionality.

**What's next:** Test the find pipeline end-to-end (trigger a find cron run manually, verify Spotify candidates → taste filter → Telegram delivery). Deploy to persistent hosting. Build judes.ai landing page.

---

## Session 3 — 2026-03-07

**What happened:** Email delivery replaces WhatsApp. Meta Cloud API blocked (no FB account, ad account locked). Pivoted to Resend for email delivery with click tracking and styled HTML finds.

**Architecture shift:** WhatsApp (Meta Cloud API) → Email (Resend). Auth changes from phone + OTP to email magic link. Responses move entirely to web timeline at judes.ai.

**Files created:**
- `email.js` — Resend SDK integration. `sendFind()` sends styled HTML find emails (dark bg, monospace, tracked links). `sendMagicLink()` sends auth emails. Lazy Resend client init.
- `web/app/api/click/route.js` — Click tracking redirect. Logs to `find_clicks` table, redirects to Spotify URL or timeline. Fire-and-forget for respond clicks.
- `web/app/api/auth/send/route.js` — Magic link send endpoint. Generates UUID token, stores in `auth_tokens` with 15min expiry, sends via Resend.
- `web/app/api/auth/verify/route.js` — Magic link verify. GET endpoint (user clicks email link). Validates token, creates JWT session, sets cookie, redirects to `/timeline`.
- `web/app/api/decode/email/route.js` — Saves email to user record after onboarding decode.
- `db/migrate-email.sql` — New tables: `find_clicks` (UUID FK to find_records), `auth_tokens`. New column: `users.email`.

**Files modified:**
- `initiate.js` — `whatsapp_id` → `email` in queries and result objects. `find_records` INSERT now returns ID for click tracking.
- `index.js` — Imports `sendFind` from `email.js` instead of `sendWhatsAppMessage` from `whatsapp.js`. Passes structured find object.
- `web/app/page.js` — DecodeView: WhatsApp connect link → email capture form with magic link send.
- `web/app/connect/page.js` — Phone + OTP → email magic link flow.
- `web/app/timeline/page.js` — Added `?find=` deep-link support (scrolls to specific find from email), Suspense wrapper.
- `web/lib/auth.js` — Removed OTP functions (generateOTP, storeOTP, verifyOTP). Added `generateMagicToken()`. Changed `createSession` param from phoneNumber to email.
- `db/run-migrations.js` — Added `migrate-email.sql` to migration list.
- `.env.example` — Replaced WhatsApp env vars with `RESEND_API_KEY` and `BASE_URL`.

**Files deleted:**
- `whatsapp.js` — Replaced by `email.js`
- `web/app/api/whatsapp/webhook/route.js` — No longer needed
- `web/app/api/auth/send-otp/route.js` — Replaced by `/auth/send`
- `web/app/api/auth/verify-otp/route.js` — Replaced by `/auth/verify`

**What's next:** Add RESEND_API_KEY to .env. Verify domain (judes.ai) in Resend dashboard. Test end-to-end: onboarding → email capture → find cron → email delivery → click tracking → timeline response. Deploy to Vercel + persistent cron host.
