import { NextResponse } from "next/server";
import { sql } from "../../../../../db/index.js";
import { generateMagicToken } from "../../../../lib/auth.js";
import { sendMagicLink } from "../../../../../email.js";

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();
    const token = generateMagicToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await sql`INSERT INTO auth_tokens (email, token, expires_at) VALUES (${normalized}, ${token}, ${expiresAt})`;

    await sendMagicLink(normalized, token);

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("Send magic link error:", error);
    return NextResponse.json({ error: "Failed to send magic link" }, { status: 500 });
  }
}
