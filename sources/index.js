import { generateCandidates as spotifyCandidates } from "./spotify.js";
import { generateCandidates as youtubeCandidates } from "./youtube.js";
import { generateCandidates as tmdbCandidates } from "./tmdb.js";
import { generateCandidates as crossUserCandidates } from "./cross-user.js";

export async function getAllCandidates(tasteProfile, options = {}) {
  const { avoidDomain } = options;

  const [spotify, youtube, tmdb, crossUser] = await Promise.allSettled([
    spotifyCandidates(tasteProfile),
    youtubeCandidates(tasteProfile),
    tmdbCandidates(tasteProfile),
    crossUserCandidates(tasteProfile),
  ]);

  const all = [
    ...(spotify.status === "fulfilled" ? spotify.value : []),
    ...(youtube.status === "fulfilled" ? youtube.value : []),
    ...(tmdb.status === "fulfilled" ? tmdb.value : []),
    ...(crossUser.status === "fulfilled" ? crossUser.value : []),
  ];

  // Add domain field to Spotify candidates (they don't have it yet)
  for (const c of all) {
    if (!c.domain) c.domain = "music";
    if (!c.sourceType) c.sourceType = "spotify";
  }

  // If we should avoid a domain, sort those to the end
  if (avoidDomain) {
    all.sort((a, b) => {
      if (a.domain === avoidDomain && b.domain !== avoidDomain) return 1;
      if (a.domain !== avoidDomain && b.domain === avoidDomain) return -1;
      return 0;
    });
  }

  return all;
}
