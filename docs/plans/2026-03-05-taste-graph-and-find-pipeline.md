# Taste Graph + Find Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the decode engine to populate the taste graph schema, then build the end-to-end find pipeline (Spotify source → taste filter → reasoning sentence → Telegram delivery → reaction capture).

**Architecture:** Two phases. Phase A wires the existing decode to write TasteNodes, TasteEdges, DecodePatterns, and UserTasteProfiles to the new Postgres tables on every onboarding. Phase B builds the find pipeline: Spotify integration as the first source, a Claude-powered taste filter that scores candidates and generates reasoning sentences, an initiation engine rewrite that sends finds instead of conversations, and reaction capture that classifies user responses.

**Tech Stack:** Node.js (ESM), Neon Postgres + pgvector, Grammy (Telegram), Claude API (Anthropic SDK), Spotify Web API, MiniLM-L6-v2 embeddings via @xenova/transformers.

**Key files to read first:**
- `docs/IDENTITY.md` — governing document, taste graph schema, voice rules, integrity audit, refusal set
- `docs/NAOMI.md` — test persona, canonical three things (Tirzah, Peckham, concrete)
- `docs/STACK.md` — architecture, data flows
- `docs/DECISIONS.md` — settled decisions (do not re-litigate)
- `db/migrate-taste-graph.sql` — taste graph table definitions

**Existing code that stays unchanged:**
- `memory/recall.js` — semantic recall (used by reaction capture)
- `memory/embeddings.js` — MiniLM-L6-v2 embedding (used everywhere)
- `memory/backfill.js` — embedding backfill utility
- `scoring.js` — user scoring signals (reused by find initiation engine)
- `temporal.js` — temporal fact awareness
- `chapters.js` — life chapter detection
- `brief.js` — living brief rebuilds
- `db/index.js` — Neon Postgres connection

**Existing code that gets modified:**
- `decode.js` — add taste graph writes after decode
- `bot.js` — change post-onboarding message handling to reaction capture
- `initiate.js` — rewrite from conversational initiations to find pipeline
- `index.js` — update cron schedule and imports
- `conversation.js` — becomes reaction reply engine (one reply max)

**New files created:**
- `sources/spotify.js` — Spotify Web API integration
- `taste-filter.js` — Claude-powered candidate scoring + reasoning sentence generation
- `reaction.js` — reaction signal classification and taste graph updates

---

## Phase A: Decode → Taste Graph

### Task 1: Run the taste graph migration

**Files:**
- Run: `db/migrate-taste-graph.sql`

**Step 1: Run migration against Neon**

Run the migration SQL against your Neon database. This creates the 6 taste graph tables: `taste_nodes`, `taste_edges`, `user_taste_profiles`, `find_records`, `reaction_signals`, `decode_patterns`.

```bash
# Using psql or Neon dashboard — run the contents of db/migrate-taste-graph.sql
# The migration is idempotent (uses gen_random_uuid(), CREATE INDEX, etc.)
```

**Step 2: Verify tables exist**

```bash
# Connect to Neon and run:
# SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
# Should include: taste_nodes, taste_edges, user_taste_profiles, find_records, reaction_signals, decode_patterns
```

---

### Task 2: Add taste graph extraction to decode engine

**Files:**
- Modify: `decode.js`

The decode prompt already generates three sections: decode text, world (8 references), and brief. We need to:
1. Add a second Claude call (Haiku, cheap) that extracts structured taste graph data from the decode output
2. Write TasteNodes, TasteEdges, DecodePattern, and UserTasteProfile to Postgres

**Step 1: Add the taste graph extraction function to decode.js**

Add this after the existing `decode` function:

```javascript
import { sql } from "./db/index.js";
import { embed, toVector } from "./memory/embeddings.js";

const EXTRACT_PROMPT = `you are extracting structured taste data from a decode. given three inputs and the decode text, extract:

1. NODES: each input as a taste node. format per line:
name|domain|specificity

domain is one of: music, film, architecture, food, place, photography, design, literature, fashion, fragrance, material, texture, game, brand, font, colour, other
specificity is one of: domain, genre, creator, work, moment

2. EDGES: connections between the three nodes that the decode implies. format per line:
node_a_name|node_b_name|edge_type|reasoning

edge_type is one of: sensory, emotional, structural, corrective
reasoning is one sentence explaining the connection (lowercase, no exclamation marks)

3. THREAD: the single through-line connecting all three — one sentence, lowercase.

separate sections with ---

