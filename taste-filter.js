import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";
import { getCurrentTastePrompt } from "./taste-prompt.js";
import { getStalenessContext } from "./staleness.js";

const client = new Anthropic();

const TASTE_FILTER_PROMPT = `you are judes' taste filter. you're deciding whether to send someone a specific song, film, video, or cultural object.

you have their taste profile: their three things, their decode, their brief, and the typed edges that define their position in taste space. edges are typed:
- sensory: shared texture, grain, physical quality
- emotional: shared feeling, register, temperature
- structural: shared architecture, form, negative space
- corrective: "not X. Y." - the real reason, not the surface one

your job:
1. decide if this candidate is worth interrupting someone's life for
2. if yes, write the reasoning sentence - ONE sentence, lowercase, no exclamation marks
3. identify which edge type(s) connect this find to the person

the reasoning sentence must name the SPECIFIC thing. for music: "the bassline at 2:47" not "the production." for film: "the way the camera holds on her face for eleven seconds in the third act" not "the cinematography." for video: "the cut at 4:12 where the argument shifts register" not "the editing." if you can't name a specific element, the find isn't ready.

DEAD WORDS (never use): recommend, you might like, discover, curated, resonates, vibe, content, personalised, based on your preferences, algorithm, I found this for you, check this out, amazing, incredible, stunning, trending, viral.

INTEGRITY AUDIT - the find must pass ALL of these:
1. interruption test: would you interrupt someone reading a book for this?
2. specificity test: does the reasoning name the exact thing, not the category?
3. duplication test: have they likely already encountered this?
4. software test: could this message have come from Spotify or Netflix?
5. flatness test: any performed enthusiasm? any superlatives?

respond in one of two formats:

REJECT|reason
(e.g., REJECT|too obvious - anyone who likes Tirzah already knows this artist)

SEND|reasoning_sentence|edge_type|specific_element
(e.g., SEND|the way the piano dissolves at 1:23 - same patience as the concrete you chose.|sensory|piano dissolution at 1:23)`;

