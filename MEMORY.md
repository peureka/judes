# Judes — Project Memory

## What Judes Is
Judes is a taste engine for deepening and expanding your taste. A machine for feeling uniquely understood through culture. It studies your cultural signal, remembers your patterns, and spots hidden affinities across what you love — then sends the one thing that feels uncannily, specifically yours. Not recommendation (more of the same), but cultural inference (finding the deeper thread running through what moves you, then surfacing something that belongs to that thread). The right find feels surprising and inevitable at once — strangely yours. Judes is a curator with judgment, in conversation with your pattern, not overriding it. Sends finds when they're worth it, stays silent when they're not.

## Governing Docs (read order)
1. `docs/IDENTITY.md` — wins all conflicts
2. `docs/NAOMI.md` — test persona (26yo creative strategist in Peckham)
3. `docs/STACK.md` — architecture
4. `docs/DECISIONS.md` — settled decisions, don't re-litigate
5. `docs/CHANGELOG.md` — session history

## Architecture
- **Web**: Next.js 14 (App Router) + Tailwind on Vercel
- **Email**: Resend (find delivery, magic link auth)
- **AI**: Claude API (Sonnet for taste filter/decode, Haiku for reaction classification)
- **DB**: Neon Postgres + pgvector in aws-eu-west-2
- **Source**: Spotify (only active source; YouTube/TMDB deferred)
- **Domain**: judes.ai (Vercel project: `prj_uclYYpSQcUIt4qNVbNQeJOvix6gX`)
- **Vercel team**: `team_5WUQcDFwHJnq8MhVGTBWV1ni` (peurekas-projects)

## Key Files
- `web/` — Next.js app (pages, API routes, components)
- `web/app/api/timeline/route.js` — timeline data endpoint
- `web/app/api/auth/verify/route.js` — magic link auth
- `web/app/api/auth/send/route.js` — send magic link
- `web/app/api/decode/route.js` — decode engine endpoint
- `web/app/api/respond/route.js` — user responses to finds
- `web/app/api/click/route.js` — email click tracking
- `web/lib/auth.js` — JWT session, magic link tokens
- `email.js` — Resend integration (finds + auth emails)
- `initiate.js` — find pipeline (cron: evaluate candidates, filter, send or silence)
- `taste-filter.js` — Claude-powered find scoring + reasoning sentences
- `reaction.js` — reaction classification (Haiku)
- `decode.js` — onboarding decode engine
- `sources/spotify.js` — Spotify API integration
- `db/index.js` — Neon serverless connection
- `db/run-migrations.js` — migration runner
- `db/schema.sql` + `db/migrate-*.sql` — DB schema

## DB Tables
users, messages, user_context, brief_history, chapters, temporal_hints, taste_connections, taste_nodes, taste_edges, user_taste_profiles, decode_patterns, find_records, reaction_signals, find_clicks, auth_tokens, taste_prompts

## Platform History
Telegram → WhatsApp (blocked by Meta) → Email (Resend) + web timeline

## Messaging Framework (docs/MESSAGING.md)
Core tenets from the brand messaging framework v2:
- **Category**: Taste engine (not recommendation engine, chatbot, assistant, discovery app)
- **Core idea**: Helps you become more yourself through culture
- **Mechanism**: Cultural inference, not similarity matching. Find the deeper thread, not more of the same.
- **Five pillars**: Cultural inference, Living taste memory, Discernment, Taste expansion, Understoodness
- **Key phrases**: "hidden affinities", "cultural signal", "deeper thread", "surprising and inevitable at once", "strangely yours"
- **Always use**: Taste, Signal, Pattern, Affinities, Resonance, Discernment, Rare finds, Cultural inference, Living memory
- **Use sparingly in copy**: AI, Personalisation, Recommendation engine, Algorithm, Vectors, Nodes, Graph
- **Feedback language**: "This fits" / "Not this thread" (not Like/Dislike)
- **Positioning test**: If the copy could also describe Spotify/Pinterest/Netflix/TikTok, it is too weak

## Voice Rules
- Lowercase default, no emoji, no exclamation marks
- Dead words: recommend, curated, vibe, content, personalised, algorithm, discover, etc. (full list in IDENTITY.md)
- Signature move: "not X. Y." correction format
- Error states stay in voice: "nothing right now. soon."
- Tone: Precise, culturally literate, restrained, confident, elegant, slightly mysterious, intimate but not needy
- Never overexplain the AI. Protect the mystique.

## Founder Workflow
- Founder writes docs/briefs, Claude Code builds
- "session log" trigger = update CHANGELOG.md, DECISIONS.md, STACK.md if needed
- NotebookLM = brain (strategy), Claude Code = hands (engineering)
