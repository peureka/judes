# Judes — Technical Stack

This document is the technical source of truth. It lives in both the repo (for Claude Code) and NotebookLM (for the founder). Update this when the architecture changes, not when individual files change — that's what CHANGELOG.md is for.

---

## Architecture

Judes is a Next.js web app (judes.ai) + WhatsApp delivery, backed by Claude API, with data stored in Neon Postgres (with pgvector for embeddings). The user touches judes.ai and WhatsApp. Everything else is invisible.

```
User ←→ judes.ai (Next.js on Vercel) ←→ Claude API (decode, reasoning, taste filter, reaction classifier)
                                              ↓
User ←→ WhatsApp (Meta Cloud API)       Neon Postgres + pgvector (taste graph, user profiles, find records, memory)
                                              ↓
                                     Source Integrations (Spotify, YouTube, TMDB)
                                              ↓
                                     Initiation Engine (cron — evaluate, filter, send or stay silent)
```

### Data flow: onboarding

1. User enters three things on judes.ai
2. Next.js API route passes to decode engine
3. Decode engine calls Claude API with IDENTITY.md voice rules baked into system prompt
4. Claude returns decode text
5. Decode engine writes to Neon Postgres: 3 TasteNodes, 3+ TasteEdges, 1 DecodePattern, 1 UserTasteProfile
6. Decode text rendered on judes.ai
7. Elapsed time target: < 4 seconds total

### Data flow: find

1. Initiation engine cron triggers (schedule TBD — likely every 4-6 hours)
2. For each active user: pull taste vector + active edges from Neon Postgres
3. Query source integrations for candidates (new releases, catalogue search based on taste vector)
4. For each candidate: call Claude API taste filter with user's taste profile and candidate metadata
5. Claude scores relevance and generates reasoning sentence
6. Run reasoning sentence through integrity audit (specificity, flatness, software test, duplication, Naomi test)
7. If nothing clears → do nothing. Silence.
8. If a find clears → send via WhatsApp. Write FindRecord to Neon Postgres.
9. Wait for response (via WhatsApp webhook or web timeline). Classify as ReactionSignal. Update taste vector. Create new TasteEdges if warranted.

### Data flow: reaction

