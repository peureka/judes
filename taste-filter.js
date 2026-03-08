import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";
import { getCurrentTastePrompt } from "./taste-prompt.js";

const client = new Anthropic();

const TASTE_FILTER_PROMPT = `you are judes' taste filter. you're deciding whether to send someone a specific song/album/artist.

you have their taste profile: their three things, their decode, their brief, and the typed edges that define their position in taste space. edges are typed:
- sensory: shared texture, grain, physical quality
- emotional: shared feeling, register, temperature
- structural: shared architecture, form, negative space
- corrective: "not X. Y." - the real reason, not the surface one

your job:
1. decide if this candidate is worth interrupting someone's life for
2. if yes, write the reasoning sentence - ONE sentence, lowercase, no exclamation marks
3. identify which edge type(s) connect this find to the person

the reasoning sentence must name the SPECIFIC thing - "the bassline at 2:47" not "the production." "the way she drops the melody in the bridge" not "her vocal style." if you can't name a specific element, the find isn't ready.

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
  const context = `## their taste profile

three things: ${tasteProfile.onboarding_inputs.join(", ")}
decode: ${tasteProfile.decode}
brief: ${tasteProfile.brief || "not yet generated"}
${tasteProfile.tastePrompt ? `\ntaste prompt:\n${tasteProfile.tastePrompt}\n` : ""}
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

  const sentFinds = await sql`
    SELECT node_id FROM find_records WHERE user_id = ${userId}
  `;
  const sentNodeIds = new Set(sentFinds.map((f) => f.node_id));

  for (const candidate of candidates) {
    if (candidate.popularity > 65) continue;

    const result = await filterCandidate(candidate, tasteProfile);

    if (result.action === "send") {
      const node = await sql`
        INSERT INTO taste_nodes (name, domain, specificity, source, metadata)
        VALUES (
          ${candidate.artist ? `${candidate.name} - ${candidate.artist}` : candidate.name},
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

      if (sentNodeIds.has(node[0].id)) continue;

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

  return null;
}
