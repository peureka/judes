import { NextResponse } from "next/server";
import { COOKIE_NAME } from "../../../../lib/auth.js";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
  });
  return response;
}