export async function filterCandidate(candidate, tasteProfile) {
  const candidateContext = candidate.sourceType === "tmdb"
    ? `name: ${candidate.name}${candidate.year ? ` (${candidate.year})` : ""}
overview: ${candidate.overview || "n/a"}
popularity: ${candidate.popularity || "unknown"}
domain: film`
    : candidate.sourceType === "youtube"
    ? `name: ${candidate.name}
creator: ${candidate.creator || "n/a"}
description: ${candidate.description || "n/a"}
view count: ${candidate.viewCount || "unknown"}
domain: video/film`
    : `name: ${candidate.name}
artist: ${candidate.artist || "n/a"}
album: ${candidate.album || "n/a"}
popularity: ${candidate.popularity || "unknown"}/100
genres: ${candidate.genres?.join(", ") || "unknown"}
domain: music`;

  const context = `## their taste profile

three things: ${tasteProfile.onboarding_inputs.join(", ")}
decode: ${tasteProfile.decode}
brief: ${tasteProfile.brief || "not yet generated"}
${tasteProfile.tastePrompt ? `\ntaste prompt:\n${tasteProfile.tastePrompt}\n` : ""}
taste edges:
${(tasteProfile.edges || []).map((e) => `- [${e.edge_type}] ${e.reasoning}`).join("\n") || "none yet"}

## the candidate

${candidateContext}
source strategy: ${candidate.strategy || "unknown"}${candidate.crossUserReasoning ? `\ncross-user signal: ${candidate.crossUserReasoning}` : ""}${tasteProfile.stalenessLines?.length ? `\n\n## expansion signal\n${tasteProfile.stalenessLines.join("\n")}` : ""}`;

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
  const profile = await sql`
    SELECT utp.*, u.taste_brief AS brief
    FROM user_taste_profiles utp
    JOIN users u ON u.id = utp.user_id
    WHERE utp.user_id = ${userId}
  `;

  if (!profile.length) return null;

  const tasteProfile = profile[0];

  const edges = tasteProfile.active_edges?.length
    ? await sql`
        SELECT edge_type, reasoning FROM taste_edges
        WHERE id = ANY(${tasteProfile.active_edges})
      `
    : [];

  tasteProfile.edges = edges;

  // Include taste prompt if available
  const tastePrompt = await getCurrentTastePrompt(userId);
  if (tastePrompt) {
    tasteProfile.tastePrompt = tastePrompt.prompt_text;
  }

  // Load staleness context for expansion signals
  const staleness = await getStalenessContext(userId, tasteProfile.staleness_score || 0);
  tasteProfile.stalenessLines = staleness.lines;

  const sentFinds = await sql`
    SELECT node_id FROM find_records WHERE user_id = ${userId}
  `;
  const sentNodeIds = new Set(sentFinds.map((f) => f.node_id));

  for (const candidate of candidates) {
    // Domain-aware popularity gate (widened when staleness is high)
    const boost = staleness.popularityBoost ? 1.5 : 1;
    const popularityLimit = candidate.sourceType === "tmdb" ? 30 * boost
      : candidate.sourceType === "youtube" ? 500000 * boost  // view count
      : 65 * boost; // spotify popularity
    const popularityValue = candidate.sourceType === "youtube"
      ? (candidate.viewCount || 0)
      : (candidate.popularity || 0);
    if (popularityValue > popularityLimit) continue;

    const result = await filterCandidate(candidate, tasteProfile);

    if (result.action === "send") {
      let nodeId;

      if (candidate.existingNodeId) {
        // Cross-user candidate — reuse existing node, increment count
        nodeId = candidate.existingNodeId;
        await sql`
          UPDATE taste_nodes SET cross_user_count = cross_user_count + 1
          WHERE id = ${nodeId}
        `;
      } else {
        // Create new node
        const nodeName = candidate.artist
          ? `${candidate.name} - ${candidate.artist}`
          : candidate.creator
          ? `${candidate.name} - ${candidate.creator}`
          : candidate.name;
        const nodeDomain = candidate.domain || "music";
        const nodeMetadata = {
          spotify_id: candidate.sourceType === "spotify" ? candidate.id : undefined,
          spotify_url: candidate.spotifyUrl || undefined,
          youtube_url: candidate.youtubeUrl || undefined,
          tmdb_id: candidate.tmdbId || undefined,
          tmdb_url: candidate.tmdbUrl || undefined,
          album: candidate.album || undefined,
          year: candidate.year || undefined,
          popularity: candidate.popularity,
          view_count: candidate.viewCount,
        };
        // Remove undefined values
        Object.keys(nodeMetadata).forEach(k => nodeMetadata[k] === undefined && delete nodeMetadata[k]);

        const node = await sql`
          INSERT INTO taste_nodes (name, domain, specificity, source, metadata)
          VALUES (${nodeName}, ${nodeDomain}, 'work', 'find', ${JSON.stringify(nodeMetadata)})
          RETURNING id
        `;
        nodeId = node[0].id;
      }

      if (sentNodeIds.has(nodeId)) continue;

      const edgeType = result.edgeType || "emotional";
      const validEdgeTypes = ["sensory", "emotional", "structural", "corrective"];
      const safeEdgeType = validEdgeTypes.includes(edgeType) ? edgeType : "emotional";

      const onboardingNodes = await sql`
        SELECT tn.id FROM taste_nodes tn
        JOIN taste_edges te ON (te.node_a = tn.id OR te.node_b = tn.id)
        WHERE tn.source = 'onboarding' AND te.user_id = ${userId}
        LIMIT 1
      `;

      let edgeId = null;
      if (onboardingNodes.length) {
        const edgeResult = await sql`
          INSERT INTO taste_edges (node_a, node_b, edge_type, reasoning, source, user_id)
          VALUES (${onboardingNodes[0].id}, ${nodeId}, ${safeEdgeType}, ${result.reasoningSentence}, 'find_reasoning', ${userId})
          RETURNING id
        `;
        edgeId = edgeResult[0].id;
      }

      return {
        candidate,
        nodeId,
        edgeId,
        reasoningSentence: result.reasoningSentence,
        edgeType: safeEdgeType,
        specificElement: result.specificElement,
      };
    }
  }

  return null;
}
