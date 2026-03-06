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
          <p className="text-sm text-[var(--fg-dim)] mb-4">
            when something's yours, it'll arrive on whatsapp.
          </p>
          <a href={`/connect?userId=${result.userId}`} className="text-sm">
            connect
          </a>
        </div>
      </div>
    </main>
  );
}
