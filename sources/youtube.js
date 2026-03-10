import "dotenv/config";

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

async function youtubeGet(path, params = {}) {
  if (!API_KEY) return null;
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("key", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[youtube] GET ${path} failed: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[youtube] GET ${path} error:`, err.message);
    return null;
  }
}

function simplifyVideo(item) {
  if (!item?.id?.videoId && !item?.id) return null;
  const videoId = typeof item.id === "string" ? item.id : item.id.videoId;
  const s = item.snippet || {};
  return {
    id: videoId,
    name: s.title || "",
    creator: s.channelTitle || "",
    description: (s.description || "").slice(0, 200),
    publishedAt: s.publishedAt || null,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: s.thumbnails?.high?.url || s.thumbnails?.default?.url || null,
    domain: "film",
    sourceType: "youtube",
  };
}

async function searchVideos(query, maxResults = 10) {
  const data = await youtubeGet("/search", {
    part: "snippet",
    q: query,
    type: "video",
    maxResults,
    videoDuration: "medium",
    relevanceLanguage: "en",
    safeSearch: "none",
  });
  if (!data?.items) return [];
  return data.items.map(simplifyVideo).filter(Boolean);
}

async function getVideoStats(videoIds) {
  if (!videoIds.length) return new Map();
  const data = await youtubeGet("/videos", {
    part: "statistics",
    id: videoIds.join(","),
  });
  if (!data?.items) return new Map();
  const map = new Map();
  for (const item of data.items) {
    map.set(item.id, {
      viewCount: parseInt(item.statistics?.viewCount || "0"),
      likeCount: parseInt(item.statistics?.likeCount || "0"),
    });
  }
  return map;
}

export async function generateCandidates(tasteProfile) {
  if (!API_KEY) return [];

  const { onboarding_inputs, brief, edges } = tasteProfile || {};
  const seen = new Set();
  const candidates = [];

  function addUnique(videos) {
    for (const v of videos) {
      if (v && !seen.has(v.id)) {
        seen.add(v.id);
        candidates.push(v);
      }
    }
  }

  // Strategy 1: Brief keywords — film essays, visual content
  if (brief) {
    const keywords = brief
      .split(/[.,;:!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3)
      .slice(0, 3);

    const briefResults = await Promise.all(
      keywords.map((kw) => searchVideos(`${kw} film essay OR short film OR visual essay`, 5))
    );
    for (const videos of briefResults) {
      addUnique(videos);
    }
  }

  // Strategy 2: Onboarding inputs — find related visual content
  if (onboarding_inputs && Array.isArray(onboarding_inputs)) {
    for (const input of onboarding_inputs.slice(0, 3)) {
      const videos = await searchVideos(`${input} documentary OR essay OR architecture`, 5).catch(() => []);
      addUnique(videos);
    }
  }

  // Strategy 3: Edge reasoning text — visual content matching taste edges
  if (edges && Array.isArray(edges)) {
    const edgeQueries = edges
      .filter((e) => e.reasoning)
      .map((e) => e.reasoning)
      .slice(0, 3);

    const edgeResults = await Promise.all(
      edgeQueries.map((q) => searchVideos(`${q} film OR visual`, 5))
    );
    for (const videos of edgeResults) {
      addUnique(videos);
    }
  }

  // Filter by view count — skip anything with > 500K views
  if (candidates.length > 0) {
    const ids = candidates.map((c) => c.id);
    const stats = await getVideoStats(ids);

    return candidates.filter((c) => {
      const s = stats.get(c.id);
      if (!s) return true; // keep if stats unavailable
      c.viewCount = s.viewCount;
      return s.viewCount < 500000;
    });
  }

  return candidates;
}
