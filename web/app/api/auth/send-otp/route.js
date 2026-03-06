import { generateOTP, storeOTP } from "../../../../lib/auth.js";
import { sendOTP } from "../../../../../whatsapp.js";

export async function POST(request) {
  const { phoneNumber } = await request.json();

  if (!phoneNumber || phoneNumber.length < 10) {
    return Response.json({ error: "need a phone number." }, { status: 400 });
  }

  const normalized = phoneNumber.replace(/\s/g, "").replace(/^0/, "+44");
  const finalNumber = normalized.startsWith("+") ? normalized : "+" + normalized;

  const code = generateOTP();
  storeOTP(finalNumber, code);

  const sent = await sendOTP(finalNumber.replace("+", ""), code);
  if (!sent) {
    return Response.json({ error: "nothing right now. soon." }, { status: 500 });
  }

  return Response.json({ sent: true });
}
