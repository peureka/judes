import { sql } from "../../../../../db/index.js";

export async function POST(request) {
  const { userId, email } = await request.json();
  if (!userId || !email) {
    return Response.json({ error: "missing" }, { status: 400 });
  }

  await sql`UPDATE users SET email = ${email.toLowerCase().trim()} WHERE id = ${userId}`;
  return Response.json({ saved: true });
}
