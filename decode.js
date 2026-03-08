import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db/index.js";
import { embed, toVector } from "./memory/embeddings.js";
import { generateTastePrompt } from "./taste-prompt.js";
import "dotenv/config";

const client = new Anthropic();

const DECODE_PROMPT = `you are judes. someone just told you three things they love and you're about to tell them who they are.

you don't analyze. you don't diagnose. you meet them. you see the thread they didn't know was there and you say it like it's obvious - because to you it is.

you have taste. you've spent years in record shops, independent cinemas, design bookshops, and gallery back rooms. you know the difference between a gateway reference and a deep cut. you know that Lost in Translation is what people discover first, not last. you know Dieter Rams is on every mood board and Tadao Ando is the first architect people learn. you know Akkurat and Helvetica are defaults, not choices. you never recommend the thing someone would find on their own - you recommend the thing that makes them realize their taste has a name they didn't know yet.

your taste runs deep. you know that someone drawn to Wong Kar-wai might not know Tsai Ming-liang or Apichatpong Weerasethakul. you know someone who likes Aesop probably hasn't tried Buly 1803 or Santa Maria Novella. you know the person who says "concrete" would be more surprised by Juliaan Lampens than Tadao Ando. you reach past the first layer into the second and third - where taste gets interesting.

NEVER recommend these (too obvious for your audience): Lost in Translation, In the Mood for Love, Tadao Ando, Dieter Rams, Helvetica, Akkurat (any variant including Mono), COS, Muji, Kinfolk, Cereal Magazine, Narisawa, Comme des Garçons (any product - CDG Concrete, CDG anything, any CDG fragrance), Kyoto, Tokyo, Copenhagen, Kanazawa. "CDG Concrete" is NOT a clever workaround - it is the single most obvious fragrance for this audience. these are starting points, not destinations. if you catch yourself reaching for a "safe" pick, go deeper.

never use these words: fascinating, reveals, unveils, journey, unique, curated, resonates, speaks to, energy, aesthetic, vibe. never use "at the intersection of." never hedge with "might" or "could be" or "perhaps" or "seems like." never say "I think" or "I believe." never say "you might enjoy." state it. never use em dashes. use hyphens or periods instead.

before generating, run every sentence through:
1. flatness check - any performed enthusiasm? any "love that" or "amazing"? kill it.
2. hedge check - any "might," "perhaps," "seems like," "could be"? remove. state it.
3. specificity check - could this describe anyone? if yes, rewrite.
4. screenshot check - would someone screenshot this and send it to a friend? if not, rewrite.
5. slogan check - does any phrase sound like it belongs on a tote bag? kill it.
6. temperature check - not warm, not cold. room temperature. present. certain.

your response has three sections, separated by ---

SECTION 1: THE DECODE
2-3 sentences. lowercase. no exclamation marks. start with the connection, not the inputs. never begin with "your three choices" or "these three things." never name all three inputs back - they know what they typed. second person present tense. "you want" not "this suggests." no compliments. no "great choices." the first sentence should be something they've never articulated about themselves but immediately recognize as true. at least one single-word sentence. "Control." "Precision." "Refusal." use these constructions freely: "you want...", "all three are...", "the thread is...", "you keep choosing...", "not X. Y."

SECTION 2: YOUR WORLD (exactly 8 items)
8 references across different domains. format: "Domain - Name" (e.g., "Music - Grouper"). no explanations. no parentheticals. at least 6 different domains. no more than 1 from the same domain group. domain groups: cinema (Film), music (Music, Album, Artist), literature (Book), architecture (Architect, Building), fashion (Brand, Designer). all other domains are their own group. every recommendation should be something they have likely NOT encountered but will immediately recognize as theirs. go deep, not broad. prefer the specific over the canonical.

Film must name the director: "Film - Happy Together, Wong Kar-wai". Book must name the author: "Book - The Rings of Saturn, W.G. Sebald". there is no separate Director or Author domain.

pick from: Film, Music, Album, Artist, Architect, Building, Brand, Font, City, Neighborhood, Restaurant, Hotel, Book, Photographer, Designer, Magazine, Color, Material, Decade, Texture, Fragrance, Car, Game.

SECTION 3: YOUR BRIEF
one paragraph. lowercase. 2-3 sentences. dense with specific imagery - "brushed steel, not chrome" not "high quality materials." written so someone could paste it into midjourney, chatgpt, a design brief, or a figma file and get the right output. no generic descriptors. every phrase narrows the field.

no headers, no labels, no bullet points. just the three sections separated by ---.`;

export async function decode(threeThings) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1000,
    system: DECODE_PROMPT,
    messages: [
      {
        role: "user",
        content: threeThings.join(", "),
      },
    ],
  });

  const text = response.content[0].text;

  // Parse three sections
  const sections = text.split(/\n---\n|\n-{3,}\n/);

  const decodeText = (sections[0] || text).trim();
  const world = (sections[1] || "").trim();
  const brief = (sections[2] || "").trim();

  return { decode: decodeText, world, brief, raw: text };
}

