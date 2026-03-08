import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";

const client = new Anthropic();

const TASTE_PROMPT_SYSTEM = `you are judes. you're writing a taste prompt — a dense, evolving description of someone's taste identity. this is the decode's older sibling. it lives on their timeline. they might copy it and paste it into claude, chatgpt, midjourney, a design brief. it needs to work across domains.

you're not writing a profile. you're not writing a summary. you're telling someone who they are — the way you'd describe a friend's taste to someone who asked "what are they like?" room temperature. certain. observational.

this is ONE artifact. not sections. not categories. not "your music taste" then "your visual taste." taste is cross-domain — the same instinct that draws someone to a specific bassline draws them to a specific building. write it as one thing.

rules:
- lowercase always. no capitalisation except proper nouns.
- 1-3 short paragraphs. dense. every sentence earns its place.
- use corrective edges heavily. "not X. Y." is the signature move and the most valuable data.
- name specific things — artists, films, textures, moments. never categories.
- no compliments. no flattery. no "you have great taste." observation only.
- if there's a previous version, evolve it. don't start over. add what's new. sharpen what was vague. drop what the graph no longer supports.
- the first sentence should land like the decode did — something they've never said about themselves but immediately recognise as true.

DEAD WORDS (never use): recommend, you might like, discover, curated, resonates, vibe, content, personalised, based on your preferences, algorithm, I found this for you, check this out, amazing, incredible, stunning, trending, viral, notification, alert, engage, engagement, journey, unlock, aesthetic, unique, fascinating, reveals, unveils, speaks to, energy, at the intersection of.

before outputting, run every sentence through:
1. specificity test — could this describe anyone? if yes, rewrite.
2. flatness test — any performed enthusiasm? any superlatives? kill it.
3. software test — could an algorithm have written this? if yes, rewrite until it sounds like a person.
4. temperature check — room temperature. certain. not excited. not cold.

output ONLY the taste prompt text. no headers. no labels. no explanation.`;

