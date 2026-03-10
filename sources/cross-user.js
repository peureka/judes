import { sql } from "../db/index.js";

export async function generateCandidates(tasteProfile) {
  const userId = tasteProfile.user_id;
  if (!userId) return [];

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

  const otherIds = connections.map((c) => c.other_id);

  // Find nodes that landed well for connected users but haven't been sent to this user
  const candidates = await sql`
    SELECT DISTINCT ON (tn.id)
      tn.id AS node_id,
      tn.name,
      tn.domain,
      tn.metadata,
      tn.cross_user_count,
      fr.reasoning_sentence AS original_reasoning
    FROM find_records fr
    JOIN taste_nodes tn ON tn.id = fr.node_id
    LEFT JOIN reaction_signals rs ON rs.find_id = fr.id
    WHERE fr.user_id = ANY(${otherIds})
      AND tn.id NOT IN (SELECT node_id FROM find_records WHERE user_id = ${userId})
      AND (rs.signal_type IN ('confirmation', 'deep_resonance', 'discovery') OR rs.signal_type IS NULL)
    ORDER BY tn.id, tn.cross_user_count DESC
    LIMIT 10
  `;

  return candidates.map((c) => {
    const meta = c.metadata || {};
    return {
      id: c.node_id,
      name: c.name,
      domain: c.domain,
      spotifyUrl: meta.spotify_url || null,
      youtubeUrl: meta.youtube_url || null,
      tmdbUrl: meta.tmdb_url || null,
      popularity: 0, // already vetted by taste filter for another user
      sourceType: meta.spotify_url ? "spotify" : meta.youtube_url ? "youtube" : meta.tmdb_url ? "tmdb" : "cross_user",
      strategy: "cross_user_affinity",
      crossUserReasoning: `landed for someone with a similar thread`,
      existingNodeId: c.node_id, // flag to skip creating a new node
    };
  });
}
