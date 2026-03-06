/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@anthropic-ai/sdk",
    "@neondatabase/serverless",
    "@xenova/transformers",
  ],
};

export default nextConfig;
