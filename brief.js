import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";
import { embedBrief } from "./taste-graph.js";

const client = new Anthropic();

export async function rebuildBrief(userId) {
  const user = (await sql`SELECT * FROM users WHERE id = ${userId}`)[0];
  if (!user) return;

  const facts = await sql`
    SELECT fact, weight, created_at FROM user_context
    WHERE user_id = ${userId}
    ORDER BY weight DESC, created_at DESC
  `;

  if (!facts.length) return;

  const factList = facts
    .map((f) => {
      const prefix = f.weight === 3 ? "[deep] " : f.weight === 2 ? "[significant] " : "";
      return prefix + f.fact;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 500,
    system: `you are judes. you wrote someone's initial brief when they first arrived. now you know much more about them. rewrite the brief to reflect everything you know now.

the brief is a dense, visual, specific paragraph - the kind of thing you could paste into a design tool. lowercase, 2-3 sentences. every phrase narrows the field. no generic descriptors.

if the original brief is still accurate given everything you now know, return it unchanged. but if you've learned things that shift or deepen the picture, the brief should evolve.`,
    messages: [
      {
        role: "user",
        content: `their three things: ${user.three_things.join(", ")}
their original decode: ${user.taste_decode}
their current brief: ${user.taste_brief}

everything you know about them:
${factList}`,
      },
    ],
  });

  const newBrief = response.content[0].text.trim();

  // Archive old brief
  await sql`
    INSERT INTO brief_history (user_id, brief, fact_count)
    VALUES (${userId}, ${user.taste_brief}, ${facts.length})
  `;

  // Update user
  await sql`
    UPDATE users
    SET taste_brief = ${newBrief},
        brief_rebuilt_at = NOW(),
        brief_fact_count = ${facts.length}
    WHERE id = ${userId}
  `;

  // Re-embed the brief for taste graph
  await embedBrief(userId).catch(() => {});

  console.log(`brief rebuilt for user ${userId} (${facts.length} facts)`);
}

export async function sweepBriefs() {
  const staleUsers = await sql`
    SELECT u.id, COUNT(uc.id)::int AS fact_count
    FROM users u
    LEFT JOIN user_context uc ON uc.user_id = u.id
    WHERE u.taste_brief IS NOT NULL
    GROUP BY u.id
    HAVING COUNT(uc.id) - COALESCE(u.brief_fact_count, 0) >= 10
  `;

  console.log(`brief sweep: ${staleUsers.length} stale briefs found`);

  for (const u of staleUsers) {
    try {
      await rebuildBrief(u.id);
    } catch (err) {
      console.error(`brief rebuild failed for user ${u.id}:`, err.message);
    }
  }
}
