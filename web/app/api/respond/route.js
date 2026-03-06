import { getSession } from "../../../lib/auth.js";
import { sql } from "../../../../db/index.js";
import { classifyReaction } from "../../../../reaction.js";
import { respondToReaction, extractFacts } from "../../../../conversation.js";

export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { findId, text } = await request.json();
  if (!findId || !text?.trim()) {
    return Response.json({ error: "nothing to say." }, { status: 400 });
  }

  const userId = session.userId;

  await sql`
    INSERT INTO messages (user_id, role, content)
    VALUES (${userId}, 'user', ${text})
  `;

  const reaction = await classifyReaction(findId, userId, text);
  extractFacts(userId, text).catch(() => {});

  const find = await sql`
    SELECT reasoning_sentence, source_url FROM find_records WHERE id = ${findId}
  `;

  const reply = await respondToReaction(userId, text, find[0], reaction);

  if (reply) {
    await sql`
      INSERT INTO messages (user_id, role, content)
      VALUES (${userId}, 'judes', ${reply})
    `;
  }

  return Response.json({ reply: reply || null });
}
