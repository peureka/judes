# Decisions

Every product decision, dated. One line each. These are settled. Do not re-litigate unless the founder explicitly reopens.

---

## 2025-03-05

- Judes is a Telegram bot. Not an app. Not a web app. Not SMS. Telegram.
- Transport layer is Claudegram.
- Backend memory and taste graph storage is memnant (local SQLite via MCP).
- Judes uses Claude API for decode generation, reasoning sentences, and taste filtering.
- The onboarding is three messages: Judes asks, user answers three things, Judes decodes. Nothing else.
- judes.ai is one page with a few lines of text and a single link to the Telegram bot. No navigation, no logo, no features, no signup.
- The taste graph schema (TasteNode, TasteEdge, UserTasteProfile, FindRecord, ReactionSignal, DecodePattern) ships from day 0. Every interaction populates it from the first user.
- Finds are one per message. Never batched. Never listed.
- The initiation engine is a cron that evaluates candidates, not a send scheduler. Most runs produce nothing.
- Silence is a valid and expected state. Judes never apologises for not sending.
- Judes never asks the user to rate, review, or react to a find. Natural responses are captured. Prompted responses are banned.
- Judes will not answer questions. It is not an assistant.
- Judes will not respond on demand. There is no command or prompt.
- The decode is the only part designed for screenshotting. Finds spread through word of mouth, not screenshots.
- No light mode. Dark only.
- No share buttons anywhere.
- No account system, no login, no email capture.
- Source integrations at launch: Spotify, YouTube, TMDB.
- The product is designed to run as a one-person company with AI agents. No features requiring manual curation, support, content production, or team coordination.
- NotebookLM is the brain (strategy, taste, product direction). Claude Code is the hands (all engineering). The founder does not write code.
- "Session log" is the trigger for Claude Code to update CHANGELOG.md and DECISIONS.md at end of session.
- STACK.md is the technical reference. Lives in both the repo and NotebookLM. Updated when architecture changes, not when individual files change.

## 2026-03-05

- Storage is Neon Postgres with pgvector. Not memnant SQLite. Postgres is already working, has pgvector for vector similarity, scales for multi-user taste graph queries.
- Taste graph schema (TasteNode, TasteEdge, UserTasteProfile, FindRecord, ReactionSignal, DecodePattern) implemented as new tables alongside existing memory tables. Migration: `db/migrate-taste-graph.sql`.
- Surface changes, engine stays. All intelligence layers (fact extraction, temporal awareness, life chapters, memory recall, scoring) stay and run silently. User-facing surface changes to finds + silence.
- Judes can respond once to a user's response to a find. Not initiate conversation. Not answer questions. One reply, in voice, then quiet. That exchange feeds the engine (facts, taste signals, chapters, reaction classification).
- The conversation layer becomes the reaction capture layer. Every response to a find is classified as a ReactionSignal, facts are extracted, taste edges inferred, taste vector updated.
- Neon project: `judes` in `aws-eu-west-2` (London). Project ID: `hidden-morning-72867567`.
- Telegram bot: @heyjudesbot. One bot, not per-environment.
- Find cron runs every 4 hours at 9/13/17/21 UTC. Silence sweep at 2am UTC. Briefs daily 3am. Chapters weekly Sunday 4am. Taste graph weekly Sunday 5am.
- Taste filter uses Claude Sonnet (quality matters for reasoning sentences). Reaction classification uses Haiku (speed, cost). Taste graph extraction uses Haiku.
- Spotify is the first and only source integration. YouTube and TMDB deferred until find pipeline is proven.
