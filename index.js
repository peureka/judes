import { bot } from "./bot.js";
import { generateInitiations } from "./initiate.js";
import cron from "node-cron";
import "dotenv/config";

// Start the bot
bot.start();
console.log("judes is awake.");

// Initiation cron — runs every 2 hours between 9am-10pm UTC
cron.schedule("0 9-22/2 * * *", async () => {
  console.log("thinking about people...");

  try {
    const results = await generateInitiations();

    for (const result of results) {
      if (result.action === "send") {
        await bot.api.sendMessage(result.telegramId, result.message);
        console.log(`sent to ${result.telegramId}: ${result.message.slice(0, 50)}...`);
      } else {
        console.log(`silence for ${result.telegramId}`);
      }
    }

    console.log(`initiation round: ${results.length} users processed`);
  } catch (err) {
    console.error("initiation failed:", err.message);
  }
});
