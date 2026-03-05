import { sql } from "./db/index.js";
import { embed, toVector } from "./memory/embeddings.js";

const WEIGHTS = {
  temporal: 0.25,
  silenceAfterIntensity: 0.20,
  connectionSpark: 0.20,
  timeSinceLastMessage: 0.15,
  unresolvedThread: 0.10,
  chapterMomentum: 0.10,
};

async function temporalScore(userId) {
  const rows = await sql`
    SELECT th.reference_text, th.estimated_date
    FROM temporal_hints th
    WHERE th.user_id = ${userId}
      AND th.estimated_date >= CURRENT_DATE - INTERVAL '1 day'
      AND th.estimated_date <= CURRENT_DATE + INTERVAL '3 days'
    LIMIT 3
  `;
  if (!rows.length) return { score: 0, reason: null };

  const upcoming = rows.filter((r) => new Date(r.estimated_date) >= new Date());
  const passed = rows.filter((r) => new Date(r.estimated_date) < new Date());

  const reason = upcoming.length
    ? `they mentioned "${upcoming[0].reference_text}" - it's coming up`
    : `"${passed[0].reference_text}" probably just happened`;

  return { score: 1.0, reason };
}

async function silenceAfterIntensity(userId) {
  // Check if last conversation had weight-2/3 facts and then 2+ days silence
  const lastMessage = await sql`
    SELECT created_at FROM messages
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 1
  `;
  if (!lastMessage.length) return { score: 0, reason: null };

  const daysSince = (Date.now() - new Date(lastMessage[0].created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 2) return { score: 0, reason: null };

  const recentHeavyFacts = await sql`
    SELECT COUNT(*)::int AS count FROM user_context
    WHERE user_id = ${userId}
      AND weight >= 2
      AND created_at >= NOW() - INTERVAL '7 days'
  `;

  if (recentHeavyFacts[0].count === 0) return { score: 0, reason: null };

  return {
    score: Math.min(daysSince / 5, 1.0),
    reason: "they shared something heavy recently, then went quiet",
  };
}

async function connectionSpark(userId) {
  // Re-embed a recent fact and check for high similarity to older facts
  const recentFacts = await sql`
    SELECT id, fact, created_at FROM user_context
    WHERE user_id = ${userId}
      AND embedding IS NOT NULL
      AND created_at >= NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC LIMIT 3
  `;

  if (!recentFacts.length) return { score: 0, reason: null };

  for (const recent of recentFacts) {
    const vec = await embed(recent.fact);
    const vecStr = toVector(vec);

    const similar = await sql`
      SELECT fact, 1 - (embedding <=> ${vecStr}::vector) AS similarity
      FROM user_context
      WHERE user_id = ${userId}
        AND id != ${recent.id}
        AND embedding IS NOT NULL
        AND created_at < NOW() - INTERVAL '14 days'
      ORDER BY embedding <=> ${vecStr}::vector
      LIMIT 1
    `;

    if (similar.length && similar[0].similarity > 0.8) {
      return {
        score: similar[0].similarity,
        reason: `"${recent.fact}" connects to something older: "${similar[0].fact}"`,
      };
    }
  }

  return { score: 0, reason: null };
}

function timeSinceLastMessageScore(lastMessageAt) {
  if (!lastMessageAt) return { score: 0, reason: null };

  const days = (Date.now() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60 * 24);

  // Bell curve peaking at 2-3 days, drops after 14
  let score;
  if (days < 1) score = 0.3;
  else if (days <= 3) score = 1.0;
  else if (days <= 7) score = 0.7;
  else if (days <= 14) score = 0.3;
  else score = 0.1;

  return { score, reason: `${Math.round(days)} days since last message` };
}

async function unresolvedThread(userId) {
  const lastMsg = await sql`
    SELECT role FROM messages
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 1
  `;

  if (!lastMsg.length || lastMsg[0].role !== "user") {
    return { score: 0, reason: null };
  }

  return { score: 1.0, reason: "they said something last - no follow-up yet" };
}

async function chapterMomentum(userId) {
  const active = await sql`
    SELECT c.title FROM chapters c
    WHERE c.user_id = ${userId} AND c.ended_at IS NULL
  `;
  if (!active.length) return { score: 0, reason: null };

  const recentFacts = await sql`
    SELECT COUNT(*)::int AS count FROM user_context
    WHERE user_id = ${userId}
      AND created_at >= NOW() - INTERVAL '7 days'
  `;

  if (recentFacts[0].count === 0) return { score: 0, reason: null };

  return {
    score: Math.min(recentFacts[0].count / 5, 1.0),
    reason: `active chapter: "${active[0].title}"`,
  };
}

export async function scoreUsers(eligibleUsers) {
  const scored = [];

  for (const user of eligibleUsers) {
    try {
      const [temporal, silence, spark, thread, chapter] = await Promise.all([
        temporalScore(user.id),
        silenceAfterIntensity(user.id),
        connectionSpark(user.id),
        unresolvedThread(user.id),
        chapterMomentum(user.id),
      ]);

      const timeScore = timeSinceLastMessageScore(user.last_message_at);

      const composite =
        WEIGHTS.temporal * temporal.score +
        WEIGHTS.silenceAfterIntensity * silence.score +
        WEIGHTS.connectionSpark * spark.score +
        WEIGHTS.timeSinceLastMessage * timeScore.score +
        WEIGHTS.unresolvedThread * thread.score +
        WEIGHTS.chapterMomentum * chapter.score;

      // Find the highest-scoring signal for trigger reason
      const signals = [
        { name: "temporal", ...temporal, weight: WEIGHTS.temporal },
        { name: "silence", ...silence, weight: WEIGHTS.silenceAfterIntensity },
        { name: "spark", ...spark, weight: WEIGHTS.connectionSpark },
        { name: "time", ...timeScore, weight: WEIGHTS.timeSinceLastMessage },
        { name: "thread", ...thread, weight: WEIGHTS.unresolvedThread },
        { name: "chapter", ...chapter, weight: WEIGHTS.chapterMomentum },
      ];

      const topSignal = signals
        .filter((s) => s.reason)
        .sort((a, b) => b.score * b.weight - a.score * a.weight)[0];

      scored.push({
        ...user,
        score: composite,
        triggerReason: topSignal?.reason || null,
      });
    } catch (err) {
      console.error(`scoring failed for user ${user.id}:`, err.message);
      scored.push({ ...user, score: 0, triggerReason: null });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}
