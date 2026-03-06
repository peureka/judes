# Web App + WhatsApp Pivot — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Telegram with a Next.js web app (onboarding, timeline, taste profile) and WhatsApp via Meta Cloud API (find delivery).

**Architecture:** Next.js app lives in `web/` subdirectory, deployed to Vercel. Engine files (decode, taste-filter, reaction, etc.) stay at project root and are imported by API routes via relative paths. Cron process (`index.js`) stays as a separate Node process, updated to send via WhatsApp instead of Telegram. Both share the same Neon Postgres database.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS, Meta Cloud API (WhatsApp Business), Neon Postgres + pgvector, Claude API

**Key files to read first:**
- `docs/IDENTITY.md` — governing document, wins all conflicts
- `docs/plans/2026-03-06-web-app-whatsapp-design.md` — the design this plan implements
- `db/schema.sql` + `db/migrate-taste-graph.sql` — current DB schema
- `decode.js` — decode engine (called from onboarding API route)
- `bot.js` — current Telegram handler (being replaced)
- `initiate.js` — find pipeline (needs WhatsApp send instead of Telegram)
- `db/index.js` — shared Neon database connection

---

### Task 1: Database Migration — Add Phone/WhatsApp Columns

**Context:** The `users` table currently requires `telegram_id BIGINT UNIQUE NOT NULL`. We need to make it nullable, add `phone_number` and `whatsapp_id` columns for the new auth and delivery system.

**Files:**
- Create: `db/migrate-whatsapp.sql`
- Modify: `db/run-migrations.js`

**Step 1: Write the migration SQL**

Create `db/migrate-whatsapp.sql`:

```sql
-- Add phone and WhatsApp columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_id TEXT UNIQUE;

-- Make telegram_id nullable (was NOT NULL)
ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;

-- Index for phone lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_whatsapp ON users(whatsapp_id);
```

**Step 2: Run the migration**

```bash
cd /Users/pj/Documents/Code/judes && node db/run-migrations.js
```

If `run-migrations.js` doesn't pick up the new file automatically, add it to the migration list. The migration runner reads files from `db/` — check whether it auto-discovers or has a hardcoded list.

**Step 3: Verify**

```bash
cd /Users/pj/Documents/Code/judes && node -e "
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';
const sql = neon(process.env.DATABASE_URL);
const cols = await sql\`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position\`;
console.table(cols);
"
```

Expected: `phone_number` and `whatsapp_id` columns exist. `telegram_id` shows `is_nullable: YES`.

**Step 4: Commit**

```bash
git add db/migrate-whatsapp.sql
git commit -m "feat: add phone_number and whatsapp_id columns, make telegram_id nullable"
```

---

### Task 2: Scaffold Next.js App

**Context:** Create the Next.js app in `web/` subdirectory. It needs to import engine files from the parent directory (decode.js, db/index.js, etc.). Dark theme, monospace, Tailwind CSS.

**Files:**
- Create: `web/` directory with Next.js scaffold
- Create: `web/package.json`
- Create: `web/next.config.js`
- Create: `web/tailwind.config.js`
- Create: `web/app/layout.js`
- Create: `web/app/globals.css`
- Create: `web/.env.local` (symlink or copy of root `.env`)

**Step 1: Scaffold Next.js**

```bash
cd /Users/pj/Documents/Code/judes && npx create-next-app@latest web --js --tailwind --app --no-src-dir --no-eslint --no-turbopack --import-alias "@/*"
```

When prompted, accept defaults. This creates `web/` with App Router, Tailwind, JavaScript.

**Step 2: Configure next.config.js for parent imports**

Replace `web/next.config.js` with:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@anthropic-ai/sdk",
      "@neondatabase/serverless",
      "@xenova/transformers",
    ],
  },
  webpack: (config) => {
    // Allow importing from parent directory (engine files)
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
```

**Step 3: Set up environment variables**

```bash
cp /Users/pj/Documents/Code/judes/.env /Users/pj/Documents/Code/judes/web/.env.local
```

**Step 4: Set up global styles (dark theme, monospace)**

Replace `web/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #111111;
  --fg: #e0e0e0;
  --fg-dim: #666666;
  --accent: #ffffff;
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--fg);
  text-decoration: underline;
  text-decoration-color: var(--fg-dim);
  text-underline-offset: 3px;
}

a:hover {
  text-decoration-color: var(--fg);
}

::selection {
  background: rgba(255, 255, 255, 0.15);
}
```

**Step 5: Set up root layout**

Replace `web/app/layout.js` with:

```jsx
import "./globals.css";

