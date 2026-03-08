# Taste Engine Vision — Strategic Analysis

An external perspective reframes Judes as a "taste engine" — a portable taste identity layer for the AI agent era. This document maps that vision against what Judes already is, what's already built, and what's genuinely new, so the founder can decide what to adopt, adapt, or reject.

---

## 1. The Vision (summarised)

1. **Multimodal ingestion** — Judes silently learns by observing Spotify playlists, saved aesthetic references, email vocabulary, movie ratings. It watches what users accept, reject, and edit.
2. **Taste compiler** — Translates abstract human preferences into structured, machine-readable system prompts. Maps the DNA of your aesthetic.
3. **Portable taste prompts** — Generates modular instruction sets users inject into other AI tools (writing assistants, image generators, research agents) to instantly align output with their sensibilities.
4. **Domain-specific agents** — Voice prompts for ghostwriting, aesthetic prompts for visual design, quality prompts for curation — all derived from the same taste identity.
5. **A/B refinement interface** — Shows two variations (paragraph, image, room design), user picks which feels more "them." Progressively higher-resolution taste understanding.

---

## 2. Alignment Map — What Judes Already Has

| Vision element | Judes equivalent | Where it lives | Status |
|---|---|---|---|
| Multimodal ingestion | Onboarding decode (3 things) + find reactions + silence signals + brief rebuilding | `decode.js`, `reaction.js`, `brief.js` | **Built** (narrow — relational, not passive) |
| Taste compiler | `extractTasteGraph()` → TasteNodes, TasteEdges, UserTasteProfile with 384-dim pgvector embedding | `decode.js:extractTasteGraph()`, `db/migrate-taste-graph.sql` | **Built** |
| Machine-readable profiles | Typed edges (sensory/emotional/structural/corrective) with natural language reasoning + taste vector + decode pattern through-lines | `user_taste_profiles`, `taste_edges`, `decode_patterns` tables | **Built** |
| Portable taste prompts | Not built — but the graph data is structured enough to generate them. The decode, through-line, edge reasoning, and taste vector are all the raw material. | — | **Gap** |
| A/B refinement | Not built. Conflicts with IDENTITY.md refusal set and UI constraints. | — | **Conflict** |
| Voice/writing prompt | Decode text + through-line + corrective edges could compose into a voice instruction set | `decode.js`, `taste_edges` (edge_type = corrective) | **Latent** |
| Aesthetic prompt | Sensory + structural edges + taste vector could compose into visual/spatial instructions | `taste_edges` (edge_type = sensory, structural) | **Latent** |
| Quality/curation prompt | Taste filter integrity audit already functions as a quality gate — specificity test, flatness test, software test | `taste-filter.js` | **Latent** |
| Cross-user patterns | Weekly batch computes taste similarity, generates pattern descriptions for users with >0.85 cosine similarity | `taste-graph.js:computeConnections()` | **Built** (not surfaced) |

The gap is not in the data model. It's in the output layer. The graph already captures what the vision calls for — the missing piece is generating typed outputs from it (taste prompts, domain-specific instructions) and making those available through an API.

---

## 3. Where the Vision Confirms IDENTITY.md

These are places the external vision independently arrived at the same conclusions already in the governing document:

**"The taste graph is the product, not the consumer surface."**
IDENTITY.md: *"Judes is the interface. The taste graph is the product."* The vision agrees — the consumer experience (finds) is the data collection mechanism; the graph is the asset.

**"AI Persona Taste Layers" as primary monetisation.**
IDENTITY.md already names this as business line #1: *"Any AI building a persona, a character, a companion, a brand voice needs a taste model. Judes' graph provides structured, conviction-backed taste profiles."* The vision calls it "taste prompts." Same idea, cleaner name.

**"Conviction data is different from consumption data."**
IDENTITY.md: *"Consumption data tells you what someone did. Conviction data tells you who someone is."* The vision's framing of Judes as a "meta-layer of your digital identity" is the same thesis — just from the user's perspective rather than the graph's.

**"The biggest friction in the AI era is re-explaining who you are."**
This is the problem IDENTITY.md's taste graph was designed to solve at the B2B level. The vision frames it as a user-facing problem. Both are true.

---

## 4. Where the Vision Diverges from IDENTITY.md

### 4.1 Passive ingestion vs. relational capture

**Vision:** "The engine silently learns by observing what you accept, reject, and heavily edit. It ingests your Spotify playlists, your saved aesthetic references, the specific vocabulary you use in emails."

**IDENTITY.md:** Taste is built through the find→reaction→edge loop. The moat section is explicit: *"The taste graph cannot be replicated by scraping, by surveying, or by analysing consumption data. It can only be built through a relationship where someone trusts you enough to react honestly to things you send them without being asked."*

**The tension:** Passive ingestion treats users as data sources. Judes treats them as people in a relationship. Importing a Spotify library produces consumption data — what someone played. The find→silence→correction loop produces conviction data — what someone recognised as theirs. These are categorically different datasets. The moat thesis depends on this distinction.

