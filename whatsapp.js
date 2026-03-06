import "dotenv/config";

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const BASE_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}`;

export async function sendWhatsAppMessage(to, text) {
  const res = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[whatsapp] send failed:", res.status, err);
    return null;
  }

  const data = await res.json();
  return data.messages?.[0]?.id || null;
}

export async function sendWhatsAppTemplate(to, templateName, parameters) {
  const components = parameters?.length
    ? [{ type: "body", parameters: parameters.map((p) => ({ type: "text", text: p })) }]
    : [];

  const res = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[whatsapp] template send failed:", res.status, err);
    return null;
  }

  const data = await res.json();
  return data.messages?.[0]?.id || null;
}

export async function sendOTP(to, code) {
  return sendWhatsAppMessage(to, `your judes code: ${code}`);
}
