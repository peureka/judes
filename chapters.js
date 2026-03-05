import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";

const client = new Anthropic();

export async function reflect(userId) {
  const activeChapters = await sql`
    SELECT id, title, summary, themes, started_at
    FROM chapters
    WHERE user_id = ${userId} AND ended_at IS NULL
    ORDER BY created_at DESC
  `;

  const recentFacts = await sql`
    SELECT fact, weight, created_at FROM user_context
    WHERE user_id = ${userId}
      AND created_at >= NOW() - INTERVAL '30 days'
    ORDER BY weight DESC, created_at DESC
  `;

  if (!recentFacts.length) return;

  const chaptersStr = activeChapters.length
    ? activeChapters
        .map((c) => `[${c.id}] "${c.title}" - ${c.summary} (themes: ${(c.themes || []).join(", ")})`)
        .join("\n")
    : "none yet.";

  const factsStr = recentFacts
    .map((f) => {
      const prefix = f.weight === 3 ? "[deep] " : f.weight === 2 ? "[significant] " : "";
      const date = new Date(f.created_at).toISOString().slice(0, 10);
      return `${date}: ${prefix}${f.fact}`;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 500,
    system: `you are judes. you've been talking to this person for a while. look at what you know about them - especially recent things. are there patterns? shifts? something starting or ending?

a "chapter" is a stretch of someone's life with a coherent thread. not a mood, not a day - something bigger. "figuring out what to do after quitting" or "falling back in love with making things" or "the part where nothing is certain."

identify: NEW chapters starting, active chapters that seem to have ended, updated summaries for ongoing chapters. format each as:
NEW|title|summary|themes (comma-separated)
CLOSE|chapter_id|closing_summary
UPDATE|chapter_id|updated_summary

if nothing has changed enough, return "steady". titles should be lowercase, evocative, short.`,
    messages: [
      {
        role: "user",
        content: `active chapters:\n${chaptersStr}\n\nrecent facts (last 30 days):\n${factsStr}`,
      },
    ],
  });

  const text = response.content[0].text.trim();
  if (text.toLowerCase() === "steady") return;

  const lines = text.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    const action = parts[0]?.toUpperCase();

    if (action === "NEW" && parts.length >= 4) {
      const [, title, summary, themesStr] = parts;
      const themes = themesStr.split(",").map((t) => t.trim()).filter(Boolean);
      await sql`
        INSERT INTO chapters (user_id, title, summary, themes, started_at)
        VALUES (${userId}, ${title}, ${summary}, ${themes}, NOW())
      `;
      console.log(`chapter opened for user ${userId}: "${title}"`);
    } else if (action === "CLOSE" && parts.length >= 3) {
      const chapterId = parseInt(parts[1]);
      const closingSummary = parts[2];
      if (!isNaN(chapterId)) {
        await sql`
          UPDATE chapters SET ended_at = NOW(), summary = ${closingSummary}
          WHERE id = ${chapterId} AND user_id = ${userId}
        `;
        console.log(`chapter closed for user ${userId}: #${chapterId}`);
      }
    } else if (action === "UPDATE" && parts.length >= 3) {
      const chapterId = parseInt(parts[1]);
      const updatedSummary = parts[2];
      if (!isNaN(chapterId)) {
        await sql`
          UPDATE chapters SET summary = ${updatedSummary}
          WHERE id = ${chapterId} AND user_id = ${userId}
        `;
      }
    }
  }
}

export async function sweepChapters() {
  const eligibleUsers = await sql`
    SELECT DISTINCT user_id AS id FROM user_context
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY user_id
    HAVING COUNT(*) >= 5
  `;

  console.log(`chapter sweep: ${eligibleUsers.length} users eligible`);

  for (const u of eligibleUsers) {
    try {
      await reflect(u.id);
    } catch (err) {
      console.error(`chapter reflection failed for user ${u.id}:`, err.message);
    }
  }
}

export async function getActiveChapters(userId, limit = 3) {
  return sql`
    SELECT title, summary, themes, started_at FROM chapters
    WHERE user_id = ${userId} AND ended_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}
