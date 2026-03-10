"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

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

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-[var(--fg-dim)]">...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-16 md:py-24">
      <a
        href="/connect"
        className="fixed top-6 right-6 text-xs text-[var(--fg-dim)] hover:text-[var(--fg)] no-underline"
      >
        sign in
      </a>

      <div className="max-w-lg mx-auto space-y-24">
        {/* Hero */}
        <section className="space-y-6">
          <h1 className="text-base leading-relaxed">
            a machine for feeling uniquely understood through culture.
          </h1>
          <p className="text-sm text-[var(--fg-dim)] leading-relaxed">
            judes remembers your pattern, spots hidden affinities,
            and sends one rare find only when it is worth it.
          </p>
          <a
            href="/decode"
            className="inline-block text-sm text-[var(--fg)] no-underline border-b border-[var(--fg-dim)] pb-0.5 hover:border-[var(--fg)]"
          >
            get decoded
          </a>
        </section>

        {/* How it works */}
        <section className="space-y-6">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[var(--fg-dim)] mb-1">1</p>
              <p className="text-sm leading-relaxed">
                give judes three signals.
              </p>
              <p className="text-xs text-[var(--fg-dim)] mt-1">
                songs, films, places, images, books, moods, references. anything with cultural pull.
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--fg-dim)] mb-1">2</p>
              <p className="text-sm leading-relaxed">
                get decoded.
              </p>
              <p className="text-xs text-[var(--fg-dim)] mt-1">
                judes writes a short reading of your taste, your patterns, and your cultural pull.
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--fg-dim)] mb-1">3</p>
              <p className="text-sm leading-relaxed">
                receive finds.
              </p>
              <p className="text-xs text-[var(--fg-dim)] mt-1">
                when judes finds something worth sending, it emails you one thing with one sentence explaining why it is yours.
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--fg-dim)] mb-1">4</p>
              <p className="text-sm leading-relaxed">
                get sharper over time.
              </p>
              <p className="text-xs text-[var(--fg-dim)] mt-1">
                every interaction helps judes understand your taste more deeply.
              </p>
            </div>
          </div>
        </section>

        {/* Why it's different */}
        <section className="space-y-3">
          <p className="text-sm leading-relaxed">
            most systems recommend by similarity. judes works by cultural inference.
          </p>
          <p className="text-sm text-[var(--fg-dim)] leading-relaxed">
            it looks past surface matches and finds the deeper thread across what you love.
            that is why the right find feels surprising and inevitable at once.
          </p>
        </section>

        {/* Silence */}
        <section className="space-y-3">
          <p className="text-sm leading-relaxed">
            silence is part of the product.
          </p>
          <p className="text-sm text-[var(--fg-dim)] leading-relaxed">
            judes does not send because a schedule says it should.
            it sends when it has something worth sending.
            fewer emails. fewer interruptions. a higher bar for every find.
          </p>
        </section>

        {/* Final CTA */}
        <section className="space-y-4">
          <p className="text-sm text-[var(--fg-dim)]">
            not more recommendations. better ones.
          </p>
          <a
            href="/decode"
            className="inline-block text-sm text-[var(--fg)] no-underline border-b border-[var(--fg-dim)] pb-0.5 hover:border-[var(--fg)]"
          >
            get your taste decoded
          </a>
        </section>
      </div>
    </main>
  );
}
