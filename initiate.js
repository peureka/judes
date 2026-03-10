import { sql } from "./db/index.js";
import { scoreUsers } from "./scoring.js";
import { getAllCandidates } from "./sources/index.js";
import { findForUser } from "./taste-filter.js";
import { getDomainBias } from "./staleness.js";

function getMinGapHours(responseRatio, totalFindsSent) {
  if (totalFindsSent < 3) return 48;     // new users get more space early
  if (responseRatio > 0.6) return 20;     // engaged users: current minimum
  if (responseRatio > 0.3) return 48;     // moderate: 2 days
  return 96;                               // low response: 4 days minimum
}

export async function generateFinds() {
  const allUsers = await sql`
    SELECT u.*, utp.onboarding_inputs, utp.taste_vector, utp.staleness_score,
           utp.total_finds_sent, utp.last_find_at, utp.response_ratio
    FROM users u
    JOIN user_taste_profiles utp ON utp.user_id = u.id
    WHERE u.email IS NOT NULL
  `;

  const now = Date.now();
  const eligibleUsers = allUsers.filter((u) => {
    if (!u.last_find_at) return true;
    const hoursSince = (now - new Date(u.last_find_at).getTime()) / (1000 * 60 * 60);
    const minGap = getMinGapHours(u.response_ratio || 0, u.total_finds_sent || 0);
    return hoursSince >= minGap;
  });

  if (!eligibleUsers.length) return [];

  const MIN_SCORE_THRESHOLD = 0.25;

  const ranked = await scoreUsers(eligibleUsers);
  const topUsers = ranked
    .filter((u) => u.score >= MIN_SCORE_THRESHOLD)
    .slice(0, 10);

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

      // Check domain bias for staleness-driven expansion
      const domainBias = await getDomainBias(user.id);
      const candidates = await getAllCandidates(tasteProfile, {
        avoidDomain: domainBias?.avoid || null,
      });

      if (!candidates.length) {
        results.push({ userId: user.id, email: user.email, action: "silence", reason: "no candidates" });
        continue;
      }

      const find = await findForUser(user.id, candidates);

      if (!find) {
        results.push({ userId: user.id, email: user.email, action: "silence", reason: "nothing cleared filter" });
        continue;
      }

      const sourceUrl = find.candidate.spotifyUrl || find.candidate.youtubeUrl || find.candidate.tmdbUrl || null;
      const message = sourceUrl
        ? `${sourceUrl}\n${find.reasoningSentence}`
        : find.reasoningSentence;

      const msgResult = await sql`
        INSERT INTO messages (user_id, role, content, is_initiation)
        VALUES (${user.id}, 'judes', ${message}, true)
        RETURNING id
      `;

      const findRecord = await sql`
        INSERT INTO find_records (user_id, node_id, reasoning_sentence, reasoning_edges, source_url, source_type, message_id, candidate_name)
        VALUES (${user.id}, ${find.nodeId}, ${find.reasoningSentence}, ${find.edgeId ? [find.edgeId] : []}, ${find.candidate.spotifyUrl || find.candidate.youtubeUrl || find.candidate.tmdbUrl || null}, ${find.candidate.sourceType || 'spotify'}, ${msgResult[0].id}, ${find.candidate.name})
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
        sourceUrl: find.candidate.spotifyUrl || find.candidate.youtubeUrl || find.candidate.tmdbUrl || null,
        sourceType: find.candidate.sourceType || "spotify",
      });
    } catch (err) {
      console.error(`find generation failed for user ${user.id}:`, err.message);
    }
  }

  return results;
}
