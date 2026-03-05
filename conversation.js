import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { sql } from "./db/index.js";
import { recall, recallFallback } from "./memory/recall.js";
import { embed, toVector } from "./memory/embeddings.js";
import { getUpcomingFacts, getRecentlyPassedFacts, storeTemporalHint } from "./temporal.js";
import { getActiveChapters } from "./chapters.js";

const client = new Anthropic();
const JUDES_IDENTITY = readFileSync("./judes-identity.md", "utf8");

async function getUserContext(userId, lastUserMessage) {
  const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
  if (!user.length) return null;

  // Semantic recall + fallback + temporal + chapters in parallel
  const [recalled, fallback, upcoming, recentlyPassed, chapters] = await Promise.all([
    lastUserMessage
      ? recall(userId, lastUserMessage, 15).catch(() => [])
      : Promise.resolve([]),
    recallFallback(userId, 10),
    getUpcomingFacts(userId, 7).catch(() => []),
    getRecentlyPassedFacts(userId, 3).catch(() => []),
    getActiveChapters(userId, 3).catch(() => []),
  ]);

  // Merge and dedupe by fact id
  const seen = new Set();
  const allFacts = [];
  for (const r of [...recalled, ...fallback]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      allFacts.push(r);
    }
  }

  const recentMessages = await sql`
    SELECT role, content, created_at FROM messages
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 30
  `;

  return {
    user: user[0],
    facts: allFacts.map((f) => {
      const prefix = f.weight === 3 ? "[deep] " : f.weight === 2 ? "[significant] " : "";
      return prefix + f.fact;
    }),
    upcoming,
    recentlyPassed,
    chapters,
    recentMessages: recentMessages.reverse(),
  };
}

function buildSystemPrompt(ctx) {
  let prompt = JUDES_IDENTITY + "\n\n---\n\n";

  prompt += `## this person\n\n`;
  prompt += `their three things: ${ctx.user.three_things.join(", ")}\n`;
  prompt += `your initial read: ${ctx.user.taste_decode}\n`;
  prompt += `the thread: ${ctx.user.taste_thread}\n`;
  if (ctx.user.taste_brief) {
    prompt += `their brief: ${ctx.user.taste_brief}\n`;
  }
  prompt += "\n";

  if (ctx.facts.length > 0) {
    prompt += `## what you know about them\n\n`;
    prompt += ctx.facts.map((f) => `- ${f}`).join("\n");
    prompt += "\n\n";
  }

  // Temporal awareness
  if (ctx.upcoming?.length || ctx.recentlyPassed?.length) {
    prompt += `## what's happening in their life right now\n\n`;
    if (ctx.upcoming?.length) {
      prompt += `coming up:\n`;
      for (const f of ctx.upcoming) {
        const date = new Date(f.estimated_date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
        prompt += `- ${f.fact} (${date})\n`;
      }
    }
    if (ctx.recentlyPassed?.length) {
      prompt += `just happened:\n`;
      for (const f of ctx.recentlyPassed) {
        const date = new Date(f.estimated_date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
        prompt += `- ${f.fact} (${date})\n`;
      }
    }
    prompt += "\n";
  }

  // Life chapters
  if (ctx.chapters?.length) {
    prompt += `## where they are right now\n\n`;
    for (const ch of ctx.chapters) {
      prompt += `- "${ch.title}" — ${ch.summary}\n`;
    }
    prompt += "\n";
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

export async function respond(userId, userMessage, mediaContext = null) {
  const ctx = await getUserContext(userId, userMessage);
  if (!ctx) return null;

  // Save user message with optional media metadata
  if (mediaContext) {
    await sql`
      INSERT INTO messages (user_id, role, content, media_type, media_description, media_file_id)
      VALUES (${userId}, 'user', ${userMessage}, ${mediaContext.mediaType}, ${mediaContext.mediaDescription}, ${mediaContext.mediaFileId})
    `;
  } else {
    await sql`
      INSERT INTO messages (user_id, role, content)
      VALUES (${userId}, 'user', ${userMessage})
    `;
  }

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

export async function extractFacts(userId, userMessage) {
  const today = new Date().toISOString().slice(0, 10);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: `extract any concrete facts about this person from their message. things like: preferences, people they mention, places they've been, opinions they hold, things they're working on.

return each fact on its own line in one of two formats:

for regular facts: weight|fact
for facts with time references: T|weight|fact_text|date_reference|estimated_YYYY-MM-DD|precision

weight is 1-3:
- 1 = routine (likes oat milk, works from home)
- 2 = significant (started a new job, moved cities, going through a breakup)
- 3 = formative (parent died, core identity belief, life-defining experience)

precision is one of: day, week, month, season

today's date is ${today}.

examples:
1|prefers oat milk in coffee
2|just started a new job at a design studio
T|2|has a job interview|job interview on friday|${nextFriday(today)}|day
T|1|going to barcelona|trip to barcelona in march|2026-03-15|month

if there are no concrete facts, return "none". be specific — "likes jazz" is too vague, "loves Coltrane's A Love Supreme" is right.`,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content[0].text.trim();
  if (text.toLowerCase() === "none") return;

  const lines = text.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    // Try temporal format first: T|weight|fact|date_ref|estimated_date|precision
    const temporalMatch = line.match(/^T\|([1-3])\|(.+?)\|(.+?)\|(\d{4}-\d{2}-\d{2})\|(\w+)/);
    if (temporalMatch) {
      const [, weightStr, fact, dateRef, estimatedDate, precision] = temporalMatch;
      const weight = parseInt(weightStr);
      const vec = await embed(fact);
      const result = await sql`
        INSERT INTO user_context (user_id, fact, weight, embedding)
        VALUES (${userId}, ${fact}, ${weight}, ${toVector(vec)}::vector)
        RETURNING id
      `;
      await storeTemporalHint(result[0].id, userId, dateRef, estimatedDate, precision);
      continue;
    }

    // Regular format: weight|fact
    const match = line.match(/^([1-3])\|(.+)/);
    const weight = match ? parseInt(match[1]) : 1;
    const fact = match ? match[2].trim() : line.trim();
    if (!fact) continue;

    const vec = await embed(fact);
    await sql`
      INSERT INTO user_context (user_id, fact, weight, embedding)
      VALUES (${userId}, ${fact}, ${weight}, ${toVector(vec)}::vector)
    `;
  }
}

// Helper: compute next Friday from a date string for the prompt example
function nextFriday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = (5 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function respondToReaction(userId, userMessage, find, reaction) {
  if (reaction.signalType === "soft_ignore" || reaction.signalType === "hard_ignore") {
    return null;
  }

  const ctx = await getUserContext(userId, userMessage);
  if (!ctx) return null;

  const prompt = `you are judes. someone responded to a find you sent them. you can say one thing back — brief, in voice, still as judes — and then you go quiet.

the find you sent: ${find.source_url || ""}
your reasoning: ${find.reasoning_sentence}
their response: ${userMessage}
response type: ${reaction.signalType}

rules:
- one sentence max. two if you genuinely need it.
- lowercase. no exclamation marks.
- don't explain. don't elaborate on the find. don't send another find.
- if their response is a question ("who is this?"), you can answer it — briefly.
- if their response is deep resonance, acknowledge the specific thing they named. don't gush.
- if their response is a correction, accept it. learn. don't defend.
- if you have nothing to add, return "silence" — don't force a reply.
- you are not starting a conversation. you are closing an exchange.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 100,
    system: prompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const reply = response.content[0].text.trim();
  if (reply.toLowerCase() === "silence") return null;

  return reply;
}
