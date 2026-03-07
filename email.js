import { Resend } from "resend";

let _resend;
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const BASE_URL = process.env.BASE_URL || "https://judes.ai";
const FROM = "judes <finds@judes.ai>";

const FONT_STACK = `"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace`;

function shell(body) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:40px 24px;background:#111111;font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
    <tr><td>${body}</td></tr>
  </table>
</body>
</html>`;
}

export async function sendFind(email, find) {
  const { findRecordId, reasoningSentence, sourceUrl, candidateName } = find;
  const spotifyUrl = `${BASE_URL}/api/click?f=${findRecordId}&t=spotify`;
  const respondUrl = `${BASE_URL}/api/click?f=${findRecordId}&t=respond`;

  const html = shell(`
    <p style="margin:0 0 24px;color:#e0e0e0;font-size:14px;line-height:1.6;">
      ${reasoningSentence}
    </p>
    <p style="margin:0 0 32px;">
      <a href="${spotifyUrl}" style="color:#e0e0e0;text-decoration:underline;text-decoration-color:#666666;text-underline-offset:3px;font-size:14px;">listen</a>
    </p>
    <p style="margin:0;">
      <a href="${respondUrl}" style="color:#666666;text-decoration:underline;text-decoration-color:#666666;text-underline-offset:3px;font-size:12px;">say something</a>
    </p>
  `);

  try {
    const { data, error } = await resend().emails.send({
      from: FROM,
      to: email,
      subject: candidateName || "",
      html,
    });
    if (error) {
      console.error("[email] sendFind error:", error);
      return null;
    }
    return data.id;
  } catch (err) {
    console.error("[email] sendFind error:", err);
    return null;
  }
}

export async function sendMagicLink(email, token) {
  const verifyUrl = `${BASE_URL}/api/auth/verify?token=${token}`;

  const html = shell(`
    <p style="margin:0 0 24px;">
      <a href="${verifyUrl}" style="color:#e0e0e0;text-decoration:underline;text-decoration-color:#666666;text-underline-offset:3px;font-size:14px;">sign in to judes</a>
    </p>
    <p style="margin:0;color:#666666;font-size:12px;">
      expires in 15 minutes
    </p>
  `);

  try {
    const { data, error } = await resend().emails.send({
      from: FROM,
      to: email,
      subject: "judes",
      html,
    });
    if (error) {
      console.error("[email] sendMagicLink error:", error);
      return null;
    }
    return data.id;
  } catch (err) {
    console.error("[email] sendMagicLink error:", err);
    return null;
  }
}
