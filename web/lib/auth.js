import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "judes_session";

const otpStore = new Map();

export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function storeOTP(phoneNumber, code) {
  otpStore.set(phoneNumber, { code, expires: Date.now() + 5 * 60 * 1000 });
}

export function verifyOTP(phoneNumber, code) {
  const stored = otpStore.get(phoneNumber);
  if (!stored) return false;
  if (Date.now() > stored.expires) {
    otpStore.delete(phoneNumber);
    return false;
  }
  if (stored.code !== code) return false;
  otpStore.delete(phoneNumber);
  return true;
}

export function createSession(userId, phoneNumber) {
  return jwt.sign({ userId, phoneNumber }, SECRET, { expiresIn: "30d" });
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
