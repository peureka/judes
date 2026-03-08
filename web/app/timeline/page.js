"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ProfilePanel({ onClose }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then(setProfile);
  }, []);

  if (!profile) return <p className="text-xs text-[var(--fg-dim)]">...</p>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <p className="text-xs text-[var(--fg-dim)]">profile</p>
        <button
          onClick={onClose}
          className="text-xs text-[var(--fg-dim)] hover:text-[var(--fg)] md:hidden"
        >
          close
        </button>
      </div>

      <div>
        <p className="text-xs text-[var(--fg-dim)] mb-2">three things</p>
        <p className="text-sm">{profile.threeThings?.join(", ")}</p>
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

function sourceLabel(find) {
  if (find.candidate_name) return find.candidate_name;
  if (find.source_type === "spotify") return "listen";
  if (find.source_url) return "open";
  return null;
}

function TastePromptSection({ tastePrompt, history }) {
  const [showingVersion, setShowingVersion] = useState(null);

  if (!tastePrompt) return null;

  const allVersions = [tastePrompt, ...(history || [])];
  const displayed = showingVersion !== null
    ? allVersions.find((v) => v.version === showingVersion)
    : tastePrompt;

  return (
    <div className="mb-12 pb-8 border-b border-[var(--fg-dim)]/10">
      <p className="text-sm leading-relaxed whitespace-pre-line">
        {displayed?.prompt_text}
      </p>
      {allVersions.length > 1 && (
        <div className="flex gap-2 mt-3">
          {allVersions.map((v) => (
            <button
              key={v.version}
              onClick={() => setShowingVersion(v.version === tastePrompt.version && showingVersion === null ? null : v.version)}
              className={`text-xs ${
                (showingVersion === null && v.version === tastePrompt.version) || showingVersion === v.version
                  ? "text-[var(--fg)]"
                  : "text-[var(--fg-dim)] hover:text-[var(--fg)]"
              }`}
            >
              v{v.version}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Timeline() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetFindId = searchParams.get("find");
  const [data, setData] = useState(null);
  const [input, setInput] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const bottomRef = useRef(null);
  const findRef = useRef(null);

  useEffect(() => {
    fetch("/api/timeline")
      .then((r) => {
        if (r.status === 401) { router.push("/"); return null; }
        return r.json();
      })
      .then((d) => d && setData(d));
  }, [router]);

  useEffect(() => {
    if (targetFindId && findRef.current) {
      findRef.current.scrollIntoView({ behavior: "smooth" });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [data, targetFindId]);

  async function handleRespond(e) {
    e.preventDefault();
    if (!input.trim() || !data?.unansweredFind) return;

    setReplyLoading(true);
    try {
      await fetch("/api/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findId: data.unansweredFind.id, text: input }),
      });

      const refreshed = await fetch("/api/timeline").then((r) => r.json());
      setData(refreshed);
      setInput("");
    } catch {
      // silent
    } finally {
      setReplyLoading(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--fg-dim)]">...</p>
      </main>
    );
  }

  const hasFinds = data.finds.length > 0;

  return (
    <main className="flex min-h-screen relative">
      <div className="flex-1 max-w-2xl mx-auto px-6 py-12">
        <div className="flex justify-end gap-4 mb-4">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="text-xs text-[var(--fg-dim)] hover:text-[var(--fg)]"
          >
            {profileOpen ? "close" : "profile"}
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs text-[var(--fg-dim)] hover:text-[var(--fg)]"
          >
            sign out
          </button>
        </div>

        <div className="mb-12 pb-8 border-b border-[var(--fg-dim)]/10">
          <p className="text-xs text-[var(--fg-dim)] mb-2">
            {data.threeThings.join(", ")}
          </p>
          <p className="text-sm leading-relaxed">{data.decode}</p>
        </div>

        <TastePromptSection
          tastePrompt={data.tastePrompt}
          history={data.tastePromptHistory}
        />

        {hasFinds ? (
          <div className="space-y-8">
            {data.finds.map((find) => (
              <div key={find.id} ref={find.id.toString() === targetFindId ? findRef : null} className="space-y-3">
                <div>
                  {find.source_url && (
                    <a
                      href={find.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--fg-dim)] block mb-1"
                    >
                      {sourceLabel(find)}
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

                {find.response_text && (
                  <div className="pl-4 border-l border-[var(--fg-dim)]/20">
                    <p className="text-sm text-[var(--fg-dim)]">{find.response_text}</p>
                  </div>
                )}

                {find.judes_reply && (
                  <div className="pl-4 border-l border-[var(--fg-dim)]/20">
                    <p className="text-sm">{find.judes_reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--fg-dim)]">
            when something is yours, it will arrive here.
          </p>
        )}

        {data.unansweredFind && (
          <form onSubmit={handleRespond} className="mt-12 pt-6 border-t border-[var(--fg-dim)]/10">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-transparent border-b border-[var(--fg-dim)] text-[var(--fg)] text-sm py-2 px-0 focus:outline-none focus:border-[var(--fg)]"
              disabled={replyLoading}
              autoFocus
            />
            {replyLoading && <p className="text-xs text-[var(--fg-dim)] mt-2">...</p>}
          </form>
        )}

        <div ref={bottomRef} />
      </div>

      {profileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-10 md:hidden"
            onClick={() => setProfileOpen(false)}
          />
          <aside className="fixed right-0 top-0 h-full w-80 bg-[var(--bg)] border-l border-[var(--fg-dim)]/10 px-6 py-12 overflow-y-auto z-20 md:static md:w-80 md:z-auto">
            <ProfilePanel onClose={() => setProfileOpen(false)} />
          </aside>
        </>
      )}
    </main>
  );
}

export default function TimelinePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-sm text-[var(--fg-dim)]">...</p></main>}>
      <Timeline />
    </Suspense>
  );
}
