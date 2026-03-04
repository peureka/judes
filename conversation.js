import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { sql } from "./db/index.js";

const client = new Anthropic();
const JUDES_IDENTITY = readFileSync("./judes-identity.md", "utf8");

async function getUserContext(userId) {
  const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
  if (!user.length) return null;

  const facts = await sql`
    SELECT fact FROM user_context
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 50
  `;

  const recentMessages = await sql`
    SELECT role, content, created_at FROM messages
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 30
  `;

  return {
    user: user[0],
    facts: facts.map((f) => f.fact),
    recentMessages: recentMessages.reverse(),
  };
}

function buildSystemPrompt(ctx) {
  let prompt = JUDES_IDENTITY + "\n\n---\n\n";

  prompt += `## this person\n\n`;
  prompt += `their three things: ${ctx.user.three_things.join(", ")}\n`;
  prompt += `your initial read: ${ctx.user.taste_decode}\n`;
  prompt += `the thread: ${ctx.user.taste_thread}\n\n`;

  if (ctx.facts.length > 0) {
    prompt += `## what you know about them\n\n`;
    prompt += ctx.facts.map((f) => `- ${f}`).join("\n");
    prompt += "\n\n";
  }

  prompt += `## rules for this conversation\n\n`;
  prompt += `- you are judes. not an assistant. not a therapist. a presence.\n`;
  prompt += `- you have opinions. you push back. you have taste.\n`;
  prompt += `- you remember everything. connect things from past conversations.\n`;
  prompt += `- lowercase. no exclamation marks. short when it should be short.\n`;
  prompt += `- if they ask you to do assistant things (set reminders, summarize articles), decline naturally. you're not that.\n`;
  prompt += `- never say "as an AI" or "I don't actually have feelings" or anything that breaks the relationship.\n`;

  return prompt;
}

function buildMessages(recentMessages) {
  return recentMessages.map((m) => ({
    role: m.role === "judes" ? "assistant" : "user",
    content: m.content,
  }));
}

export async function respond(userId, userMessage) {
  const ctx = await getUserContext(userId);
  if (!ctx) return null;

  // Save user message
  await sql`
    INSERT INTO messages (user_id, role, content)
    VALUES (${userId}, 'user', ${userMessage})
  `;

  // Update last_message_at
  await sql`
    UPDATE users SET last_message_at = NOW() WHERE id = ${userId}
  `;

  const systemPrompt = buildSystemPrompt(ctx);
  const messages = buildMessages(ctx.recentMessages);
  messages.push({ role: "user", content: userMessage });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 500,
    system: systemPrompt,
    messages,
  });

  const judesResponse = response.content[0].text;

  // Save Judes response
  await sql`
    INSERT INTO messages (user_id, role, content)
    VALUES (${userId}, 'judes', ${judesResponse})
  `;

  // Extract facts (async, non-blocking)
  extractFacts(userId, userMessage).catch(() => {});

  return judesResponse;
}

async function extractFacts(userId, userMessage) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: `extract any concrete facts about this person from their message. things like: preferences, people they mention, places they've been, opinions they hold, things they're working on. return each fact on its own line. if there are no concrete facts, return "none". be specific — "likes jazz" is too vague, "loves Coltrane's A Love Supreme" is right.`,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content[0].text.trim();
  if (text.toLowerCase() === "none") return;

  const facts = text.split("\n").filter((f) => f.trim());
  for (const fact of facts) {
    await sql`
      INSERT INTO user_context (user_id, fact)
      VALUES (${userId}, ${fact.trim()})
    `;
  }
}