example output:
Tirzah|music|creator
Peckham|place|work
concrete|material|domain
---
Tirzah|concrete|sensory|both have grain — unpolished surfaces that hold warmth underneath
Tirzah|Peckham|emotional|the same commitment to staying where you are instead of performing somewhere else
Peckham|concrete|structural|built environments that don't pretend to be finished
---
you want texture that earns its roughness.`;

export async function extractTasteGraph(threeThings, decodeText, userId) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: EXTRACT_PROMPT,
    messages: [
      {
        role: "user",
        content: `inputs: ${threeThings.join(", ")}\ndecode: ${decodeText}`,
      },
    ],
  });

  const text = response.content[0].text.trim();
  const sections = text.split(/\n---\n|\n-{3,}\n/);

  if (sections.length < 3) {
    console.error("taste graph extraction: unexpected format");
    return null;
  }

  // Parse nodes
  const nodeLines = sections[0].trim().split("\n").filter((l) => l.trim());
  const nodeIds = [];

  for (const line of nodeLines) {
    const [name, domain, specificity] = line.split("|").map((s) => s.trim());
    if (!name || !domain) continue;

    const result = await sql`
      INSERT INTO taste_nodes (name, domain, specificity, source)
      VALUES (${name}, ${domain}, ${specificity || "work"}, 'onboarding')
      RETURNING id
    `;
    nodeIds.push({ name, id: result[0].id });
  }

  // Parse edges
  const edgeLines = sections[1].trim().split("\n").filter((l) => l.trim());
  const edgeIds = [];

  for (const line of edgeLines) {
    const parts = line.split("|").map((s) => s.trim());
    if (parts.length < 4) continue;
    const [nodeAName, nodeBName, edgeType, reasoning] = parts;

    const nodeA = nodeIds.find((n) => n.name.toLowerCase() === nodeAName.toLowerCase());
    const nodeB = nodeIds.find((n) => n.name.toLowerCase() === nodeBName.toLowerCase());
    if (!nodeA || !nodeB) continue;

    const result = await sql`
      INSERT INTO taste_edges (node_a, node_b, edge_type, reasoning, source, user_id)
      VALUES (${nodeA.id}, ${nodeB.id}, ${edgeType}, ${reasoning}, 'decode', ${userId})
      RETURNING id
    `;
    edgeIds.push(result[0].id);
  }

  // Parse thread
  const thread = sections[2].trim();

  // Create decode pattern
  await sql`
    INSERT INTO decode_patterns (input_nodes, through_line, edges_used)
    VALUES (${nodeIds.map((n) => n.id)}, ${thread}, ${edgeIds})
  `;

  // Create user taste profile
  const briefVec = await embed(decodeText);
  await sql`
    INSERT INTO user_taste_profiles (user_id, onboarding_inputs, decode, taste_vector, active_edges)
    VALUES (${userId}, ${threeThings}, ${decodeText}, ${toVector(briefVec)}::vector, ${edgeIds})
    ON CONFLICT (user_id) DO UPDATE SET
      decode = ${decodeText},
      taste_vector = ${toVector(briefVec)}::vector,
      active_edges = ${edgeIds},
      updated_at = NOW()
  `;

  return { nodeIds, edgeIds, thread };
}
```

**Step 2: Wire extractTasteGraph into bot.js onboarding flow**

In `bot.js`, after the user is created and the decode reply is sent, call `extractTasteGraph`:

```javascript
// Add import at top of bot.js
import { extractTasteGraph } from "./decode.js";

// In the onboarding handler, after onboardingState.delete(telegramId) and ctx.reply(replyText):
// Replace the embedBrief call with taste graph extraction
extractTasteGraph(threeThings, decodeText, user[0].id).catch((err) => {
  console.error("taste graph extraction failed:", err.message);
});
```

Remove the `embedBrief` call — the taste profile now embeds the decode vector directly.

**Step 3: Smoke test with Naomi's three things**

Send `/start` to the bot, then `Tirzah, Peckham, concrete`. Verify:
- Decode reply comes back in voice
- `taste_nodes` table has 3 rows
- `taste_edges` table has 3+ rows with typed edges (sensory/emotional/structural)
- `decode_patterns` table has 1 row
- `user_taste_profiles` table has 1 row with taste_vector populated

```sql
SELECT name, domain, specificity FROM taste_nodes ORDER BY created_at DESC LIMIT 3;
SELECT edge_type, reasoning FROM taste_edges ORDER BY created_at DESC LIMIT 5;
SELECT through_line FROM decode_patterns ORDER BY created_at DESC LIMIT 1;
SELECT onboarding_inputs, decode FROM user_taste_profiles ORDER BY created_at DESC LIMIT 1;
```

**Step 4: Commit**

```bash
git add decode.js bot.js
git commit -m "feat: wire decode engine to taste graph — writes TasteNodes, TasteEdges, DecodePattern, UserTasteProfile on every onboarding"
```

---

## Phase B: Find Pipeline

### Task 3: Spotify source integration

**Files:**
- Create: `sources/spotify.js`
- Modify: `.env.example`
- Modify: `package.json` (no new deps — Spotify API uses fetch)

Spotify Web API uses OAuth2 client credentials flow (no user auth needed for search/browse). We need:
- Token management (client credentials → access token, auto-refresh)
- Search by taste keywords derived from user's taste profile
- New releases browsing
- Track/album metadata with audio features

**Step 1: Create sources/spotify.js**

