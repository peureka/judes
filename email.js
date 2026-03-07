import { Resend } from "resend";

let _resend;
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const BASE_URL = process.env.BASE_URL || "https://judes.ai";
const FROM = "judes <finds@judes.ai>";

const FONT = `'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', 'Courier New', monospace`;

function shell(body) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style>
    body, html { margin: 0; padding: 0; }
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #111111 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#111111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111111" style="background-color:#111111;min-height:100%;width:100%;">
    <tr>
      <td align="center" valign="top" style="padding:48px 24px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
          <tr>
            <td style="font-family:${FONT};-webkit-font-smoothing:antialiased;">
              ${body}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendFind(email, find) {
  const { findRecordId, reasoningSentence, sourceUrl, candidateName } = find;
  const spotifyUrl = `${BASE_URL}/api/click?f=${findRecordId}&t=spotify`;
  const respondUrl = `${BASE_URL}/api/click?f=${findRecordId}&t=respond`;

  const html = shell(`
    <p style="margin:0 0 28px 0;color:#e0e0e0;font-size:15px;line-height:1.7;font-family:${FONT};">
      ${reasoningSentence}
    </p>
    <p style="margin:0 0 40px 0;">
      <a href="${spotifyUrl}" style="color:#e0e0e0;font-size:14px;font-family:${FONT};text-decoration:underline;text-decoration-color:#555555;text-underline-offset:3px;">listen</a>
    </p>
    <p style="margin:0;">
      <a href="${respondUrl}" style="color:#555555;font-size:12px;font-family:${FONT};text-decoration:underline;text-decoration-color:#333333;text-underline-offset:3px;">say something</a>
    </p>
  `);

  try {
    const { data, error } = await resend().emails.send({
      from: FROM,
      to: email,
      subject: candidateName || "judes",
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
    <p style="margin:0 0 28px 0;">
      <a href="${verifyUrl}" style="color:#e0e0e0;font-size:15px;font-family:${FONT};text-decoration:underline;text-decoration-color:#555555;text-underline-offset:3px;">sign in to judes</a>
    </p>
    <p style="margin:0;color:#555555;font-size:12px;font-family:${FONT};">
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
