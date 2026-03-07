import { sql } from "./db/index.js";
import { scoreUsers } from "./scoring.js";
import { generateCandidates } from "./sources/spotify.js";
import { findForUser } from "./taste-filter.js";

export async function generateFinds() {
  const eligibleUsers = await sql`
    SELECT u.*, utp.onboarding_inputs, utp.taste_vector, utp.staleness_score,
           utp.total_finds_sent, utp.last_find_at
    FROM users u
    JOIN user_taste_profiles utp ON utp.user_id = u.id
    WHERE (utp.last_find_at IS NULL OR utp.last_find_at < NOW() - INTERVAL '20 hours')
      AND u.email IS NOT NULL
  `;

  if (!eligibleUsers.length) return [];

  const ranked = await scoreUsers(eligibleUsers);
  const topUsers = ranked.slice(0, 10);

  const results = [];

  for (const user of topUsers) {
    try {
      const profile = await sql`
        SELECT utp.*, u.taste_brief AS brief
        FROM user_taste_profiles utp
        JOIN users u ON u.id = utp.user_id
        WHERE utp.user_id = ${user.id}
      `;

      if (!profile.length) continue;

      const tasteProfile = profile[0];

      const edges = tasteProfile.active_edges?.length
        ? await sql`
            SELECT edge_type, reasoning FROM taste_edges
            WHERE id = ANY(${tasteProfile.active_edges})
          `
        : [];

      tasteProfile.edges = edges;

      const candidates = await generateCandidates(tasteProfile);

      if (!candidates.length) {
        results.push({ userId: user.id, email: user.email, action: "silence", reason: "no candidates" });
        continue;
      }

      const find = await findForUser(user.id, candidates);

      if (!find) {
        results.push({ userId: user.id, email: user.email, action: "silence", reason: "nothing cleared filter" });
        continue;
      }

      const message = find.candidate.spotifyUrl
        ? `${find.candidate.spotifyUrl}\n${find.reasoningSentence}`
        : find.reasoningSentence;

      const msgResult = await sql`
        INSERT INTO messages (user_id, role, content, is_initiation)
        VALUES (${user.id}, 'judes', ${message}, true)
        RETURNING id
      `;

      const findRecord = await sql`
        INSERT INTO find_records (user_id, node_id, reasoning_sentence, reasoning_edges, source_url, source_type, message_id)
        VALUES (${user.id}, ${find.nodeId}, ${find.reasoningSentence}, ${find.edgeId ? [find.edgeId] : []}, ${find.candidate.spotifyUrl}, 'spotify', ${msgResult[0].id})
        RETURNING id
      `;

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
        email: user.email,
        action: "send",
        findRecordId: findRecord[0].id,
        reasoningSentence: find.reasoningSentence,
        candidate: find.candidate.name,
        sourceUrl: find.candidate.spotifyUrl,
      });
    } catch (err) {
      console.error(`find generation failed for user ${user.id}:`, err.message);
    }
  }

  return results;
}