```javascript
import "dotenv/config";

let accessToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (accessToken && Date.now() < tokenExpiry - 60000) return accessToken;

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
        ).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return accessToken;
}

async function spotifyFetch(endpoint, params = {}) {
  const token = await getToken();
  const url = new URL(`https://api.spotify.com/v1${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Spotify API ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function searchTracks(query, limit = 20) {
  const data = await spotifyFetch("/search", {
    q: query,
    type: "track",
    limit,
    market: "GB",
  });

  return data.tracks.items.map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artists[0]?.name,
    album: track.album?.name,
    releaseDate: track.album?.release_date,
    previewUrl: track.preview_url,
    spotifyUrl: track.external_urls?.spotify,
    popularity: track.popularity,
    albumArt: track.album?.images?.[0]?.url,
  }));
}

export async function searchAlbums(query, limit = 10) {
  const data = await spotifyFetch("/search", {
    q: query,
    type: "album",
    limit,
    market: "GB",
  });

  return data.albums.items.map((album) => ({
    id: album.id,
    name: album.name,
    artist: album.artists[0]?.name,
    releaseDate: album.release_date,
    spotifyUrl: album.external_urls?.spotify,
    totalTracks: album.total_tracks,
    albumArt: album.images?.[0]?.url,
  }));
}

export async function searchArtists(query, limit = 10) {
  const data = await spotifyFetch("/search", {
    q: query,
    type: "artist",
    limit,
    market: "GB",
  });

  return data.artists.items.map((artist) => ({
    id: artist.id,
    name: artist.name,
    genres: artist.genres,
    popularity: artist.popularity,
    spotifyUrl: artist.external_urls?.spotify,
    followers: artist.followers?.total,
  }));
}

export async function getAudioFeatures(trackIds) {
  if (!trackIds.length) return [];
  const data = await spotifyFetch("/audio-features", {
    ids: trackIds.join(","),
  });
  return data.audio_features;
}

export async function getNewReleases(limit = 20) {
  const data = await spotifyFetch("/browse/new-releases", {
    limit,
    country: "GB",
  });

  return data.albums.items.map((album) => ({
    id: album.id,
    name: album.name,
    artist: album.artists[0]?.name,
    releaseDate: album.release_date,
    spotifyUrl: album.external_urls?.spotify,
    albumArt: album.images?.[0]?.url,
  }));
}

export async function getRelatedArtists(artistId) {
  const data = await spotifyFetch(`/artists/${artistId}/related-artists`);
  return data.artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    genres: artist.genres,
    popularity: artist.popularity,
    spotifyUrl: artist.external_urls?.spotify,
  }));
}

export async function getArtistTopTracks(artistId) {
  const data = await spotifyFetch(`/artists/${artistId}/top-tracks`, {
    market: "GB",
  });
  return data.tracks.map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artists[0]?.name,
    album: track.album?.name,
    previewUrl: track.preview_url,
    spotifyUrl: track.external_urls?.spotify,
    popularity: track.popularity,
  }));
}

export async function generateCandidates(tasteProfile) {
  // Build search queries from the user's taste data
  const candidates = [];

  // Strategy 1: Search based on taste brief keywords
  if (tasteProfile.brief) {
    const briefTracks = await searchTracks(tasteProfile.brief, 10).catch(() => []);
    candidates.push(...briefTracks.map((t) => ({ ...t, strategy: "brief" })));
  }

  // Strategy 2: Get related artists from onboarding inputs that are music
  for (const input of tasteProfile.onboarding_inputs || []) {
    const artists = await searchArtists(input, 3).catch(() => []);
    for (const artist of artists) {
      if (artist.popularity > 70) continue; // too popular — skip
      const related = await getRelatedArtists(artist.id).catch(() => []);
      const deep = related.filter((r) => r.popularity < 50); // prefer obscure
      for (const r of deep.slice(0, 3)) {
        const tracks = await getArtistTopTracks(r.id).catch(() => []);
        candidates.push(
          ...tracks.slice(0, 2).map((t) => ({
            ...t,
            strategy: "related_deep",
            viaArtist: artist.name,
          }))
        );
      }
    }
  }

  // Strategy 3: Search based on taste edges (reasoning text)
  for (const edge of tasteProfile.edges || []) {
    const edgeTracks = await searchTracks(edge.reasoning, 5).catch(() => []);
    candidates.push(
      ...edgeTracks.map((t) => ({
        ...t,
        strategy: "edge",
        edgeReasoning: edge.reasoning,
      }))
    );
  }

  // Dedupe by Spotify ID
  const seen = new Set();
  return candidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}
```

**Step 2: Update .env.example**

Add Spotify credentials:

```
TELEGRAM_BOT_TOKEN=
ANTHROPIC_API_KEY=
DATABASE_URL=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

**Step 3: Create sources directory**

```bash
mkdir -p sources
```

**Step 4: Commit**

```bash
git add sources/spotify.js .env.example
git commit -m "feat: add Spotify source integration — search, related artists, audio features, candidate generation"
```

---

### Task 4: Taste filter (Claude-powered find scoring + reasoning sentence)

**Files:**
- Create: `taste-filter.js`

This is the hardest part. The taste filter takes a candidate find and the user's taste profile, and either rejects it or generates a reasoning sentence that passes the integrity audit.

**Step 1: Create taste-filter.js**

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";

const client = new Anthropic();

