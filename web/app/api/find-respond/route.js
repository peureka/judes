import { sql } from "../../../../db/index.js";
import { classifyReaction } from "../../../../reaction.js";
import { respondToReaction, extractFacts } from "../../../../conversation.js";
import { createHmac } from "crypto";

const SECRET = process.env.JWT_SECRET || "judes-find-response-secret";

export function signFindToken(findId) {
  return createHmac("sha256", SECRET).update(String(findId)).digest("hex").slice(0, 16);
}

export function verifyFindToken(findId, token) {
  const expected = signFindToken(findId);
  return token === expected;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const findId = searchParams.get("f");
  const token = searchParams.get("t");
  const response = searchParams.get("r"); // "fits" or "not"

  if (!findId || !token || !response) {
    return Response.redirect(new URL("/", request.url));
  }

  if (!verifyFindToken(findId, token)) {
    return Response.redirect(new URL("/", request.url));
  }

  const text = response === "fits" ? "this fits" : "not this thread";

  // Find the user for this find
  const find = await sql`
    SELECT user_id, reasoning_sentence, source_url FROM find_records WHERE id = ${findId}
  `;
  if (!find.length) {
    return Response.redirect(new URL("/", request.url));
  }

  const userId = find[0].user_id;

  // Check if already responded
  const existing = await sql`
    SELECT id FROM reaction_signals WHERE find_id = ${findId}
  `;
  if (existing.length) {
    return Response.redirect(new URL("/noted", request.url));
  }

  // Save as message
  await sql`
    INSERT INTO messages (user_id, role, content)
    VALUES (${userId}, 'user', ${text})
  `;

  // Classify and process reaction
  const reaction = await classifyReaction(findId, userId, text);
  extractFacts(userId, text).catch(() => {});

  const reply = await respondToReaction(userId, text, find[0], reaction);

  if (reply) {
    await Promise.all([
      sql`INSERT INTO messages (user_id, role, content) VALUES (${userId}, 'judes', ${reply})`,
      sql`UPDATE find_records SET judes_reply = ${reply} WHERE id = ${findId}`,
    ]);
  }

  return Response.redirect(new URL("/noted", request.url));
}
