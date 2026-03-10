import { sql } from "./db/index.js";

/**
 * Check domain distribution of recent finds for a user.
 * Returns the dominant domain to avoid if 80%+ of recent finds are one domain.
 */
export async function getDomainBias(userId) {
  const recentDomains = await sql`
    SELECT tn.domain, COUNT(*)::int AS count
    FROM find_records fr
    JOIN taste_nodes tn ON tn.id = fr.node_id
    WHERE fr.user_id = ${userId}
      AND fr.sent_at >= NOW() - INTERVAL '30 days'
    GROUP BY tn.domain
    ORDER BY count DESC
  `;

  const total = recentDomains.reduce((sum, d) => sum + d.count, 0);
  if (!total || total < 3) return null;

  const dominant = recentDomains[0];
  if (dominant.count / total >= 0.8) {
    return {
      avoid: dominant.domain,
      reason: `${dominant.count}/${total} recent finds are ${dominant.domain}`,
    };
  }
  return null;
}

/**
 * Check edge type distribution of recent finds for a user.
 * Returns edge types to prefer if distribution is heavily skewed.
 */
export async function getEdgeTypeBias(userId) {
  const recentEdgeTypes = await sql`
    SELECT te.edge_type, COUNT(*)::int AS count
    FROM find_records fr
    JOIN taste_edges te ON te.id = ANY(fr.reasoning_edges)
    WHERE fr.user_id = ${userId}
      AND fr.sent_at >= NOW() - INTERVAL '30 days'
    GROUP BY te.edge_type
    ORDER BY count DESC
  `;

  const total = recentEdgeTypes.reduce((sum, e) => sum + e.count, 0);
  if (!total || total < 3) return null;

  const allTypes = ["sensory", "emotional", "structural", "corrective"];
  const usedTypes = new Set(recentEdgeTypes.map((e) => e.edge_type));
  const unusedTypes = allTypes.filter((t) => !usedTypes.has(t));

  const dominant = recentEdgeTypes[0];
  if (dominant.count / total >= 0.7) {
    const preferred = unusedTypes.length > 0
      ? unusedTypes
      : allTypes.filter((t) => t !== dominant.edge_type);
    return {
      dominant: dominant.edge_type,
      prefer: preferred,
      reason: `${dominant.count}/${total} recent edges are ${dominant.edge_type}`,
    };
  }
  return null;
}

/**
 * Build staleness context for the taste filter prompt.
 * Returns additional context lines to inject based on staleness score and biases.
 */
export async function getStalenessContext(userId, stalenessScore) {
  const lines = [];

  if (stalenessScore > 0.3) {
    lines.push("this user's recent finds haven't landed. push further from the centre. surprise over safety.");
  }

  const domainBias = await getDomainBias(userId);
  if (domainBias) {
    lines.push(`domain bias: ${domainBias.reason}. prefer finds outside ${domainBias.avoid}.`);
  }

  const edgeTypeBias = await getEdgeTypeBias(userId);
  if (edgeTypeBias) {
    lines.push(`edge type bias: ${edgeTypeBias.reason}. prefer ${edgeTypeBias.prefer.join(" or ")} connections.`);
  }

  return {
    lines,
    domainBias,
    edgeTypeBias,
    shouldExpand: stalenessScore > 0.3,
    popularityBoost: stalenessScore > 0.3, // raise popularity ceiling
    shouldTriggerCrossUser: stalenessScore > 0.6,
  };
}