**However:** There's a version of source connection that doesn't violate this. A user voluntarily sharing their Letterboxd or Spotify history — once, as an act of trust — is closer to onboarding than to surveillance. The question is framing: "let Judes watch you" vs. "tell Judes more about you." The first is surveillance. The second is disclosure. Judes could accept the second.

### 4.2 A/B refinement interface

**Vision:** "Show two variations of a paragraph, an image, or a room design — ask the user to choose the one that feels more 'you.'"

**IDENTITY.md, refusal set #8:** *"Judes will not ask you to do anything. No 'rate this,' 'share this,' 'tell me more.' The relationship is not transactional."*

**The Naomi test:** Would Naomi do A/B comparisons for an app? She'd delete it. She walked out of a restaurant because of the font on the menu. She's not going to sit through a preference quiz dressed up as taste calibration.

**Verdict:** This directly conflicts with the refusal set and fails the Naomi test. Judes learns through the relationship (sends, reactions, silence), not through prompted choices. The A/B approach is how you'd build a taste engine that feels like software. Judes is not software.

### 4.3 User-facing taste profile

**Vision:** Implies users see, manage, and actively use their taste identity. They "inject" taste prompts into other tools.

**IDENTITY.md:** *"The taste model is never declared to the user. There is no 'your taste profile' page. Taste is invisible. The proof is in the finds."*

**The tension:** Making taste visible turns Judes into a mirror. Judes is a window — it shows you things you didn't know existed, not things you already are. The decode is the one moment Judes reflects you back to yourself, and even that is designed to feel like being seen, not like seeing a dashboard.

**However:** This doesn't mean taste data can't flow to other services. It means the user shouldn't be the one managing that flow. If a partner app integrates the Judes API and a user consents to sharing their taste profile, the user never sees the taste prompt itself — they just notice the partner app suddenly gets them right. The magic is invisible. That's more Judes than a copy-paste prompt.

### 4.4 Portability as user-facing feature

**Vision:** Users actively carry their taste profile across the AI ecosystem. They copy taste prompts into tools.

**IDENTITY.md:** The taste graph is a B2B asset. Users never see the infrastructure. *"None of this is the user's problem. None of it is visible."*

**The reframe:** Portability is real, but it's an API feature, not a consumer feature. The user's experience is: "things that use Judes data seem to understand me." Not: "I exported my taste prompt and pasted it into ChatGPT." The first is magic. The second is plumbing.

### 4.5 "Prompt engineer for your personality"

**Vision:** Judes as a utility — a meta-tool that makes other tools work better.

**IDENTITY.md:** *"If it feels like software, it's wrong. If it feels like a feature, it's wrong. If it feels like someone who knows you just sent you something perfect, it's Judes."*

**The tension:** "Prompt engineer for your personality" is a utility framing. Judes is a relationship. The consumer product should never feel like a tool you use. The B2B layer can be a tool that developers use — but that's invisible to Naomi.

---

## 5. What's Genuinely New (and Worth Considering)

Three ideas from the vision that aren't in IDENTITY.md and don't conflict with it:

### 5.1 "Taste prompts" as the B2B API delivery format

IDENTITY.md names "AI Persona Taste Layers" as the primary business line but doesn't specify the delivery format. The vision names it: a **taste prompt** is a structured system prompt fragment that makes another AI tool behave as if it knows the user.

This is architecturally concrete. Given a user's taste graph, Judes could generate:

```
// Example taste prompt (not user-facing — delivered via API to partner)
{
  "voice": "lowercase, no superlatives, room temperature conviction.
    prefers single-word sentences for emphasis. references specific
    moments rather than categories. says 'the part where' not 'the vibe of'.",
  "aesthetic": "raw materials over polish. concrete, brushed metal,
    exposed structure. favours negative space. film grain over digital
    clarity. brutalist over minimalist — the distinction matters.",
  "quality_filter": "rejects anything trending. rejects anything that
    could describe anyone. specificity threshold: must name the exact
    element, not the category. popularity ceiling: ~50.",
  "edges": [
    {"type": "sensory", "pattern": "texture of unfinished surfaces"},
    {"type": "structural", "pattern": "architecture that shows its bones"},
    {"type": "corrective", "pattern": "not minimal — raw. the difference is intention."}
  ]
}
```

This is generated from data that already exists in the graph. The decode, through-line, edge reasoning, corrective edges, and taste filter criteria are all raw material. No new ingestion needed — just a new output format.

### 5.2 Domain-specific output from the same graph

The vision's insight that the same taste identity expresses differently across domains (voice, visual, quality) is architecturally useful. The graph already has typed edges:

- **Sensory edges** → aesthetic/visual taste prompts
- **Structural edges** → quality/rigour taste prompts
- **Emotional edges** → voice/tone taste prompts
- **Corrective edges** → constraint/boundary prompts (the most valuable — "not X, Y")

