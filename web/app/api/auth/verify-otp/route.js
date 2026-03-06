import { verifyOTP, createSession, COOKIE_NAME } from "../../../../lib/auth.js";
import { sql } from "../../../../../db/index.js";

export async function POST(request) {
  const { phoneNumber, code, userId } = await request.json();

  const normalized = phoneNumber.replace(/\s/g, "").replace(/^0/, "+44");
  const finalNumber = normalized.startsWith("+") ? normalized : "+" + normalized;

  if (!verifyOTP(finalNumber, code)) {
    return Response.json({ error: "wrong code." }, { status: 400 });
  }

  if (userId) {
    await sql`
      UPDATE users SET phone_number = ${finalNumber}, whatsapp_id = ${finalNumber.replace("+", "")}
      WHERE id = ${userId}
    `;
  }

  const user = await sql`
    SELECT id FROM users WHERE phone_number = ${finalNumber}
  `;

  if (!user.length) {
    return Response.json({ error: "no user found." }, { status: 404 });
  }

  const token = createSession(user[0].id, finalNumber);

  const response = Response.json({ authenticated: true, userId: user[0].id });
  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
  );

  return response;
}
