import { sql } from "./db/index.js";

export async function getUpcomingFacts(userId, windowDays = 7) {
  return sql`
    SELECT uc.fact, uc.weight, th.reference_text, th.estimated_date, th.date_precision
    FROM temporal_hints th
    JOIN user_context uc ON uc.id = th.fact_id
    WHERE th.user_id = ${userId}
      AND th.estimated_date >= CURRENT_DATE
      AND th.estimated_date <= CURRENT_DATE + ${windowDays}::int * INTERVAL '1 day'
    ORDER BY th.estimated_date ASC
  `;
}

export async function getRecentlyPassedFacts(userId, windowDays = 3) {
  return sql`
    SELECT uc.fact, uc.weight, th.reference_text, th.estimated_date, th.date_precision
    FROM temporal_hints th
    JOIN user_context uc ON uc.id = th.fact_id
    WHERE th.user_id = ${userId}
      AND th.estimated_date < CURRENT_DATE
      AND th.estimated_date >= CURRENT_DATE - ${windowDays}::int * INTERVAL '1 day'
    ORDER BY th.estimated_date DESC
  `;
}

export async function storeTemporalHint(factId, userId, referenceText, estimatedDate, precision) {
  await sql`
    INSERT INTO temporal_hints (fact_id, user_id, reference_text, estimated_date, date_precision)
    VALUES (${factId}, ${userId}, ${referenceText}, ${estimatedDate}, ${precision})
  `;
}
