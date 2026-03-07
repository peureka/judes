"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(true);

  const authError = searchParams.get("error");

  useEffect(() => {
    fetch("/api/timeline")
      .then((r) => {
        if (r.ok) {
          router.replace("/timeline");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

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

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-[var(--fg-dim)]">...</p>
      </main>
    );
  }

  if (result) {
    return <DecodeView result={result} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <a
        href="/connect"
        className="fixed top-6 right-6 text-xs text-[var(--fg-dim)] hover:text-[var(--fg)] no-underline"
      >
        sign in
      </a>
      <div className="w-full max-w-lg">
        {authError && (
          <p className="text-sm text-[var(--fg-dim)] mb-6">
            {authError === "expired" ? "link expired. try again." : "something went wrong. try again."}
          </p>
        )}
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
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState(null);

  async function handleEmail(e) {
    e.preventDefault();
    setEmailError(null);

    if (!email.trim()) return;

    try {
      const authRes = await fetch("/api/auth/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!authRes.ok) {
        setEmailError("try again.");
        return;
      }

      await fetch("/api/decode/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: result.userId, email: email.trim() }),
      });

      setSent(true);
    } catch {
      setEmailError("try again.");
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
            <div className="space-y-3">
              <p className="text-sm text-[var(--fg-dim)]">
                check your email for a sign-in link.
              </p>
              <p className="text-sm text-[var(--fg-dim)]">
                finds will arrive there too, when something is yours.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--fg-dim)] mb-4">
                your email. finds arrive there.
              </p>
              <form onSubmit={handleEmail}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-transparent border-b border-[var(--fg-dim)] text-[var(--fg)] text-base py-3 px-0 focus:outline-none focus:border-[var(--fg)] placeholder:text-[var(--fg-dim)] placeholder:opacity-50"
                  autoFocus
                />
                {emailError && <p className="text-sm text-[var(--fg-dim)] mt-3">{emailError}</p>}
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-sm text-[var(--fg-dim)]">...</p></main>}>
      <Home />
    </Suspense>
  );
}
