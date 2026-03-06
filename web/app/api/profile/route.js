import { getSession } from "../../../lib/auth.js";
import { sql } from "../../../../db/index.js";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const userId = session.userId;

  const user = await sql`
    SELECT three_things, taste_decode, taste_thread, taste_brief
    FROM users WHERE id = ${userId}
  `;

  if (!user.length) {
    return Response.json({ error: "no user" }, { status: 404 });
  }

  const profile = await sql`
    SELECT onboarding_inputs, staleness_score, total_finds_sent, total_responses, response_ratio
    FROM user_taste_profiles WHERE user_id = ${userId}
  `;

  const firstMessage = await sql`
    SELECT content FROM messages
    WHERE user_id = ${userId} AND role = 'judes'
    ORDER BY created_at ASC LIMIT 1
  `;

  let worldItems = [];
  if (firstMessage.length) {
    const parts = firstMessage[0].content.split("\n\n");
    if (parts.length > 1) {
      worldItems = parts[1]
        .split("\n")
        .map((line) => {
          const match = line.match(/^(.+?)\s*-\s*(.+)$/);
          if (!match) return null;
          const [, domain, name] = match;
          return {
            domain: domain.trim(),
            name: name.trim(),
            searchUrl: `https://www.google.com/search?q=${encodeURIComponent(name.trim() + " " + domain.trim())}`,
          };
        })
        .filter(Boolean);
    }
  }

  return Response.json({
    threeThings: user[0].three_things,
    decode: user[0].taste_decode,
    thread: user[0].taste_thread,
    brief: user[0].taste_brief,
    world: worldItems,
    stats: profile[0]
      ? {
          findsSent: profile[0].total_finds_sent,
          responses: profile[0].total_responses,
        }
      : null,
  });
}