const TASTE_FILTER_PROMPT = `you are judes' taste filter. you're deciding whether to send someone a specific song/album/artist.

you have their taste profile: their three things, their decode, their brief, and the typed edges that define their position in taste space. edges are typed:
- sensory: shared texture, grain, physical quality
- emotional: shared feeling, register, temperature
- structural: shared architecture, form, negative space
- corrective: "not X. Y." — the real reason, not the surface one

your job:
1. decide if this candidate is worth interrupting someone's life for
2. if yes, write the reasoning sentence — ONE sentence, lowercase, no exclamation marks
3. identify which edge type(s) connect this find to the person

the reasoning sentence must name the SPECIFIC thing — "the bassline at 2:47" not "the production." "the way she drops the melody in the bridge" not "her vocal style." if you can't name a specific element, the find isn't ready.

DEAD WORDS (never use): recommend, you might like, discover, curated, resonates, vibe, content, personalised, based on your preferences, algorithm, I found this for you, check this out, amazing, incredible, stunning, trending, viral.

INTEGRITY AUDIT — the find must pass ALL of these:
1. interruption test: would you interrupt someone reading a book for this?
2. specificity test: does the reasoning name the exact thing, not the category?
3. duplication test: have they likely already encountered this?
4. software test: could this message have come from Spotify or Netflix?
5. flatness test: any performed enthusiasm? any superlatives?

respond in one of two formats:

REJECT|reason
(e.g., REJECT|too obvious — anyone who likes Tirzah already knows this artist)

SEND|reasoning_sentence|edge_type|specific_element
(e.g., SEND|the way the piano dissolves at 1:23 — same patience as the concrete you chose.|sensory|piano dissolution at 1:23)`;

