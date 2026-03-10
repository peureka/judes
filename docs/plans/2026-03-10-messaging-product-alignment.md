# Phase: Messaging–Product Alignment

**Goal:** Bridge the gap between the brand messaging framework (judes-messaging-v2) and the live product. The messaging doc makes six promises the product doesn't fully deliver yet. This phase closes each one.

**Governing principle:** The messaging doc is right about what Judes should feel like. The product needs to catch up. No new features — just making the product match what it already claims to be.

---

## The six gaps

| # | What the doc says | What the product does | Gap |
|---|---|---|---|
| 1 | "songs, films, places, images, books, moods, references" | Spotify only | Single-domain finds |
| 2 | "spots hidden affinities across what you love" | Per-user inference only | Cross-user graph not in find pipeline |
| 3 | "This fits" / "Not this thread" | Free-text response only | No structured response language |
| 4 | Hero, how it works, why it's different, silence section, CTA | Input form that jumps straight to decode | No front door |
| 5 | "deepens and expands your taste" | Staleness tracked, not used | Comfort zone not challenged |
| 6 | "sends only when it earns the interruption" | 20-hour floor + top-10 users per cron | Time-based, not taste-based restraint |

---

## Epic 1 — Multi-domain sources

**Why:** The messaging doc says "songs, films, places, images, books, moods, references." The decode already references film, architecture, and place. A user whose three things are "Tarkovsky, Peckham, concrete" should not only receive music.

**What to build:**

### 1.1 — YouTube source (`sources/youtube.js`)

Film essays, music videos, visual content. YouTube Data API v3.

```
generateCandidates(tasteProfile) → [
  { name, creator, id, youtubeUrl, viewCount, publishedAt, strategy }
]
```

Three strategies (mirroring Spotify pattern):
- **Brief keywords** — search YouTube for terms from taste brief
- **Related channels** — find channels similar to creators in onboarding nodes, pull recent videos with < 50K views
- **Edge reasoning** — search using language from taste edges

Filter: skip anything with > 500K views (popularity gate, same logic as Spotify's `popularity > 65`). Skip music videos from major labels (those are Spotify's domain). Prioritise: film essays, short films, visual art, architecture walks, documentary clips.

Files:
- Create: `sources/youtube.js`
- Modify: `.env.example` — add `YOUTUBE_API_KEY`

### 1.2 — TMDB source (`sources/tmdb.js`)

Films and TV. TMDB API v3.

```
generateCandidates(tasteProfile) → [
  { name, year, director, tmdbId, tmdbUrl, popularity, genres, strategy }
]
```

Three strategies:
- **Brief keywords** — discover films matching taste brief themes
- **Director/cast graph** — from onboarding nodes, find directors/actors → their lesser-known work
- **Edge reasoning** — search using edge type language (structural → films with notable architecture/pacing, sensory → films known for texture/grain)

