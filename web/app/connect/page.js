"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

function ConnectForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get("userId");

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("phone");
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
      if (!res.ok) { setError(data.error); return; }
      setStep("code");
    } catch { setError("nothing right now. soon."); }
    finally { setLoading(false); }
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
      if (!res.ok) { setError(data.error); return; }
      router.push("/timeline");
    } catch { setError("nothing right now. soon."); }
    finally { setLoading(false); }
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

export default function Connect() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-sm text-[var(--fg-dim)]">...</p></main>}>
      <ConnectForm />
    </Suspense>
  );
}
