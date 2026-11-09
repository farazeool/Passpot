import type { NextConfig } from "next";

// The app reads live chain data in the browser, so pages are client-rendered;
// Cache Components' prerender checks don't apply.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
