import { NextResponse } from "next/server";
import { sql } from "../../../../../db/index.js";
import { createSession, COOKIE_NAME } from "../../../../lib/auth.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/?error=expired", request.url));
  }

  try {
    const [authToken] = await sql`
      SELECT id, email FROM auth_tokens
      WHERE token = ${token} AND used = FALSE AND expires_at > NOW()
    `;

    if (!authToken) {
      return NextResponse.redirect(new URL("/?error=expired", request.url));
    }

    await sql`UPDATE auth_tokens SET used = TRUE WHERE id = ${authToken.id}`;

    const [user] = await sql`SELECT id FROM users WHERE email = ${authToken.email}`;

    if (!user) {
      return NextResponse.redirect(new URL("/?error=no-user", request.url));
    }

    const sessionToken = createSession(user.id, authToken.email);
    const response = NextResponse.redirect(new URL("/timeline", request.url));
    response.cookies.set(COOKIE_NAME, sessionToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("Verify magic link error:", error);
    return NextResponse.redirect(new URL("/?error=expired", request.url));
  }
}
