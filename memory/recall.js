import { sql } from "../db/index.js";
import { embed, toVector } from "./embeddings.js";

const HALF_LIFE_DAYS = 60;
const DECAY = Math.LN2 / HALF_LIFE_DAYS;

function recencyScore(createdAt) {
  const daysAgo = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-DECAY * daysAgo);
}

function compositeScore(similarity, createdAt, weight) {
  return (
    0.4 * similarity +
    0.3 * recencyScore(createdAt) +
    0.3 * ((weight || 1) / 3)
  );
}

export async function recall(userId, queryText, limit = 15) {
  const queryEmbedding = await embed(queryText);
  const vectorStr = toVector(queryEmbedding);
  const overFetch = limit * 3;

  const rows = await sql`
    SELECT id, fact, weight, created_at,
      1 - (embedding <=> ${vectorStr}::vector) AS similarity
    FROM user_context
    WHERE user_id = ${userId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${overFetch}
  `;

  return rows
    .map((r) => ({
      ...r,
      score: compositeScore(r.similarity, r.created_at, r.weight),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function recallFallback(userId, limit = 10) {
  return sql`
    SELECT id, fact, weight, created_at
    FROM user_context
    WHERE user_id = ${userId} AND embedding IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}