export const metadata = {
  title: "judes",
  description: "three things.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
```

**Step 6: Verify it runs**

```bash
cd /Users/pj/Documents/Code/judes/web && npm run dev
```

Open `http://localhost:3000`. Should see a dark page. Kill the dev server after confirming.

**Step 7: Add web/ to root .gitignore**

Add to root `.gitignore`:

```
web/.env.local
web/.next/
web/node_modules/
```

**Step 8: Commit**

```bash
git add web/ .gitignore
git commit -m "feat: scaffold Next.js app in web/ with dark monospace theme"
```

---

### Task 3: Landing Page — Onboarding UI

**Context:** The landing page IS the onboarding. Dark, monospace, a few lines in Judes' voice, then an input for three things. After submission, show the decode and world items. This is the screenshot moment.

**Files:**
- Create: `web/app/page.js` (landing page component)
- Create: `web/app/api/decode/route.js` (API route that calls decode engine)

**Step 1: Create the decode API route**

Create `web/app/api/decode/route.js`:

```js
import { decode, extractTasteGraph } from "../../../../decode.js";
import { sql } from "../../../../db/index.js";

export async function POST(request) {
  const { threeThings, phoneNumber } = await request.json();

  if (!threeThings || !Array.isArray(threeThings) || threeThings.length < 3) {
    return Response.json({ error: "three things. not two." }, { status: 400 });
  }

  const items = threeThings.slice(0, 3).map((t) => t.trim()).filter(Boolean);
  if (items.length < 3) {
    return Response.json({ error: "three things. not two." }, { status: 400 });
  }

  let result = await decode(items);

  // Strip em dashes
  result.decode = result.decode.replace(/\u2014/g, "-");
  if (result.world) result.world = result.world.replace(/\u2014/g, "-");
  if (result.brief) result.brief = result.brief.replace(/\u2014/g, "-");

  // Parse world items into structured data
  const worldItems = result.world
    ? result.world.split("\n").map((line) => {
        const match = line.match(/^(.+?)\s*-\s*(.+)$/);
        if (!match) return null;
        const [, domain, name] = match;
        return {
          domain: domain.trim(),
          name: name.trim(),
          searchUrl: `https://www.google.com/search?q=${encodeURIComponent(name.trim() + " " + domain.trim())}`,
        };
      }).filter(Boolean)
    : [];

  // Create user (without requiring telegram_id)
  const user = await sql`
    INSERT INTO users (phone_number, three_things, taste_decode, taste_thread, taste_brief)
    VALUES (${phoneNumber || null}, ${items}, ${result.decode}, ${result.decode.split(".")[0] + "."}, ${result.brief})
    RETURNING id
  `;

  // Extract taste graph (async, non-blocking)
  extractTasteGraph(items, result.decode, user[0].id).catch((err) => {
    console.error("taste graph extraction failed:", err.message);
  });

  // Save decode as first message
  const replyText = result.world ? result.decode + "\n\n" + result.world : result.decode;
  await sql`
    INSERT INTO messages (user_id, role, content)
    VALUES (${user[0].id}, 'judes', ${replyText})
  `;

  return Response.json({
    userId: user[0].id,
    decode: result.decode,
    world: worldItems,
    brief: result.brief,
  });
}
```

**Step 2: Create the landing page**

Replace `web/app/page.js` with:

```jsx
"use client";

import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const things = input.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
    if (things.length < 3) {
      setError("three things. not two.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threeThings: things.slice(0, 3) }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "nothing right now. soon.");
        return;
      }

      setResult(data);
    } catch {
      setError("nothing right now. soon.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return <DecodeView result={result} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <p className="text-sm text-[var(--fg-dim)] mb-8">
          three things. anything - a film, a city, a texture, a feeling. whatever comes first.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="tirzah, peckham, concrete"
            className="w-full bg-transparent border-b border-[var(--fg-dim)] text-[var(--fg)] text-base py-3 px-0 focus:outline-none focus:border-[var(--fg)] placeholder:text-[var(--fg-dim)] placeholder:opacity-50"
            disabled={loading}
            autoFocus
          />
          {error && <p className="text-sm text-[var(--fg-dim)] mt-3">{error}</p>}
          {loading && <p className="text-sm text-[var(--fg-dim)] mt-3">...</p>}
        </form>
      </div>
    </main>
  );
}

