# CLAUDE.md — Judes

You are building Judes. Read these files in this order before doing anything:

1. `docs/IDENTITY.md` — the governing document. It wins all conflicts. If anything in this repo contradicts IDENTITY.md, IDENTITY.md is correct.
2. `docs/NAOMI.md` — the test persona. Every product decision runs through her.
3. `docs/STACK.md` — the technical architecture, dependencies, data flows, and integration details.
4. `docs/DECISIONS.md` — every product decision already made. Do not re-litigate. Do not propose alternatives to settled decisions unless the founder explicitly reopens them.
5. `docs/CHANGELOG.md` — what happened in previous sessions. Read this to know where things stand. Do not ask the founder to re-explain work that's already logged here.

Then look at `src/` for the current codebase.

---

## How this repo works

The founder does not write code. You write code. The founder writes documents, briefs, and corrections. You read them and build.

If you're unsure whether something has been decided, check `docs/DECISIONS.md`. If it's not there, ask the founder. If the founder decides, log it.

If you're unsure about voice, tone, what Judes would or wouldn't say — the answer is in `docs/IDENTITY.md`. If it's not there, ask the founder.

If you're unsure about whether a feature passes — run it through the Naomi Test in `docs/NAOMI.md`.

---

## Session Log

When the founder says **"session log"**, this is a trigger. Stop what you're doing and perform the following:

1. **Update `docs/CHANGELOG.md`** — Add an entry for today's date with a summary of everything built, changed, fixed, or discussed in this session. Be specific. Name files created, schemas changed, integrations wired, bugs fixed. This is the memory between sessions.

2. **Update `docs/DECISIONS.md`** — Add any product decisions that were made during this session. One line per decision. Include the date. Only log actual decisions, not discussions or open questions.

3. **Update `docs/STACK.md` if architecture changed** — If any new dependency was added, a data flow changed, a hosting decision was made, or an open technical question was resolved, update STACK.md. This file also lives in NotebookLM, so flag to the founder: "STACK.md changed — re-upload to NotebookLM."

4. **Confirm** — Tell the founder what you logged. Read back the changelog entry and any new decisions so they can correct anything before the session ends.

The session log is how context survives between sessions. Treat it as the most important thing you do before the session closes. Do not skip it. Do not summarise loosely. Be precise.

---

## Rules

- Never propose features that require manual curation, customer support, content production, or coordination between multiple people. Judes is a one-person company run by a founder with AI agents.
- Never add UI beyond the Telegram chat and judes.ai (one page, one link).
- Never use any word from the Dead Words list in `docs/IDENTITY.md` in any user-facing copy, error message, or output.
- Never build anything that makes Judes feel like software.
- The taste graph schema in `docs/IDENTITY.md` ships from day 0. Every interaction populates it. Nothing is deferred.
- When generating decodes or reasoning sentences, the Integrity Audit in `docs/IDENTITY.md` is your quality gate. Run every output through it before shipping.
