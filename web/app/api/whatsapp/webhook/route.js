import { sql } from "../../../../../db/index.js";
import { classifyReaction } from "../../../../../reaction.js";
import { respondToReaction, extractFacts } from "../../../../../conversation.js";
import { sendWhatsAppMessage } from "../../../../../whatsapp.js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// GET: Meta webhook verification (one-time setup)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("forbidden", { status: 403 });
}

// POST: Incoming messages from WhatsApp
export async function POST(request) {
  const body = await request.json();

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value?.messages?.length) {
    return Response.json({ status: "ok" });
  }

  const message = value.messages[0];
  const from = message.from;
  const text = message.text?.body;

  if (!text) {
    return Response.json({ status: "ok" });
  }

  const user = await sql`
    SELECT id FROM users WHERE whatsapp_id = ${from}
  `;

  if (!user.length) {
    return Response.json({ status: "ok" });
  }

  const userId = user[0].id;

  const recentFind = await sql`
    SELECT fr.id, fr.reasoning_sentence, fr.source_url
    FROM find_records fr
    WHERE fr.user_id = ${userId}
      AND fr.response_at IS NULL
      AND fr.sent_at > NOW() - INTERVAL '7 days'
    ORDER BY fr.sent_at DESC LIMIT 1
  `;

  if (recentFind.length) {
    const reaction = await classifyReaction(recentFind[0].id, userId, text);
    extractFacts(userId, text).catch(() => {});

    const reply = await respondToReaction(userId, text, recentFind[0], reaction);
    if (reply) {
      await sql`
        INSERT INTO messages (user_id, role, content)
        VALUES (${userId}, 'judes', ${reply})
      `;
      await sendWhatsAppMessage(from, reply);
    }
  } else {
    await sql`
      INSERT INTO messages (user_id, role, content)
      VALUES (${userId}, 'user', ${text})
    `;
    await sql`
      UPDATE users SET last_message_at = NOW() WHERE id = ${userId}
    `;
    extractFacts(userId, text).catch(() => {});
  }

  return Response.json({ status: "ok" });
}
