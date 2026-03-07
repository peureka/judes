import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "judes_session";

export function generateMagicToken() {
  return randomUUID();
}

export function createSession(userId, email) {
  return jwt.sign({ userId, email }, SECRET, { expiresIn: "30d" });
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