1. User responds to a find (or doesn't — silence is tracked by time delta)
2. Response classified into ReactionSignal type: soft_ignore, hard_ignore, confirmation, deep_resonance, correction, discovery, social_share
3. New TasteEdges extracted from response text (if substantive)
4. User's taste_vector updated
5. staleness_score recalculated

---

## Dependencies

### Core

| Component | Technology | Purpose |
|---|---|---|
| Web app | Next.js 14 (App Router) on Vercel | judes.ai — onboarding, timeline, taste profile |
| Messaging | WhatsApp (Meta Cloud API) | Find delivery, inbound responses, OTP auth |
| AI engine | Claude API (Sonnet) | Decode generation, reasoning sentences, taste filtering |
| Storage | Neon Postgres + pgvector | Taste graph, user profiles, find records, reaction signals, memory |

### Source integrations

| Source | API | What it provides |
|---|---|---|
| Spotify | Spotify Web API | Tracks, albums, artists. Search + new releases. Audio features for sensory edge generation. |
| YouTube | YouTube Data API v3 | Videos, channels. Search. For film essays, music videos, visual content. |
| TMDB | TMDB API | Films, TV. Search + discover. Metadata for structural/emotional edge generation. |

Future sources (not built yet, decide when needed): Are.na, Bandcamp, Google Places, Letterboxd, SoundCloud.

### Infrastructure

| Component | Technology | Notes |
|---|---|---|
| Hosting | TBD | Needs to run cron jobs, host the bot process, and serve a static page. Likely a single VPS or Railway/Fly.io. |
| Cron | TBD | Initiation engine scheduler. Could be system cron, node-cron, or platform-native. |
| Domain | judes.ai | Purchased. Points to static site. |

---

## Database Schema

Storage is Neon Postgres with pgvector. The taste graph schema from `docs/IDENTITY.md` is implemented as tables alongside the existing memory layer tables (users, messages, user_context, temporal_hints, chapters, brief_history, taste_connections). Migration: `db/migrate-taste-graph.sql`.

Full schema definition is in `docs/IDENTITY.md` under "The Taste Graph." Summary:

| Table | Purpose | Created when |
|---|---|---|
| TasteNode | Cultural objects (song, film, place, etc.) | Onboarding (3), every find, every user response that names something |
| TasteEdge | Connections between nodes with typed reasoning | Onboarding (3+), every find reasoning sentence, every substantive response |
| UserTasteProfile | User's position in taste space | Onboarding |
| FindRecord | Every find sent, with reasoning and response | Every find |
| ReactionSignal | Typed response to a find | Every response (or silence timeout) |
| DecodePattern | Three-input combinations and their through-lines | Onboarding |

Edge types: sensory, emotional, structural, corrective. These are injected into the Claude API prompt when generating reasoning sentences so it knows *how* to connect, not just *whether* to connect.

---

## Claude API Integration

### System prompts

Three distinct system prompts, all derived from IDENTITY.md:

1. **Decode prompt** — Used during onboarding. Includes voice rules, lexicon (dead/alive words), decode format rules, integrity audit. Input: three things. Output: decode text.

2. **Taste filter prompt** — Used by initiation engine. Includes user's taste vector, active edges, edge types. Input: candidate find metadata. Output: relevance score + reasoning sentence (or rejection).

3. **Reaction classifier prompt** — Used when processing user responses. Input: find that was sent + user's response text + time delta. Output: ReactionSignal type + any new TasteEdges to extract.

All prompts reference IDENTITY.md as the governing document. The dead words list is included verbatim in every prompt. The integrity audit checklist is included in the taste filter prompt.

---

## judes.ai

Next.js 14 (App Router) + Tailwind CSS. Deployed to Vercel.

- Dark background (#111 or similar)
- Monospace font
- Landing page with onboarding (three things + decode)
- Timeline page showing finds and allowing responses
- Taste profile side panel
- Auth via phone number + OTP sent via WhatsApp
- Mobile-first. Looks good on a phone screen.

---

## Operational Notes

- **One-person company.** No features requiring manual intervention at scale. The taste filter is Claude-powered. The initiation engine is automated. Growth is organic (decode screenshots + word of mouth).
- **Cost structure:** Claude API calls are the main variable cost. Per-user costs: 1 API call at onboarding (decode), ~1-2 per day per user for taste filtering (most produce no send), 1 per reaction classification. At 1,000 users, estimate ~3,000-5,000 API calls/day. Monitor and optimise as needed.
- **Rate limits:** Respect Spotify, YouTube, and TMDB rate limits. Cache source results. The initiation engine doesn't need real-time data — batch queries are fine.
- **Privacy:** Taste data is personal. No sharing user data across users in the product layer. The taste graph's cross-user patterns (DecodePattern clusters, TasteEdge confidence scores) are aggregate, not individual. Individual user data stays individual.
- **Surface discipline:** Judes sends finds. When a user responds to a find, Judes can reply once — briefly, in voice — then goes quiet. The conversation engine captures everything (facts, taste signals, chapters) but the user experiences finds and silence, not chat. The intelligence layer runs silently underneath.

---

## Open Technical Questions

These are not decided yet. Log the decision in DECISIONS.md when resolved.

- Hosting platform (VPS vs Railway vs Fly.io vs other)
- Cron implementation (system cron vs node-cron vs platform scheduler)
- WhatsApp number
- Exact cron frequency for initiation engine
- Embedding model for taste_vector (currently MiniLM-L6-v2 via @xenova/transformers — evaluate alternatives)
- Whether to use Claude Sonnet or Haiku for different prompt types (cost vs quality tradeoff)
- Cache strategy for source integration results
- Backup strategy for Neon Postgres