export async function filterCandidate(candidate, tasteProfile) {
  const context = `## their taste profile

three things: ${tasteProfile.onboarding_inputs.join(", ")}
decode: ${tasteProfile.decode}
brief: ${tasteProfile.brief || "not yet generated"}

taste edges:
${(tasteProfile.edges || []).map((e) => `- [${e.edge_type}] ${e.reasoning}`).join("\n") || "none yet"}

## the candidate

name: ${candidate.name}
artist: ${candidate.artist || "n/a"}
album: ${candidate.album || "n/a"}
popularity: ${candidate.popularity || "unknown"}/100
genres: ${candidate.genres?.join(", ") || "unknown"}
source strategy: ${candidate.strategy || "unknown"}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 200,
    system: TASTE_FILTER_PROMPT,
    messages: [{ role: "user", content: context }],
  });

  const text = response.content[0].text.trim();

  if (text.startsWith("REJECT")) {
    const reason = text.split("|")[1]?.trim() || "not good enough";
    return { action: "reject", reason };
  }

  if (text.startsWith("SEND")) {
    const parts = text.split("|");
    return {
      action: "send",
      reasoningSentence: parts[1]?.trim(),
      edgeType: parts[2]?.trim(),
      specificElement: parts[3]?.trim(),
    };
  }

  return { action: "reject", reason: "unparseable response" };
}

export async function findForUser(userId, candidates) {
  // Get user's taste profile with edges
  const profile = await sql`
    SELECT utp.*, u.taste_brief AS brief
    FROM user_taste_profiles utp
    JOIN users u ON u.id = utp.user_id
    WHERE utp.user_id = ${userId}
  `;

  if (!profile.length) return null;

  const tasteProfile = profile[0];

  // Get active edges
  const edges = tasteProfile.active_edges?.length
    ? await sql`
        SELECT edge_type, reasoning FROM taste_edges
        WHERE id = ANY(${tasteProfile.active_edges})
      `
    : [];

  tasteProfile.edges = edges;

  // Get previously sent finds to avoid duplicates
  const sentFinds = await sql`
    SELECT node_id FROM find_records WHERE user_id = ${userId}
  `;
  const sentNodeIds = new Set(sentFinds.map((f) => f.node_id));

  // Filter candidates through Claude
  for (const candidate of candidates) {
    // Skip very popular tracks (Naomi would already know these)
    if (candidate.popularity > 65) continue;

    const result = await filterCandidate(candidate, tasteProfile);

    if (result.action === "send") {
      // Create taste node for the find
      const node = await sql`
        INSERT INTO taste_nodes (name, domain, specificity, source, metadata)
        VALUES (
          ${candidate.artist ? `${candidate.name} — ${candidate.artist}` : candidate.name},
          'music',
          'work',
          'find',
          ${JSON.stringify({
            spotify_id: candidate.id,
            spotify_url: candidate.spotifyUrl,
            album: candidate.album,
            popularity: candidate.popularity,
          })}
        )
        RETURNING id
      `;

      // Skip if we already sent this node
      if (sentNodeIds.has(node[0].id)) continue;

      // Create taste edge for the find reasoning
      const edgeType = result.edgeType || "emotional";
      const validEdgeTypes = ["sensory", "emotional", "structural", "corrective"];
      const safeEdgeType = validEdgeTypes.includes(edgeType) ? edgeType : "emotional";

      // Find a relevant onboarding node to connect to
      const onboardingNodes = await sql`
        SELECT id FROM taste_nodes
        WHERE source = 'onboarding'
        AND id = ANY(
          SELECT unnest(input_nodes) FROM decode_patterns
          WHERE created_at = (
            SELECT MAX(created_at) FROM decode_patterns
            WHERE input_nodes && (
              SELECT ARRAY(
                SELECT id FROM taste_nodes
                WHERE source = 'onboarding'
                ORDER BY created_at DESC LIMIT 3
              )
            )
          )
        )
        LIMIT 1
      `;

      let edgeId = null;
      if (onboardingNodes.length) {
        const edgeResult = await sql`
          INSERT INTO taste_edges (node_a, node_b, edge_type, reasoning, source, user_id)
          VALUES (${onboardingNodes[0].id}, ${node[0].id}, ${safeEdgeType}, ${result.reasoningSentence}, 'find_reasoning', ${userId})
          RETURNING id
        `;
        edgeId = edgeResult[0].id;
      }

      return {
        candidate,
        nodeId: node[0].id,
        edgeId,
        reasoningSentence: result.reasoningSentence,
        edgeType: safeEdgeType,
        specificElement: result.specificElement,
      };
    }
  }

  return null; // Nothing cleared the filter. Silence.
}
```

**Step 2: Commit**

```bash
git add taste-filter.js
git commit -m "feat: add Claude-powered taste filter — scores candidates, generates reasoning sentences, runs integrity audit"
```

---

### Task 5: Reaction capture

**Files:**
- Create: `reaction.js`

Classifies user responses to finds. Extracts taste signals. Updates the taste graph.

**Step 1: Create reaction.js**

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";
import { embed, toVector } from "./memory/embeddings.js";

const client = new Anthropic();

const CLASSIFY_PROMPT = `classify this response to a find. the find was a song/film/place sent with a reasoning sentence. the user replied (or didn't — silence is tracked by time).

response types:
- confirmation: short affirmation ("yes", "this", "exactly", thumbs up)
- deep_resonance: specific response naming what connected ("the part where...", "the way she...")
- correction: pushback or correction ("not really", "already know this", "not what I meant")
- discovery: curiosity pull ("who is this?", "what album?", "where is this?")
- social_share: forwarded or shared with others

respond with: type|any_new_taste_insight
(the taste insight is optional — only include if the response reveals something new about their taste, one sentence, lowercase)

example: deep_resonance|they respond to unresolved tension in music, not resolution`;

export async function classifyReaction(findId, userId, responseText) {
  // Get the find that was responded to
  const find = await sql`
    SELECT reasoning_sentence, source_url FROM find_records WHERE id = ${findId}
  `;
  if (!find.length) return null;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: CLASSIFY_PROMPT,
    messages: [
      {
        role: "user",
        content: `find reasoning: ${find[0].reasoning_sentence}\ntheir response: ${responseText}`,
      },
    ],
  });

  const text = response.content[0].text.trim();
  const parts = text.split("|").map((s) => s.trim());
  const signalType = parts[0];
  const tasteInsight = parts[1] || null;

  const validTypes = [
    "confirmation", "deep_resonance", "correction", "discovery", "social_share",
  ];
  const safeType = validTypes.includes(signalType) ? signalType : "confirmation";

  // Store reaction signal
  await sql`
    INSERT INTO reaction_signals (find_id, user_id, signal_type, raw_text)
    VALUES (${findId}, ${userId}, ${safeType}, ${responseText})
  `;

  // Update find record with response time
  await sql`
    UPDATE find_records SET response_at = NOW() WHERE id = ${findId}
  `;

  // Update taste profile stats
  await sql`
    UPDATE user_taste_profiles
    SET total_responses = total_responses + 1,
        response_ratio = (total_responses + 1)::float / GREATEST(total_finds_sent, 1),
        updated_at = NOW()
    WHERE user_id = ${userId}
  `;

  // If there's a taste insight, create a new edge
  if (tasteInsight) {
    // Find relevant nodes to connect
    const recentNodes = await sql`
      SELECT id FROM taste_nodes
      WHERE id = (SELECT node_id FROM find_records WHERE id = ${findId})
      LIMIT 1
    `;

    if (recentNodes.length) {
      const onboardingNode = await sql`
        SELECT tn.id FROM taste_nodes tn
        JOIN taste_edges te ON te.node_a = tn.id OR te.node_b = tn.id
        WHERE tn.source = 'onboarding' AND te.user_id = ${userId}
        LIMIT 1
      `;

      if (onboardingNode.length) {
        await sql`
          INSERT INTO taste_edges (node_a, node_b, edge_type, reasoning, source, user_id)
          VALUES (${onboardingNode[0].id}, ${recentNodes[0].id}, 'emotional', ${tasteInsight}, 'user_articulation', ${userId})
        `;
      }
    }
  }

  return { signalType: safeType, tasteInsight };
}

