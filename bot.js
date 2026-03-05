import { Bot } from "grammy";
import { sql } from "./db/index.js";
import { decode, extractTasteGraph } from "./decode.js";
import { respondToReaction, extractFacts } from "./conversation.js";
import { classifyReaction } from "./reaction.js";
import { handlePhoto, handleVoice } from "./media.js";
import "dotenv/config";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// State tracking for onboarding
const onboardingState = new Map();

bot.command("start", async (ctx) => {
  const telegramId = ctx.from.id;

  // Check if user already exists
  const existing = await sql`
    SELECT * FROM users WHERE telegram_id = ${telegramId}
  `;

  if (existing.length > 0) {
    await ctx.reply("hey. you're back.");
    return;
  }

  // Start onboarding
  onboardingState.set(telegramId, { step: "waiting_for_three" });
  await ctx.reply(
    "hey. three things. anything - a film, a city, a texture, a person. whatever comes first."
  );
});

bot.on("message:photo", async (ctx) => {
  const telegramId = ctx.from.id;
  if (onboardingState.has(telegramId)) return;
  // Photos are noted but Judes doesn't reply to random photos
});

bot.on("message:voice", async (ctx) => {
  const telegramId = ctx.from.id;
  if (onboardingState.has(telegramId)) return;
  // Voice messages are noted but Judes doesn't reply to random voice messages
});

bot.on("message:text", async (ctx) => {
  const telegramId = ctx.from.id;
  const text = ctx.message.text;

  // Check onboarding state
  const state = onboardingState.get(telegramId);

  if (state && state.step === "waiting_for_three") {
    // Parse three things (comma-separated or three lines)
    const things = text
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter((t) => t);

    if (things.length < 3) {
      await ctx.reply("three things. not two.");
      return;
    }

    const threeThings = things.slice(0, 3);

    // Show typing indicator
    await ctx.replyWithChatAction("typing");

    // Decode
    let { decode: decodeText, world, brief, raw } = await decode(threeThings);

    // Strip em dashes from all output
    decodeText = decodeText.replace(/—/g, "-");
    if (world) world = world.replace(/—/g, "-");
    if (brief) brief = brief.replace(/—/g, "-");

    // Extract thread (first sentence of decode)
    const thread = decodeText.split(".")[0] + ".";

    // Create user
    const user = await sql`
      INSERT INTO users (telegram_id, username, first_name, three_things, taste_decode, taste_thread, taste_brief)
      VALUES (${telegramId}, ${ctx.from.username}, ${ctx.from.first_name}, ${threeThings}, ${decodeText}, ${thread}, ${brief})
      RETURNING id
    `;

    // Build the message Judes sends - decode + world
    let replyText = decodeText;

    // Linkify world items: "Domain - Name" → "Domain - <a href='google search'>Name</a>"
    let worldHtml = "";
    if (world) {
      worldHtml = world
        .split("\n")
        .map((line) => {
          const match = line.match(/^(.+?)\s*-\s*(.+)$/);
          if (!match) return line;
          const [, domain, name] = match;
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(name.trim() + " " + domain.trim())}`;
          return `${domain} - <a href="${searchUrl}">${name.trim()}</a>`;
        })
        .join("\n");
      replyText += "\n\n" + world;
    }

    // Save full output as first Judes message (plain text for DB)
    await sql`
      INSERT INTO messages (user_id, role, content)
      VALUES (${user[0].id}, 'judes', ${replyText})
    `;

    // Extract taste graph (async, non-blocking)
    extractTasteGraph(threeThings, decodeText, user[0].id).catch((err) => {
      console.error("taste graph extraction failed:", err.message);
    });

    onboardingState.delete(telegramId);
    // Send with HTML parse mode for clickable links
    const htmlReply = worldHtml ? decodeText + "\n\n" + worldHtml : decodeText;
    await ctx.reply(htmlReply, { parse_mode: "HTML" });
    return;
  }

  // Post-onboarding: reaction capture only
  const user = await sql`
    SELECT id FROM users WHERE telegram_id = ${telegramId}
  `;

  if (!user.length) {
    await ctx.reply(
      "hey. three things. anything - a film, a city, a texture, a person. whatever comes first."
    );
    onboardingState.set(telegramId, { step: "waiting_for_three" });
    return;
  }

  // Check if this is a response to a recent find
  const recentFind = await sql`
    SELECT fr.id, fr.reasoning_sentence, fr.source_url
    FROM find_records fr
    WHERE fr.user_id = ${user[0].id}
      AND fr.response_at IS NULL
      AND fr.sent_at > NOW() - INTERVAL '7 days'
    ORDER BY fr.sent_at DESC LIMIT 1
  `;

  if (recentFind.length) {
    await ctx.replyWithChatAction("typing");

    const reaction = await classifyReaction(recentFind[0].id, user[0].id, text);

    // Extract facts silently (existing engine)
    extractFacts(user[0].id, text).catch(() => {});

    // Generate one reply, then go quiet
    const reply = await respondToReaction(user[0].id, text, recentFind[0], reaction);
    if (reply) {
      await sql`
        INSERT INTO messages (user_id, role, content)
        VALUES (${user[0].id}, 'judes', ${reply})
      `;
      await ctx.reply(reply);
    }
  } else {
    // Not responding to a find. Save message, extract facts, stay quiet.
    await sql`
      INSERT INTO messages (user_id, role, content)
      VALUES (${user[0].id}, 'user', ${text})
    `;
    await sql`
      UPDATE users SET last_message_at = NOW() WHERE id = ${user[0].id}
    `;
    extractFacts(user[0].id, text).catch(() => {});
  }
});

// Error handling
bot.catch((err) => {
  console.error("Bot error:", err);
});

export { bot };
