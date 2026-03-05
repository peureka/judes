import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";

const client = new Anthropic();

const CLASSIFY_PROMPT = `classify this response to a find. the find was a song/film/place sent with a reasoning sentence. the user replied (or didn't — silence is tracked by time).

response types:
- confirmation: short affirmation ("yes", "this", "exactly", thumbs up)
- deep_resonance: specific response naming what connected ("the part where...", "the way she...")
- correction: pushback or correction ("not really", "already know this", "not what I meant")
- discovery: curiosity pull ("who is this?", "what album?", "where is this?")
- social_share: forwarded or shared with others

respond with: type|any_new_taste_insight
(the taste insight is optional — only include if the response reveals something new about their taste, one sentence, lowercase)

example: deep_resonance|they respond to unresolved tension in music, not resolution`;

export async function classifyReaction(findId, userId, responseText) {
  const find = await sql`
    SELECT reasoning_sentence, source_url FROM find_records WHERE id = ${findId}
  `;
  if (!find.length) return null;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: CLASSIFY_PROMPT,
    messages: [
      {
        role: "user",
        content: `find reasoning: ${find[0].reasoning_sentence}\ntheir response: ${responseText}`,
      },
    ],
  });

  const text = response.content[0].text.trim();
  const parts = text.split("|").map((s) => s.trim());
  const signalType = parts[0];
  const tasteInsight = parts[1] || null;

  const validTypes = [
    "confirmation", "deep_resonance", "correction", "discovery", "social_share",
  ];
  const safeType = validTypes.includes(signalType) ? signalType : "confirmation";

  await sql`
    INSERT INTO reaction_signals (find_id, user_id, signal_type, raw_text)
    VALUES (${findId}, ${userId}, ${safeType}, ${responseText})
  `;

  await sql`
    UPDATE find_records SET response_at = NOW() WHERE id = ${findId}
  `;

  await sql`
    UPDATE user_taste_profiles
    SET total_responses = total_responses + 1,
        response_ratio = (total_responses + 1)::float / GREATEST(total_finds_sent, 1),
        updated_at = NOW()
    WHERE user_id = ${userId}
  `;

  if (tasteInsight) {
    const findNode = await sql`
      SELECT node_id FROM find_records WHERE id = ${findId}
    `;

    if (findNode.length && findNode[0].node_id) {
      const onboardingNode = await sql`
        SELECT tn.id FROM taste_nodes tn
        JOIN taste_edges te ON te.node_a = tn.id OR te.node_b = tn.id
        WHERE tn.source = 'onboarding' AND te.user_id = ${userId}
        LIMIT 1
      `;

      if (onboardingNode.length) {
        await sql`
          INSERT INTO taste_edges (node_a, node_b, edge_type, reasoning, source, user_id)
          VALUES (${onboardingNode[0].id}, ${findNode[0].node_id}, 'emotional', ${tasteInsight}, 'user_articulation', ${userId})
        `;
      }
    }
  }

  return { signalType: safeType, tasteInsight };
}

export async function checkSilenceSignals() {
  const softIgnores = await sql`
    SELECT fr.id, fr.user_id FROM find_records fr
    LEFT JOIN reaction_signals rs ON rs.find_id = fr.id
    WHERE rs.id IS NULL
      AND fr.sent_at < NOW() - INTERVAL '24 hours'
      AND fr.sent_at > NOW() - INTERVAL '72 hours'
      AND fr.response_at IS NULL
  `;

  for (const find of softIgnores) {
    await sql`
      INSERT INTO reaction_signals (find_id, user_id, signal_type)
      VALUES (${find.id}, ${find.user_id}, 'soft_ignore')
      ON CONFLICT DO NOTHING
    `;
  }

  const hardIgnores = await sql`
    SELECT fr.id, fr.user_id FROM find_records fr
    LEFT JOIN reaction_signals rs ON rs.find_id = fr.id
    WHERE rs.id IS NULL
      AND fr.sent_at < NOW() - INTERVAL '72 hours'
      AND fr.response_at IS NULL
  `;

  for (const find of hardIgnores) {
    await sql`
      INSERT INTO reaction_signals (find_id, user_id, signal_type)
      VALUES (${find.id}, ${find.user_id}, 'hard_ignore')
      ON CONFLICT DO NOTHING
    `;

    await sql`
      UPDATE user_taste_profiles
      SET staleness_score = LEAST(staleness_score + 0.1, 1.0),
          updated_at = NOW()
      WHERE user_id = ${find.user_id}
    `;
  }

  return { softIgnores: softIgnores.length, hardIgnores: hardIgnores.length };
}