export async function checkSilenceSignals() {
  // Find finds with no response after 24 hours → soft_ignore
  const softIgnores = await sql`
    SELECT fr.id, fr.user_id FROM find_records fr
    LEFT JOIN reaction_signals rs ON rs.find_id = fr.id
    WHERE rs.id IS NULL
      AND fr.sent_at < NOW() - INTERVAL '24 hours'
      AND fr.sent_at > NOW() - INTERVAL '72 hours'
      AND fr.response_at IS NULL
  `;

  for (const find of softIgnores) {
    await sql`
      INSERT INTO reaction_signals (find_id, user_id, signal_type)
      VALUES (${find.id}, ${find.user_id}, 'soft_ignore')
      ON CONFLICT DO NOTHING
    `;
  }

  // Find finds with no response after 72 hours → hard_ignore
  const hardIgnores = await sql`
    SELECT fr.id, fr.user_id FROM find_records fr
    LEFT JOIN reaction_signals rs ON rs.find_id = fr.id
    WHERE rs.id IS NULL
      AND fr.sent_at < NOW() - INTERVAL '72 hours'
      AND fr.response_at IS NULL
  `;

  for (const find of hardIgnores) {
    await sql`
      INSERT INTO reaction_signals (find_id, user_id, signal_type)
      VALUES (${find.id}, ${find.user_id}, 'hard_ignore')
      ON CONFLICT DO NOTHING
    `;

    // Hard ignore = recalibrate. Increase staleness score.
    await sql`
      UPDATE user_taste_profiles
      SET staleness_score = LEAST(staleness_score + 0.1, 1.0),
          updated_at = NOW()
      WHERE user_id = ${find.user_id}
    `;
  }

  return { softIgnores: softIgnores.length, hardIgnores: hardIgnores.length };
}
```

**Step 2: Commit**

```bash
git add reaction.js
git commit -m "feat: add reaction capture — classifies responses, updates taste graph, tracks silence signals"
```

---

### Task 6: Rewrite initiation engine for finds

**Files:**
- Modify: `initiate.js`

Replace the conversational initiation system with the find pipeline: score users → generate candidates from Spotify → run through taste filter → send or stay silent.

**Step 1: Rewrite initiate.js**

```javascript
import { sql } from "./db/index.js";
import { scoreUsers } from "./scoring.js";
import { generateCandidates } from "./sources/spotify.js";
import { findForUser } from "./taste-filter.js";

export async function generateFinds() {
  // Fetch eligible users — haven't received a find in 20+ hours, have a taste profile
  const eligibleUsers = await sql`
    SELECT u.*, utp.onboarding_inputs, utp.taste_vector, utp.staleness_score,
           utp.total_finds_sent, utp.last_find_at
    FROM users u
    JOIN user_taste_profiles utp ON utp.user_id = u.id
    WHERE (utp.last_find_at IS NULL OR utp.last_find_at < NOW() - INTERVAL '20 hours')
  `;

  if (!eligibleUsers.length) return [];

  // Score and rank
  const ranked = await scoreUsers(eligibleUsers);
  const topUsers = ranked.slice(0, 10); // fewer than before — finds are expensive

  const results = [];

  for (const user of topUsers) {
    try {
      // Build taste profile for candidate generation
      const profile = await sql`
        SELECT utp.*, u.taste_brief AS brief
        FROM user_taste_profiles utp
        JOIN users u ON u.id = utp.user_id
        WHERE utp.user_id = ${user.id}
      `;

      if (!profile.length) continue;

      const tasteProfile = profile[0];

      // Get active edges for the profile
      const edges = tasteProfile.active_edges?.length
        ? await sql`
            SELECT edge_type, reasoning FROM taste_edges
            WHERE id = ANY(${tasteProfile.active_edges})
          `
        : [];

      tasteProfile.edges = edges;

      // Generate candidates from Spotify
      const candidates = await generateCandidates(tasteProfile);

      if (!candidates.length) {
        results.push({ userId: user.id, telegramId: user.telegram_id, action: "silence", reason: "no candidates" });
        continue;
      }

      // Run candidates through taste filter
      const find = await findForUser(user.id, candidates);

      if (!find) {
        results.push({ userId: user.id, telegramId: user.telegram_id, action: "silence", reason: "nothing cleared filter" });
        continue;
      }

      // Build the message: link + reasoning sentence
      const message = find.candidate.spotifyUrl
        ? `${find.candidate.spotifyUrl}\n${find.reasoningSentence}`
        : find.reasoningSentence;

      // Record the find
      const msgResult = await sql`
        INSERT INTO messages (user_id, role, content, is_initiation)
        VALUES (${user.id}, 'judes', ${message}, true)
        RETURNING id
      `;

      await sql`
        INSERT INTO find_records (user_id, node_id, reasoning_sentence, reasoning_edges, source_url, source_type, message_id)
        VALUES (${user.id}, ${find.nodeId}, ${find.reasoningSentence}, ${find.edgeId ? [find.edgeId] : []}, ${find.candidate.spotifyUrl}, 'spotify', ${msgResult[0].id})
      `;

      // Update taste profile
      await sql`
        UPDATE user_taste_profiles
        SET last_find_at = NOW(),
            total_finds_sent = total_finds_sent + 1,
            updated_at = NOW()
        WHERE user_id = ${user.id}
      `;

      await sql`
        UPDATE users SET last_initiation_at = NOW() WHERE id = ${user.id}
      `;

      results.push({
        userId: user.id,
        telegramId: user.telegram_id,
        action: "send",
        message,
        reasoningSentence: find.reasoningSentence,
        candidate: find.candidate.name,
      });
    } catch (err) {
      console.error(`find generation failed for user ${user.id}:`, err.message);
    }
  }

  return results;
}
```

**Step 2: Commit**

```bash
git add initiate.js
git commit -m "feat: rewrite initiation engine — sends finds via Spotify + taste filter instead of conversational messages"
```

---

### Task 7: Rewrite bot surface (reaction capture, one-reply discipline)

**Files:**
- Modify: `bot.js`
- Modify: `conversation.js`

The bot's post-onboarding behavior changes: when a user sends a message, check if it's a response to a recent find. If yes, classify it as a ReactionSignal, generate one reply in Judes' voice, then go quiet. If it's not a response to a find (user just messaging randomly), stay silent or give a minimal non-conversational response.

**Step 1: Rewrite the text handler in bot.js**

Replace the current `bot.on("message:text")` handler's post-onboarding section:

```javascript
// Replace the "Regular conversation" section in bot.js with:
import { classifyReaction } from "./reaction.js";
import { respondToReaction } from "./conversation.js";

