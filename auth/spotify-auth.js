// One-time script to get Spotify refresh token via OAuth2 Authorization Code flow.
// Run: node auth/spotify-auth.js
// Then paste the refresh token into .env as SPOTIFY_REFRESH_TOKEN

import { createServer } from "http";
import { URL } from "url";
import open from "open";
import "dotenv/config";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:8888/callback";
const SCOPES = ""; // no special scopes needed - just user auth unlocks related-artists + top-tracks

const authUrl =
  `https://accounts.spotify.com/authorize?` +
  `client_id=${CLIENT_ID}` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent(SCOPES)}`;

console.log("opening browser for Spotify authorization...");
console.log("if it doesn't open, visit:", authUrl);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:8888`);

  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end();
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    console.error("authorization failed:", error);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>authorization failed</h1><p>check the terminal.</p>");
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end("no code");
    return;
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = await tokenRes.json();

  if (data.error) {
    console.error("token exchange failed:", data);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>token exchange failed</h1><p>check the terminal.</p>");
    server.close();
    process.exit(1);
  }

  console.log("\n--- add this to your .env ---\n");
  console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}`);
  console.log("\n---\n");

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(
    "<h1>done.</h1><p>refresh token printed to terminal. you can close this tab.</p>"
  );

  server.close();
  process.exit(0);
});

server.listen(8888, () => {
  open(authUrl);
});
