"use client";

import { useState, Suspense } from "react";

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
      <a
        href="/"
        className="fixed top-6 left-6 text-xs text-[var(--fg-dim)] hover:text-[var(--fg)] no-underline"
      >
        judes
      </a>
      <div className="w-full max-w-sm">
        {sent ? (
          <p className="text-sm text-[var(--fg-dim)]">check your email.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="text-sm text-[var(--fg-dim)] mb-6">
              your email. we'll send a link.
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
