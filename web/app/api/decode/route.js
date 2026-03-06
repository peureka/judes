import { decode, extractTasteGraph } from "../../../../decode.js";
import { sql } from "../../../../db/index.js";

export async function POST(request) {
  const { threeThings } = await request.json();

  if (!threeThings || !Array.isArray(threeThings) || threeThings.length < 3) {
    return Response.json({ error: "three things. not two." }, { status: 400 });
  }

  const items = threeThings.slice(0, 3).map((t) => t.trim()).filter(Boolean);
  if (items.length < 3) {
    return Response.json({ error: "three things. not two." }, { status: 400 });
  }

  let result = await decode(items);

  // Strip em dashes
  result.decode = result.decode.replace(/\u2014/g, "-");
  if (result.world) result.world = result.world.replace(/\u2014/g, "-");
  if (result.brief) result.brief = result.brief.replace(/\u2014/g, "-");

  // Parse world items into structured data
  const worldItems = result.world
    ? result.world.split("\n").map((line) => {
        const match = line.match(/^(.+?)\s*-\s*(.+)$/);
        if (!match) return null;
        const [, domain, name] = match;
        return {
          domain: domain.trim(),
          name: name.trim(),
          searchUrl: `https://www.google.com/search?q=${encodeURIComponent(name.trim() + " " + domain.trim())}`,
        };
      }).filter(Boolean)
    : [];

  // Create user (without requiring telegram_id)
  const user = await sql`
    INSERT INTO users (three_things, taste_decode, taste_thread, taste_brief)
    VALUES (${items}, ${result.decode}, ${result.decode.split(".")[0] + "."}, ${result.brief})
    RETURNING id
  `;

  // Extract taste graph (async, non-blocking)
  extractTasteGraph(items, result.decode, user[0].id).catch((err) => {
    console.error("taste graph extraction failed:", err.message);
  });

  // Save decode as first message
  const replyText = result.world ? result.decode + "\n\n" + result.world : result.decode;
  await sql`
    INSERT INTO messages (user_id, role, content)
    VALUES (${user[0].id}, 'judes', ${replyText})
  `;

  return Response.json({
    userId: user[0].id,
    decode: result.decode,
    world: worldItems,
    brief: result.brief,
  });
}
