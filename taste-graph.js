import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";
import { embed, toVector } from "./memory/embeddings.js";

const client = new Anthropic();

export async function embedBrief(userId) {
  const user = (await sql`SELECT taste_brief FROM users WHERE id = ${userId}`)[0];
  if (!user?.taste_brief) return;

  const vec = await embed(user.taste_brief);
  await sql`
    UPDATE users SET brief_embedding = ${toVector(vec)}::vector
    WHERE id = ${userId}
  `;
}

export async function computeConnections() {
  const users = await sql`
    SELECT id, taste_brief FROM users
    WHERE brief_embedding IS NOT NULL
  `;

  console.log(`taste graph: computing connections for ${users.length} users`);
  let newConnections = 0;

  for (const user of users) {
    // Re-embed the brief to get a usable vector for comparison
    const vec = await embed(user.taste_brief);
    const vecStr = toVector(vec);

    // Find nearest neighbors via pgvector
    const neighbors = await sql`
      SELECT id, taste_brief,
        1 - (brief_embedding <=> ${vecStr}::vector) AS similarity
      FROM users
      WHERE id != ${user.id}
        AND brief_embedding IS NOT NULL
      ORDER BY brief_embedding <=> ${vecStr}::vector
      LIMIT 10
    `;

    for (const neighbor of neighbors) {
      if (neighbor.similarity < 0.75) continue;

      const [userA, userB] = [Math.min(user.id, neighbor.id), Math.max(user.id, neighbor.id)];

      // Upsert connection
      const existing = await sql`
        SELECT id, similarity FROM taste_connections
        WHERE user_a = ${userA} AND user_b = ${userB}
      `;

      if (existing.length) {
        await sql`
          UPDATE taste_connections SET similarity = ${neighbor.similarity}
          WHERE id = ${existing[0].id}
        `;
        continue;
      }

      // Generate pattern for high-similarity pairs
      let pattern = null;
      if (neighbor.similarity > 0.85) {
        pattern = await generatePattern(user.taste_brief, neighbor.taste_brief);
      }

      await sql`
        INSERT INTO taste_connections (user_a, user_b, similarity, pattern)
        VALUES (${userA}, ${userB}, ${neighbor.similarity}, ${pattern})
        ON CONFLICT (user_a, user_b) DO UPDATE SET similarity = ${neighbor.similarity}, pattern = COALESCE(${pattern}, taste_connections.pattern)
      `;
      newConnections++;
    }
  }

  console.log(`taste graph: ${newConnections} new connections`);
}

async function generatePattern(briefA, briefB) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `two people you know separately. neither knows the other exists.
person A's brief: ${briefA}
person B's brief: ${briefB}
what's the overlap? not surface-level ("both like music") but the specific thread. one sentence, lowercase. if the overlap is too generic, return "thin".`,
      },
    ],
  });

  const text = response.content[0].text.trim();
  return text.toLowerCase() === "thin" ? null : text;
}

export async function getUnsurfacedConnection(userId) {
  const conn = await sql`
    SELECT tc.*,
      CASE WHEN tc.user_a = ${userId} THEN tc.user_b ELSE tc.user_a END AS other_user_id
    FROM taste_connections tc
    WHERE (tc.user_a = ${userId} OR tc.user_b = ${userId})
      AND tc.pattern IS NOT NULL
      AND tc.surfaced_at IS NULL
      AND tc.similarity > 0.85
    ORDER BY tc.similarity DESC
    LIMIT 1
  `;

  if (!conn.length) return null;

  // Check monthly limit — max 1 taste connection surfaced per user per month
  const recentSurface = await sql`
    SELECT COUNT(*)::int AS count FROM taste_connections
    WHERE (user_a = ${userId} OR user_b = ${userId})
      AND surfaced_at >= NOW() - INTERVAL '30 days'
  `;

  if (recentSurface[0].count > 0) return null;

  return conn[0];
}

export async function markConnectionSurfaced(connectionId) {
  await sql`
    UPDATE taste_connections SET surfaced_at = NOW()
    WHERE id = ${connectionId}
  `;
}
