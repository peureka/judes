import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const sql = neon(process.env.DATABASE_URL);

// Split SQL on semicolons that are NOT inside parentheses
function splitStatements(content) {
  const statements = [];
  let current = "";
  let depth = 0;

  for (const char of content) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === ";" && depth === 0) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith("--")) {
        statements.push(trimmed);
      }
      current = "";
    } else {
      current += char;
    }
  }

  const trimmed = current.trim();
  if (trimmed && !trimmed.startsWith("--")) {
    statements.push(trimmed);
  }

  return statements;
}

const files = [
  "db/schema.sql",
  "db/migrate-memory.sql",
  "db/migrate-vision.sql",
  "db/migrate-taste-graph.sql",
  "db/migrate-whatsapp.sql",
  "db/migrate-email.sql",
  "db/migrate-ui.sql",
  "db/migrate-taste-prompt.sql",
];

for (const file of files) {
  console.log("Running:", file);
  const content = readFileSync(file, "utf8");
  // Strip single-line comments
  const cleaned = content.replace(/^--.*$/gm, "");
  const statements = splitStatements(cleaned);

  for (const stmt of statements) {
    try {
      await sql.query(stmt);
    } catch (e) {
      if (e.code === "42701" || e.code === "42P07" || e.code === "42710") {
        console.log("  (skipped, already exists)");
      } else {
        console.error("  FAILED:", stmt.slice(0, 100));
        throw e;
      }
    }
  }
  console.log("  done.");
}
console.log("All migrations complete.");
