# Email Delivery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace WhatsApp delivery with email via Resend. Finds arrive as styled HTML emails with click tracking. Responses happen on judes.ai/timeline. Auth via email magic links.

**Architecture:** `email.js` replaces `whatsapp.js` using Resend SDK. Click tracking via `/api/click` redirect endpoint. Magic link auth replaces OTP. Onboarding captures email instead of phone number.

**Tech Stack:** Resend (email), Next.js 14, Neon Postgres, existing Claude API pipeline

---

### Task 1: Install Resend SDK and add env vars

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

**Step 1: Install resend**

Run: `cd /Users/pj/Documents/Code/judes && npm install resend`

**Step 2: Add env vars to .env.example**

Add these lines to `.env.example`:
```
RESEND_API_KEY=re_xxxxxxxxxxxx
```

**Step 3: Add RESEND_API_KEY to .env**

The founder adds their real key manually.

**Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add resend dependency and env var"
```

---

### Task 2: Database migration — email column, find_clicks, auth_tokens

**Files:**
- Create: `db/migrate-email.sql`

**Step 1: Write migration**

```sql
-- Add email column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Click tracking for find emails
CREATE TABLE IF NOT EXISTS find_clicks (
  id SERIAL PRIMARY KEY,
  find_record_id INTEGER NOT NULL REFERENCES find_records(id),
  click_type TEXT NOT NULL,
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_find_clicks_find ON find_clicks(find_record_id);

-- Magic link auth tokens
CREATE TABLE IF NOT EXISTS auth_tokens (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
```

**Step 2: Run migration**

Run: `cd /Users/pj/Documents/Code/judes && node db/run-migrations.js db/migrate-email.sql`

**Step 3: Commit**

```bash
git add db/migrate-email.sql
git commit -m "feat: add email column, find_clicks, auth_tokens tables"
```

---

### Task 3: Create email.js — Resend find delivery

**Files:**
- Create: `email.js`

**Step 1: Write email.js**

```javascript
import { Resend } from "resend";
import "dotenv/config";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "judes <finds@judes.ai>";
const BASE_URL = process.env.BASE_URL || "https://judes.ai";

export async function sendFind(email, find) {
  const clickUrl = `${BASE_URL}/api/click?f=${find.findRecordId}&t=spotify`;
  const respondUrl = `${BASE_URL}/api/click?f=${find.findRecordId}&t=respond`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:40px 24px;background:#111111;font-family:'SF Mono','Fira Code','Fira Mono','Roboto Mono','Courier New',monospace;-webkit-font-smoothing:antialiased;">
  <div style="max-width:480px;margin:0 auto;">
    <p style="color:#e0e0e0;font-size:14px;line-height:1.7;margin:0 0 24px 0;">
      ${find.reasoningSentence}
    </p>
    ${find.sourceUrl ? `<a href="${clickUrl}" style="color:#e0e0e0;font-size:13px;text-decoration:underline;text-decoration-color:#666666;text-underline-offset:3px;">${find.sourceUrl}</a>` : ""}
    <p style="margin:32px 0 0 0;">
      <a href="${respondUrl}" style="color:#666666;font-size:12px;text-decoration:none;">say something</a>
    </p>
  </div>
</body>
</html>`.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: find.candidateName || "",
      html,
    });

    if (error) {
      console.error("[email] send failed:", error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error("[email] send failed:", err.message);
    return null;
  }
}

export async function sendMagicLink(email, token) {
  const url = `${BASE_URL}/api/auth/verify?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:40px 24px;background:#111111;font-family:'SF Mono','Fira Code','Fira Mono','Roboto Mono','Courier New',monospace;">
  <div style="max-width:480px;margin:0 auto;">
    <p style="color:#e0e0e0;font-size:14px;margin:0 0 24px 0;">
      <a href="${url}" style="color:#e0e0e0;text-decoration:underline;text-decoration-color:#666666;text-underline-offset:3px;">sign in to judes</a>
    </p>
    <p style="color:#666666;font-size:11px;margin:0;">expires in 15 minutes.</p>
  </div>
</body>
</html>`.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: "judes",
      html,
    });

    if (error) {
      console.error("[email] magic link failed:", error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error("[email] magic link failed:", err.message);
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add email.js
git commit -m "feat: email.js — Resend-powered find delivery and magic link auth"
```

---

### Task 4: Click tracking endpoint

**Files:**
- Create: `web/app/api/click/route.js`

**Step 1: Write click route**

```javascript
import { sql } from "../../../../db/index.js";
import { redirect } from "next/navigation";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const findId = searchParams.get("f");
  const clickType = searchParams.get("t");

  if (!findId) {
    return redirect("/");
  }

  // Log click (fire-and-forget, don't block redirect)
  sql`
    INSERT INTO find_clicks (find_record_id, click_type)
    VALUES (${findId}, ${clickType || "unknown"})
  `.catch((err) => console.error("[click] log failed:", err.message));

  if (clickType === "respond") {
    return redirect(`/timeline?find=${findId}`);
  }

  // For spotify clicks, look up the source URL
  const find = await sql`
    SELECT source_url FROM find_records WHERE id = ${findId}
  `;

  if (find.length && find[0].source_url) {
    return redirect(find[0].source_url);
  }

  return redirect("/");
}
```

**Step 2: Commit**

```bash
git add web/app/api/click/route.js
git commit -m "feat: /api/click — tracked redirects for find email links"
```

---

### Task 5: Magic link auth — replace OTP

**Files:**
- Modify: `web/lib/auth.js` — remove OTP functions, add magic link token generation
- Create: `web/app/api/auth/send/route.js` — replaces `send-otp`
- Create: `web/app/api/auth/verify/route.js` — replaces `verify-otp` (GET, not POST)
- Delete: `web/app/api/auth/send-otp/route.js`
- Delete: `web/app/api/auth/verify-otp/route.js`

**Step 1: Rewrite web/lib/auth.js**

Remove OTP functions. Keep JWT session logic. Add magic link helpers.

```javascript
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
```

**Step 2: Write web/app/api/auth/send/route.js**

```javascript
import { generateMagicToken } from "../../../../lib/auth.js";
import { sendMagicLink } from "../../../../../email.js";
import { sql } from "../../../../../db/index.js";

export async function POST(request) {
  const { email } = await request.json();

  if (!email || !email.includes("@")) {
    return Response.json({ error: "need an email." }, { status: 400 });
  }

  const normalized = email.toLowerCase().trim();
  const token = generateMagicToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await sql`
    INSERT INTO auth_tokens (email, token, expires_at)
    VALUES (${normalized}, ${token}, ${expiresAt})
  `;

  const sent = await sendMagicLink(normalized, token);
  if (!sent) {
    return Response.json({ error: "nothing right now. soon." }, { status: 500 });
  }

  return Response.json({ sent: true });
}
```

**Step 3: Write web/app/api/auth/verify/route.js**

This is a GET endpoint — user clicks the link in their email.

```javascript
import { createSession, COOKIE_NAME } from "../../../../lib/auth.js";
import { sql } from "../../../../../db/index.js";
import { redirect } from "next/navigation";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return redirect("/?error=invalid");
  }

  const rows = await sql`
    SELECT * FROM auth_tokens
    WHERE token = ${token} AND used = FALSE AND expires_at > NOW()
  `;

  if (!rows.length) {
    return redirect("/?error=expired");
  }

  const authToken = rows[0];

  await sql`UPDATE auth_tokens SET used = TRUE WHERE id = ${authToken.id}`;

  const user = await sql`SELECT id FROM users WHERE email = ${authToken.email}`;

  if (!user.length) {
    return redirect("/?error=no-user");
  }

  const sessionToken = createSession(user[0].id, authToken.email);

  const response = redirect("/timeline");
  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
  );

  return response;
}
```

**Step 4: Delete old OTP routes**

Run:
```bash
rm web/app/api/auth/send-otp/route.js
rm web/app/api/auth/verify-otp/route.js
rmdir web/app/api/auth/send-otp
rmdir web/app/api/auth/verify-otp
```

**Step 5: Commit**

```bash
git add web/lib/auth.js web/app/api/auth/send/route.js web/app/api/auth/verify/route.js
git rm web/app/api/auth/send-otp/route.js web/app/api/auth/verify-otp/route.js
git commit -m "feat: magic link auth via Resend, replace WhatsApp OTP"
```

---

### Task 6: Update onboarding — capture email instead of phone

**Files:**
- Modify: `web/app/page.js:43-103` — DecodeView: replace WhatsApp connect with email capture
- Modify: `web/app/api/decode/route.js:38-42` — save email on user creation

**Step 1: Update /api/decode to accept email**

In `web/app/api/decode/route.js`, change the POST handler to accept an optional `email` param and save it on user creation.

At line 5, change the destructuring:
```javascript
const { threeThings, email } = await request.json();
```

At lines 38-42, change the INSERT to include email:
```javascript
const normalizedEmail = email?.toLowerCase().trim() || null;
const user = await sql`
  INSERT INTO users (three_things, taste_decode, taste_thread, taste_brief, email)
  VALUES (${items}, ${result.decode}, ${result.decode.split(".")[0] + "."}, ${result.brief}, ${normalizedEmail})
  RETURNING id
`;
```

**Step 2: Update DecodeView in page.js**

Replace the connect section (lines 92-99) and add email capture to the onboarding form. The DecodeView needs an email input instead of the WhatsApp connect link:

```javascript
function DecodeView({ result }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function handleEmail(e) {
    e.preventDefault();
    if (!email.includes("@")) return;

    try {
      const res = await fetch("/api/auth/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      setSent(true);

      // Save email to user record
      await fetch("/api/decode/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: result.userId, email: email.toLowerCase().trim() }),
      });
    } catch {
      setError("nothing right now. soon.");
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center px-6 py-16">
      <div className="w-full max-w-lg space-y-10">
        <p className="text-base leading-relaxed">{result.decode}</p>

        {result.world?.length > 0 && (
          <div className="space-y-2">
            {result.world.map((item, i) => (
              <div key={i} className="text-sm">
                <span className="text-[var(--fg-dim)]">{item.domain}</span>
                {" - "}
                <a href={item.searchUrl} target="_blank" rel="noopener noreferrer">
                  {item.name}
                </a>
              </div>
            ))}
          </div>
        )}

        <div className="pt-6 border-t border-[var(--fg-dim)]/20">
          {sent ? (
            <p className="text-sm text-[var(--fg-dim)]">check your email. when something's yours, it'll arrive there.</p>
          ) : (
            <form onSubmit={handleEmail}>
              <p className="text-sm text-[var(--fg-dim)] mb-4">
                your email. when something's yours, it'll arrive there.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent border-b border-[var(--fg-dim)] text-[var(--fg)] text-base py-3 px-0 focus:outline-none focus:border-[var(--fg)] placeholder:text-[var(--fg-dim)] placeholder:opacity-50"
                autoFocus
              />
              {error && <p className="text-sm text-[var(--fg-dim)] mt-3">{error}</p>}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
```

**Step 3: Create /api/decode/email endpoint**

Create `web/app/api/decode/email/route.js` to save email after decode:

```javascript
import { sql } from "../../../../../db/index.js";

export async function POST(request) {
  const { userId, email } = await request.json();
  if (!userId || !email) {
    return Response.json({ error: "missing" }, { status: 400 });
  }

  await sql`UPDATE users SET email = ${email} WHERE id = ${userId}`;
  return Response.json({ saved: true });
}
```

**Step 4: Commit**

```bash
git add web/app/page.js web/app/api/decode/route.js web/app/api/decode/email/route.js
git commit -m "feat: onboarding captures email, replaces WhatsApp connect"
```

---

### Task 7: Update connect page — email auth instead of phone/OTP

**Files:**
- Modify: `web/app/connect/page.js` — email input + magic link flow

**Step 1: Rewrite connect/page.js**

```javascript
"use client";

import { useState } from "react";
import { Suspense } from "react";

function ConnectForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSent(true);
    } catch { setError("nothing right now. soon."); }
    finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {sent ? (
          <p className="text-sm text-[var(--fg-dim)]">check your email.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="text-sm text-[var(--fg-dim)] mb-6">
              your email.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-transparent border-b border-[var(--fg-dim)] text-[var(--fg)] text-base py-3 px-0 focus:outline-none focus:border-[var(--fg)] placeholder:text-[var(--fg-dim)] placeholder:opacity-50"
              disabled={loading}
              autoFocus
            />
            {error && <p className="text-sm text-[var(--fg-dim)] mt-3">{error}</p>}
            {loading && <p className="text-sm text-[var(--fg-dim)] mt-3">...</p>}
          </form>
        )}
      </div>
    </main>
  );
}

export default function Connect() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-sm text-[var(--fg-dim)]">...</p></main>}>
      <ConnectForm />
    </Suspense>
  );
}
```

**Step 2: Commit**

```bash
git add web/app/connect/page.js
git commit -m "feat: connect page uses email magic link instead of phone OTP"
```

---

### Task 8: Wire find delivery to email — update initiate.js and index.js

**Files:**
- Modify: `initiate.js:13-14,48,59,86-93` — use email instead of whatsapp_id
- Modify: `index.js:1-2,24` — import email.js instead of whatsapp.js

**Step 1: Update initiate.js**

Line 13-14, change the WHERE clause:
```javascript
    WHERE (utp.last_find_at IS NULL OR utp.last_find_at < NOW() - INTERVAL '20 hours')
      AND u.email IS NOT NULL
```

Line 48, change silence result:
```javascript
results.push({ userId: user.id, email: user.email, action: "silence", reason: "no candidates" });
```

Line 55, same pattern:
```javascript
results.push({ userId: user.id, email: user.email, action: "silence", reason: "nothing cleared filter" });
```

Lines 86-93, change the send result:
```javascript
results.push({
  userId: user.id,
  email: user.email,
  action: "send",
  findRecordId: findRecord[0].id,
  message,
  reasoningSentence: find.reasoningSentence,
  candidate: find.candidate.name,
  sourceUrl: find.candidate.spotifyUrl,
});
```

Also need the find_records INSERT to return the id. Change line 63-72:
```javascript
const findRecord = await sql`
  INSERT INTO find_records (user_id, node_id, reasoning_sentence, reasoning_edges, source_url, source_type, message_id)
  VALUES (${user.id}, ${find.nodeId}, ${find.reasoningSentence}, ${find.edgeId ? [find.edgeId] : []}, ${find.candidate.spotifyUrl}, 'spotify', ${msgResult[0].id})
  RETURNING id
`;
```

**Step 2: Update index.js**

Line 1-2, change imports:
```javascript
import { generateFinds } from "./initiate.js";
import { sendFind } from "./email.js";
```

Lines 23-25, change send call:
```javascript
if (result.action === "send") {
  await sendFind(result.email, {
    findRecordId: result.findRecordId,
    reasoningSentence: result.reasoningSentence,
    sourceUrl: result.sourceUrl,
    candidateName: result.candidate,
  });
  console.log(`find sent to ${result.email}: ${result.candidate}`);
}
```

**Step 3: Commit**

```bash
git add initiate.js index.js
git commit -m "feat: find delivery via email instead of WhatsApp"
```

---

### Task 9: Delete whatsapp.js and webhook

**Files:**
- Delete: `whatsapp.js`
- Delete: `web/app/api/whatsapp/webhook/route.js`

**Step 1: Remove files**

```bash
git rm whatsapp.js
git rm -r web/app/api/whatsapp/
```

**Step 2: Commit**

```bash
git commit -m "chore: remove WhatsApp integration (replaced by email)"
```

---

### Task 10: Update timeline to handle ?find= deep link

**Files:**
- Modify: `web/app/timeline/page.js` — handle `?find=` query param, scroll to find, auto-focus input

**Step 1: Update timeline page**

Add `useSearchParams` import and find-specific scrolling. After line 4:
```javascript
import { useSearchParams } from "next/navigation";
```

Inside the Timeline component, add after the existing state declarations:
```javascript
const searchParams = useSearchParams();
const targetFindId = searchParams.get("find");
const findRef = useRef(null);
```

Add an effect to scroll to the target find:
```javascript
useEffect(() => {
  if (targetFindId && findRef.current) {
    findRef.current.scrollIntoView({ behavior: "smooth" });
  }
}, [data, targetFindId]);
```

On the find div that matches, add the ref:
```javascript
<div key={find.id} ref={find.id.toString() === targetFindId ? findRef : null} className="space-y-3">
```

Wrap the export in Suspense (for useSearchParams):
```javascript
export default function TimelinePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-sm text-[var(--fg-dim)]">...</p></main>}>
      <Timeline />
    </Suspense>
  );
}
```

**Step 2: Commit**

```bash
git add web/app/timeline/page.js
git commit -m "feat: timeline deep-links to specific find from email"
```

---

### Task 11: Update docs

**Files:**
- Modify: `docs/DECISIONS.md` — add email pivot decisions
- Modify: `docs/STACK.md` — update messaging from WhatsApp to email
- Modify: `docs/CHANGELOG.md` — log this session

**Step 1: Add decisions**

Add to `docs/DECISIONS.md` under a new `## 2026-03-07` section:
```markdown
## 2026-03-07

- Email replaces WhatsApp. Meta Cloud API blocked (no FB account, ad account locked). No platform gatekeeping with email.
- Resend is the email service. Developer-first, 3,000 free emails/month, simple API.
- Find emails are styled HTML (dark bg, monospace, Judes aesthetic). Not plain text.
- Click tracking on all email links via /api/click redirect endpoint. Spotify clicks without response = soft confirmation.
- Auth is email magic link. No OTP. No password. Email is the identity.
- Responses happen on web timeline at judes.ai/timeline. Find emails link to ?find=id.
- No Twilio. Direct Resend integration. Simpler, no Meta dependency.
```

**Step 2: Update STACK.md**

Replace all WhatsApp references with email/Resend. Key changes:
- Architecture diagram: `WhatsApp (Meta Cloud API)` → `Email (Resend)`
- Dependencies table: Messaging row changes to `Email (Resend) | Find delivery, magic link auth`
- Data flows: WhatsApp send → email send, WhatsApp webhook → web timeline response
- Auth: phone + OTP via WhatsApp → email magic link via Resend

**Step 3: Commit**

```bash
git add docs/DECISIONS.md docs/STACK.md docs/CHANGELOG.md
git commit -m "docs: update for email delivery pivot"
```