function DecodeView({ result }) {
  return (
    <main className="flex min-h-screen items-start justify-center px-6 py-16">
      <div className="w-full max-w-lg space-y-10">
        {/* The decode */}
        <p className="text-base leading-relaxed">{result.decode}</p>

        {/* The world */}
        {result.world?.length > 0 && (
          <div className="space-y-2">
            {result.world.map((item, i) => (
              <div key={i} className="text-sm">
                <span className="text-[var(--fg-dim)]">{item.domain}</span>
                {" - "}
                <a
                  href={item.searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.name}
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Connect WhatsApp CTA */}
        <div className="pt-6 border-t border-[var(--fg-dim)]/20">
          <p className="text-sm text-[var(--fg-dim)] mb-4">
            when something's yours, it'll arrive on whatsapp.
          </p>
          <a
            href={`/connect?userId=${result.userId}`}
            className="text-sm"
          >
            connect
          </a>
        </div>
      </div>
    </main>
  );
}
```

**Step 3: Test**

```bash
cd /Users/pj/Documents/Code/judes/web && npm run dev
```

Open `http://localhost:3000`. Type "tirzah, peckham, concrete" and press Enter. Should see the decode and world items appear. The decode API route calls the real Claude API, so this requires `ANTHROPIC_API_KEY` in `web/.env.local`.

**Step 4: Commit**

```bash
git add web/app/page.js web/app/api/decode/route.js
git commit -m "feat: landing page with onboarding decode flow"
```

---

### Task 4: WhatsApp Cloud API — Outbound Helper

**Context:** Set up the Meta Cloud API integration for sending WhatsApp messages. This is needed for both OTP auth and find delivery. Uses the Meta Business Platform directly (no Twilio).

**Prerequisites:** The user needs a Meta Business account and WhatsApp Business phone number. For development, Meta provides a test phone number and sandbox.

**Files:**
- Create: `whatsapp.js` (root-level, shared by both web app and cron process)
- Modify: `.env.example` — add WhatsApp env vars

**Step 1: Add env vars to .env.example**

Add these lines to `.env.example`:

```
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
```

**Step 2: Create WhatsApp API helper**

Create `whatsapp.js` at project root:

```js
import "dotenv/config";

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const BASE_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}`;

/**
 * Send a text message via WhatsApp Cloud API
 */
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

/**
 * Send a template message (required for business-initiated conversations).
 * Template must be pre-approved in Meta Business Manager.
 */
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

/**
 * Send OTP code via WhatsApp text message.
 * Works when user initiates conversation first (24-hour window).
 * Falls back to template for business-initiated.
 */
export async function sendOTP(to, code) {
  return sendWhatsAppMessage(to, `your judes code: ${code}`);
}
```

**Step 3: Commit**

```bash
git add whatsapp.js .env.example
git commit -m "feat: WhatsApp Cloud API helper for outbound messages"
```

---

### Task 5: Auth — Phone Number + OTP

**Context:** Users authenticate with their phone number. Judes sends an OTP code via WhatsApp. The same phone number is used for WhatsApp find delivery. Sessions are JWT cookies.

**Files:**
- Create: `web/app/api/auth/send-otp/route.js`
- Create: `web/app/api/auth/verify-otp/route.js`
- Create: `web/lib/auth.js` (JWT session helpers)
- Create: `web/app/connect/page.js` (connect WhatsApp page)

**Step 1: Install jsonwebtoken in web/**

```bash
cd /Users/pj/Documents/Code/judes/web && npm install jsonwebtoken
```

**Step 2: Add JWT_SECRET to env**

Add to `.env.example` and `web/.env.local`:

```
JWT_SECRET=<random-32-char-string>
```

Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Step 3: Create auth helpers**

Create `web/lib/auth.js`:

```js
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "judes_session";

// In-memory OTP store (for production, use database)
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
```

**Step 4: Create send-otp API route**

Create `web/app/api/auth/send-otp/route.js`:

```js
import { generateOTP, storeOTP } from "../../../../lib/auth.js";
import { sendOTP } from "../../../../../whatsapp.js";

export async function POST(request) {
  const { phoneNumber } = await request.json();

  if (!phoneNumber || phoneNumber.length < 10) {
    return Response.json({ error: "need a phone number." }, { status: 400 });
  }

  // Normalize: strip spaces, ensure leading +
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
```

**Step 5: Create verify-otp API route**

Create `web/app/api/auth/verify-otp/route.js`:

```js
import { verifyOTP, createSession, COOKIE_NAME } from "../../../../lib/auth.js";
import { sql } from "../../../../../db/index.js";

export async function POST(request) {
  const { phoneNumber, code, userId } = await request.json();

  const normalized = phoneNumber.replace(/\s/g, "").replace(/^0/, "+44");
  const finalNumber = normalized.startsWith("+") ? normalized : "+" + normalized;

  if (!verifyOTP(finalNumber, code)) {
    return Response.json({ error: "wrong code." }, { status: 400 });
  }

  // Link phone number to user
  if (userId) {
    await sql`
      UPDATE users SET phone_number = ${finalNumber}, whatsapp_id = ${finalNumber.replace("+", "")}
      WHERE id = ${userId}
    `;
  }

  // Look up user by phone
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
```

**Step 6: Create connect page**

Create `web/app/connect/page.js`:

```jsx
"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function Connect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get("userId");

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("phone"); // phone | code | done
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }

      setStep("code");
    } catch {
      setError("nothing right now. soon.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, code, userId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }

      router.push("/timeline");
    } catch {
      setError("nothing right now. soon.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {step === "phone" && (
          <form onSubmit={sendCode}>
            <p className="text-sm text-[var(--fg-dim)] mb-6">
              your phone number. finds arrive on whatsapp.
            </p>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 7700 000000"
              className="w-full bg-transparent border-b border-[var(--fg-dim)] text-[var(--fg)] text-base py-3 px-0 focus:outline-none focus:border-[var(--fg)] placeholder:text-[var(--fg-dim)] placeholder:opacity-50"
              disabled={loading}
              autoFocus
            />
            {error && <p className="text-sm text-[var(--fg-dim)] mt-3">{error}</p>}
            {loading && <p className="text-sm text-[var(--fg-dim)] mt-3">...</p>}
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verifyCode}>
            <p className="text-sm text-[var(--fg-dim)] mb-6">
              check whatsapp. enter the code.
            </p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              className="w-full bg-transparent border-b border-[var(--fg-dim)] text-[var(--fg)] text-base py-3 px-0 focus:outline-none focus:border-[var(--fg)] tracking-[0.3em] text-center placeholder:text-[var(--fg-dim)] placeholder:opacity-50"
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
```

**Step 7: Commit**

```bash
git add web/lib/auth.js web/app/api/auth/ web/app/connect/ .env.example
git commit -m "feat: phone OTP auth via WhatsApp with JWT sessions"
```

---

### Task 6: Timeline Page

**Context:** The main authenticated view. A chat-like thread showing finds Judes sent and the user's responses. Input field only appears when there's an unanswered find. Dark, sparse, unhurried.

**Files:**
- Create: `web/app/timeline/page.js`
- Create: `web/app/api/timeline/route.js` (GET: fetch finds + messages)
- Create: `web/app/api/respond/route.js` (POST: respond to a find)

**Step 1: Create timeline API route**

Create `web/app/api/timeline/route.js`:

```js
import { getSession } from "../../../lib/auth.js";
import { sql } from "../../../../db/index.js";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const userId = session.userId;

  // Get all finds with their reaction status
  const finds = await sql`
    SELECT
      fr.id,
      fr.reasoning_sentence,
      fr.source_url,
      fr.source_type,
      fr.sent_at,
      fr.response_at,
      rs.signal_type,
      rs.raw_text AS response_text
    FROM find_records fr
    LEFT JOIN reaction_signals rs ON rs.find_id = fr.id
    WHERE fr.user_id = ${userId}
    ORDER BY fr.sent_at ASC
  `;

  // Check if there's an unanswered find (for showing input)
  const unanswered = await sql`
    SELECT fr.id, fr.reasoning_sentence, fr.source_url
    FROM find_records fr
    WHERE fr.user_id = ${userId}
      AND fr.response_at IS NULL
      AND fr.sent_at > NOW() - INTERVAL '7 days'
    ORDER BY fr.sent_at DESC LIMIT 1
  `;

  // Get the decode (first message)
  const user = await sql`
    SELECT three_things, taste_decode FROM users WHERE id = ${userId}
  `;

  return Response.json({
    finds,
    unansweredFind: unanswered[0] || null,
    threeThings: user[0]?.three_things || [],
    decode: user[0]?.taste_decode || "",
  });
}
```

**Step 2: Create respond API route**

Create `web/app/api/respond/route.js`:

```js
import { getSession } from "../../../lib/auth.js";
import { sql } from "../../../../db/index.js";
import { classifyReaction } from "../../../../reaction.js";
import { respondToReaction, extractFacts } from "../../../../conversation.js";

export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { findId, text } = await request.json();
  if (!findId || !text?.trim()) {
    return Response.json({ error: "nothing to say." }, { status: 400 });
  }

  const userId = session.userId;

  // Save user message
  await sql`
    INSERT INTO messages (user_id, role, content)
    VALUES (${userId}, 'user', ${text})
  `;

  // Classify reaction
  const reaction = await classifyReaction(findId, userId, text);

  // Extract facts silently
  extractFacts(userId, text).catch(() => {});

  // Get find for context
  const find = await sql`
    SELECT reasoning_sentence, source_url FROM find_records WHERE id = ${findId}
  `;

  // Generate one reply
  const reply = await respondToReaction(userId, text, find[0], reaction);

  if (reply) {
    await sql`
      INSERT INTO messages (user_id, role, content)
      VALUES (${userId}, 'judes', ${reply})
    `;
  }

  return Response.json({ reply: reply || null });
}
```

**Step 3: Create timeline page**

Create `web/app/timeline/page.js`:

```jsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function Timeline() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch("/api/timeline")
      .then((r) => {
        if (r.status === 401) {
          router.push("/");
          return null;
        }
        return r.json();
      })
      .then((d) => d && setData(d));
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data]);

  async function handleRespond(e) {
    e.preventDefault();
    if (!input.trim() || !data?.unansweredFind) return;

    setReplyLoading(true);
    try {
      const res = await fetch("/api/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findId: data.unansweredFind.id,
          text: input,
        }),
      });

      const result = await res.json();

      // Refresh timeline
      const refreshed = await fetch("/api/timeline").then((r) => r.json());
      setData(refreshed);
      setInput("");
    } catch {
      // silent
    } finally {
      setReplyLoading(false);
    }
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--fg-dim)]">...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen">
      {/* Timeline */}
      <div className="flex-1 max-w-2xl mx-auto px-6 py-12">
        {/* Decode header */}
        <div className="mb-12 pb-8 border-b border-[var(--fg-dim)]/10">
          <p className="text-xs text-[var(--fg-dim)] mb-2">
            {data.threeThings.join(", ")}
          </p>
          <p className="text-sm leading-relaxed">{data.decode}</p>
        </div>

        {/* Finds thread */}
        <div className="space-y-8">
          {data.finds.map((find) => (
            <div key={find.id} className="space-y-3">
              {/* Judes' find */}
              <div>
                {find.source_url && (
                  <a
                    href={find.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--fg-dim)] block mb-1"
                  >
                    {find.source_url}
                  </a>
                )}
                <p className="text-sm">{find.reasoning_sentence}</p>
                <p className="text-xs text-[var(--fg-dim)] mt-1">
                  {new Date(find.sent_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>

              {/* User's response */}
              {find.response_text && (
                <div className="pl-4 border-l border-[var(--fg-dim)]/20">
                  <p className="text-sm text-[var(--fg-dim)]">
                    {find.response_text}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Response input - only shown when there's an unanswered find */}
        {data.unansweredFind && (
          <form onSubmit={handleRespond} className="mt-12 pt-6 border-t border-[var(--fg-dim)]/10">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder=""
              className="w-full bg-transparent border-b border-[var(--fg-dim)] text-[var(--fg)] text-sm py-2 px-0 focus:outline-none focus:border-[var(--fg)]"
              disabled={replyLoading}
              autoFocus
            />
            {replyLoading && (
              <p className="text-xs text-[var(--fg-dim)] mt-2">...</p>
            )}
          </form>
        )}

        <div ref={bottomRef} />
      </div>
    </main>
  );
}
```

**Step 4: Commit**

```bash
git add web/app/timeline/ web/app/api/timeline/ web/app/api/respond/
git commit -m "feat: timeline page with find thread and respond-to-find"
```

---

### Task 7: Taste Profile Side Panel

**Context:** A side panel (or separate route) showing the user's decode, three things, world items, brief, and past find history. Read-only. No settings, no toggles.

**Files:**
- Create: `web/app/api/profile/route.js`
- Modify: `web/app/timeline/page.js` (add side panel)

**Step 1: Create profile API route**

Create `web/app/api/profile/route.js`:

```js
import { getSession } from "../../../lib/auth.js";
import { sql } from "../../../../db/index.js";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const userId = session.userId;

  const user = await sql`
    SELECT three_things, taste_decode, taste_thread, taste_brief
    FROM users WHERE id = ${userId}
  `;

  if (!user.length) {
    return Response.json({ error: "no user" }, { status: 404 });
  }

  const profile = await sql`
    SELECT onboarding_inputs, staleness_score, total_finds_sent, total_responses, response_ratio
    FROM user_taste_profiles WHERE user_id = ${userId}
  `;

  // Get the world items from the first judes message (decode output)
  const firstMessage = await sql`
    SELECT content FROM messages
    WHERE user_id = ${userId} AND role = 'judes'
    ORDER BY created_at ASC LIMIT 1
  `;

  // Parse world items from the message
  let worldItems = [];
  if (firstMessage.length) {
    const parts = firstMessage[0].content.split("\n\n");
    if (parts.length > 1) {
      worldItems = parts[1].split("\n").map((line) => {
        const match = line.match(/^(.+?)\s*-\s*(.+)$/);
        if (!match) return null;
        const [, domain, name] = match;
        return {
          domain: domain.trim(),
          name: name.trim(),
          searchUrl: `https://www.google.com/search?q=${encodeURIComponent(name.trim() + " " + domain.trim())}`,
        };
      }).filter(Boolean);
    }
  }

  return Response.json({
    threeThings: user[0].three_things,
    decode: user[0].taste_decode,
    thread: user[0].taste_thread,
    brief: user[0].taste_brief,
    world: worldItems,
    stats: profile[0] ? {
      findsSent: profile[0].total_finds_sent,
      responses: profile[0].total_responses,
    } : null,
  });
}
```

**Step 2: Add side panel to timeline page**

Modify `web/app/timeline/page.js` — add a profile panel that toggles open. Add a `profileOpen` state and a button to toggle it. Add a `ProfilePanel` component that fetches `/api/profile` and displays the data.

Add after the timeline `<div>`:

```jsx
{/* Profile side panel */}
{profileOpen && (
  <aside className="w-80 border-l border-[var(--fg-dim)]/10 px-6 py-12 shrink-0">
    <ProfilePanel />
  </aside>
)}
```

Add a toggle button in the timeline header area. The `ProfilePanel` component:

```jsx
function ProfilePanel() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setProfile);
  }, []);

  if (!profile) return <p className="text-xs text-[var(--fg-dim)]">...</p>;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-[var(--fg-dim)] mb-2">three things</p>
        <p className="text-sm">{profile.threeThings.join(", ")}</p>
      </div>

      <div>
        <p className="text-xs text-[var(--fg-dim)] mb-2">decode</p>
        <p className="text-sm leading-relaxed">{profile.decode}</p>
      </div>

      {profile.world?.length > 0 && (
        <div>
          <p className="text-xs text-[var(--fg-dim)] mb-2">your world</p>
          <div className="space-y-1">
            {profile.world.map((item, i) => (
              <div key={i} className="text-sm">
                <span className="text-[var(--fg-dim)]">{item.domain}</span>
                {" - "}
                <a href={item.searchUrl} target="_blank" rel="noopener noreferrer">
                  {item.name}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.brief && (
        <div>
          <p className="text-xs text-[var(--fg-dim)] mb-2">brief</p>
          <p className="text-sm leading-relaxed">{profile.brief}</p>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add web/app/api/profile/ web/app/timeline/
git commit -m "feat: taste profile side panel on timeline view"
```

---

### Task 8: WhatsApp Webhook — Inbound Messages

**Context:** Meta Cloud API sends incoming WhatsApp messages to a webhook URL. We need an API route that receives these, identifies the user by phone number, and processes the message through the same reaction engine used by the timeline respond route.

**Files:**
- Create: `web/app/api/whatsapp/webhook/route.js`

**Step 1: Create webhook route**

Create `web/app/api/whatsapp/webhook/route.js`:

```js
import { sql } from "../../../../../db/index.js";
import { classifyReaction } from "../../../../../reaction.js";
import { respondToReaction, extractFacts } from "../../../../../conversation.js";
import { sendWhatsAppMessage } from "../../../../../whatsapp.js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// GET: Meta webhook verification (one-time setup)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("forbidden", { status: 403 });
}

// POST: Incoming messages from WhatsApp
export async function POST(request) {
  const body = await request.json();

  // Meta sends various webhook types; we only care about messages
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value?.messages?.length) {
    // Not a message event (could be status update, etc.)
    return Response.json({ status: "ok" });
  }

  const message = value.messages[0];
  const from = message.from; // phone number without +
  const text = message.text?.body;

  if (!text) {
    // Non-text message (image, audio, etc.) — ignore for now
    return Response.json({ status: "ok" });
  }

  // Find user by WhatsApp ID (phone number without +)
  const user = await sql`
    SELECT id FROM users WHERE whatsapp_id = ${from}
  `;

  if (!user.length) {
    // Unknown user — they need to onboard on the web first
    return Response.json({ status: "ok" });
  }

  const userId = user[0].id;

  // Check for recent unanswered find
  const recentFind = await sql`
    SELECT fr.id, fr.reasoning_sentence, fr.source_url
    FROM find_records fr
    WHERE fr.user_id = ${userId}
      AND fr.response_at IS NULL
      AND fr.sent_at > NOW() - INTERVAL '7 days'
    ORDER BY fr.sent_at DESC LIMIT 1
  `;

  if (recentFind.length) {
    // Responding to a find
    const reaction = await classifyReaction(recentFind[0].id, userId, text);
    extractFacts(userId, text).catch(() => {});

    const reply = await respondToReaction(userId, text, recentFind[0], reaction);
    if (reply) {
      await sql`
        INSERT INTO messages (user_id, role, content)
        VALUES (${userId}, 'judes', ${reply})
      `;
      await sendWhatsAppMessage(from, reply);
    }
  } else {
    // Not responding to a find — save message, extract facts, stay quiet
    await sql`
      INSERT INTO messages (user_id, role, content)
      VALUES (${userId}, 'user', ${text})
    `;
    await sql`
      UPDATE users SET last_message_at = NOW() WHERE id = ${userId}
    `;
    extractFacts(userId, text).catch(() => {});
  }

  return Response.json({ status: "ok" });
}
```

**Step 2: Commit**

```bash
git add web/app/api/whatsapp/
git commit -m "feat: WhatsApp webhook for inbound messages with reaction pipeline"
```

---

### Task 9: Wire Find Pipeline to WhatsApp

**Context:** The cron process in `index.js` currently sends finds via `bot.api.sendMessage(result.telegramId, ...)`. Replace with WhatsApp outbound. Also update `initiate.js` to return phone numbers instead of Telegram IDs.

**Files:**
- Modify: `initiate.js` — return `whatsappId` instead of `telegramId`
- Modify: `index.js` — replace Grammy bot with WhatsApp send, remove bot import

**Step 1: Update initiate.js**

In `initiate.js`, change all references from `telegramId` / `telegram_id` to `whatsappId` / `whatsapp_id`:

- Line 47: change `telegramId: user.telegram_id` to `whatsappId: user.whatsapp_id`
- Line 54: same change
- Line 85-92: change `telegramId: user.telegram_id` to `whatsappId: user.whatsapp_id`

Also update the eligible users query (line 2-13) to require `whatsapp_id IS NOT NULL` instead of relying on telegram_id:

```sql
SELECT u.*, utp.onboarding_inputs, utp.taste_vector, utp.staleness_score,
       utp.total_finds_sent, utp.last_find_at
FROM users u
JOIN user_taste_profiles utp ON utp.user_id = u.id
WHERE (utp.last_find_at IS NULL OR utp.last_find_at < NOW() - INTERVAL '20 hours')
  AND u.whatsapp_id IS NOT NULL
```

**Step 2: Update index.js**

Replace the Grammy bot import and send logic:

```js
import { generateFinds } from "./initiate.js";
import { warmup } from "./memory/embeddings.js";
import { sweepBriefs } from "./brief.js";
import { sweepChapters } from "./chapters.js";
import { computeConnections } from "./taste-graph.js";
import { checkSilenceSignals } from "./reaction.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import cron from "node-cron";
import "dotenv/config";

warmup();

console.log("judes cron process is awake.");

// Find engine — runs every 4 hours between 9am-10pm UTC
cron.schedule("0 9,13,17,21 * * *", async () => {
  console.log("looking for finds...");

  try {
    const results = await generateFinds();

    for (const result of results) {
      if (result.action === "send" && result.whatsappId) {
        await sendWhatsAppMessage(result.whatsappId, result.message);
        console.log(`find sent to ${result.whatsappId}: ${result.candidate}`);
      }
    }

    const sent = results.filter((r) => r.action === "send").length;
    const silent = results.filter((r) => r.action === "silence").length;
    console.log(`find round: ${sent} sent, ${silent} silent`);
  } catch (err) {
    console.error("find generation failed:", err.message);
  }
});

// ... rest of crons stay the same (silence sweep, briefs, chapters, taste graph)
```

Remove the Grammy bot import, the `bot.start()` call, and the `warmupWhisper()` call (whisper was for Telegram voice messages).

**Step 3: Commit**

```bash
git add initiate.js index.js
git commit -m "feat: wire find pipeline to WhatsApp, remove Telegram bot"
```

---

### Task 10: Cleanup — Remove Telegram Dependencies

**Context:** Remove Grammy, bot.js, and all Telegram-specific code. Update package.json.

**Files:**
- Delete: `bot.js`
- Delete: `media.js` (Telegram-specific media handlers)
- Modify: `package.json` — remove `grammy` dependency
- Modify: `index.js` — remove any remaining Telegram references
- Modify: `.env.example` — remove `TELEGRAM_BOT_TOKEN`
- Modify: `docs/STACK.md` — update architecture
- Modify: `docs/DECISIONS.md` — log the platform pivot

**Step 1: Remove files**

```bash
cd /Users/pj/Documents/Code/judes && rm bot.js media.js
```

**Step 2: Uninstall grammy**

```bash
cd /Users/pj/Documents/Code/judes && npm uninstall grammy
```

**Step 3: Remove `open` package** (was only used by spotify-auth.js)

Keep `open` if `auth/spotify-auth.js` is still needed. Otherwise remove it too.

**Step 4: Update .env.example**

Remove `TELEGRAM_BOT_TOKEN=` line. Add if not already present:

```
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
JWT_SECRET=
```

**Step 5: Update docs/STACK.md**

Update the architecture diagram to show:

```
User --> judes.ai (Next.js on Vercel)
           |-- Onboarding, timeline, profile
           |-- WhatsApp webhook (inbound)
                        |
                   Claude API (decode, reasoning, taste filter, reaction classifier)
                        |
                   Neon Postgres + pgvector
                        |
               Source Integrations (Spotify)
                        |
               Cron Process (evaluate, filter, send via WhatsApp)
```

Replace all references to "Telegram" and "Grammy" with "WhatsApp" and "Meta Cloud API".

Update the Components table:
- Telegram bot / Grammy → WhatsApp webhook + Meta Cloud API
- Add: Web app / Next.js on Vercel

Update the judes.ai section — it's now a full Next.js app, not a static page.

**Step 6: Update docs/DECISIONS.md**

Add under `## 2026-03-06`:

```
- Platform pivot: Telegram replaced with WhatsApp (Meta Cloud API direct) + Next.js web app at judes.ai. Reason: Telegram is developer-focused, target user (Naomi) doesn't have it.
- Web app is the onboarding surface. Three things + decode happen on judes.ai, not in chat.
- WhatsApp is delivery only. Finds arrive as WhatsApp messages. Users can respond on WhatsApp or on the web timeline.
- Auth is phone number + OTP sent via WhatsApp. No email. No password.
- No Twilio. Meta Cloud API direct. Free tier: 1,000 conversations/month.
- Next.js 14 (App Router) + Tailwind CSS. Deployed to Vercel.
- The web app is NOT a chatbot. No free conversation. Input field only shows when there's an unanswered find.
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: remove Telegram, update docs for WhatsApp + web app pivot"
```

---

### Task 11: Vercel Deployment

**Context:** Deploy the Next.js web app to Vercel. The `web/` subdirectory is the deployment root. The cron process runs separately (not on Vercel).

**Files:**
- Create: `web/vercel.json` (optional — Vercel auto-detects Next.js)

**Step 1: Initialize Vercel**

```bash
cd /Users/pj/Documents/Code/judes/web && npx vercel
```

Follow prompts:
- Link to existing project or create new
- Framework: Next.js (auto-detected)
- Root directory: `web/` if deploying from repo root, or `.` if deploying from `web/`

**Step 2: Set environment variables**

In Vercel dashboard or via CLI:

```bash
cd /Users/pj/Documents/Code/judes/web
npx vercel env add DATABASE_URL
npx vercel env add ANTHROPIC_API_KEY
npx vercel env add SPOTIFY_CLIENT_ID
npx vercel env add SPOTIFY_CLIENT_SECRET
npx vercel env add SPOTIFY_REFRESH_TOKEN
npx vercel env add WHATSAPP_TOKEN
npx vercel env add WHATSAPP_PHONE_NUMBER_ID
npx vercel env add WHATSAPP_VERIFY_TOKEN
npx vercel env add JWT_SECRET
```

**Step 3: Deploy**

```bash
cd /Users/pj/Documents/Code/judes/web && npx vercel --prod
```

**Step 4: Set up WhatsApp webhook URL**

In Meta Business Manager → WhatsApp → Configuration → Webhook:
- Callback URL: `https://your-vercel-domain.vercel.app/api/whatsapp/webhook`
- Verify token: same as `WHATSAPP_VERIFY_TOKEN` env var
- Subscribe to: `messages`

**Step 5: Commit vercel config if any was created**

```bash
git add web/vercel.json web/.vercel/ 2>/dev/null; git commit -m "chore: vercel deployment config" 2>/dev/null || true
```
