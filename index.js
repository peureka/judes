import { generateFinds } from "./initiate.js";
import { sendFind } from "./email.js";
import { warmup } from "./memory/embeddings.js";
import { sweepBriefs } from "./brief.js";
import { sweepChapters } from "./chapters.js";
import { computeConnections } from "./taste-graph.js";
import { checkSilenceSignals } from "./reaction.js";
import cron from "node-cron";
import "dotenv/config";

// Warm up embedding model (non-blocking)
warmup();

console.log("judes cron process is awake.");

// Find engine — runs every 4 hours between 9am-10pm UTC
cron.schedule("0 9,13,17,21 * * *", async () => {
  console.log("looking for finds...");

  try {
    const results = await generateFinds();

    for (const result of results) {
      if (result.action === "send") {
        await sendFind(result.email, {
          findRecordId: result.findRecordId,
          reasoningSentence: result.reasoningSentence,
          sourceUrl: result.sourceUrl,
          candidateName: result.candidate,
          sourceType: result.sourceType,
        });
        console.log(`find sent to ${result.email}: ${result.candidate}`);
      }
    }

    const sent = results.filter((r) => r.action === "send").length;
    const silent = results.filter((r) => r.action === "silence").length;
    console.log(`find round: ${sent} sent, ${silent} silent`);
    if (sent === 0) {
      console.log(`[cron] ${new Date().toISOString()} - full silence. nothing cleared.`);
    }
  } catch (err) {
    console.error("find generation failed:", err.message);
  }
});

// Silence signal sweep — runs daily at 2am UTC
cron.schedule("0 2 * * *", async () => {
  try {
    const { softIgnores, hardIgnores } = await checkSilenceSignals();
    if (softIgnores || hardIgnores) {
      console.log(`silence sweep: ${softIgnores} soft, ${hardIgnores} hard`);
    }
  } catch (err) {
    console.error("silence sweep failed:", err.message);
  }
});

// Daily brief sweep — 3am UTC
cron.schedule("0 3 * * *", async () => {
  console.log("sweeping briefs...");
  try {
    await sweepBriefs();
  } catch (err) {
    console.error("brief sweep failed:", err.message);
  }
});

// Weekly chapter reflection — Sunday 4am UTC
cron.schedule("0 4 * * 0", async () => {
  console.log("reflecting on chapters...");
  try {
    await sweepChapters();
  } catch (err) {
    console.error("chapter sweep failed:", err.message);
  }
});

// Daily taste graph computation — 2:30am UTC
cron.schedule("30 2 * * *", async () => {
  console.log("computing taste graph...");
  try {
    await computeConnections();
  } catch (err) {
    console.error("taste graph computation failed:", err.message);
  }
});