Filter: skip anything with TMDB popularity > 30 (roughly equivalent to widely known). Skip anything released in the last 3 months (avoid "trending" territory — IDENTITY.md refusal #7).

Files:
- Create: `sources/tmdb.js`
- Modify: `.env.example` — add `TMDB_API_KEY`

### 1.3 — Source router in initiate.js

The find pipeline currently calls `generateCandidates` from `sources/spotify.js` directly. Replace with a source router that pulls candidates from all active sources, merges them, and passes the combined pool to the taste filter.

```javascript
import { generateCandidates as spotifyCandidates } from "./sources/spotify.js";
import { generateCandidates as youtubeCandidates } from "./sources/youtube.js";
import { generateCandidates as tmdbCandidates } from "./sources/tmdb.js";

async function getAllCandidates(tasteProfile) {
  const [spotify, youtube, tmdb] = await Promise.allSettled([
    spotifyCandidates(tasteProfile),
    youtubeCandidates(tasteProfile),
    tmdbCandidates(tasteProfile),
  ]);

  return [
    ...(spotify.status === "fulfilled" ? spotify.value : []),
    ...(youtube.status === "fulfilled" ? youtube.value : []),
    ...(tmdb.status === "fulfilled" ? tmdb.value : []),
  ];
}
```

The taste filter prompt already handles any domain — it says "song/album/artist" but the logic is domain-agnostic. Update the prompt to say "song, film, video, place, or cultural object" and add domain-appropriate specificity examples:
- Music: "the bassline at 2:47"
- Film: "the way light falls in the third shot of the opening"
- Video: "the cut at 4:12 where the argument changes register"

Files:
- Modify: `initiate.js` — replace direct Spotify import with source router
- Modify: `taste-filter.js` — expand TASTE_FILTER_PROMPT for multi-domain candidates
- Modify: `taste-filter.js:filterCandidate` — candidate context builder handles film/video metadata

### 1.4 — Domain-aware find email

The find email currently assumes a Spotify URL. Handle YouTube and TMDB links. Subject line stays as candidate name. The email template adapts:
- Music: `listen` link → Spotify
- Film: `watch` link → TMDB page or streaming link if available
- Video: `watch` link → YouTube

Files:
- Modify: `email.js:sendFind` — source_type-aware link text and URL

### 1.5 — Domain-aware node creation

`findForUser()` in taste-filter.js hardcodes `domain: 'music'` when inserting taste nodes. Make domain dynamic based on candidate source.

Files:
- Modify: `taste-filter.js:findForUser` — pass `candidate.domain` to taste_nodes INSERT
- Each source module exports candidates with a `domain` field (music, film, video)

---

## Epic 2 — Homepage as front door

**Why:** The messaging doc has detailed homepage copy. The current judes.ai goes straight to the decode input. A new visitor with no context sees "three things. anything — a film, a city, a texture, a feeling. whatever comes first." and an input field. The messaging doc's homepage earns the decode by explaining what Judes is first.

**What to build:**

### 2.1 — Landing page (`web/app/page.js` rewrite)

The current page.js serves double duty — it's the landing page AND the decode flow. Split them.

New page.js becomes the homepage from the messaging doc:

**Hero section:**
```
a machine for feeling uniquely understood through culture.

judes remembers your pattern, spots hidden affinities,
and sends one rare find only when it is worth it.

[get decoded]
```

**How it works section:**
```
1. give judes three signals.
   songs, films, places, images, books, moods, references. anything with cultural pull.

2. get decoded.
   judes writes a short reading of your taste, your patterns, and your cultural pull.

3. receive finds.
   when judes finds something worth sending, it emails you one thing
   with one sentence explaining why it is yours.

4. get sharper over time.
   every interaction helps judes understand your taste more deeply.
```

**Why it's different section:**
```
most systems recommend by similarity. judes works by cultural inference.
it looks past surface matches and finds the deeper thread across what you love.
that is why the right find feels surprising and inevitable at once.
```

**Silence section:**
```
silence is part of the product.

judes does not send because a schedule says it should.
it sends when it has something worth sending.
fewer emails. fewer interruptions. a higher bar for every find.
```

**Final CTA:**
```
not more recommendations. better ones.
[get your taste decoded]
```

Both CTAs link to `/decode`.

**Design rules:**
- Dark background (#111), monospace font — existing aesthetic
- No navigation, no logo, no footer (per IDENTITY.md)
- Sign in link stays top-right
- Mobile-first. Reads like a note someone left for you
- Single scroll. No sections that feel like a "website"
- Copy verbatim from messaging doc — it's already in voice

Files:
- Rewrite: `web/app/page.js` — homepage only, no decode logic

### 2.2 — Decode page (`web/app/decode/page.js`)

Move the current decode flow (input + DecodeView) to `/decode`. Same logic, same code — just lives at a different route now.

The homepage CTA links here. The decode page has no explanation — just the input. You've already been told what this is on the homepage (or you came via a friend's screenshot and you already know).

Files:
- Create: `web/app/decode/page.js` — move existing decode logic from page.js
- The auth check (redirect to /timeline if logged in) stays on the homepage

---

## Epic 3 — "This fits" / "Not this thread"

**Why:** The messaging doc specifies these as the response language. They reinforce the deeper-thread concept. "Not this thread" is more useful than "dislike" — it tells the user (and the engine) that the connection was wrong, not the quality. The classification engine already handles both — this is just giving users the right words.

**What to build:**

### 3.1 — Response options in find email

Add two links below the find, before "say something":

```
this fits    not this thread    say something
```

- `this fits` → POST to `/api/respond` with `{ findId, text: "this fits" }` → classified as `confirmation`
- `not this thread` → POST to `/api/respond` with `{ findId, text: "not this thread" }` → classified as `correction`
- `say something` → opens timeline at the find (existing behaviour)

The first two are one-click responses that don't require the timeline. They should redirect to a simple confirmation page: "noted." (lowercase, no exclamation, in voice).

Files:
- Modify: `email.js:sendFind` — add two response links
- Create: `web/app/api/respond/route.js` — accepts findId + text, runs existing reaction pipeline
- Create: `web/app/noted/page.js` — minimal confirmation page: "noted."

### 3.2 — Response options on timeline

When viewing an unanswered find on the timeline, show the two phrases as clickable options above the free-text input. Clicking one submits immediately. Free text remains available below.

Files:
- Modify: `web/app/timeline/page.js` — add response option buttons on unanswered finds

---

## Epic 4 — Staleness-driven expansion

**Why:** IDENTITY.md says "comfort is the enemy of taste." The staleness_score is tracked on every hard_ignore (+0.1, capped at 1.0) but isn't used to change find behaviour. The messaging doc promises "deepens and expands" — the expand part requires the engine to push into unfamiliar territory when the safe zone stops landing.

**What to build:**

### 4.1 — Domain diversification in candidate generation

Track domain distribution of recent finds per user. When the last N finds are all the same domain, bias candidate generation toward other domains.

```javascript
async function getDomainBias(userId) {
  const recentDomains = await sql`
    SELECT tn.domain, COUNT(*)::int AS count
    FROM find_records fr
    JOIN taste_nodes tn ON tn.id = fr.node_id
    WHERE fr.user_id = ${userId}
      AND fr.sent_at >= NOW() - INTERVAL '30 days'
    GROUP BY tn.domain
    ORDER BY count DESC
  `;

  // If 80%+ of recent finds are one domain, deprioritise it
  const total = recentDomains.reduce((sum, d) => sum + d.count, 0);
  if (!total) return null;

  const dominant = recentDomains[0];
  if (dominant.count / total >= 0.8) {
    return { avoid: dominant.domain, reason: `${dominant.count}/${total} recent finds are ${dominant.domain}` };
  }
  return null;
}
```

When a domain bias is detected, the source router should request more candidates from underrepresented sources and fewer from the dominant one.

Files:
- Modify: `initiate.js` — add domain bias check before candidate generation
- Pass bias info to source router so it can weight source calls

### 4.2 — Edge type diversification in taste filter

Track edge type distribution of recent finds. If all recent reasoning sentences use sensory edges, prompt the taste filter to prefer structural or emotional connections.

Add to the taste filter prompt context:
```
recent edge types used: sensory (4), emotional (1), structural (0), corrective (0)
prefer: structural or corrective connections for this find.
```

Files:
- Modify: `taste-filter.js:findForUser` — query recent edge types, pass as context
- Modify: `taste-filter.js` — TASTE_FILTER_PROMPT gets a diversification instruction when bias detected

### 4.3 — Staleness as expansion signal

When `staleness_score > 0.3` (3+ hard ignores without course correction), the engine should:
1. Raise the popularity ceiling slightly (from 65 to 75) — cast a wider net
2. Include candidates from domains the user hasn't received finds in
3. Add a line to the taste filter prompt: "this user's recent finds haven't landed. push further from the centre. surprise over safety."

When `staleness_score > 0.6`, also:
4. Include `getUnsurfacedConnection()` candidates (Epic 5 prerequisite)
5. Consider regenerating the taste prompt even if the normal threshold hasn't been met

Files:
- Modify: `taste-filter.js:findForUser` — staleness-aware popularity gate and prompt injection
- Modify: `initiate.js` — pass staleness_score through to candidate generation

---

## Epic 5 — Cross-user affinity in find pipeline

**Why:** The messaging doc says "spots hidden affinities across what you love." `getUnsurfacedConnection()` and `computeConnections()` exist in taste-graph.js but aren't wired into find generation. Right now, finds come from Spotify search strategies based on the individual user's profile. Cross-user patterns ("users who share your specific edge type for this node also connect with this other node") are the mechanism that makes cultural inference real at scale.

**What to build:**

### 5.1 — Cross-user candidate strategy

A fourth candidate generation strategy: query the taste graph for nodes that appear in other users' profiles who share high-similarity connections with the current user.

```javascript
async function crossUserCandidates(userId, tasteProfile) {
  // Find users with high taste similarity
  const connections = await sql`
    SELECT tc.*,
      CASE WHEN tc.user_a = ${userId} THEN tc.user_b ELSE tc.user_a END AS other_id
    FROM taste_connections tc
    WHERE (tc.user_a = ${userId} OR tc.user_b = ${userId})
      AND tc.similarity > 0.8
    ORDER BY tc.similarity DESC
    LIMIT 5
  `;

  if (!connections.length) return [];

  const otherIds = connections.map(c => c.other_id);

  // Find nodes that landed well for connected users but haven't been sent to this user
  const candidates = await sql`
    SELECT tn.*, fr.reasoning_sentence, rs.signal_type
    FROM find_records fr
    JOIN taste_nodes tn ON tn.id = fr.node_id
    LEFT JOIN reaction_signals rs ON rs.find_id = fr.id
    WHERE fr.user_id = ANY(${otherIds})
      AND tn.id NOT IN (SELECT node_id FROM find_records WHERE user_id = ${userId})
      AND (rs.signal_type IN ('confirmation', 'deep_resonance', 'discovery') OR rs.signal_type IS NULL)
    ORDER BY tn.cross_user_count DESC
    LIMIT 10
  `;

  return candidates.map(c => ({
    name: c.name,
    domain: c.domain,
    metadata: c.metadata,
    spotifyUrl: c.metadata?.spotify_url,
    youtubeUrl: c.metadata?.youtube_url,
    tmdbUrl: c.metadata?.tmdb_url,
    popularity: 0, // already vetted by taste filter for another user
    strategy: "cross_user_affinity",
    crossUserReasoning: `landed for someone with a similar thread`,
  }));
}
```

This feeds into the existing taste filter — the filter still gates quality. The cross-user source just provides candidates the user would never have found through their own search terms.

Files:
- Create: `sources/cross-user.js` — cross-user candidate generation
- Modify: `initiate.js` — add cross-user candidates to source router
- Modify: `taste-filter.js:filterCandidate` — add `crossUserReasoning` to candidate context when present

### 5.2 — Run `computeConnections()` on cron

Currently not called anywhere on schedule. Add to the daily cron (2am UTC alongside silence sweep).

Files:
- Modify: `index.js` — import and call `computeConnections()` at 2am UTC

### 5.3 — Increment `cross_user_count` on taste nodes

When a node appears in a find for a new user, increment the counter. This is already in the schema but not wired.

Files:
- Modify: `taste-filter.js:findForUser` — after inserting a find record, increment `cross_user_count` on the node if it was sent to a different user previously

---

## Epic 6 — Restraint calibration

**Why:** The messaging doc says "sends only when it earns the interruption" and "silence is part of the product." The current system has a 20-hour minimum gap and takes the top 10 users per cron cycle. That's operational throttling, not taste-driven restraint. Judes should be capable of going days or weeks without sending if nothing clears the bar.

**What to build:**

### 6.1 — Minimum score threshold

Add a minimum composite score below which no find is attempted for a user, regardless of eligibility.

```javascript
const MIN_SCORE_THRESHOLD = 0.25;

const topUsers = ranked
  .filter(u => u.score >= MIN_SCORE_THRESHOLD)
  .slice(0, 10);
```

If no users clear the threshold in a cron cycle, the engine produces nothing. That's correct behaviour.

Files:
- Modify: `initiate.js:generateFinds` — add score threshold filter

### 6.2 — Extend minimum gap based on response ratio

Users who respond frequently can receive finds more often. Users who rarely respond should get more space.

```javascript
// Current: fixed 20-hour gap
// New: dynamic gap based on response ratio
function getMinGapHours(responseRatio, totalFindsSent) {
  if (totalFindsSent < 3) return 48;  // new users get more space early
  if (responseRatio > 0.6) return 20;  // engaged users: current minimum
  if (responseRatio > 0.3) return 48;  // moderate: 2 days
  return 96;                            // low response: 4 days minimum
}
```

The query in `generateFinds()` currently uses a fixed `INTERVAL '20 hours'`. Replace with a per-user gap calculated from their profile.

Files:
- Modify: `initiate.js:generateFinds` — dynamic gap calculation per user
- The eligible users query needs to pull response_ratio and total_finds_sent (already available via join to user_taste_profiles)

### 6.3 — Log silence as signal

When the cron runs and produces no finds for anyone, log it. This is useful for the founder to see how often the engine stays quiet.

```javascript
if (!results.length || results.every(r => r.action === "silence")) {
  console.log(`[cron] ${new Date().toISOString()} — full silence. nothing cleared.`);
}
```

Files:
- Modify: `index.js` — log full-silence cron runs

---

## Order of implementation

Epics are independent and can be built in any order. Recommended sequence based on impact:

1. **Epic 2** (Homepage) — fastest to ship, biggest perception change. Users see a product with a point of view instead of just an input field.
2. **Epic 3** (This fits / Not this thread) — small surface change, big data quality improvement. Corrective edges from "not this thread" are the highest-value taste signal.
3. **Epic 6** (Restraint calibration) — no new features, just tuning. Makes silence real instead of just claimed.
4. **Epic 1** (Multi-domain sources) — largest engineering scope. YouTube and TMDB integration. The product starts feeling like the doc.
5. **Epic 4** (Staleness-driven expansion) — depends on multi-domain sources being available. Can't push into film if film isn't a source yet.
6. **Epic 5** (Cross-user affinity) — depends on having enough users with enough finds to produce meaningful cross-user patterns. Wire it now, value compounds later.

---

## What this phase does NOT include

- New source integrations beyond YouTube and TMDB (Are.na, Bandcamp, Google Places, Letterboxd, SoundCloud — deferred per STACK.md)
- Taste graph visualisation or export API
- Business layer (AI persona licensing, brand taste positioning, cultural forecasting)
- Mobile app or push notifications
- Any feature that requires manual curation, customer support, or coordination between people
- Any UI beyond judes.ai

---

## How to know this phase is done

A new user arrives at judes.ai. They read what Judes is. They get decoded. Days later, they receive a film — not a song — with a reasoning sentence that names the specific shot. They tap "this fits." Two weeks of silence. Then a song from an artist they've never heard of, connected to their decode through a structural edge. They reply with a sentence. Judes replies once. Then quiet.

That sequence is what the messaging doc promises. When the product delivers it, the gap is closed.