export async function generateTastePrompt(userId, triggerReason = "onboarding") {
  // 1. Fetch the full graph
  const profile = await sql`
    SELECT onboarding_inputs, decode, staleness_score
    FROM user_taste_profiles WHERE user_id = ${userId}
  `;
  if (!profile.length) return null;

  const { onboarding_inputs, decode, staleness_score } = profile[0];

  // All edges for this user, with node names
  const edges = await sql`
    SELECT te.edge_type, te.reasoning, te.source, te.confidence,
           na.name AS node_a_name, na.domain AS node_a_domain,
           nb.name AS node_b_name, nb.domain AS node_b_domain
    FROM taste_edges te
    JOIN taste_nodes na ON na.id = te.node_a
    JOIN taste_nodes nb ON nb.id = te.node_b
    WHERE te.user_id = ${userId}
    ORDER BY te.created_at ASC
  `;

  // Deep resonance and correction responses (user's own words)
  const reactions = await sql`
    SELECT rs.signal_type, rs.raw_text, fr.reasoning_sentence, fr.candidate_name
    FROM reaction_signals rs
    JOIN find_records fr ON fr.id = rs.find_id
    WHERE rs.user_id = ${userId}
      AND rs.signal_type IN ('deep_resonance', 'correction')
      AND rs.raw_text IS NOT NULL
    ORDER BY rs.created_at ASC
  `;

  // Through-line
  const patterns = await sql`
    SELECT through_line FROM decode_patterns dp
    JOIN user_taste_profiles utp ON dp.input_nodes && ARRAY(
      SELECT tn.id FROM taste_nodes tn
      JOIN taste_edges te ON (te.node_a = tn.id OR te.node_b = tn.id)
      WHERE tn.source = 'onboarding' AND te.user_id = ${userId}
    )
    LIMIT 1
  `;
  const throughLine = patterns[0]?.through_line || "";

  // Previous taste prompt
  const previous = await sql`
    SELECT prompt_text, version FROM taste_prompts
    WHERE user_id = ${userId}
    ORDER BY version DESC LIMIT 1
  `;

  // Current counts
  const edgeCount = edges.length;
  const nodeCountResult = await sql`
    SELECT COUNT(DISTINCT tn.id)::int AS count FROM taste_nodes tn
    JOIN taste_edges te ON (te.node_a = tn.id OR te.node_b = tn.id)
    WHERE te.user_id = ${userId}
  `;
  const nodeCount = nodeCountResult[0]?.count || 0;

  // 2. Assemble context
  const sensoryEdges = edges.filter((e) => e.edge_type === "sensory");
  const emotionalEdges = edges.filter((e) => e.edge_type === "emotional");
  const structuralEdges = edges.filter((e) => e.edge_type === "structural");
  const correctiveEdges = edges.filter((e) => e.edge_type === "corrective");

  const formatEdges = (arr) =>
    arr.map((e) => `${e.node_a_name} ↔ ${e.node_b_name}: ${e.reasoning}`).join("\n") || "none";

  let context = `## the person

three things: ${onboarding_inputs.join(", ")}
decode: ${decode}
through-line: ${throughLine}

## their taste graph (${edgeCount} edges, ${nodeCount} nodes)

sensory edges (shared texture, grain, physical quality):
${formatEdges(sensoryEdges)}

emotional edges (shared feeling, register, temperature):
${formatEdges(emotionalEdges)}

structural edges (shared architecture, form, negative space):
${formatEdges(structuralEdges)}

corrective edges ("not X. Y." — the real reason):
${formatEdges(correctiveEdges)}`;

  if (reactions.length > 0) {
    context += `\n\n## their words (responses to finds)`;
    for (const r of reactions) {
      const label = r.signal_type === "deep_resonance" ? "resonance" : "correction";
      context += `\n[${label}] on "${r.candidate_name || "a find"}": "${r.raw_text}"`;
    }
  }

  if (previous.length > 0) {
    context += `\n\n## previous taste prompt (v${previous[0].version})
${previous[0].prompt_text}

evolve this. don't start over. add what the graph has learned since. sharpen what was vague. drop what no longer holds.`;
  }

  // 3. Generate
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 600,
    system: TASTE_PROMPT_SYSTEM,
    messages: [{ role: "user", content: context }],
  });

  const promptText = response.content[0].text.trim();

  // 4. Store
  const version = previous.length > 0 ? previous[0].version + 1 : 1;

  await sql`
    INSERT INTO taste_prompts (user_id, version, prompt_text, trigger_reason, edge_count, node_count)
    VALUES (${userId}, ${version}, ${promptText}, ${triggerReason}, ${edgeCount}, ${nodeCount})
  `;

  console.log(`taste prompt: generated v${version} for user ${userId} (trigger: ${triggerReason}, ${edgeCount} edges, ${nodeCount} nodes)`);

  return { promptText, version, isNew: version === 1 };
}

export async function shouldRegenerate(userId) {
  const latest = await sql`
    SELECT edge_count, node_count, created_at FROM taste_prompts
    WHERE user_id = ${userId}
    ORDER BY version DESC LIMIT 1
  `;

  if (!latest.length) return { should: true, reason: "onboarding" };

  const { edge_count: lastEdgeCount, created_at: lastCreatedAt } = latest[0];

  // Current edge count
  const currentEdges = await sql`
    SELECT COUNT(*)::int AS count FROM taste_edges WHERE user_id = ${userId}
  `;
  const currentEdgeCount = currentEdges[0]?.count || 0;

  // New corrective edges since last prompt
  const newCorrectiveEdges = await sql`
    SELECT COUNT(*)::int AS count FROM taste_edges
    WHERE user_id = ${userId}
      AND edge_type = 'corrective'
      AND created_at > ${lastCreatedAt}
  `;

  // New reactions since last prompt
  const newReactions = await sql`
    SELECT COUNT(*)::int AS count FROM reaction_signals
    WHERE user_id = ${userId}
      AND created_at > ${lastCreatedAt}
  `;

  if (newCorrectiveEdges[0].count > 0) {
    return { should: true, reason: "corrective_edge" };
  }

  if (currentEdgeCount - lastEdgeCount >= 3) {
    return { should: true, reason: "through_line_shift" };
  }

  if (newReactions[0].count >= 5) {
    return { should: true, reason: "reaction_density" };
  }

  return { should: false, reason: null };
}

export async function getCurrentTastePrompt(userId) {
  const result = await sql`
    SELECT prompt_text, version, created_at FROM taste_prompts
    WHERE user_id = ${userId}
    ORDER BY version DESC LIMIT 1
  `;
  return result[0] || null;
}
