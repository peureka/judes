import { Bot } from "grammy";
import { sql } from "./db/index.js";
import { decode } from "./decode.js";
import { respond } from "./conversation.js";
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
    "hey. three things. anything — a film, a city, a texture, a person. whatever comes first."
  );
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
    const decodeResult = await decode(threeThings);

    // Extract thread (first sentence of decode)
    const thread = decodeResult.split(".")[0] + ".";

    // Create user
    const user = await sql`
      INSERT INTO users (telegram_id, username, first_name, three_things, taste_decode, taste_thread)
      VALUES (${telegramId}, ${ctx.from.username}, ${ctx.from.first_name}, ${threeThings}, ${decodeResult}, ${thread})
      RETURNING id
    `;

    // Save decode as first Judes message
    await sql`
      INSERT INTO messages (user_id, role, content)
      VALUES (${user[0].id}, 'judes', ${decodeResult})
    `;

    onboardingState.delete(telegramId);
    await ctx.reply(decodeResult);
    return;
  }

  // Regular conversation
  const user = await sql`
    SELECT id FROM users WHERE telegram_id = ${telegramId}
  `;

  if (!user.length) {
    await ctx.reply(
      "hey. three things. anything — a film, a city, a texture, a person. whatever comes first."
    );
    onboardingState.set(telegramId, { step: "waiting_for_three" });
    return;
  }

  await ctx.replyWithChatAction("typing");
  const response = await respond(user[0].id, text);

  if (response) {
    await ctx.reply(response);
  }
});

// Error handling
bot.catch((err) => {
  console.error("Bot error:", err);
});

export { bot };