A `generateTastePrompt(userId, domain)` function could filter the graph by edge type and generate domain-specific outputs. This is a new capability built on existing data, not a new data collection mechanism.

### 5.3 Voluntary source connections as graph enrichment

Not passive surveillance — a one-time act of disclosure. After onboarding (never during), a user could optionally share a Letterboxd profile, a Spotify library, or an Are.na channel. Judes processes it once, extracts taste nodes and edges, and never monitors it again.

The framing matters. Not "connect your accounts so we can learn about you" (software). More like: if a user mentions Letterboxd in a reaction, Judes could say nothing — but internally flag it as a potential enrichment source. Or: a single moment, months in, where Judes says something like `if you ever want to show me your letterboxd, I'd look.` One sentence. No link. No button. The user has to volunteer it.

This is the riskiest of the three ideas because it's closest to the line. It would need to pass the Naomi test: would Naomi share her Letterboxd with Judes? Maybe — but only because she trusts Judes, and only if Judes asked the way a person would ask, not the way an app would ask.

---

## 6. The Reframe

### What the vision gets right that Judes should sharpen

**The taste graph is an identity layer.** IDENTITY.md already knows this, but naming it explicitly — "taste identity infrastructure" — is useful for strategic positioning. When pitching the B2B API, "taste prompts" is a better phrase than "AI Persona Taste Layers" because it tells a developer exactly what they're getting: a system prompt fragment they can inject.

**Domain-specific outputs increase graph value.** The graph's value multiplies if it can express taste in voice, visual, and quality registers. This doesn't require new data — it requires a new output layer on existing data. The typed edge system (sensory, emotional, structural, corrective) was designed for exactly this kind of decomposition.

**The "re-explaining yourself" problem is real.** Every time someone starts a new AI tool and spends 20 minutes calibrating it, that's the problem Judes' graph solves. Not by giving users a portable file — by being the API that tools call to skip the calibration phase entirely.

### What the vision gets wrong about Judes

**The moat is the relationship, not the technology.** Making Judes feel like infrastructure to the user (export prompts, manage your taste profile, connect accounts) destroys the relationship that produces the data that makes the infrastructure valuable. The user never sees the engine. The user just notices that Judes is always right.

**Passive ingestion is consumption data in disguise.** Scraping someone's Spotify history tells you what they played. It doesn't tell you why "3am cement" exists as a playlist name. The find→reaction loop gets you the "why." That's the data that's actually scarce.

**Showing users their taste profile turns Judes into a mirror.** The decode is the one moment of reflection — and it's designed to feel like being seen by someone, not like looking at a screen. A taste dashboard, no matter how beautifully designed, is a screen.

---

## 7. What Could Be Built (and in What Order)

If the founder decides to adopt elements of this vision, here's the build order that respects IDENTITY.md:

### Phase 1: Taste prompt generation (internal)
Build `generateTastePrompt(userId, domain)` — a function that reads a user's taste graph and produces a structured prompt fragment. Domain options: `voice`, `aesthetic`, `quality`, `general`. Uses existing edge types to filter. No new UI, no new ingestion. Test it by using the output to improve Judes' own find quality — the taste prompt becomes a better system prompt for the taste filter.

### Phase 2: Taste prompt API (B2B)
Expose taste prompts through an authenticated API endpoint. Partners request a taste prompt for a user (with user consent via OAuth or similar). The user never sees the prompt. They just notice the partner app suddenly understands them. This is the "AI Persona Taste Layers" monetisation — now with a concrete delivery format.

### Phase 3: Voluntary source enrichment (careful)
If there's evidence users want to deepen their graph, allow one-time source connections. Letterboxd, Spotify library, Are.na. Processed once, not monitored. Framed as disclosure, not surveillance. Only after the relationship has earned it (months, not days). Must pass the Naomi test.

Phase 1 is pure upside — no new surface, no new ingestion, no conflict with IDENTITY.md. It makes the existing product better while creating the B2B delivery format.

Phase 2 is the business model. It requires consent infrastructure and API design but no changes to the consumer experience.

Phase 3 is optional and debatable. It enriches the graph but risks making Judes feel like software. Only worth doing if the relationship model hits a data ceiling — which it hasn't yet.

---

## 8. Questions for the Founder

1. **Should "taste prompts" become the named format for the B2B API?** The term is clearer than "AI Persona Taste Layers" for developer positioning. It tells a partner exactly what they get: a system prompt fragment they can inject.

2. **Should domain-specific output (voice, aesthetic, quality) be built as an internal tool first?** Using it to improve Judes' own taste filter would validate the concept before exposing it as an API.

3. **Is voluntary source connection worth exploring, or does it cross a line?** The Naomi test is close on this one. She might share her Letterboxd with someone she trusts — but only if they asked like a person, not like an app.

4. **Should this analysis go into NotebookLM?** It maps the vision against IDENTITY.md in a way that could inform the next round of strategic thinking.
