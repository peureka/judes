import "dotenv/config";
import { sql } from "../db/index.js";
import { embed, toVector, warmup } from "./embeddings.js";

async function backfill() {
  await warmup();

  const rows = await sql`
    SELECT id, fact FROM user_context WHERE embedding IS NULL
  `;

  console.log(`${rows.length} facts to backfill.`);

  let count = 0;
  for (const row of rows) {
    const vec = await embed(row.fact);
    await sql`
      UPDATE user_context SET embedding = ${toVector(vec)}::vector
      WHERE id = ${row.id}
    `;
    count++;
    if (count % 50 === 0) console.log(`${count}/${rows.length}`);
  }

  console.log(`backfill complete. ${count} facts embedded.`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
