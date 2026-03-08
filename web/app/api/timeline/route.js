import { getSession } from "../../../lib/auth.js";
import { sql } from "../../../../db/index.js";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const userId = session.userId;

  const finds = await sql`
    SELECT
      fr.id,
      fr.reasoning_sentence,
      fr.source_url,
      fr.source_type,
      fr.candidate_name,
      fr.judes_reply,
      fr.sent_at,
      fr.response_at,
      rs.signal_type,
      rs.raw_text AS response_text
    FROM find_records fr
    LEFT JOIN reaction_signals rs ON rs.find_id = fr.id
    WHERE fr.user_id = ${userId}
    ORDER BY fr.sent_at ASC
  `;

  const unanswered = await sql`
    SELECT fr.id, fr.reasoning_sentence, fr.source_url
    FROM find_records fr
    WHERE fr.user_id = ${userId}
      AND fr.response_at IS NULL
      AND fr.sent_at > NOW() - INTERVAL '7 days'
    ORDER BY fr.sent_at DESC LIMIT 1
  `;

  const user = await sql`
    SELECT three_things, taste_decode FROM users WHERE id = ${userId}
  `;

  const tastePrompts = await sql`
    SELECT prompt_text, version, created_at
    FROM taste_prompts
    WHERE user_id = ${userId}
    ORDER BY version DESC
  `;

  return Response.json({
    finds,
    unansweredFind: unanswered[0] || null,
    threeThings: user[0]?.three_things || [],
    decode: user[0]?.taste_decode || "",
    tastePrompt: tastePrompts[0] || null,
    tastePromptHistory: tastePrompts.slice(1),
  });
}