// ... (keep the onboarding handler exactly as-is) ...

// Post-onboarding: reaction capture only
const user = await sql`
  SELECT id FROM users WHERE telegram_id = ${telegramId}
`;

if (!user.length) {
  await ctx.reply(
    "hey. three things. anything — a film, a city, a texture, a person. whatever comes first."
  );
  onboardingState.set(telegramId, { step: "waiting_for_three" });
  return;
}

// Check if this is a response to a recent find
const recentFind = await sql`
  SELECT fr.id, fr.reasoning_sentence, fr.source_url
  FROM find_records fr
  WHERE fr.user_id = ${user[0].id}
    AND fr.response_at IS NULL
    AND fr.sent_at > NOW() - INTERVAL '7 days'
  ORDER BY fr.sent_at DESC LIMIT 1
`;

if (recentFind.length) {
  // This is a reaction to a find — classify and respond once
  await ctx.replyWithChatAction("typing");

  const reaction = await classifyReaction(recentFind[0].id, user[0].id, text);

  // Extract facts from the response (existing engine, runs silently)
  extractFacts(user[0].id, text).catch(() => {});

  // Generate one reply, then go quiet
  const reply = await respondToReaction(user[0].id, text, recentFind[0], reaction);
  if (reply) {
    await sql`
      INSERT INTO messages (user_id, role, content)
      VALUES (${user[0].id}, 'judes', ${reply})
    `;
    await ctx.reply(reply);
  }
} else {
  // Not responding to a find. Save the message for fact extraction, but don't reply.
  await sql`
    INSERT INTO messages (user_id, role, content)
    VALUES (${user[0].id}, 'user', ${text})
  `;
  await sql`
    UPDATE users SET last_message_at = NOW() WHERE id = ${user[0].id}
  `;
  // Extract facts silently
  extractFacts(user[0].id, text).catch(() => {});
  // Judes is quiet. No reply.
}
```

**Step 2: Add respondToReaction to conversation.js**

Keep the existing `extractFacts` function (it's the engine). Add a new function that generates a single reply to a find reaction:

```javascript
export async function respondToReaction(userId, userMessage, find, reaction) {
  // Only respond to certain reaction types
  if (reaction.signalType === "soft_ignore" || reaction.signalType === "hard_ignore") {
    return null; // silence
  }

  const ctx = await getUserContext(userId, userMessage);
  if (!ctx) return null;

  const prompt = `you are judes. someone responded to a find you sent them. you can say one thing back — brief, in voice, still as judes — and then you go quiet.

the find you sent: ${find.source_url || ""}
your reasoning: ${find.reasoning_sentence}
their response: ${userMessage}
response type: ${reaction.signalType}

rules:
- one sentence max. two if you genuinely need it.
- lowercase. no exclamation marks.
- don't explain. don't elaborate on the find. don't send another find.
- if their response is a question ("who is this?"), you can answer it — briefly.
- if their response is deep resonance, acknowledge the specific thing they named. don't gush.
- if their response is a correction, accept it. learn. don't defend.
- if you have nothing to add, return "silence" — don't force a reply.
- you are not starting a conversation. you are closing an exchange.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 100,
    system: prompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const reply = response.content[0].text.trim();
  if (reply.toLowerCase() === "silence") return null;

  return reply;
}
```

**Step 3: Update photo/voice handlers in bot.js**

Photo and voice messages should also route through reaction capture, not conversation:

```javascript
// In bot.js photo handler — replace the handlePhoto flow:
// Instead of replying to every photo, check if it's a response to a find
// and process accordingly. If not responding to a find, extract facts silently.

// Same pattern as text: check for recent find, classify reaction if applicable,
// otherwise save and go quiet.
```

**Step 4: Commit**

```bash
git add bot.js conversation.js
git commit -m "feat: rewrite bot surface — reaction capture with one-reply discipline, silent fact extraction for non-find messages"
```

---

### Task 8: Update index.js cron and imports

**Files:**
- Modify: `index.js`

**Step 1: Update the initiation cron to use generateFinds**

```javascript
import { bot } from "./bot.js";
import { generateFinds } from "./initiate.js";
import { warmup } from "./memory/embeddings.js";
import { warmupWhisper } from "./media.js";
import { sweepBriefs } from "./brief.js";
import { sweepChapters } from "./chapters.js";
import { computeConnections } from "./taste-graph.js";
import { checkSilenceSignals } from "./reaction.js";
import cron from "node-cron";
import "dotenv/config";

warmup();
warmupWhisper();

bot.start();
console.log("judes is awake.");

// Find engine — runs every 4 hours between 9am-10pm UTC
cron.schedule("0 9,13,17,21 * * *", async () => {
  console.log("looking for things...");

  try {
    const results = await generateFinds();

    for (const result of results) {
      if (result.action === "send") {
        await bot.api.sendMessage(result.telegramId, result.message);
        console.log(`find sent to ${result.telegramId}: ${result.candidate}`);
      } else {
        console.log(`silence for ${result.telegramId}: ${result.reason}`);
      }
    }

    console.log(`find round: ${results.length} users processed`);
  } catch (err) {
    console.error("find generation failed:", err.message);
  }
});

// Silence signal sweep — every 6 hours
cron.schedule("0 */6 * * *", async () => {
  try {
    const { softIgnores, hardIgnores } = await checkSilenceSignals();
    if (softIgnores || hardIgnores) {
      console.log(`silence signals: ${softIgnores} soft, ${hardIgnores} hard`);
    }
  } catch (err) {
    console.error("silence sweep failed:", err.message);
  }
});

// Daily brief sweep — 3am UTC
cron.schedule("0 3 * * *", async () => {
  console.log("sweeping briefs...");
  try {
    await sweepBriefs();
  } catch (err) {
    console.error("brief sweep failed:", err.message);
  }
});

// Weekly chapter reflection — Sunday 4am UTC
cron.schedule("0 4 * * 0", async () => {
  console.log("reflecting on chapters...");
  try {
    await sweepChapters();
  } catch (err) {
    console.error("chapter sweep failed:", err.message);
  }
});

// Weekly taste graph computation — Sunday 5am UTC
cron.schedule("0 5 * * 0", async () => {
  console.log("computing taste graph...");
  try {
    await computeConnections();
  } catch (err) {
    console.error("taste graph computation failed:", err.message);
  }
});
```

**Step 2: Commit**

```bash
git add index.js
git commit -m "feat: update cron — find engine every 4 hours, silence signal sweep every 6 hours"
```

---

### Task 9: Update IDENTITY.md — respond to responses rule

**Files:**
- Modify: `docs/IDENTITY.md`

**Step 1: Add to the Refusal Set section**

After refusal #10, add:

```markdown
### The Exception

Judes can respond to a response. When someone replies to a find, Judes can say one thing back — brief, in voice, still as Judes. Then Judes goes quiet until the next find. This is not conversation. This is closing an exchange. The response is a taste signal, not a chat.

Rules for the response:
- One sentence. Two if genuinely needed. Never more.
- If they ask a question ("who is this?"), answer it briefly.
- If they name what connected ("the part where..."), acknowledge it without gushing.
- If they correct ("not really"), accept it. Don't defend.
- If there's nothing to add, stay silent. Don't force a reply.
```

**Step 2: Commit**

```bash
git add docs/IDENTITY.md
git commit -m "docs: add respond-to-responses rule to IDENTITY.md refusal set"
```

---

### Task 10: End-to-end smoke test

**Step 1: Set up Spotify credentials**

Register a Spotify app at https://developer.spotify.com/dashboard. Add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to `.env`.

**Step 2: Run the migration**

Run `db/migrate-taste-graph.sql` against Neon.

**Step 3: Test onboarding**

Send `/start` to the bot, then `Tirzah, Peckham, concrete`. Verify:
- Decode comes back in voice
- `taste_nodes` has 3 rows
- `taste_edges` has 3+ rows
- `user_taste_profiles` has 1 row with vector

**Step 4: Test find generation manually**

```javascript
// Temporary test script — run once to verify the pipeline
import { generateFinds } from "./initiate.js";
const results = await generateFinds();
console.log(JSON.stringify(results, null, 2));
```

Verify:
- Spotify candidates are generated
- Most are rejected by the taste filter (this is correct)
- If one clears, the reasoning sentence is specific ("the way the..." not "because you like...")
- `find_records` has a row
- The message was sent via Telegram

**Step 5: Test reaction capture**

Reply to the find in Telegram. Verify:
- `reaction_signals` has a row with the correct type
- Judes replies once, briefly
- Judes does NOT continue the conversation if you reply again
- Facts were extracted from your response

**Step 6: Commit test results to changelog**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: log session — taste graph wired, find pipeline built, reaction capture working"
```
