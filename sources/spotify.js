import "dotenv/config";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const BASE_URL = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const MARKET = "GB";

// --- Token management ---

let tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      console.error(`[spotify] token request failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return tokenCache.accessToken;
  } catch (err) {
    console.error("[spotify] token request error:", err.message);
    return null;
  }
}

// --- HTTP helper ---

async function spotifyGet(path, params = {}) {
  const token = await getAccessToken();
  if (!token) return null;

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error(`[spotify] GET ${path} failed: ${res.status} ${res.statusText}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`[spotify] GET ${path} error:`, err.message);
    return null;
  }
}

// --- Simplifiers ---

function simplifyTrack(t) {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    artist: (t.artists || []).map((a) => a.name).join(", "),
    artistIds: (t.artists || []).map((a) => a.id),
    album: t.album?.name || null,
    releaseDate: t.album?.release_date || null,
    spotifyUrl: t.external_urls?.spotify || null,
    popularity: t.popularity ?? null,
    previewUrl: t.preview_url || null,
    durationMs: t.duration_ms || null,
  };
}

function simplifyAlbum(a) {
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    artist: (a.artists || []).map((ar) => ar.name).join(", "),
    artistIds: (a.artists || []).map((ar) => ar.id),
    releaseDate: a.release_date || null,
    spotifyUrl: a.external_urls?.spotify || null,
    popularity: a.popularity ?? null,
    totalTracks: a.total_tracks || null,
    imageUrl: a.images?.[0]?.url || null,
  };
}

function simplifyArtist(a) {
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    genres: a.genres || [],
    spotifyUrl: a.external_urls?.spotify || null,
    popularity: a.popularity ?? null,
    imageUrl: a.images?.[0]?.url || null,
    followers: a.followers?.total ?? null,
  };
}

// --- Core API functions ---

export async function searchTracks(query, limit = 20) {
  const data = await spotifyGet("/search", {
    q: query,
    type: "track",
    market: MARKET,
    limit,
  });
  if (!data?.tracks?.items) return [];
  return data.tracks.items.map(simplifyTrack).filter(Boolean);
}

export async function searchAlbums(query, limit = 10) {
  const data = await spotifyGet("/search", {
    q: query,
    type: "album",
    market: MARKET,
    limit,
  });
  if (!data?.albums?.items) return [];
  return data.albums.items.map(simplifyAlbum).filter(Boolean);
}

export async function searchArtists(query, limit = 10) {
  const data = await spotifyGet("/search", {
    q: query,
    type: "artist",
    market: MARKET,
    limit,
  });
  if (!data?.artists?.items) return [];
  return data.artists.items.map(simplifyArtist).filter(Boolean);
}

export async function getAudioFeatures(trackIds) {
  if (!trackIds || trackIds.length === 0) return [];

  // Spotify allows max 100 IDs per request
  const batches = [];
  for (let i = 0; i < trackIds.length; i += 100) {
    batches.push(trackIds.slice(i, i + 100));
  }

  const results = [];
  for (const batch of batches) {
    const data = await spotifyGet("/audio-features", { ids: batch.join(",") });
    if (data?.audio_features) {
      results.push(
        ...data.audio_features.filter(Boolean).map((f) => ({
          id: f.id,
          danceability: f.danceability,
          energy: f.energy,
          key: f.key,
          loudness: f.loudness,
          mode: f.mode,
          speechiness: f.speechiness,
          acousticness: f.acousticness,
          instrumentalness: f.instrumentalness,
          liveness: f.liveness,
          valence: f.valence,
          tempo: f.tempo,
          timeSignature: f.time_signature,
          durationMs: f.duration_ms,
        }))
      );
    }
  }
  return results;
}

export async function getNewReleases(limit = 20) {
  const data = await spotifyGet("/browse/new-releases", {
    country: MARKET,
    limit,
  });
  if (!data?.albums?.items) return [];
  return data.albums.items.map(simplifyAlbum).filter(Boolean);
}

export async function getRelatedArtists(artistId) {
  const data = await spotifyGet(`/artists/${artistId}/related-artists`);
  if (!data?.artists) return [];
  return data.artists.map(simplifyArtist).filter(Boolean);
}

export async function getArtistTopTracks(artistId) {
  const data = await spotifyGet(`/artists/${artistId}/top-tracks`, {
    market: MARKET,
  });
  if (!data?.tracks) return [];
  return data.tracks.map(simplifyTrack).filter(Boolean);
}

// --- Candidate generation ---

export async function generateCandidates(tasteProfile) {
  const { onboarding_inputs, brief, edges } = tasteProfile || {};
  const seen = new Set();
  const candidates = [];

  function addUnique(tracks) {
    for (const t of tracks) {
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        candidates.push(t);
      }
    }
  }

  // Strategy 1: Search based on taste brief keywords
  if (brief) {
    const keywords = brief
      .split(/[.,;:!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3)
      .slice(0, 3);

    const briefResults = await Promise.all(
      keywords.map((kw) => searchTracks(kw, 10))
    );
    for (const tracks of briefResults) {
      addUnique(tracks);
    }
  }

  // Strategy 2: Search each onboarding input as artist, find related obscure artists
  if (onboarding_inputs && Array.isArray(onboarding_inputs)) {
    for (const input of onboarding_inputs.slice(0, 5)) {
      const artists = await searchArtists(input, 3).catch(() => []);
      for (const artist of artists) {
        if (artist.popularity > 70) continue;
        const related = await getRelatedArtists(artist.id).catch(() => []);
        const obscure = related.filter((r) => (r.popularity ?? 100) < 50);
        for (const r of obscure.slice(0, 3)) {
          const topTracks = await getArtistTopTracks(r.id).catch(() => []);
          addUnique(topTracks.slice(0, 2));
        }
      }
    }
  }

  // Strategy 3: Search based on taste edge reasoning text
  if (edges && Array.isArray(edges)) {
    const edgeQueries = edges
      .filter((e) => e.reasoning)
      .map((e) => e.reasoning)
      .slice(0, 3);

    const edgeResults = await Promise.all(
      edgeQueries.map((q) => searchTracks(q, 10))
    );
    for (const tracks of edgeResults) {
      addUnique(tracks);
    }
  }

  return candidates;
}