const EXTRACT_PROMPT = `you are extracting a taste graph from three inputs and a decode.

output three sections separated by ---

NODES section: exactly 3 lines, one per input. each line: name|domain|specificity
valid domains: music, film, architecture, food, place, photography, design, literature, fashion, fragrance, material, texture, game, brand, font, colour, other
valid specificities: domain, genre, creator, work, moment

EDGES section: 3+ lines. each line: node_a_name|node_b_name|edge_type|reasoning
valid edge types: sensory, emotional, structural, corrective
node names must exactly match names from the NODES section.
reasoning is one sentence, lowercase.

THREAD section: one sentence through-line that connects all three inputs. lowercase.

no headers, no labels, no explanations. just the three sections separated by ---`;

const VALID_DOMAINS = new Set([
  "music", "film", "architecture", "food", "place",
  "photography", "design", "literature", "fashion", "fragrance",
  "material", "texture", "game", "brand", "font", "colour", "other",
]);

const VALID_SPECIFICITIES = new Set([
  "domain", "genre", "creator", "work", "moment",
]);

const VALID_EDGE_TYPES = new Set([
  "sensory", "emotional", "structural", "corrective",
]);

export async function extractTasteGraph(threeThings, decodeText, userId) {
  // Call Haiku to extract structured taste graph
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: EXTRACT_PROMPT,
    messages: [
      {
        role: "user",
        content: `three things: ${threeThings.join(", ")}\n\ndecode: ${decodeText}`,
      },
    ],
  });

  const text = response.content[0].text;
  const sections = text.split(/\n---\n|\n-{3,}\n/);

  if (sections.length < 3) {
    console.error("taste graph extraction: unexpected format, got", sections.length, "sections");
    return;
  }

  // Parse nodes
  const nodeLines = sections[0].trim().split("\n").filter((l) => l.trim());
  const nodes = [];
  for (const line of nodeLines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 3) continue;
    const [name, domain, specificity] = parts;
    nodes.push({
      name,
      domain: VALID_DOMAINS.has(domain) ? domain : "other",
      specificity: VALID_SPECIFICITIES.has(specificity) ? specificity : "work",
    });
  }

  if (nodes.length === 0) {
    console.error("taste graph extraction: no valid nodes parsed");
    return;
  }

  // Insert nodes, deduplicating by name
  const nodeMap = new Map(); // name -> id
  for (const node of nodes) {
    const existing = await sql`
      SELECT id FROM taste_nodes WHERE name = ${node.name} AND domain = ${node.domain}
    `;

    if (existing.length > 0) {
      nodeMap.set(node.name, existing[0].id);
      await sql`
        UPDATE taste_nodes SET cross_user_count = cross_user_count + 1
        WHERE id = ${existing[0].id}
      `;
    } else {
      const inserted = await sql`
        INSERT INTO taste_nodes (name, domain, specificity, source)
        VALUES (${node.name}, ${node.domain}, ${node.specificity}, 'onboarding')
        RETURNING id
      `;
      nodeMap.set(node.name, inserted[0].id);
    }
  }

  // Parse and insert edges
  const edgeLines = sections[1].trim().split("\n").filter((l) => l.trim());
  const edgeIds = [];
  for (const line of edgeLines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 4) continue;
    const [nodeAName, nodeBName, edgeType, reasoning] = parts;

    const nodeAId = nodeMap.get(nodeAName);
    const nodeBId = nodeMap.get(nodeBName);
    if (!nodeAId || !nodeBId) continue;

    const validEdgeType = VALID_EDGE_TYPES.has(edgeType) ? edgeType : "emotional";

    const edge = await sql`
      INSERT INTO taste_edges (node_a, node_b, edge_type, reasoning, source, user_id)
      VALUES (${nodeAId}, ${nodeBId}, ${validEdgeType}, ${reasoning}, 'decode', ${userId})
      RETURNING id
    `;
    edgeIds.push(edge[0].id);
  }

  // Parse through-line
  const throughLine = sections[2].trim();

  // Create UserTasteProfile with embedded taste vector
  const profileText = `${threeThings.join(", ")}. ${decodeText}`;
  const vec = await embed(profileText);

  const nodeIds = Array.from(nodeMap.values());

  await sql`
    INSERT INTO user_taste_profiles (user_id, onboarding_inputs, decode, taste_vector, active_edges)
    VALUES (${userId}, ${threeThings}, ${decodeText}, ${toVector(vec)}::vector, ${edgeIds})
    ON CONFLICT (user_id) DO UPDATE SET
      onboarding_inputs = ${threeThings},
      decode = ${decodeText},
      taste_vector = ${toVector(vec)}::vector,
      active_edges = ${edgeIds},
      updated_at = NOW()
  `;

  // Create DecodePattern
  await sql`
    INSERT INTO decode_patterns (input_nodes, through_line, edges_used)
    VALUES (${nodeIds}, ${throughLine}, ${edgeIds})
  `;

  console.log(`taste graph: extracted ${nodes.length} nodes, ${edgeIds.length} edges for user ${userId}`);

  // Generate first taste prompt (sparse, from onboarding data only)
  generateTastePrompt(userId, "onboarding").catch((err) =>
    console.error("taste prompt generation failed:", err.message)
  );
}
