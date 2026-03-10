import "dotenv/config";

const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";

async function tmdbGet(path, params = {}) {
  if (!API_KEY) return null;
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[tmdb] GET ${path} failed: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[tmdb] GET ${path} error:`, err.message);
    return null;
  }
}

function simplifyMovie(m) {
  if (!m) return null;
  return {
    id: `tmdb-${m.id}`,
    name: m.title || m.original_title || "",
    year: m.release_date ? m.release_date.slice(0, 4) : null,
    overview: (m.overview || "").slice(0, 200),
    tmdbId: m.id,
    tmdbUrl: `https://www.themoviedb.org/movie/${m.id}`,
    popularity: m.popularity || 0,
    voteAverage: m.vote_average || 0,
    genreIds: m.genre_ids || [],
    posterUrl: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    domain: "film",
    sourceType: "tmdb",
  };
}

async function searchMovies(query, page = 1) {
  const data = await tmdbGet("/search/movie", {
    query,
    page,
    include_adult: false,
    language: "en-US",
  });
  if (!data?.results) return [];
  return data.results.map(simplifyMovie).filter(Boolean);
}

async function discoverMovies(params = {}) {
  const data = await tmdbGet("/discover/movie", {
    language: "en-US",
    sort_by: "vote_average.desc",
    "vote_count.gte": 50,
    "vote_average.gte": 7,
    include_adult: false,
    ...params,
  });
  if (!data?.results) return [];
  return data.results.map(simplifyMovie).filter(Boolean);
}

async function getMovieCredits(movieId) {
  const data = await tmdbGet(`/movie/${movieId}/credits`);
  if (!data) return { director: null, cast: [] };
  const director = data.crew?.find((c) => c.job === "Director");
  const cast = (data.cast || []).slice(0, 5).map((c) => c.name);
  return { director: director?.name || null, cast };
}

async function searchPerson(name) {
  const data = await tmdbGet("/search/person", { query: name });
  if (!data?.results?.length) return null;
  return data.results[0];
}

async function getPersonMovies(personId) {
  const data = await tmdbGet(`/person/${personId}/movie_credits`);
  if (!data) return [];
  // Combine directing and notable acting roles
  const directed = (data.crew || [])
    .filter((c) => c.job === "Director")
    .map(simplifyMovie)
    .filter(Boolean);
  const acted = (data.cast || [])
    .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    .slice(0, 10)
    .map(simplifyMovie)
    .filter(Boolean);
  return [...directed, ...acted];
}

export async function generateCandidates(tasteProfile) {
  if (!API_KEY) return [];

  const { onboarding_inputs, brief, edges } = tasteProfile || {};
  const seen = new Set();
  const candidates = [];

  function addUnique(movies) {
    for (const m of movies) {
      if (m && !seen.has(m.id)) {
        seen.add(m.id);
        candidates.push(m);
      }
    }
  }

  // Strategy 1: Brief keywords — discover films matching themes
  if (brief) {
    const keywords = brief
      .split(/[.,;:!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3)
      .slice(0, 3);

    const briefResults = await Promise.all(
      keywords.map((kw) => searchMovies(kw))
    );
    for (const movies of briefResults) {
      addUnique(movies);
    }
  }

  // Strategy 2: Onboarding inputs — find directors/actors, get their lesser-known work
  if (onboarding_inputs && Array.isArray(onboarding_inputs)) {
    for (const input of onboarding_inputs.slice(0, 3)) {
      // Try as person name first
      const person = await searchPerson(input).catch(() => null);
      if (person) {
        const movies = await getPersonMovies(person.id).catch(() => []);
        addUnique(movies);
        continue;
      }
      // Fall back to movie search
      const movies = await searchMovies(input).catch(() => []);
      addUnique(movies);
    }
  }

  // Strategy 3: Edge reasoning — search for films matching taste edge language
  if (edges && Array.isArray(edges)) {
    const edgeQueries = edges
      .filter((e) => e.reasoning)
      .map((e) => e.reasoning)
      .slice(0, 3);

    const edgeResults = await Promise.all(
      edgeQueries.map((q) => searchMovies(q))
    );
    for (const movies of edgeResults) {
      addUnique(movies);
    }
  }

  // Filter: skip anything with TMDB popularity > 30 and released in last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  return candidates.filter((c) => {
    if (c.popularity > 30) return false;
    if (c.year) {
      const releaseDate = new Date(c.year);
      if (releaseDate > threeMonthsAgo) return false;
    }
    return true;
  });
}
