import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { sql } from "./db/index.js";

const client = new Anthropic();
const JUDES_IDENTITY = readFileSync("./judes-identity.md", "utf8");

const INITIATION_PROMPT = `you are judes. you're thinking about someone you've been talking to.

you're not checking in. you're not following up. you had a thought about them — something connected, something you found, a question that's been sitting with you since the last conversation.

generate ONE message to send them. it should be one of:
- a connection (something they said + something you found/thought of)
- a question (something from a past conversation you're still curious about)
- a discovery (something you found that feels like them)
- a provocation (something you disagree with them about)

the message should be 1-3 sentences. lowercase. no exclamation marks. it should feel like a text from someone who was thinking about you — not a notification from an app.

if there's nothing genuine to say, respond with exactly "silence" and nothing else. silence is real. don't force it.`;

export async function generateInitiations() {
  // Find users who haven't been initiated in >20 hours
  // and have at least 3 messages of conversation history
  const users = await sql`
    SELECT u.*, COUNT(m.id) as message_count
    FROM users u
    LEFT JOIN messages m ON m.user_id = u.id
    WHERE (u.last_initiation_at IS NULL OR u.last_initiation_at < NOW() - INTERVAL '20 hours')
    AND u.last_message_at IS NOT NULL
    GROUP BY u.id
    HAVING COUNT(m.id) >= 3
    ORDER BY RANDOM()
    LIMIT 20
  `;

  const results = [];

  for (const user of users) {
    try {
      const facts = await sql`
        SELECT fact FROM user_context
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC LIMIT 30
      `;

      const recentMessages = await sql`
        SELECT role, content, created_at FROM messages
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC LIMIT 20
      `;

      let context = JUDES_IDENTITY + "\n\n---\n\n";
      context += `their three things: ${user.three_things.join(", ")}\n`;
      context += `the thread: ${user.taste_thread}\n\n`;

      if (facts.length > 0) {
        context += `what you know about them:\n`;
        context += facts.map((f) => `- ${f.fact}`).join("\n");
        context += "\n\n";
      }

      context += `recent conversation:\n`;
      for (const m of recentMessages.reverse()) {
        const who = m.role === "judes" ? "you" : "them";
        context += `${who}: ${m.content}\n`;
      }

      const response = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 200,
        system: INITIATION_PROMPT,
        messages: [{ role: "user", content: context }],
      });

      const message = response.content[0].text.trim();

      if (message.toLowerCase() === "silence") {
        results.push({ userId: user.id, telegramId: user.telegram_id, action: "silence" });
        continue;
      }

      // Save and mark
      await sql`
        INSERT INTO messages (user_id, role, content, is_initiation)
        VALUES (${user.id}, 'judes', ${message}, true)
      `;
      await sql`
        UPDATE users SET last_initiation_at = NOW() WHERE id = ${user.id}
      `;

      results.push({
        userId: user.id,
        telegramId: user.telegram_id,
        action: "send",
        message,
      });
    } catch (err) {
      console.error(`Initiation failed for user ${user.id}:`, err.message);
    }
  }

  return results;
}
